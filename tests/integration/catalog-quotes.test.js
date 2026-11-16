import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import sharp from 'sharp';

import { createApp } from '../../src/app.js';
import { createAdminAuth } from '../../src/modules/auth/admin-auth.service.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { createLogger } from '../../src/shared/logger.js';
import { startTestServer } from '../helpers/server-harness.js';

const TEST_TIMEOUT = 180_000;
const EMAIL = 'admin@zonalab.test';
const PASSWORD = 'clave-de-prueba-segura';
const WHATSAPP_NUMBER = '5491112345678';
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 7),
]);

let mongod;
let server;
let storageRoot;
let loginState;
let product;
const sentEmails = [];

async function login() {
  const response = await fetch(`${server.baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await response.json();
  const cookies = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

  assert.equal(response.status, 200);

  return {
    cookies,
    csrfToken: body.csrfToken,
  };
}

function adminHeaders() {
  return {
    Cookie: loginState.cookies,
    'x-csrf-token': loginState.csrfToken,
  };
}

async function waitFor(check, timeoutMs = 3000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await check();

    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

async function waitForEmail(predicate, timeoutMs = 3000) {
  return waitFor(() => sentEmails.find(predicate), timeoutMs);
}

before(
  async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri('zona_lab_integration'));
    storageRoot = await mkdtemp(path.join(tmpdir(), 'zona-lab-test-'));
    const adminAuth = createAdminAuth({
      enabled: true,
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      sessionSecret: 's'.repeat(48),
    });
    const app = createApp({
      logger: createLogger({ level: 'silent' }),
      corsOrigins: ['http://localhost:8080'],
      getDatabaseStatus: () => 'connected',
      whatsappNumber: WHATSAPP_NUMBER,
      adminAuth,
      rateLimitEnabled: false,
      settingsEncryptionSecret: 's'.repeat(48),
      notificationTransportFactory: () => ({
        async sendMail(message) {
          sentEmails.push(message);

          return { messageId: `test-${sentEmails.length}` };
        },
      }),
      storageRoot,
    });

    server = await startTestServer(app);
    loginState = await login();
  },
  { timeout: TEST_TIMEOUT },
);

after(async () => {
  await server?.close();
  await mongoose.disconnect();
  await mongod?.stop();
  await rm(storageRoot, { recursive: true, force: true });
});

test('protege el panel administrativo y exige CSRF', { timeout: TEST_TIMEOUT }, async () => {
  const unauthorized = await fetch(`${server.baseUrl}/api/admin/products`);
  assert.equal(unauthorized.status, 401);

  const withoutCsrf = await fetch(`${server.baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: {
      Cookie: loginState.cookies,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const withoutCsrfBody = await withoutCsrf.json();

  assert.equal(withoutCsrf.status, 403);
  assert.equal(withoutCsrfBody.error.code, 'CSRF_INVALID');
});

test(
  'crea un producto administrable y lo expone en el catálogo',
  { timeout: TEST_TIMEOUT },
  async () => {
    const productInput = {
      name: 'Bolso Deportivo Pro',
      category: 'bolsos-deportivos',
      shortDescription: 'Bolso resistente para equipos y clubes.',
      description: 'Fabricado a medida con materiales de alta resistencia.',
      features: ['Cierre reforzado', 'Correa ajustable'],
      imageUrl: '',
      active: true,
      minimumQuantity: 10,
      personalizationFee: 5000,
      priceTiers: [
        { minQuantity: 10, maxQuantity: 50, unitPrice: 10000 },
        { minQuantity: 51, maxQuantity: null, unitPrice: 9000 },
      ],
      optionGroups: [
        {
          name: 'Color',
          required: true,
          choices: [
            { label: 'Negro', additionalUnitPrice: 0 },
            { label: 'Blanco', additionalUnitPrice: 500 },
          ],
        },
      ],
    };

    const createResponse = await fetch(`${server.baseUrl}/api/admin/products`, {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(productInput),
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.product.slug, 'bolso-deportivo-pro');
    assert.equal(createBody.product.optionGroups[0].choices.length, 2);

    product = createBody.product;

    const listResponse = await fetch(`${server.baseUrl}/api/catalog/products?limit=12`);
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listBody.pagination.total, 1);
    assert.equal(listBody.items[0].id, product.id);

    const detailResponse = await fetch(`${server.baseUrl}/api/catalog/products/${product.slug}`);
    const detailBody = await detailResponse.json();

    assert.equal(detailResponse.status, 200);
    assert.equal(detailBody.product.name, productInput.name);
    assert.equal(detailBody.product.startingUnitPrice, 9000);
  },
);

test(
  'calcula el precio desde el servidor y rechaza opciones incompletas',
  { timeout: TEST_TIMEOUT },
  async () => {
    const colorGroup = product.optionGroups[0];
    const selections = [{ groupId: colorGroup.id, choiceId: colorGroup.choices[1].id }];
    const estimateResponse = await fetch(`${server.baseUrl}/api/quotes/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.id, quantity: 20, selections }),
    });
    const estimateBody = await estimateResponse.json();

    assert.equal(estimateResponse.status, 200);
    assert.equal(estimateBody.estimate.pricing.status, 'estimated');
    assert.equal(estimateBody.estimate.pricing.unitPrice, 10500);
    assert.equal(estimateBody.estimate.pricing.estimatedTotal, 215000);

    const invalidResponse = await fetch(`${server.baseUrl}/api/quotes/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.id, quantity: 20, selections: [] }),
    });
    const invalidBody = await invalidResponse.json();

    assert.equal(invalidResponse.status, 400);
    assert.equal(invalidBody.error.code, 'REQUIRED_OPTION_MISSING');
  },
);

