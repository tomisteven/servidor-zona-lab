import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  createAdminAuth,
} from '../../src/modules/auth/admin-auth.service.js';
import { hashPassword, verifyPassword } from '../../src/modules/auth/password.js';

const EMAIL = 'admin@zonalab.test';
const PASSWORD = 'clave-de-prueba-segura';
const SESSION_SECRET = 's'.repeat(48);

async function createConfiguredAuth() {
  return createAdminAuth({
    enabled: true,
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    sessionSecret: SESSION_SECRET,
  });
}

test('hashea y verifica contraseñas con scrypt', async () => {
  const hash = await hashPassword(PASSWORD);

  assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword(PASSWORD, hash), true);
  assert.equal(await verifyPassword('otra-clave', hash), false);
});

test('inicia sesión, firma la cookie y valida CSRF', async () => {
  const auth = await createConfiguredAuth();
  const session = await auth.login({ email: EMAIL, password: PASSWORD });
  const cookies = [];

  auth.setSessionCookies(
    {
      cookie(name, value, options) {
        cookies.push({ name, value, options });
      },
    },
    session,
  );

  const sessionCookie = cookies.find((cookie) => cookie.name === ADMIN_SESSION_COOKIE);
  const csrfCookie = cookies.find((cookie) => cookie.name === ADMIN_CSRF_COOKIE);

  assert.ok(sessionCookie);
  assert.ok(csrfCookie);
  assert.equal(sessionCookie.options.httpOnly, true);
  assert.equal(csrfCookie.options.httpOnly, false);

  const request = {
    method: 'POST',
    headers: {
      cookie: `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionCookie.value)}`,
    },
    get(name) {
      return name === 'x-csrf-token' ? session.csrfToken : undefined;
    },
  };

  let adminError = null;
  auth.requireAdmin(request, {}, (error) => {
    adminError = error ?? null;
  });
  assert.equal(adminError, null);
  assert.equal(request.adminSession.sub, EMAIL);

  let csrfError = null;
  auth.requireCsrf(request, {}, (error) => {
    csrfError = error ?? null;
  });
  assert.equal(csrfError, null);
});

test('configura cookies cross-site con SameSite none y Secure', async () => {
  const auth = createAdminAuth({
    enabled: true,
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    sessionSecret: SESSION_SECRET,
    sameSite: 'none',
    secureCookies: true,
  });
  const session = await auth.login({ email: EMAIL, password: PASSWORD });
  const cookies = [];

  auth.setSessionCookies(
    {
      cookie(name, value, options) {
        cookies.push({ name, value, options });
      },
    },
    session,
  );

  for (const cookie of cookies) {
    assert.equal(cookie.options.sameSite, 'none');
    assert.equal(cookie.options.secure, true);
  }
});

test('rechaza credenciales inválidas sin distinguir el campo', async () => {
  const auth = await createConfiguredAuth();

  await assert.rejects(auth.login({ email: EMAIL, password: 'incorrecta' }), (error) => {
    assert.equal(error.code, 'INVALID_CREDENTIALS');
    assert.equal(error.statusCode, 401);
    return true;
  });
});

test('rechaza peticiones sin sesión o sin token CSRF', async () => {
  const auth = await createConfiguredAuth();

  let authError = null;
  auth.requireAdmin({ headers: {} }, {}, (error) => {
    authError = error;
  });
  assert.equal(authError.statusCode, 401);
  assert.equal(authError.code, 'AUTH_REQUIRED');

  const request = {
    method: 'POST',
    adminSession: { csrf: 'token-esperado' },
    get() {
      return 'token-incorrecto';
    },
  };
  let csrfError = null;
  auth.requireCsrf(request, {}, (error) => {
    csrfError = error;
  });
  assert.equal(csrfError.statusCode, 403);
  assert.equal(csrfError.code, 'CSRF_INVALID');
});

test('el login responde 503 si el administrador no está configurado', async () => {
  const auth = createAdminAuth({ enabled: false });

  await assert.rejects(auth.login({ email: EMAIL, password: PASSWORD }), (error) => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, 'ADMIN_NOT_CONFIGURED');
    return true;
  });
});
