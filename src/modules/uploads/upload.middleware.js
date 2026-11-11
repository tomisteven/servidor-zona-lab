import multer from 'multer';

import { AppError } from '../../shared/errors/app-error.js';
import { MEDIA_MIME_TYPES, QUOTE_MIME_TYPES } from './file-validation.js';

const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const QUOTE_MAX_BYTES = 10 * 1024 * 1024;

export function createUploadMiddleware(kind) {
  const isQuote = kind === 'quote';
  const allowedMimeTypes = isQuote ? QUOTE_MIME_TYPES : MEDIA_MIME_TYPES;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: isQuote ? QUOTE_MAX_BYTES : MEDIA_MAX_BYTES,
      files: isQuote ? 2 : 1,
    },
    fileFilter(_req, file, callback) {
      if (!allowedMimeTypes.has(file.mimetype)) {
        callback(
          new AppError({
            message: 'El tipo de archivo no está permitido.',
            statusCode: 415,
            code: 'UNSUPPORTED_FILE_TYPE',
          }),
        );
        return;
      }

      callback(null, true);
    },
  });

  if (isQuote) {
    return upload.fields([
      { name: 'logo', maxCount: 1 },
      { name: 'reference', maxCount: 1 },
    ]);
  }

  return upload.single('file');
}