test(
  'registra el pedido con logo privado y genera WhatsApp',
  { timeout: TEST_TIMEOUT },
  async () => {
    const colorGroup = product.optionGroups[0];
    const payload = {
      productId: product.id,
      quantity: 20,
      selections: [{ groupId: colorGroup.id, choiceId: colorGroup.choices[0].id }],
      designNotes: 'Logo centrado en la cara frontal.',
      marketing: {
        source: 'google',
        medium: 'cpc',
        campaign: 'padel-bolsos',
        landingPage: '/catalogo?utm_source=google',
        referrer: '',
      },
      customer: {
        name: 'Ana Pérez',
        brandName: 'Club Zona',
        phone: '+54 11 5555 5555',
        email: 'ana@example.com',
        observations: 'Entrega antes de fin de mes.',
      },
    };
    const form = new FormData();

    form.set('payload', JSON.stringify(payload));
    form.set('logo', new Blob([PNG_BYTES], { type: 'image/png' }), 'logo.png');

    const createResponse = await fetch(`${server.baseUrl}/api/quotes`, {
      method: 'POST',
      body: form,
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.match(createBody.quote.code, /^ZL-\d{8}-[A-F0-9]{10}$/);
    assert.equal(createBody.quote.files.logo, true);
    assert.equal(createBody.quote.pricing.estimatedTotal, 205000);
    assert.ok(createBody.whatsappUrl.startsWith(`https://wa.me/${WHATSAPP_NUMBER}?text=`));
    assert.match(decodeURIComponent(createBody.whatsappUrl), /Logo centrado/);

    const listResponse = await fetch(`${server.baseUrl}/api/admin/quotes`, {
      headers: { Cookie: loginState.cookies },
    });
    const listBody = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listBody.items.length, 1);
    assert.equal(listBody.items[0].code, createBody.quote.code);
    assert.equal(listBody.items[0].marketing.source, 'google');
    assert.equal(listBody.items[0].marketing.campaign, 'padel-bolsos');
    assert.ok(listBody.items[0].files.logo.downloadUrl);

    const downloadResponse = await fetch(
      `${server.baseUrl}${listBody.items[0].files.logo.downloadUrl}`,
      { headers: { Cookie: loginState.cookies } },
    );
    const downloadedFile = Buffer.from(await downloadResponse.arrayBuffer());

    assert.equal(downloadResponse.status, 200);
    assert.match(downloadResponse.headers.get('content-disposition') ?? '', /attachment/);
    assert.deepEqual(downloadedFile, PNG_BYTES);

    const inlineResponse = await fetch(
      `${server.baseUrl}${listBody.items[0].files.logo.downloadUrl}?inline=1`,
      { headers: { Cookie: loginState.cookies } },
    );

    assert.equal(inlineResponse.status, 200);
    assert.match(inlineResponse.headers.get('content-type') ?? '', /image\/png/);
    assert.match(inlineResponse.headers.get('content-disposition') ?? '', /inline/);
    assert.deepEqual(Buffer.from(await inlineResponse.arrayBuffer()), PNG_BYTES);
  },
);

test(
  'actualiza el estado del producto y la configuración pública',
  { timeout: TEST_TIMEOUT },
  async () => {
    const statusResponse = await fetch(
      `${server.baseUrl}/api/admin/products/${product.id}/status`,
      {
        method: 'PATCH',
        headers: {
          ...adminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ active: false }),
      },
    );
    const statusBody = await statusResponse.json();

    assert.equal(statusResponse.status, 200);
    assert.equal(statusBody.product.active, false);

    const hiddenResponse = await fetch(`${server.baseUrl}/api/catalog/products/${product.slug}`);
    assert.equal(hiddenResponse.status, 404);

    const settingsResponse = await fetch(`${server.baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        whatsappNumber: '+54 9 11 4444-3333',
        heroTitle: 'DISEÑÁ TU PRÓXIMA LÍNEA.',
        heroSubtitle: 'Producción propia para tu marca o institución.',
        heroImageUrl: '',
      }),
    });
    const settingsBody = await settingsResponse.json();

    assert.equal(settingsResponse.status, 200);
    assert.equal(settingsBody.settings.whatsappNumber, '5491144443333');

    const publicSettingsResponse = await fetch(`${server.baseUrl}/api/settings/public`);
    const publicSettingsBody = await publicSettingsResponse.json();

    assert.equal(publicSettingsResponse.status, 200);
    assert.equal(publicSettingsBody.settings.heroTitle, 'DISEÑÁ TU PRÓXIMA LÍNEA.');
  },
);

test(
  'persiste el motivo de cotización personalizada para el panel',
  { timeout: TEST_TIMEOUT },
  async () => {
    const customProductInput = {
      name: 'Bolso de pedido especial',
      category: 'bolsos',
      shortDescription: 'Producto con tramos cerrados.',
      description: '',
      features: [],
      imageUrl: '',
      active: true,
      minimumQuantity: 10,
      personalizationFee: 0,
      priceTiers: [{ minQuantity: 10, maxQuantity: 20, unitPrice: 10000 }],
      optionGroups: [],
    };
    const productResponse = await fetch(`${server.baseUrl}/api/admin/products`, {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(customProductInput),
    });
    const createdProduct = await productResponse.json();
    const payload = {
      productId: createdProduct.product.id,
      quantity: 30,
      selections: [],
      designNotes: '',
      customer: {
        name: 'Cliente Prueba',
        brandName: '',
        phone: '11 5555 0000',
        email: '',
        observations: '',
      },
    };
    const form = new FormData();

    form.set('payload', JSON.stringify(payload));

    const createResponse = await fetch(`${server.baseUrl}/api/quotes`, {
      method: 'POST',
      body: form,
    });
    const createBody = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createBody.quote.pricing.status, 'custom');
    assert.equal(createBody.quote.pricing.estimatedTotal, null);

    const listResponse = await fetch(`${server.baseUrl}/api/admin/quotes`, {
      headers: { Cookie: loginState.cookies },
    });
    const listBody = await listResponse.json();
    const storedQuote = listBody.items.find((item) => item.code === createBody.quote.code);

    assert.ok(storedQuote);
    assert.equal(storedQuote.pricing.status, 'custom');
    assert.match(storedQuote.pricing.customReason, /no tiene un precio publicado/);
  },
);

test('rechaza payloads de pedido por encima del límite del campo', async () => {
  const form = new FormData();

  form.set('payload', 'x'.repeat(25 * 1024));

  const response = await fetch(`${server.baseUrl}/api/quotes`, {
    method: 'POST',
    body: form,
  });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.error.code, 'FIELD_TOO_LARGE');
});

test('sube y sirve imágenes públicas desde el panel', { timeout: TEST_TIMEOUT }, async () => {
  const form = new FormData();

  form.set('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'portada.png');

  const uploadResponse = await fetch(`${server.baseUrl}/api/admin/uploads/media`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form,
  });
  const uploadBody = await uploadResponse.json();

  assert.equal(uploadResponse.status, 201);
  assert.match(uploadBody.file.url, /^\/uploads\/media\/[0-9a-f-]{36}\.png$/);

  const mediaResponse = await fetch(`${server.baseUrl}${uploadBody.file.url}`);
  const mediaBytes = Buffer.from(await mediaResponse.arrayBuffer());

  assert.equal(mediaResponse.status, 200);
  assert.deepEqual(mediaBytes, PNG_BYTES);

  const fallbackResponse = await fetch(`${server.baseUrl}${uploadBody.file.url}?w=480`);

  assert.equal(fallbackResponse.status, 200);
  assert.match(fallbackResponse.headers.get('content-type') ?? '', /image\/png/);
});

test(
  'genera variantes responsive y lista la biblioteca de medios',
  { timeout: TEST_TIMEOUT },
  async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 20, g: 90, b: 180 },
      },
    })
      .png()
      .toBuffer();
    const form = new FormData();

    form.set('file', new Blob([source], { type: 'image/png' }), 'portada-responsive.png');

    const uploadResponse = await fetch(`${server.baseUrl}/api/admin/uploads/media`, {
      method: 'POST',
      headers: adminHeaders(),
      body: form,
    });
    const uploadBody = await uploadResponse.json();

    assert.equal(uploadResponse.status, 201);
    assert.match(uploadBody.file.url, /^\/uploads\/media\/[0-9a-f-]{36}\.png$/);
    assert.deepEqual(
      uploadBody.file.variants.map((variant) => variant.width),
      [480, 960, 1600],
    );

    for (const variant of uploadBody.file.variants) {
      assert.match(variant.url, /-\d+\.webp$/);

      const variantResponse = await fetch(`${server.baseUrl}${variant.url}`);
      const variantMetadata = await sharp(
        Buffer.from(await variantResponse.arrayBuffer()),
      ).metadata();

      assert.equal(variantResponse.status, 200);
      assert.match(variantResponse.headers.get('content-type') ?? '', /image\/webp/);
      assert.equal(variantMetadata.width, Math.min(variant.width, 1200));
    }

    const listResponse = await fetch(`${server.baseUrl}/api/admin/uploads/media?limit=100`, {
      headers: { Cookie: loginState.cookies },
    });
    const listBody = await listResponse.json();
    const listItem = listBody.items.find((item) => item.url === uploadBody.file.url);

    assert.equal(listResponse.status, 200);
    assert.ok(listItem);
    assert.equal(listItem.width, 1200);
    assert.equal(listItem.height, 900);
    assert.equal(listItem.mimeType, 'image/png');
    assert.equal(listItem.inUse, false);
    assert.equal(listItem.variants.length, 3);

    const fileName = uploadBody.file.url.split('/').pop();
    const deleteResponse = await fetch(`${server.baseUrl}/api/admin/uploads/media/${fileName}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });

    assert.equal(deleteResponse.status, 204);

    for (const variant of uploadBody.file.variants) {
      const missingVariant = await fetch(`${server.baseUrl}${variant.url}`);

      assert.equal(missingVariant.status, 404);
    }

    const afterDeleteResponse = await fetch(`${server.baseUrl}/api/admin/uploads/media?limit=100`, {
      headers: { Cookie: loginState.cookies },
    });
    const afterDeleteBody = await afterDeleteResponse.json();

    assert.equal(
      afterDeleteBody.items.some((item) => item.url === uploadBody.file.url),
      false,
    );
  },
);

