import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const HASH_PREFIX = 'scrypt';

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new TypeError('La contraseña debe tener al menos 12 caracteres.');
  }

  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scrypt(password, salt, KEY_BYTES);

  return `${HASH_PREFIX}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const [prefix, saltHex, hashHex] = storedHash.split('$');

  if (
    prefix !== HASH_PREFIX ||
    !/^[0-9a-f]{32}$/i.test(saltHex ?? '') ||
    !/^[0-9a-f]{128}$/i.test(hashHex ?? '')
  ) {
    return false;
  }

  const expectedHash = Buffer.from(hashHex, 'hex');
  const derivedKey = await scrypt(password, Buffer.from(saltHex, 'hex'), expectedHash.length);

  return derivedKey.length === expectedHash.length && timingSafeEqual(derivedKey, expectedHash);
}
