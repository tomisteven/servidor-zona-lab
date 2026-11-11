import { AppError } from '../errors/app-error.js';

export function validate(schema, value, { message = 'Revisá los datos enviados.' } = {}) {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message,
  }));

  throw new AppError({
    message,
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    details,
  });
}

export function parseJsonField(rawValue, fieldName) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    throw new AppError({
      message: `El campo ${fieldName} es obligatorio.`,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: fieldName, message: 'Es obligatorio.' }],
    });
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    throw new AppError({
      message: `El campo ${fieldName} no contiene JSON válido.`,
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: fieldName, message: 'Debe contener JSON válido.' }],
    });
  }
}

export function parsePagination(rawQuery, { defaultLimit = 12, maxLimit = 100 } = {}) {
  const pageValue = Number(rawQuery?.page ?? 1);
  const limitValue = Number(rawQuery?.limit ?? defaultLimit);

  const page = Number.isInteger(pageValue) && pageValue >= 1 && pageValue <= 100000 ? pageValue : 1;
  const limit =
    Number.isInteger(limitValue) && limitValue >= 1 && limitValue <= maxLimit
      ? limitValue
      : defaultLimit;

  return { page, limit };
}
