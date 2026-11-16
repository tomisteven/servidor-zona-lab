import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const MIN_SECRET_LENGTH = 16;

function deriveKey(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`El secreto de cifrado debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(value, secret) {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload, secret) {
  if (typeof payload !== 'string' || !payload) {
    return null;
  }

  const [version, ivValue, tagValue, encryptedValue] = payload.split('.');

  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    return null;
  }

  try {
    const key = deriveKey(secret);
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, 'base64url'));

    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