test('edita y da de baja lógica un producto', { timeout: TEST_TIMEOUT }, async () => {
  const detailResponse = await fetch(`${server.baseUrl}/api/admin/products/${product.id}`, {
    headers: { Cookie: loginState.cookies },
  });
  const detailBody = await detailResponse.json();
  const current = detailBody.product;
  const updatePayload = {
    name: 'Bolso Deportivo Pro Editado',
    category: current.category,
    shortDescription: current.shortDescription,
    description: current.description,
    features: current.features,
    imageUrl: current.imageUrl,
    active: true,
    minimumQuantity: current.minimumQuantity,
    personalizationFee: current.personalizationFee,
    priceTiers: current.priceTiers,
    optionGroups: current.optionGroups.map((group) => ({
      name: group.name,
      required: group.required,
      choices: group.choices.map((choice) => ({
        label: choice.label,
        additionalUnitPrice: choice.additionalUnitPrice,
      })),
    })),
  };
  const updateResponse = await fetch(`${server.baseUrl}/api/admin/products/${product.id}`, {
    method: 'PUT',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });
  const updateBody = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updateBody.product.name, 'Bolso Deportivo Pro Editado');

  const deleteResponse = await fetch(`${server.baseUrl}/api/admin/products/${product.id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });

  assert.equal(deleteResponse.status, 204);

  const hiddenResponse = await fetch(`${server.baseUrl}/api/admin/products/${product.id}`, {
    headers: { Cookie: loginState.cookies },
  });

  assert.equal(hiddenResponse.status, 404);
});

test(
  'guarda la configuración SMTP y envía un correo de prueba',
  { timeout: TEST_TIMEOUT },
  async () => {
    sentEmails.length = 0;

    const settingsResponse = await fetch(`${server.baseUrl}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        whatsappNumber: '+54 9 11 4444-3333',
        heroTitle: 'Título de prueba',
        heroSubtitle: 'Subtítulo de prueba',
        heroImageUrl: '',
        emailNotificationsEnabled: true,
        notificationEmail: 'pedidos@zonalab.test',
        smtpHost: 'smtp.zonalab.test',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'notificador@zonalab.test',
        smtpAppPassword: 'app-password-de-prueba',
      }),
    });
    const settingsBody = await settingsResponse.json();

    assert.equal(settingsResponse.status, 200);
    assert.equal(settingsBody.settings.notificationEmail, 'pedidos@zonalab.test');
    assert.equal(settingsBody.settings.hasSmtpAppPassword, true);
    assert.equal(settingsBody.settings.smtpAppPassword, undefined);

    const publicSettingsResponse = await fetch(`${server.baseUrl}/api/settings/public`);
    const publicSettingsBody = await publicSettingsResponse.json();

    assert.equal(publicSettingsBody.settings.notificationEmail, undefined);
    assert.equal(publicSettingsBody.settings.smtpHost, undefined);

    const testResponse = await fetch(`${server.baseUrl}/api/admin/settings/test-email`, {
      method: 'POST',
      headers: adminHeaders(),
    });
    const testBody = await testResponse.json();

    assert.equal(testResponse.status, 200);
    assert.equal(testBody.sent, true);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, 'pedidos@zonalab.test');
  },
);

