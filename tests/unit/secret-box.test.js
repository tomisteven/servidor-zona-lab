import assert from 'node:assert/strict';
import test from 'node:test';

import { decryptSecret, encryptSecret } from '../../src/shared/crypto/secret-box.js';

const SECRET = 'secreto-de-prueba-con-longitud-suficiente';

test('cifra y descifra un secreto con AES-256-GCM', () => {
  const encrypted = encryptSecret('contraseña-de-aplicación', SECRET);

  assert.match(encrypted, /^v1\./);
  assert.notEqual(encrypted, 'contraseña-de-aplicación');
  assert.equal(decryptSecret(encrypted, SECRET), 'contraseña-de-aplicación');
});

test('rechaza secretos alterados o con otra clave', () => {
  const encrypted = encryptSecret('contraseña-de-aplicación', SECRET);
  const tampered = `${encrypted.slice(0, -2)}aa`;

  assert.equal(decryptSecret(tampered, SECRET), null);
  assert.equal(decryptSecret(encrypted, 'otra-clave-suficientemente-larga'), null);
  assert.equal(decryptSecret('valor-invalido', SECRET), null);
});

test('maneja valores vacíos y exige una clave válida para cifrar', () => {
  assert.equal(encryptSecret('', SECRET), '');
  assert.equal(decryptSecret('', SECRET), null);
  assert.throws(() => encryptSecret('valor', 'corta'), /al menos 16 caracteres/);
});
