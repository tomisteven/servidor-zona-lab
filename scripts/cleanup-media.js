import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import env from '../src/config/env.js';
import { createStoragePaths } from '../src/config/storage.js';
import { Product } from '../src/modules/catalog/product.model.js';
import { SiteSettings } from '../src/modules/settings/site-settings.model.js';
import { createCloudinaryService } from '../src/modules/uploads/cloudinary.service.js';
import { getMediaVariantNames, isMediaFileName } from '../src/modules/uploads/media-files.js';

const applyChanges = process.argv.includes('--apply');

async function listReferencedMedia() {
  const [products, settings] = await Promise.all([
    Product.find({ deletedAt: null }).select('imageUrl images').lean(),
    SiteSettings.find({ key: 'main' }).select('heroImageUrl').lean(),
  ]);
  const references = new Set();

  for (const product of products) {
    if (product.imageUrl) {
      references.add(product.imageUrl);
    }

    for (const imageUrl of product.images ?? []) {
      if (imageUrl) {
        references.add(imageUrl);
      }
    }
  }

  for (const document of settings) {
    if (document.heroImageUrl) {
      references.add(document.heroImageUrl);
    }
  }

  return references;
}

async function main() {
  await connectDatabase(env.mongodbUri);

  try {
    const storagePaths = createStoragePaths();
    const cloudinary = createCloudinaryService({
      enabled: env.cloudinaryEnabled,
      cloudName: env.cloudinaryCloudName,
      apiKey: env.cloudinaryApiKey,
      apiSecret: env.cloudinaryApiSecret,
      folder: env.cloudinaryFolder,
      manifestPath: path.join(storagePaths.root, 'cloudinary-media.json'),
    });
    const files = await readdir(storagePaths.media).catch(() => []);
    const references = await listReferencedMedia();
    const orphans = files.filter(
      (fileName) => isMediaFileName(fileName) && !references.has(`/uploads/media/${fileName}`),
    );

    if (orphans.length === 0) {
      console.log('No hay archivos de media sin referencias.');
      return;
    }

    console.log(
      `${orphans.length} archivo(s) sin referencias${applyChanges ? '' : ' (simulación)'}:`,
    );

    for (const fileName of orphans) {
      console.log(`- ${fileName}`);

      if (applyChanges) {
        await Promise.all([
          rm(path.join(storagePaths.media, fileName), { force: true }),
          ...getMediaVariantNames(fileName).map((variantName) =>
            rm(path.join(storagePaths.media, variantName), { force: true }),
          ),
        ]);
        await cloudinary.destroyFile({ fileName }).catch(() => {});
      }
    }

    if (!applyChanges) {
      console.log('Ejecutá con --apply para eliminarlos.');
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (error) => {
  console.error(error);
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
