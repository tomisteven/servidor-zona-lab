import { AppError } from '../errors/app-error.js';

export function notFoundHandler(_req, _res, next) {
  next(
    new AppError({
      message: 'Recurso no encontrado.',
      statusCode: 404,
      code: 'NOT_FOUND',
    }),
  );
}
