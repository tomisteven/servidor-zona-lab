import { Router } from 'express';

import { createRateLimiter } from '../../shared/http/rate-limit.js';
import { parseJsonField, validate } from '../../shared/http/validation.js';
import {
  quoteEstimateSchema,
  quoteFileKindSchema,
  quoteListQuerySchema,
  quoteRequestInputSchema,
  quoteUpdateSchema,
} from './quote-request.schemas.js';

export function createQuotesPublicRouter({
  quoteService,
  notifier,
  upload,
  rateLimitEnabled = true,
  rateLimitStoreFor = null,
}) {
  const router = Router();
  const estimateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    message: 'Hiciste demasiadas consultas de precio. Esperá unos minutos y volvé a intentar.',
    enabled: rateLimitEnabled,
    store: rateLimitStoreFor?.('quote-estimate'),
  });
  const createLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    message:
      'Recibimos demasiados pedidos desde esta conexión. Esperá un tiempo o escribinos por WhatsApp.',
    enabled: rateLimitEnabled,
    store: rateLimitStoreFor?.('quote-create'),
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
    void notifier?.notifyQuote({ quote: result, input });
  });

  return router;
}

export function createQuotesAdminRouter({ quoteService, notifier }) {
  const router = Router();

  router.get('/', async (request, response) => {
    const query = validate(quoteListQuerySchema, request.query);
    const result = await quoteService.list(query);

    response.status(200).json(result);
  });

  router.get('/export', async (request, response) => {
    const query = validate(quoteListQuerySchema, request.query);
    const csv = await quoteService.exportCsv(query);

    response.set('Content-Type', 'text/csv; charset=utf-8');
    response.set(
      'Content-Disposition',
      `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    response.send(csv);
  });

  router.delete('/:id', async (request, response) => {
    await quoteService.remove(request.params.id);
    response.status(204).end();
  });

  router.post('/:id/anonymize', async (request, response) => {
    const result = await quoteService.anonymize(request.params.id);

    response.status(200).json(result);
  });

  router.patch('/:id', async (request, response) => {
    const input = validate(quoteUpdateSchema, request.body);
    const result = await quoteService.update(request.params.id, input);

    response.status(200).json({ quote: result.quote });

    if (result.statusChanged) {
      void notifier?.notifyStatusChange({ quote: result.quote });
    }
  });

  router.get('/:id/files/:kind', async (request, response, next) => {
    const kind = validate(quoteFileKindSchema, request.params.kind, {
      message: 'El archivo solicitado no es válido.',
    });
    const file = await quoteService.getFile(request.params.id, kind);
    const inlineImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
    const inline = request.query.inline === '1' && inlineImageTypes.has(file.mimeType);

    function handleFileError(error) {
      if (!error) {
        return;
      }

      if (!response.headersSent) {
        next(error);
        return;
      }

      request.log?.warn({ err: error }, 'quote_file_download_failed');
    }

    response.set('Cache-Control', 'private, no-store');

    if (inline) {
      response.type(file.mimeType);
      response.set(
        'Content-Disposition',
        `inline; filename="${file.downloadName.replace(/["\r\n]/g, '')}"`,
      );
      response.sendFile(file.filePath, handleFileError);
      return;
    }

    response.download(file.filePath, file.downloadName, handleFileError);
  });

  return router;
}
