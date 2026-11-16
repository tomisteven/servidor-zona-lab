import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCloudinaryUrl,
  createCloudinaryService,
  signCloudinaryParams,
} from '../../src/modules/uploads/cloudinary.service.js';

test('firma parámetros de Cloudinary en orden alfabético', () => {
  assert.equal(
    signCloudinaryParams({ timestamp: 1315060510, public_id: 'sample_image' }, 'abcd'),
    'b4ad47fb4e25c7bf5f92a20089f9db59bc302313',
  );
});

test('construye URLs de Cloudinary con versión y ancho', () => {
  assert.equal(
    buildCloudinaryUrl({
      cloudName: 'demo',
      publicId: 'zona-lab/media/bolso',
      version: 123,
    }),
    'https://res.cloudinary.com/demo/image/upload/q_auto,f_auto/v123/zona-lab/media/bolso',
  );
  assert.equal(
    buildCloudinaryUrl({
      cloudName: 'demo',
      publicId: 'zona-lab/media/bolso',
      version: 123,
      width: 480,
    }),
    'https://res.cloudinary.com/demo/image/upload/w_480,c_limit,q_auto,f_auto/v123/zona-lab/media/bolso',
  );
});

test('sube, registra y elimina una imagen en Cloudinary', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zona-lab-cloudinary-'));
  const manifestPath = path.join(directory, 'cloudinary-media.json');
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), body: options.body });

    return {
      ok: true,
      status: 200,
      async json() {
        return { public_id: 'zona-lab/media/foto', version: 42 };
      },
      async text() {
        return '';
      },
    };
  };

  try {
    const cloudinary = createCloudinaryService({
      enabled: true,
      cloudName: 'demo',
      apiKey: 'key',
      apiSecret: 'secret',
      folder: 'zona-lab/media',
      manifestPath,
    });
    const entry = await cloudinary.uploadFile({
      fileName: 'foto.png',
      buffer: Buffer.from('imagen'),
      mimeType: 'image/png',
    });

    assert.equal(entry.publicId, 'zona-lab/media/foto');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/demo\/image\/upload$/);
    assert.equal(calls[0].body.get('api_key'), 'key');
    assert.equal(calls[0].body.get('public_id'), 'zona-lab/media/foto');
    assert.ok(calls[0].body.get('signature'));

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    assert.equal(manifest.files['foto.png'].publicId, 'zona-lab/media/foto');
    assert.equal(
      cloudinary.buildUrl(await cloudinary.getEntry('foto.png'), { width: 960 }),
      'https://res.cloudinary.com/demo/image/upload/w_960,c_limit,q_auto,f_auto/v42/zona-lab/media/foto',
    );

    const destroyed = await cloudinary.destroyFile({ fileName: 'foto.png' });

    assert.equal(destroyed, true);
    assert.match(calls[1].url, /\/demo\/image\/destroy$/);
    assert.equal(calls[1].body.get('public_id'), 'zona-lab/media/foto');
    assert.equal(await cloudinary.getEntry('foto.png'), null);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('detecta credenciales de Cloudinary inválidas', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    async text() {
      return '{"error":{"message":"api_secret mismatch"}}';
    },
  });

  try {
    const cloudinary = createCloudinaryService({
      enabled: true,
      cloudName: 'demo',
      apiKey: 'key',
      apiSecret: 'secret',
      manifestPath: path.join(tmpdir(), 'no-usado-cloudinary.json'),
    });

    await assert.rejects(cloudinary.verifyCredentials(), /api_secret mismatch/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sincroniza el manifiesto con las imágenes de Cloudinary', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zona-lab-cloudinary-sync-'));
  const manifestPath = path.join(directory, 'cloudinary-media.json');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        resources: [
          {
            public_id: 'zona-lab/media/bolso',
            format: 'jpg',
            version: 7,
            created_at: '2026-11-14T10:00:00.000Z',
          },
        ],
        next_cursor: null,
      };
    },
  });

  try {
    const cloudinary = createCloudinaryService({
      enabled: true,
      cloudName: 'demo',
      apiKey: 'key',
      apiSecret: 'secret',
      folder: 'zona-lab/media',
      manifestPath,
    });
    const count = await cloudinary.syncManifest();
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    assert.equal(count, 1);
    assert.equal(manifest.files['bolso.jpg'].publicId, 'zona-lab/media/bolso');
    assert.equal(manifest.files['bolso.jpg'].version, 7);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});
