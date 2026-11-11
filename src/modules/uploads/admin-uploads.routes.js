import { Router } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { MEDIA_MIME_TYPES, saveUploadedFile } from './file-validation.js';

export function createAdminUploadsRouter({ upload, storagePaths }) {
  const router = Router();

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
    });

    response.status(201).json({
      file: {
        url: file.url,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      },
    });
  });

  return router;
}
