import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import env from '../src/config/env.js';
import { createStoragePaths } from '../src/config/storage.js';
import { createCloudinaryService } from '../src/modules/uploads/cloudinary.service.js';
import { isMediaFileName } from '../src/modules/uploads/media-files.js';

const applyChanges = process.argv.includes('--apply');
const forceUpload = process.argv.includes('--force');

async function main() {
  if (!env.cloudinaryEnabled) {
    throw new Error(
      'Cloudinary no está configurado. Definí CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET.',
    );
  }

  const storagePaths = createStoragePaths();
  const cloudinary = createCloudinaryService({
    enabled: true,
    cloudName: env.cloudinaryCloudName,
    apiKey: env.cloudinaryApiKey,
    apiSecret: env.cloudinaryApiSecret,
    folder: env.cloudinaryFolder,
    manifestPath: path.join(storagePaths.root, 'cloudinary-media.json'),
  });
  const allFiles = await readdir(storagePaths.media).catch(() => []);
  const files = allFiles.filter((fileName) => isMediaFileName(fileName));
  const pending = [];

  await cloudinary.verifyCredentials();

  for (const fileName of files) {
    const entry = await cloudinary.getEntry(fileName);

    if (entry && !forceUpload) {
      continue;
    }

    pending.push(fileName);
  }

  if (pending.length === 0) {
    console.log(`Todas las imágenes (${files.length}) ya están en Cloudinary.`);
    return;
  }

  console.log(
    `${pending.length} de ${files.length} imagen(es) para subir${applyChanges ? '' : ' (simulación)'}:`,
  );

  if (!applyChanges) {
    for (const fileName of pending) {
      console.log(`- ${fileName}`);
    }

    console.log('\nEjecutá con --apply para subirlas. Usá --force para reemplazar las existentes.');
    return;
  }

  let uploaded = 0;
  let failed = 0;

  for (const fileName of pending) {
    const filePath = path.join(storagePaths.media, fileName);

    try {
      const buffer = await readFile(filePath);
      const entry = await cloudinary.uploadFile({
        fileName,
        buffer,
        mimeType: mimeTypeFor(fileName),
      });

      uploaded += 1;
      console.log(`✓ ${fileName} → ${entry.publicId}`);
    } catch (error) {
      failed += 1;
      console.warn(`✗ ${fileName}: ${error.message}`);
    }
  }

  console.log(`\nListo: ${uploaded} subidas, ${failed} con error.`);
  console.log(
    'Las copias locales se conservan como respaldo. El servidor redirige a Cloudinary automáticamente.',
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

function mimeTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
