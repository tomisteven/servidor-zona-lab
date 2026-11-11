import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

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
    assert.ok(listBody.items[0].files.logo.downloadUrl);

    const downloadResponse = await fetch(
      `${server.baseUrl}${listBody.items[0].files.logo.downloadUrl}`,
      { headers: { Cookie: loginState.cookies } },
    );
    const downloadedFile = Buffer.from(await downloadResponse.arrayBuffer());

    assert.equal(downloadResponse.status, 200);
    assert.match(downloadResponse.headers.get('content-disposition') ?? '', /attachment/);
    assert.deepEqual(downloadedFile, PNG_BYTES);
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
