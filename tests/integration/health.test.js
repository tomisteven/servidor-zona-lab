import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/shared/logger.js';
import { startTestServer } from '../helpers/server-harness.js';

const ALLOWED_ORIGIN = 'http://localhost:8080';

function buildApp({ databaseStatus = 'disconnected' } = {}) {
  return createApp({
    logger: createLogger({ level: 'silent' }),
    corsOrigins: [ALLOWED_ORIGIN],
    getDatabaseStatus: () => databaseStatus,
  });
}

test('GET /api/health responde estado y request id', async (t) => {
  const server = await startTestServer(buildApp());
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.ok(response.headers.get('x-request-id'));
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'zona-lab-api');
  assert.equal(typeof body.uptimeSeconds, 'number');
});

test('GET /api/health/ready devuelve 503 si la base no está conectada', async (t) => {
  const server = await startTestServer(buildApp({ databaseStatus: 'disconnected' }));
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/health/ready`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    status: 'not_ready',
    checks: {
      database: 'disconnected',
    },
  });
});

test('GET /api/health/ready devuelve 200 si la base está conectada', async (t) => {
  const server = await startTestServer(buildApp({ databaseStatus: 'connected' }));
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/health/ready`);

  assert.equal(response.status, 200);
});

test('permite únicamente orígenes CORS configurados', async (t) => {
  const server = await startTestServer(buildApp());
  t.after(() => server.close());

  const allowedResponse = await fetch(`${server.baseUrl}/api/health`, {
    headers: { Origin: ALLOWED_ORIGIN },
  });

  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedResponse.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);

  const rejectedResponse = await fetch(`${server.baseUrl}/api/health`, {
    headers: { Origin: 'https://origen-no-permitido.example' },
  });
  const rejectedBody = await rejectedResponse.json();

  assert.equal(rejectedResponse.status, 403);
  assert.equal(rejectedBody.error.code, 'CORS_NOT_ALLOWED');
});

test('responde 404 con el contrato de error centralizado', async (t) => {
  const server = await startTestServer(buildApp());
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/desconocido`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    error: {
      code: 'NOT_FOUND',
      message: 'Recurso no encontrado.',
    },
  });
});

test('rechaza JSON malformado sin exponer detalles internos', async (t) => {
  const server = await startTestServer(buildApp());
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/health`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.equal(body.error.stack, undefined);
});