test(
  'actualiza el estado y las notas internas de un pedido',
  { timeout: TEST_TIMEOUT },
  async () => {
    const listResponse = await fetch(`${server.baseUrl}/api/admin/quotes`, {
      headers: { Cookie: loginState.cookies },
    });
    const listBody = await listResponse.json();
    const target = listBody.items.find((item) => item.customer.email) ?? listBody.items[0];

    assert.ok(target);
    assert.ok(target.customer.email);

    const updateResponse = await fetch(`${server.baseUrl}/api/admin/quotes/${target.id}`, {
      method: 'PATCH',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'contacted',
        adminNotes: 'Llamar mañana para confirmar el diseño.',
      }),
    });
    const updateBody = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.equal(updateBody.quote.status, 'contacted');
    assert.equal(updateBody.quote.adminNotes, 'Llamar mañana para confirmar el diseño.');

    const buyerEmail = await waitForEmail(
      (email) => email.to === target.customer.email && email.subject.includes(target.code),
    );

    assert.ok(buyerEmail);
    assert.match(buyerEmail.subject, /Pedido en proceso/);
    assert.match(buyerEmail.text, /Bolso/);

    const filteredResponse = await fetch(`${server.baseUrl}/api/admin/quotes?status=contacted`, {
      headers: { Cookie: loginState.cookies },
    });
    const filteredBody = await filteredResponse.json();

    assert.ok(filteredBody.items.every((item) => item.status === 'contacted'));
    assert.ok(filteredBody.items.some((item) => item.id === target.id));
  },
);

