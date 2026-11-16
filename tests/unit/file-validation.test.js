import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  MEDIA_MIME_TYPES,
  QUOTE_MIME_TYPES,
  detectFileType,
  resolveStoredFilePath,
  sanitizeOriginalName,
  saveUploadedFile,
} from '../../src/modules/uploads/file-validation.js';

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 7),
]);
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4, 0),
  Buffer.from('WEBP'),
  Buffer.alloc(32, 2),
]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(32, 3)]);
const SAFE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
);
const UNSAFE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

function buildFile(buffer, name, type) {
  return {
    buffer,
    originalname: name,
    mimetype: type,
    size: buffer.length,
  };
}

test('detecta tipos de archivo por firma binaria', () => {
  assert.equal(detectFileType(PNG_BYTES)?.mimeType, 'image/png');
  assert.equal(detectFileType(JPEG_BYTES)?.mimeType, 'image/jpeg');
  assert.equal(detectFileType(WEBP_BYTES)?.mimeType, 'image/webp');
  assert.equal(detectFileType(PDF_BYTES)?.mimeType, 'application/pdf');
  assert.equal(detectFileType(SAFE_SVG)?.mimeType, 'image/svg+xml');
  assert.equal(detectFileType(Buffer.from('no-es-un-archivo-valido')), null);
});

test('sanitiza nombres y bloquea rutas fuera del directorio', () => {
  assert.equal(sanitizeOriginalName('../logo\u0000final.png'), 'logofinal.png');
  assert.equal(sanitizeOriginalName(''), 'archivo');
  assert.throws(
    () => resolveStoredFilePath('storage', '../secreto.png'),
    (error) => {
      assert.equal(error.code, 'FILE_NOT_FOUND');
      return true;
    },
  );
});

test('guarda archivos permitidos con nombre UUID', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zona-lab-upload-'));
  const directoryPath = path.join(directory, 'media');

  try {
    const saved = await saveUploadedFile({
      file: buildFile(PNG_BYTES, 'logo.png', 'image/png'),
      directory: directoryPath,
      allowedMimeTypes: MEDIA_MIME_TYPES,
      publicPathPrefix: '/uploads/media',
    });

    assert.match(saved.storageKey, /^[0-9a-f-]{36}\.png$/);
    assert.equal(saved.mimeType, 'image/png');
    assert.equal(saved.url, `/uploads/media/${saved.storageKey}`);
    assert.deepEqual(await readFile(path.join(directoryPath, saved.storageKey)), PNG_BYTES);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rechaza SVG con contenido activo y acepta SVG simple', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zona-lab-upload-'));

  try {
    await assert.rejects(
      saveUploadedFile({
        file: buildFile(UNSAFE_SVG, 'logo.svg', 'image/svg+xml'),
        directory,
        allowedMimeTypes: QUOTE_MIME_TYPES,
      }),
      (error) => {
        assert.equal(error.code, 'UNSAFE_FILE');
        assert.equal(error.statusCode, 415);
        return true;
      },
    );

    const saved = await saveUploadedFile({
      file: buildFile(SAFE_SVG, 'logo.svg', 'image/svg+xml'),
      directory,
      allowedMimeTypes: QUOTE_MIME_TYPES,
    });

    assert.equal(saved.mimeType, 'image/svg+xml');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rechaza SVG en cargas de media pública', async () => {
  await assert.rejects(
    saveUploadedFile({
      file: buildFile(SAFE_SVG, 'portada.svg', 'image/svg+xml'),
      directory: path.join(tmpdir(), 'zona-lab-no-deberia-crearse'),
      allowedMimeTypes: MEDIA_MIME_TYPES,
    }),
    (error) => {
      assert.equal(error.code, 'UNSUPPORTED_FILE_TYPE');
      return true;
    },
  );
});
