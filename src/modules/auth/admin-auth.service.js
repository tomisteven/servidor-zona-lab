import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { AppError } from '../../shared/errors/app-error.js';
import { verifyPassword } from './password.js';

export const ADMIN_SESSION_COOKIE = 'zl_admin_session';
export const ADMIN_CSRF_COOKIE = 'zl_admin_csrf';
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signPayload(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');

  return `${body}.${signature}`;
}

function verifyToken(token, secret, expectedEmail, now) {
  if (typeof token !== 'string') {
    return null;
  }

  const [body, signature] = token.split('.');

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = createHmac('sha256', secret).update(body).digest('base64url');

  if (!safeEqualStrings(signature, expectedSignature)) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    payload.sub !== expectedEmail ||
    typeof payload.csrf !== 'string' ||
    payload.csrf.length < 16 ||
    !Number.isInteger(payload.exp) ||
    payload.exp <= now
  ) {
    return null;
  }

  return payload;
}

function readCookie(request, name) {
  const header = request?.headers?.cookie;

  if (typeof header !== 'string') {
    return null;
  }

  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    if (part.slice(0, separatorIndex).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function createAdminAuth({
  enabled = false,
  email = '',
  passwordHash = '',
  sessionSecret = '',
  secureCookies = false,
  sameSite = 'lax',
  now = () => Date.now(),
} = {}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const cookieOptions = {
    sameSite,
    secure: secureCookies,
    path: '/',
  };

  function isConfigured() {
    return enabled && Boolean(normalizedEmail && passwordHash && sessionSecret);
  }

  function setSessionCookies(response, session) {
    response.cookie(ADMIN_SESSION_COOKIE, session.sessionToken, {
      ...cookieOptions,
      httpOnly: true,
      maxAge: ADMIN_SESSION_TTL_MS,
    });
    response.cookie(ADMIN_CSRF_COOKIE, session.csrfToken, {
      ...cookieOptions,
      httpOnly: false,
      maxAge: ADMIN_SESSION_TTL_MS,
    });
  }

  function clearSessionCookies(response) {
    response.clearCookie(ADMIN_SESSION_COOKIE, cookieOptions);
    response.clearCookie(ADMIN_CSRF_COOKIE, cookieOptions);
  }

  function readSession(request) {
    if (!isConfigured()) {
      return null;
    }

    const token = readCookie(request, ADMIN_SESSION_COOKIE);
    return verifyToken(token, sessionSecret, normalizedEmail, now());
  }

  async function login({ email: submittedEmail, password }) {
    if (!isConfigured()) {
      throw new AppError({
        message: 'El acceso administrativo no está configurado.',
        statusCode: 503,
        code: 'ADMIN_NOT_CONFIGURED',
      });
    }

    const emailMatches = safeEqualStrings(
      String(submittedEmail ?? '')
        .trim()
        .toLowerCase(),
      normalizedEmail,
    );
    const passwordMatches = await verifyPassword(password, passwordHash);

    if (!emailMatches || !passwordMatches) {
      throw new AppError({
        message: 'Correo o contraseña incorrectos.',
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    }

    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = now() + ADMIN_SESSION_TTL_MS;
    const sessionToken = signPayload(
      {
        sub: normalizedEmail,
        csrf: csrfToken,
        exp: expiresAt,
      },
      sessionSecret,
    );

    return {
      sessionToken,
      csrfToken,
      expiresAt,
      user: { email: normalizedEmail },
    };
  }

  function requireAdmin(request, _response, next) {
    const session = readSession(request);

    if (!session) {
      next(
        new AppError({
          message: 'Necesitás iniciar sesión como administrador.',
          statusCode: 401,
          code: 'AUTH_REQUIRED',
        }),
      );
      return;
    }

    request.adminSession = session;
    next();
  }

  function requireCsrf(request, _response, next) {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    const submittedToken = request.get('x-csrf-token');

    if (!submittedToken || !safeEqualStrings(submittedToken, request.adminSession?.csrf)) {
      next(
        new AppError({
          message: 'La verificación de seguridad falló. Recargá la página e intentá nuevamente.',
          statusCode: 403,
          code: 'CSRF_INVALID',
        }),
      );
      return;
    }

    next();
  }

  return {
    enabled: isConfigured(),
    requireAdmin,
    requireCsrf,
    setSessionCookies,
    clearSessionCookies,
    readSession,
    login,
  };
}
