import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnvironment } from '../../src/config/validate-environment.js';

const VALID_ADMIN_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
const MINIMUM_ENVIRONMENT = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/zona_lab_test',
  WHATSAPP_NUMBER: '+54 9 11 1234-5678',
};

test('aplica valores por defecto seguros para desarrollo', () => {
  const environment = validateEnvironment(MINIMUM_ENVIRONMENT);

  assert.equal(environment.nodeEnv, 'development');
  assert.equal(environment.isProduction, false);
  assert.equal(environment.port, 5050);
  assert.equal(environment.logLevel, 'info');
  assert.equal(environment.whatsappNumber, '5491112345678');
  assert.equal(environment.cookieSameSite, 'lax');
  assert.equal(environment.trustProxy, false);
  assert.equal(environment.adminEnabled, false);
  assert.deepEqual(environment.corsOrigins, ['http://localhost:8080']);
});

test('normaliza y deduplica orígenes CORS', () => {
  const environment = validateEnvironment({
    ...MINIMUM_ENVIRONMENT,
    NODE_ENV: 'test',
    PORT: '3100',
    CORS_ORIGINS: 'https://app.example.com, https://app.example.com/',
    COOKIE_SAME_SITE: 'none',
    TRUST_PROXY: 'true',
    LOG_LEVEL: 'warn',
  });

  assert.equal(environment.nodeEnv, 'test');
  assert.equal(environment.port, 3100);
  assert.equal(environment.logLevel, 'warn');
  assert.equal(environment.cookieSameSite, 'none');
  assert.equal(environment.trustProxy, true);
  assert.deepEqual(environment.corsOrigins, ['https://app.example.com']);
});

test('falla si falta MONGODB_URI', () => {
  assert.throws(() => validateEnvironment({}), /MONGODB_URI es obligatorio/);
});

test('rechaza URI, puerto, entorno, nivel de log y CORS inválidos', () => {
  assert.throws(
    () =>
      validateEnvironment({
        MONGODB_URI: 'postgres://localhost/app',
        WHATSAPP_NUMBER: '+54 9 11 1234-5678',
        PORT: '70000',
        NODE_ENV: 'staging',
        LOG_LEVEL: 'verbose',
        CORS_ORIGINS: '*',
        COOKIE_SAME_SITE: 'cross-site',
        TRUST_PROXY: 'yes',
      }),
    (error) => {
      assert.match(error.message, /MONGODB_URI/);
      assert.match(error.message, /PORT/);
      assert.match(error.message, /NODE_ENV/);
      assert.match(error.message, /LOG_LEVEL/);
      assert.match(error.message, /CORS_ORIGINS/);
      assert.match(error.message, /COOKIE_SAME_SITE/);
      assert.match(error.message, /TRUST_PROXY/);
      return true;
    },
  );
});

test('exige un WhatsApp válido', () => {
  assert.throws(
    () => validateEnvironment({ MONGODB_URI: MINIMUM_ENVIRONMENT.MONGODB_URI }),
    /WHATSAPP_NUMBER es obligatorio/,
  );
  assert.throws(
    () =>
      validateEnvironment({
        ...MINIMUM_ENVIRONMENT,
        WHATSAPP_NUMBER: '123',
      }),
    /entre 10 y 15 dígitos/,
  );
});

test('habilita el administrador solo con las tres variables válidas', () => {
  const environment = validateEnvironment({
    ...MINIMUM_ENVIRONMENT,
    ADMIN_EMAIL: 'Admin@ZonaLab.com',
    ADMIN_PASSWORD_HASH: VALID_ADMIN_HASH,
    SESSION_SECRET: 's'.repeat(40),
  });

  assert.equal(environment.adminEnabled, true);
  assert.equal(environment.adminEmail, 'admin@zonalab.com');
});

test('rechaza una configuración parcial del administrador', () => {
  assert.throws(
    () =>
      validateEnvironment({
        ...MINIMUM_ENVIRONMENT,
        ADMIN_EMAIL: 'admin@zonalab.com',
      }),
    (error) => {
      assert.match(error.message, /ADMIN_PASSWORD_HASH/);
      assert.match(error.message, /SESSION_SECRET/);
      return true;
    },
  );
});

test('exige administrador en producción', () => {
  assert.throws(
    () =>
      validateEnvironment({
        ...MINIMUM_ENVIRONMENT,
        NODE_ENV: 'production',
      }),
    /son obligatorios en producción/,
  );
});
