import { Router } from 'express';
import { z } from 'zod';

import { createRateLimiter } from '../../shared/http/rate-limit.js';
import { validate } from '../../shared/http/validation.js';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'El correo es obligatorio.')
    .max(254, 'El correo es demasiado largo.')
    .email('Ingresá un correo válido.'),
  password: z
    .string()
    .min(1, 'La contraseña es obligatoria.')
    .max(200, 'La contraseña es demasiado larga.'),
});

export function createAdminAuthRouter({ adminAuth, rateLimitEnabled = true }) {
  const router = Router();
  const loginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: 'Demasiados intentos de acceso. Esperá unos minutos antes de reintentar.',
    enabled: rateLimitEnabled,
  });

  router.post('/login', loginLimiter, async (request, response) => {
    const credentials = validate(loginSchema, request.body);
    const session = await adminAuth.login(credentials);

    adminAuth.setSessionCookies(response, session);

    response.status(200).json({
      user: session.user,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    });
  });

  router.get('/session', adminAuth.requireAdmin, (request, response) => {
    response.status(200).json({
      user: { email: request.adminSession.sub },
      csrfToken: request.adminSession.csrf,
      expiresAt: request.adminSession.exp,
    });
  });

  router.post('/logout', adminAuth.requireAdmin, adminAuth.requireCsrf, (_request, response) => {
    adminAuth.clearSessionCookies(response);
    response.status(204).end();
  });

  return router;
}
