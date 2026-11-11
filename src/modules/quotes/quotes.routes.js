import { Router } from 'express';

import { createRateLimiter } from '../../shared/http/rate-limit.js';
import { parseJsonField, validate } from '../../shared/http/validation.js';
import {
  quoteEstimateSchema,
  quoteFileKindSchema,
  quoteListQuerySchema,
  quoteRequestInputSchema,
} from './quote-request.schemas.js';

export function createQuotesPublicRouter({ quoteService, upload, rateLimitEnabled = true }) {
  const router = Router();
  const estimateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    message: 'Hiciste demasiadas consultas de precio. Esperá unos minutos y volvé a intentar.',
    enabled: rateLimitEnabled,
  });
  const createLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    message:
      'Recibimos demasiados pedidos desde esta conexión. Esperá un tiempo o escribinos por WhatsApp.',
    enabled: rateLimitEnabled,
  });

  router.post('/estimate', estimateLimiter, async (request, response) => {
    const input = validate(quoteEstimateSchema, request.body);
    const estimate = await quoteService.estimate(input);

    response.status(200).json({ estimate });
  });

  router.post('/', createLimiter, upload, async (request, response) => {
    const payload = parseJsonField(request.body?.payload, 'payload');
    const input = validate(quoteRequestInputSchema, payload);
    const files = request.files ?? {};
    const result = await quoteService.create(input, {
      logoFile: files.logo?.[0] ?? null,
      referenceFile: files.reference?.[0] ?? null,
    });

    response.status(201).json(result);
  });

  return router;
}

export function createQuotesAdminRouter({ quoteService }) {
  const router = Router();

  router.get('/', async (request, response) => {
    const query = validate(quoteListQuerySchema, request.query);
    const result = await quoteService.list(query);

    response.status(200).json(result);
  });

  router.get('/:id/files/:kind', async (request, response, next) => {
    const kind = validate(quoteFileKindSchema, request.params.kind, {
      message: 'El archivo solicitado no es válido.',
    });
    const file = await quoteService.getFile(request.params.id, kind);

    response.set('Cache-Control', 'private, no-store');
    response.download(file.filePath, file.downloadName, (error) => {
      if (!error) {
        return;
      }

      if (!response.headersSent) {
        next(error);
        return;
      }

      request.log?.warn({ err: error }, 'quote_file_download_failed');
    });
  });

  return router;
}
