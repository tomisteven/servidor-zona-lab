import path from 'node:path';

import env from '../src/config/env.js';
import { createStoragePaths } from '../src/config/storage.js';
import { createCloudinaryService } from '../src/modules/uploads/cloudinary.service.js';

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

  await cloudinary.verifyCredentials();
  const count = await cloudinary.syncManifest();

  console.log(`✓ Manifiesto sincronizado: ${count} imágenes en ${env.cloudinaryFolder}.`);
  console.log('  Archivo: storage/cloudinary-media.json');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
