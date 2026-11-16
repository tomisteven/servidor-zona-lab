import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { AppError } from '../../shared/errors/app-error.js';
import { validate } from '../../shared/http/validation.js';
import { MEDIA_MIME_TYPES, saveUploadedFile } from './file-validation.js';
import { buildMediaUrl, MEDIA_VARIANT_WIDTHS } from './media-files.js';
import { deleteMediaFile, generateMediaVariants, listMediaFiles } from './media.service.js';

const mediaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(80).optional(),
});

export function createAdminUploadsRouter({ upload, storagePaths, cloudinary = null }) {
  const router = Router();

  router.get('/media', async (request, response) => {
    const query = validate(mediaQuerySchema, request.query);
    const result = await listMediaFiles({ directory: storagePaths.media, ...query });

    response.status(200).json(result);
  });

  router.post('/media', upload, async (request, response) => {
    if (!request.file) {
      throw new AppError({
        message: 'Seleccioná una imagen para subir.',
        statusCode: 400,
        code: 'FILE_REQUIRED',
      });
    }

    const file = await saveUploadedFile({
      file: request.file,
      directory: storagePaths.media,
      allowedMimeTypes: MEDIA_MIME_TYPES,
      publicPathPrefix: '/uploads/media',
      optimizeRaster: true,
    });
    let cloudStored = false;

    if (cloudinary?.enabled) {
      try {
        const buffer = await readFile(path.join(storagePaths.media, file.storageKey));

        await cloudinary.uploadFile({
          fileName: file.storageKey,
          buffer,
          mimeType: file.mimeType,
        });
        cloudStored = true;
      } catch (error) {
        request.log?.warn?.({ err: error }, 'cloudinary_upload_failed');
      }
    }

    const variants = cloudStored
      ? MEDIA_VARIANT_WIDTHS.map((width) => ({
          width,
          url: `${buildMediaUrl(file.storageKey)}?w=${width}`,
        }))
      : await generateMediaVariants({
          directory: storagePaths.media,
          fileName: file.storageKey,
        });

    response.status(201).json({
      file: {
        url: file.url,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        variants,
      },
    });
  });

  router.delete('/media/:file', async (request, response) => {
    await deleteMediaFile({
      directory: storagePaths.media,
      fileName: request.params.file,
      cloudinary,
    });

    response.status(204).end();
  });

  return router;
}