test(
  'elimina media sin referencias y protege la que está en uso',
  { timeout: TEST_TIMEOUT },
  async () => {
    async function uploadMedia() {
      const form = new FormData();

      form.set('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'temporal.png');

      const response = await fetch(`${server.baseUrl}/api/admin/uploads/media`, {
        method: 'POST',
        headers: adminHeaders(),
        body: form,
      });
      const body = await response.json();

      assert.equal(response.status, 201);

      return body.file.url;
    }

    const orphanUrl = await uploadMedia();
    const orphanFile = orphanUrl.split('/').pop();
    const deleteOrphanResponse = await fetch(
      `${server.baseUrl}/api/admin/uploads/media/${orphanFile}`,
      {
        method: 'DELETE',
        headers: adminHeaders(),
      },
    );

    assert.equal(deleteOrphanResponse.status, 204);

    const missingResponse = await fetch(`${server.baseUrl}${orphanUrl}`);

    assert.equal(missingResponse.status, 404);

    const inUseUrl = await uploadMedia();
    const inUseFile = inUseUrl.split('/').pop();
    const productResponse = await fetch(`${server.baseUrl}/api/admin/products`, {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Producto con imagen temporal',
        category: 'bolsos',
        shortDescription: 'Producto de prueba de media.',
        description: '',
        features: [],
        imageUrl: inUseUrl,
        active: true,
        minimumQuantity: 10,
        personalizationFee: 0,
        priceTiers: [{ minQuantity: 10, maxQuantity: null, unitPrice: 10000 }],
        optionGroups: [],
      }),
    });
    const productBody = await productResponse.json();

    assert.equal(productResponse.status, 201);

    const inUseDeleteResponse = await fetch(
      `${server.baseUrl}/api/admin/uploads/media/${inUseFile}`,
      {
        method: 'DELETE',
        headers: adminHeaders(),
      },
    );
    const inUseDeleteBody = await inUseDeleteResponse.json();

    assert.equal(inUseDeleteResponse.status, 409);
    assert.equal(inUseDeleteBody.error.code, 'MEDIA_IN_USE');

    const removeProductResponse = await fetch(
      `${server.baseUrl}/api/admin/products/${productBody.product.id}`,
      {
        method: 'DELETE',
        headers: adminHeaders(),
      },
    );

    assert.equal(removeProductResponse.status, 204);

    const releaseResponse = await fetch(`${server.baseUrl}/api/admin/uploads/media/${inUseFile}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });

    assert.equal(releaseResponse.status, 204);
  },
);

test('envía consultas de contacto por email', { timeout: TEST_TIMEOUT }, async () => {
  const response = await fetch(`${server.baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Cliente Contacto',
      email: 'contacto@example.com',
      phone: '11 5555 1234',
      message: 'Quiero cotizar mochilas personalizadas para un club.',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.sent, true);

  const contactEmail = await waitForEmail((email) => email.subject.includes('Consulta del sitio'));

  assert.ok(contactEmail);
  assert.equal(contactEmail.replyTo, 'contacto@example.com');
});

