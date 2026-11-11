import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from '../../src/shared/errors/app-error.js';
import { errorHandler } from '../../src/shared/http/error-handler.js';

function createRequest() {
  return {
    log: {
      error() {},
      warn() {},
    },
  };
}

function createResponse() {
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('no expone detalles de errores inesperados', () => {
  const response = createResponse();

  errorHandler(new Error('fallo interno con datos sensibles'), createRequest(), response, () => {});

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado.',
    },
  });
});

test('traduce errores de aplicación con detalles seguros', () => {
  const response = createResponse();

  errorHandler(
    new AppError({
      message: 'Datos inválidos.',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'name', message: 'Es obligatorio.' }],
    }),
    createRequest(),
    response,
    () => {},
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Datos inválidos.',
      details: [{ field: 'name', message: 'Es obligatorio.' }],
    },
  });
});
