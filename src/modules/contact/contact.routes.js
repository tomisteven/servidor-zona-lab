import { Router } from 'express';
import { z } from 'zod';

import { AppError } from '../../shared/errors/app-error.js';
import { createRateLimiter } from '../../shared/http/rate-limit.js';
import { validate } from '../../shared/http/validation.js';

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá tu nombre.').max(80),
  email: z.string().trim().max(254).email('Ingresá un correo válido.'),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => {
      if (!value) {
        return true;
      }

      const digits = value.replace(/\D/g, '');

      return /^\+?[\d\s()-]+$/.test(value) && digits.length >= 6 && digits.length <= 15;
    }, 'Ingresá un teléfono válido.')
    .default(''),
  message: z
    .string()
    .trim()
    .min(10, 'Contanos un poco más sobre tu consulta.')
    .max(2000, 'La consulta admite hasta 2000 caracteres.'),
});

export function createContactRouter({
  notifier,
  rateLimitEnabled = true,
  rateLimitStoreFor = null,
}) {
  const router = Router();
  const limiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message:
      'Recibimos demasiadas consultas desde esta conexión. Esperá un rato o escribinos por WhatsApp.',
    enabled: rateLimitEnabled,
    store: rateLimitStoreFor?.('contact'),
  });

  router.post('/', limiter, async (request, response) => {
    const contact = validate(contactSchema, request.body);
    const sent = await notifier.notifyContact({ contact });

    if (!sent) {
      throw new AppError({
        message: 'La consulta no pudo enviarse en este momento. Escribinos por WhatsApp.',
        statusCode: 503,
        code: 'CONTACT_UNAVAILABLE',
      });
    }

    response.status(201).json({ sent: true });
  });

  return router;
}
