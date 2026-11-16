import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/shared/logger.js';
import { startTestServer } from '../helpers/server-harness.js';

test('limita los intentos de login por IP', async (t) => {
  const app = createApp({
    logger: createLogger({ level: 'silent' }),
    corsOrigins: ['http://localhost:8080'],
    getDatabaseStatus: () => 'connected',
    whatsappNumber: '5491112345678',
    rateLimitEnabled: true,
  });
  const server = await startTestServer(app);

  t.after(() => server.close());

  const attempts = [];

  for (let index = 0; index < 6; index += 1) {
    const response = await fetch(`${server.baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@zonalab.test', password: 'clave-de-prueba' }),
    });

    attempts.push({ status: response.status, body: await response.json() });
  }

  assert.deepEqual(
    attempts.slice(0, 5).map((attempt) => attempt.status),
    [503, 503, 503, 503, 503],
  );
  assert.equal(attempts[5].status, 429);
  assert.equal(attempts[5].body.error.code, 'RATE_LIMITED');
});
