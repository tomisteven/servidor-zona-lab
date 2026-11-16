import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { createStoragePaths } from '../src/config/storage.js';
import { isMediaVariantFileName } from '../src/modules/uploads/media-files.js';

const applyChanges = process.argv.includes('--apply');
const MAX_DIMENSION = 2400;

const FORMATS = {
  '.jpg': { format: 'jpeg', options: { quality: 82, mozjpeg: true } },
  '.jpeg': { format: 'jpeg', options: { quality: 82, mozjpeg: true } },
  '.png': { format: 'png', options: { compressionLevel: 9, adaptiveFiltering: true } },
  '.webp': { format: 'webp', options: { quality: 82 } },
};

async function main() {
  const storagePaths = createStoragePaths();
  const directoryArgument = process.argv.find((argument) => argument.startsWith('--dir='));
  const directory = directoryArgument
    ? path.resolve(directoryArgument.split('=').slice(1).join('='))
    : storagePaths.media;
  const files = await readdir(directory).catch(() => []);
  let optimized = 0;
  let savedBytes = 0;

  for (const fileName of files) {
    if (isMediaVariantFileName(fileName)) {
      continue;
    }

    const format = FORMATS[path.extname(fileName).toLowerCase()];

    if (!format) {
      continue;
    }

    const filePath = path.join(directory, fileName);
    const original = await readFile(filePath);

    try {
      const output = await sharp(original, { failOn: 'error' })
        .rotate()
        .resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFormat(format.format, format.options)
        .toBuffer();

      if (output.length >= original.length) {
        continue;
      }

      optimized += 1;
      savedBytes += original.length - output.length;
      console.log(
        `${fileName}: ${Math.round(original.length / 1024)} KB -> ${Math.round(
          output.length / 1024,
        )} KB`,
      );

      if (applyChanges) {
        const temporaryPath = `${filePath}.tmp`;

        await writeFile(temporaryPath, output);
        await rename(temporaryPath, filePath);
      }
    } catch (error) {
      console.warn(`No se pudo optimizar ${fileName}: ${error.message}`);
    }
  }

  console.log(
    `\n${optimized} archivo(s) optimizables, ${Math.round(savedBytes / 1024)} KB ahorrados${
      applyChanges ? '' : ' (simulación)'
    }.`,
  );

  if (!applyChanges) {
    console.log('Ejecutá con --apply para escribir los cambios.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
