const DEFAULT_PORT = 5050;
const DEFAULT_CORS_ORIGINS = ['http://localhost:8080'];
const DEFAULT_LOG_LEVEL = 'info';

const SUPPORTED_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const SUPPORTED_SAME_SITE_VALUES = new Set(['lax', 'strict', 'none']);
const SUPPORTED_LOG_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);
const MONGODB_URI_PATTERN = /^mongodb(\+srv)?:\/\/\S+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_PASSWORD_HASH_PATTERN = /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/;
const WHATSAPP_CHARACTERS_PATTERN = /^\+?[\d\s()-]+$/;
const MIN_SESSION_SECRET_LENGTH = 32;

function parsePort(rawValue, errors) {
  if (rawValue === undefined) {
    return DEFAULT_PORT;
  }

  const value = String(rawValue).trim();

  if (!/^\d+$/.test(value)) {
    errors.push('PORT debe ser un número entero.');
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (port < 1 || port > 65535) {
    errors.push('PORT debe estar entre 1 y 65535.');
    return DEFAULT_PORT;
  }

  return port;
}

function parseMongodbUri(rawValue, errors) {
  const value = String(rawValue ?? '').trim();

  if (!value) {
    errors.push('MONGODB_URI es obligatorio.');
    return '';
  }

  if (!MONGODB_URI_PATTERN.test(value)) {
    errors.push('MONGODB_URI debe usar el esquema mongodb:// o mongodb+srv://.');
  }

  return value;
}

function parseCorsOrigins(rawValue, errors) {
  if (rawValue === undefined) {
    return [...DEFAULT_CORS_ORIGINS];
  }

  const values = String(rawValue)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (values.length === 0) {
    errors.push('CORS_ORIGINS debe contener al menos un origen.');
    return [];
  }

  const origins = [];

  for (const value of values) {
    if (value === '*') {
      errors.push('CORS_ORIGINS no admite comodines; indicá orígenes explícitos.');
      continue;
    }

    try {
      const url = new URL(value);
      const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
      const isBareOrigin = url.pathname === '/' && !url.search && !url.hash;

      if (!isHttp || !isBareOrigin) {
        errors.push('CORS_ORIGINS contiene un origen inválido.');
        continue;
      }

      origins.push(url.origin);
    } catch {
      errors.push('CORS_ORIGINS contiene un origen inválido.');
    }
  }

  return [...new Set(origins)];
}

function parseCookieSameSite(rawValue, errors) {
  if (rawValue === undefined) {
    return 'lax';
  }

  const value = String(rawValue).trim().toLowerCase();

  if (!SUPPORTED_SAME_SITE_VALUES.has(value)) {
    errors.push(`COOKIE_SAME_SITE debe ser uno de: ${[...SUPPORTED_SAME_SITE_VALUES].join(', ')}.`);
    return 'lax';
  }

  return value;
}

function parseTrustProxy(rawValue, errors) {
  if (rawValue === undefined) {
    return false;
  }

  const value = String(rawValue).trim().toLowerCase();

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  errors.push('TRUST_PROXY debe ser true o false.');
  return false;
}

function parseLogLevel(rawValue, errors) {
  if (rawValue === undefined) {
    return DEFAULT_LOG_LEVEL;
  }

  const value = String(rawValue).trim();

  if (!SUPPORTED_LOG_LEVELS.has(value)) {
    errors.push(`LOG_LEVEL debe ser uno de: ${[...SUPPORTED_LOG_LEVELS].join(', ')}.`);
    return DEFAULT_LOG_LEVEL;
  }

  return value;
}

function parseWhatsappNumber(rawValue, errors) {
  const value = String(rawValue ?? '').trim();

  if (!value) {
    errors.push('WHATSAPP_NUMBER es obligatorio.');
    return '';
  }

  if (!WHATSAPP_CHARACTERS_PATTERN.test(value)) {
    errors.push(
      'WHATSAPP_NUMBER solo admite dígitos, espacios, paréntesis, guiones y un + inicial.',
    );
    return '';
  }

  const digits = value.replace(/\D/g, '');

  if (digits.length < 10 || digits.length > 15) {
    errors.push('WHATSAPP_NUMBER debe contener entre 10 y 15 dígitos.');
    return '';
  }

  return digits;
}

function parseAdminConfiguration(source, nodeEnv, errors) {
  const values = {
    adminEmail: String(source.ADMIN_EMAIL ?? '')
      .trim()
      .toLowerCase(),
    adminPasswordHash: String(source.ADMIN_PASSWORD_HASH ?? '').trim(),
    sessionSecret: String(source.SESSION_SECRET ?? '').trim(),
  };
  const configuredFields = Object.values(values).filter(Boolean).length;
  const isProduction = nodeEnv === 'production';

  if (configuredFields === 0 && !isProduction) {
    return { ...values, adminEnabled: false };
  }

  if (configuredFields === 0) {
    errors.push(
      'ADMIN_EMAIL, ADMIN_PASSWORD_HASH y SESSION_SECRET son obligatorios en producción.',
    );
    return { ...values, adminEnabled: false };
  }

  if (!values.adminEmail) {
    errors.push('ADMIN_EMAIL es obligatorio cuando se configura el administrador.');
  } else if (!EMAIL_PATTERN.test(values.adminEmail) || values.adminEmail.length > 254) {
    errors.push('ADMIN_EMAIL debe ser una dirección de correo válida.');
  }

  if (!values.adminPasswordHash) {
    errors.push('ADMIN_PASSWORD_HASH es obligatorio cuando se configura el administrador.');
  } else if (!ADMIN_PASSWORD_HASH_PATTERN.test(values.adminPasswordHash)) {
    errors.push('ADMIN_PASSWORD_HASH debe generarse con npm run admin:hash.');
  }

  if (!values.sessionSecret) {
    errors.push('SESSION_SECRET es obligatorio cuando se configura el administrador.');
  } else if (values.sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    errors.push(`SESSION_SECRET debe tener al menos ${MIN_SESSION_SECRET_LENGTH} caracteres.`);
  }

  return {
    ...values,
    adminEnabled:
      Boolean(values.adminEmail) &&
      Boolean(values.adminPasswordHash) &&
      Boolean(values.sessionSecret),
  };
}

function parseNodeEnvironment(rawValue, errors) {
  if (rawValue === undefined) {
    return 'development';
  }

  const value = String(rawValue).trim();

  if (!SUPPORTED_ENVIRONMENTS.has(value)) {
    errors.push(`NODE_ENV debe ser uno de: ${[...SUPPORTED_ENVIRONMENTS].join(', ')}.`);
    return 'development';
  }

  return value;
}

export function validateEnvironment(source = {}) {
  const errors = [];
  const nodeEnv = parseNodeEnvironment(source.NODE_ENV, errors);
  const adminConfiguration = parseAdminConfiguration(source, nodeEnv, errors);

  const environment = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: parsePort(source.PORT, errors),
    mongodbUri: parseMongodbUri(source.MONGODB_URI, errors),
    corsOrigins: parseCorsOrigins(source.CORS_ORIGINS, errors),
    cookieSameSite: parseCookieSameSite(source.COOKIE_SAME_SITE, errors),
    trustProxy: parseTrustProxy(source.TRUST_PROXY, errors),
    logLevel: parseLogLevel(source.LOG_LEVEL, errors),
    whatsappNumber: parseWhatsappNumber(source.WHATSAPP_NUMBER, errors),
    ...adminConfiguration,
  };

  if (errors.length > 0) {
    const error = new Error(`Configuración de entorno inválida:\n- ${errors.join('\n- ')}`);
    error.name = 'EnvironmentValidationError';
    throw error;
  }

  return Object.freeze(environment);
}