test('expone métricas del dashboard y auditoría admin', { timeout: TEST_TIMEOUT }, async () => {
  const dashboardResponse = await fetch(`${server.baseUrl}/api/admin/dashboard`, {
    headers: { Cookie: loginState.cookies },
  });
  const dashboardBody = await dashboardResponse.json();

  assert.equal(dashboardResponse.status, 200);
  assert.ok(dashboardBody.metrics.quotes.total >= 1);
  assert.ok(dashboardBody.metrics.products.total >= 1);
  assert.ok(Array.isArray(dashboardBody.recentQuotes));
  assert.ok(Array.isArray(dashboardBody.topProducts));

  const auditEntry = await waitFor(async () => {
    const auditResponse = await fetch(`${server.baseUrl}/api/admin/audit`, {
      headers: { Cookie: loginState.cookies },
    });
    const auditBody = await auditResponse.json();

    return auditBody.items?.find((entry) => entry.method === 'POST' && entry.actor === EMAIL);
  });

  assert.ok(auditEntry);
  assert.ok(auditEntry.action.startsWith('POST'));
  assert.equal(auditEntry.actor, EMAIL);
});

test('modera reseñas de productos', { timeout: TEST_TIMEOUT }, async () => {
  const productsResponse = await fetch(`${server.baseUrl}/api/admin/products?limit=1`, {
    headers: { Cookie: loginState.cookies },
  });
  const productsBody = await productsResponse.json();
  const productId = productsBody.items[0]?.id;

  assert.ok(productId);

  const createResponse = await fetch(
    `${server.baseUrl}/api/catalog/products/${productId}/reviews`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cliente Reseña',
        rating: 5,
        comment: 'Excelente calidad y atención en todo el proceso.',
      }),
    },
  );
  const createBody = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(createBody.published, false);

  const publicResponse = await fetch(`${server.baseUrl}/api/catalog/products/${productId}/reviews`);
  const publicBody = await publicResponse.json();

  assert.equal(publicBody.items.length, 0);

  const pendingResponse = await fetch(`${server.baseUrl}/api/admin/reviews?status=pending`, {
    headers: { Cookie: loginState.cookies },
  });
  const pendingBody = await pendingResponse.json();
  const review = pendingBody.items.find((item) => item.name === 'Cliente Reseña');

  assert.ok(review);

  const approveResponse = await fetch(`${server.baseUrl}/api/admin/reviews/${review.id}`, {
    method: 'PATCH',
    headers: {
      ...adminHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ approved: true }),
  });

  assert.equal(approveResponse.status, 200);

  const approvedResponse = await fetch(
    `${server.baseUrl}/api/catalog/products/${productId}/reviews`,
  );
  const approvedBody = await approvedResponse.json();

  assert.equal(approvedBody.items.length, 1);
  assert.equal(approvedBody.summary.average, 5);

  const deleteResponse = await fetch(`${server.baseUrl}/api/admin/reviews/${review.id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });

  assert.equal(deleteResponse.status, 204);
});

test('exporta CSV y anonimiza o elimina pedidos', { timeout: TEST_TIMEOUT }, async () => {
  const adminListResponse = await fetch(`${server.baseUrl}/api/admin/products?limit=1`, {
    headers: { Cookie: loginState.cookies },
  });
  const adminList = await adminListResponse.json();
  let targetProductId = adminList.items[0]?.id;

  if (!targetProductId) {
    const createProductResponse = await fetch(`${server.baseUrl}/api/admin/products`, {
      method: 'POST',
      headers: {
        ...adminHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Bolso CSV Pro',
        category: 'bolsos-deportivos',
        shortDescription: 'Bolso para probar la exportación.',
        features: [],
        imageUrl: '',
        active: true,
        minimumQuantity: 10,
        personalizationFee: 0,
        priceTiers: [{ minQuantity: 10, maxQuantity: null, unitPrice: 10000 }],
        optionGroups: [
          {
            name: 'Color',
            required: true,
            choices: [{ label: 'Negro', additionalUnitPrice: 0 }],
          },
        ],
      }),
    });
    const createProductBody = await createProductResponse.json();

    assert.equal(createProductResponse.status, 201);
    targetProductId = createProductBody.product.id;
  }

  const detailResponse = await fetch(`${server.baseUrl}/api/admin/products/${targetProductId}`, {
    headers: { Cookie: loginState.cookies },
  });
  const detailBody = await detailResponse.json();
  const targetProduct = detailBody.product;
  const requiredGroup = targetProduct.optionGroups.find((group) => group.required);
  const form = new FormData();

  form.set(
    'payload',
    JSON.stringify({
      productId: targetProduct.id,
      quantity: targetProduct.minimumQuantity,
      selections: requiredGroup
        ? [{ groupId: requiredGroup.id, choiceId: requiredGroup.choices[0].id }]
        : [],
      designNotes: '',
      marketing: {},
      customer: {
        name: 'Cliente CSV',
        brandName: '',
        phone: '+54 11 5555 0000',
        email: 'csv@example.com',
        observations: '',
      },
    }),
  );

  const createQuoteResponse = await fetch(`${server.baseUrl}/api/quotes`, {
    method: 'POST',
    body: form,
  });
  const createQuoteBody = await createQuoteResponse.json();

  assert.equal(createQuoteResponse.status, 201);

  const target = createQuoteBody.quote;

  const quotesCsvResponse = await fetch(`${server.baseUrl}/api/admin/quotes/export`, {
    headers: { Cookie: loginState.cookies },
  });
  const quotesCsv = await quotesCsvResponse.text();

  assert.equal(quotesCsvResponse.status, 200, quotesCsv);
  assert.match(quotesCsvResponse.headers.get('content-type') ?? '', /text\/csv/);
  assert.match(quotesCsv, /Codigo,Estado/);
  assert.ok(quotesCsv.includes(target.code));

  const productsCsvResponse = await fetch(`${server.baseUrl}/api/admin/products/export`, {
    headers: { Cookie: loginState.cookies },
  });
  const productsCsv = await productsCsvResponse.text();

  assert.equal(productsCsvResponse.status, 200);
  assert.match(productsCsv, /Nombre,Slug/);
  assert.ok(productsCsv.includes(targetProduct.slug));

  const anonymizeResponse = await fetch(
    `${server.baseUrl}/api/admin/quotes/${target.id}/anonymize`,
    {
      method: 'POST',
      headers: adminHeaders(),
    },
  );
  const anonymizeBody = await anonymizeResponse.json();

  assert.equal(anonymizeResponse.status, 200);
  assert.equal(anonymizeBody.quote.customer.name, 'Cliente eliminado');
  assert.equal(anonymizeBody.quote.customer.email, '');
  assert.equal(anonymizeBody.quote.files.logo, null);
  assert.equal(anonymizeBody.quote.files.reference, null);

  const deleteQuoteResponse = await fetch(`${server.baseUrl}/api/admin/quotes/${target.id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });

  assert.equal(deleteQuoteResponse.status, 204);

  const afterDeleteResponse = await fetch(`${server.baseUrl}/api/admin/quotes`, {
    headers: { Cookie: loginState.cookies },
  });
  const afterDeleteBody = await afterDeleteResponse.json();

  assert.equal(
    afterDeleteBody.items.some((item) => item.id === target.id),
    false,
  );
});
