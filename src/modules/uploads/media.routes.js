import { Router } from 'express';

import { ensureMediaVariant } from './media.service.js';
import { MEDIA_VARIANT_WIDTHS } from './media-files.js';

export function createMediaDeliveryRouter({ storagePaths, cloudinary = null }) {
  const router = Router();

  router.get('/:file', async (request, response, next) => {
    const fileName = request.params.file;
    const rawWidth = request.query.w;
    const parsedWidth = rawWidth === undefined ? null : Number.parseInt(String(rawWidth), 10);
    const width = MEDIA_VARIANT_WIDTHS.includes(parsedWidth) ? parsedWidth : null;

    if (cloudinary?.enabled) {
      try {
        const entry = await cloudinary.getEntry(fileName);

        if (entry) {
          response.set('Cache-Control', 'public, max-age=31536000, immutable');
          response.redirect(301, cloudinary.buildUrl(entry, { width }));
          return;
        }
      } catch {
        // Si Cloudinary falla, se intenta servir la copia local.
      }
    }

    if (rawWidth === undefined) {
      next();
      return;
    }

    try {
      const variantPath = await ensureMediaVariant({
        directory: storagePaths.media,
        fileName,
        width,
      });

      if (!variantPath) {
        next();
        return;
      }

      response.set('Cache-Control', 'public, max-age=31536000, immutable');
      response.type('image/webp');
      response.sendFile(variantPath, (error) => {
        if (error && !response.headersSent) {
          next(error);
        }
      });
    } catch {
      next();
    }
  });

  return router;
}
