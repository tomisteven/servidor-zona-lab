import assert from 'node:assert/strict';
import test from 'node:test';

import { createQuoteNotifier } from '../../src/modules/notifications/quote-notifier.js';

const CONFIG = {
  to: 'pedidos@zonalab.test',
  host: 'smtp.zonalab.test',
  port: 587,
  secure: false,
  user: 'notificador@zonalab.test',
  password: 'app-password',
};

const QUOTE = {
  quote: {
    code: 'ZL-20261111-ABCDEF1234',
    product: { name: 'Bolso Urbano' },
    quantity: 20,
    pricing: {
      status: 'estimated',
      estimatedTotal: 255000,
    },
    files: { logo: true, reference: false },
  },
};

const INPUT = {
  customer: {
    name: 'Ana Pérez',
    brandName: 'Marca <Demo>',
    phone: '11 5555 4444',
    email: 'ana@example.com',
    observations: 'Entregar en octubre',
  },
  designNotes: '<script>alert(1)</script>',
};

test('envía la notificación del pedido con el resumen escapado', async () => {
  const sent = [];
  const notifier = createQuoteNotifier({
    resolveConfig: async () => CONFIG,
    createTransport: () => ({
      async sendMail(message) {
        sent.push(message);
      },
    }),
  });

  const result = await notifier.notifyQuote({ quote: QUOTE.quote, input: INPUT });

  assert.equal(result, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, CONFIG.to);
  assert.equal(sent[0].from, CONFIG.user);
  assert.match(sent[0].subject, /ZL-20261111-ABCDEF1234/);
  assert.match(sent[0].text, /Ana Pérez/);
  assert.match(sent[0].text, /255\.000|255000/);
  assert.match(sent[0].html, /&lt;Demo&gt;/);
  assert.match(sent[0].html, /&lt;script&gt;/);
  assert.doesNotMatch(sent[0].html, /<script>/);
});

test('avisa al comprador cuando cambia el estado del pedido', async () => {
  const sent = [];
  const notifier = createQuoteNotifier({
    resolveConfig: async () => CONFIG,
    createTransport: () => ({
      async sendMail(message) {
        sent.push(message);
      },
    }),
  });
  const quote = {
    ...QUOTE.quote,
    status: 'contacted',
    customer: {
      name: 'Ana Pérez',
      email: 'ana@example.com',
    },
  };

  const result = await notifier.notifyStatusChange({ quote });

  assert.equal(result, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@example.com');
  assert.match(sent[0].subject, /Pedido en proceso/);
  assert.match(sent[0].text, /Bolso Urbano/);
  assert.match(sent[0].text, /ZL-20261111-ABCDEF1234/);
});

test('envía consultas de contacto con reply-to del visitante', async () => {
  const sent = [];
  const notifier = createQuoteNotifier({
    resolveConfig: async () => CONFIG,
    createTransport: () => ({
      async sendMail(message) {
        sent.push(message);
      },
    }),
  });

  const result = await notifier.notifyContact({
    contact: {
      name: 'Cliente',
      email: 'cliente@example.com',
      phone: '11 5555 1234',
      message: 'Quiero cotizar un pedido.',
    },
  });

  assert.equal(result, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, CONFIG.to);
  assert.equal(sent[0].replyTo, 'cliente@example.com');
  assert.match(sent[0].subject, /Consulta del sitio/);
});

test('no envía aviso de estado si el comprador no dejó correo', async () => {
  let transportCreated = false;
  const notifier = createQuoteNotifier({
    resolveConfig: async () => CONFIG,
    createTransport: () => {
      transportCreated = true;
      return { sendMail: async () => {} };
    },
  });

  const result = await notifier.notifyStatusChange({
    quote: { ...QUOTE.quote, status: 'closed', customer: { name: 'Ana Pérez', email: '' } },
  });

  assert.equal(result, false);
  assert.equal(transportCreated, false);
});

test('omite el envío cuando no hay configuración', async () => {
  let transportCreated = false;
  const notifier = createQuoteNotifier({
    resolveConfig: async () => null,
    createTransport: () => {
      transportCreated = true;
      return { sendMail: async () => {} };
    },
  });

  const result = await notifier.notifyQuote({ quote: QUOTE.quote, input: INPUT });

  assert.equal(result, false);
  assert.equal(transportCreated, false);
});

test('el envío de prueba requiere configuración y reporta fallas', async () => {
  const unconfigured = createQuoteNotifier({ resolveConfig: async () => null });

  await assert.rejects(unconfigured.sendTest(), (error) => {
    assert.equal(error.code, 'EMAIL_NOT_CONFIGURED');
    return true;
  });

  const failing = createQuoteNotifier({
    resolveConfig: async () => CONFIG,
    createTransport: () => ({
      async sendMail() {
        throw new Error('SMTP caído');
      },
    }),
  });

  await assert.rejects(failing.sendTest(), (error) => {
    assert.equal(error.code, 'EMAIL_SEND_FAILED');
    return true;
  });
});
