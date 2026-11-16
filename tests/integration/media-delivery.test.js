import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';

import { createMediaDeliveryRouter } from '../../src/modules/uploads/media.routes.js';
import { startTestServer } from '../helpers/server-harness.js';

test('redirige las imágenes migradas a Cloudinary con transformación responsive', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zona-lab-media-delivery-'));
  const cloudinary = {
    enabled: true,
    async getEntry(fileName) {
      return fileName === 'foto.png' ? { publicId: 'zona-lab/media/foto', version: 123 } : null;
    },
    buildUrl(entry, { width = null } = {}) {
      const transformation = width ? `w_${width},c_limit,q_auto,f_auto` : 'q_auto,f_auto';

      return `https://res.cloudinary.com/demo/image/upload/${transformation}/v${entry.version}/${entry.publicId}`;
    },
  };
  const app = express();

  app.use(
    '/uploads/media',
    createMediaDeliveryRouter({ storagePaths: { media: directory }, cloudinary }),
  );

  const server = await startTestServer(app);

  try {
    const responsive = await fetch(`${server.baseUrl}/uploads/media/foto.png?w=480`, {
      redirect: 'manual',
    });

    assert.equal(responsive.status, 301);
    assert.equal(
      responsive.headers.get('location'),
      'https://res.cloudinary.com/demo/image/upload/w_480,c_limit,q_auto,f_auto/v123/zona-lab/media/foto',
    );
    assert.match(responsive.headers.get('cache-control') ?? '', /immutable/);

    const original = await fetch(`${server.baseUrl}/uploads/media/foto.png`, {
      redirect: 'manual',
    });

    assert.equal(original.status, 301);
    assert.equal(
      original.headers.get('location'),
      'https://res.cloudinary.com/demo/image/upload/q_auto,f_auto/v123/zona-lab/media/foto',
    );

    const missing = await fetch(`${server.baseUrl}/uploads/media/otra.png`, {
      redirect: 'manual',
    });

    assert.equal(missing.status, 404);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
