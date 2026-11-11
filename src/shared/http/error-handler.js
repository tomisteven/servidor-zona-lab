import { AppError } from '../errors/app-error.js';

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return new AppError({
      message: 'El cuerpo de la solicitud no es JSON válido.',
      statusCode: 400,
      code: 'INVALID_JSON',
    });
  }

  if (error?.type === 'entity.too.large') {
    return new AppError({
      message: 'La solicitud es demasiado grande.',
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }

  if (error?.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError({
        message: 'El archivo supera el tamaño máximo permitido.',
        statusCode: 413,
        code: 'FILE_TOO_LARGE',
      });
    }

    return new AppError({
      message: 'No se pudo procesar el archivo enviado.',
      statusCode: 400,
      code: 'UPLOAD_ERROR',
    });
  }

  if (error?.name === 'CastError') {
    return new AppError({
      message: 'El identificador enviado no es válido.',
      statusCode: 400,
      code: 'INVALID_ID',
    });
  }

  if (error?.name === 'ValidationError' && error?.errors) {
    return new AppError({
      message: 'Los datos enviados no son válidos.',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  if (error?.code === 11000) {
    return new AppError({
      message: 'Ya existe un registro con esos datos.',
      statusCode: 409,
      code: 'CONFLICT',
    });
  }

  return null;
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalizeError(error);
  const statusCode = appError?.statusCode ?? 500;
  const payload = {
    error: {
      code: appError?.code ?? 'INTERNAL_ERROR',
      message: appError?.message ?? 'Ocurrió un error inesperado.',
    },
  };

  if (appError?.details !== undefined) {
    payload.error.details = appError.details;
  }

  if (statusCode >= 500) {
    req.log?.error({ err: error }, 'request_failed');
  } else {
    req.log?.warn({ code: payload.error.code, statusCode }, 'request_rejected');
  }

  res.status(statusCode).json(payload);
}
