import { constants as fileConstants } from 'node:fs';
import { access, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { AppError } from '../../shared/errors/app-error.js';
import { Product } from '../catalog/product.model.js';
import { SiteSettings } from '../settings/site-settings.model.js';
import { removeStoredFile, resolveStoredFilePath } from './file-validation.js';
import {
  buildMediaUrl,
  getMediaMimeType,
  getMediaVariantNames,
  isMediaFileName,
  MEDIA_VARIANT_WIDTHS,
  mediaVariantFileName,
} from './media-files.js';

const VARIANT_CONCURRENCY = new Map();

async function findReferencedMedia() {
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

async function readMediaMetadata(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();

    return { width: metadata.width ?? null, height: metadata.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

export async function listMediaFiles({ directory, page = 1, limit = 24, search = '' }) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const term = String(search ?? '')
    .trim()
    .toLowerCase();
  const fileNames = entries
    .filter((entry) => entry.isFile() && isMediaFileName(entry.name))
    .map((entry) => entry.name)
    .filter((fileName) => !term || fileName.toLowerCase().includes(term));
  const files = (
    await Promise.all(
      fileNames.map(async (fileName) => {
        try {
          const info = await stat(path.join(directory, fileName));

          return { fileName, sizeBytes: info.size, createdAt: info.mtime.toISOString() };
        } catch {
          return null;
        }
      }),
    )
  )
    .filter(Boolean)
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return right.createdAt.localeCompare(left.createdAt);
      }

      return left.fileName.localeCompare(right.fileName);
    });
  const total = files.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const pageFiles = files.slice((page - 1) * limit, page * limit);
  const references = await findReferencedMedia();
  const items = await Promise.all(
    pageFiles.map(async (file) => {
      const metadata = await readMediaMetadata(path.join(directory, file.fileName));

      return {
        ...file,
        ...metadata,
        url: buildMediaUrl(file.fileName),
        mimeType: getMediaMimeType(file.fileName),
        inUse: references.has(buildMediaUrl(file.fileName)),
        variants: MEDIA_VARIANT_WIDTHS.map((width) => ({
          width,
          url: `${buildMediaUrl(file.fileName)}?w=${width}`,
        })),
      };
    }),
  );

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function deleteMediaFile({ directory, fileName, cloudinary = null }) {
  if (!isMediaFileName(fileName)) {
    throw new AppError({
      message: 'El archivo solicitado no es válido.',
      statusCode: 400,
      code: 'INVALID_MEDIA_FILE',
    });
  }

  const filePath = resolveStoredFilePath(directory, fileName);

  try {
    await access(filePath, fileConstants.R_OK);
  } catch {
    throw new AppError({
      message: 'El archivo ya no está disponible.',
      statusCode: 404,
      code: 'FILE_NOT_FOUND',
    });
  }

  const mediaUrl = buildMediaUrl(fileName);
  const [productReference, settingsReference] = await Promise.all([
    Product.exists({ deletedAt: null, $or: [{ imageUrl: mediaUrl }, { images: mediaUrl }] }),
    SiteSettings.exists({ key: 'main', heroImageUrl: mediaUrl }),
  ]);

  if (productReference || settingsReference) {
    throw new AppError({
      message: 'La imagen está en uso. Quitála del producto o de la portada antes de eliminarla.',
      statusCode: 409,
      code: 'MEDIA_IN_USE',
    });
  }

  await Promise.all([
    removeStoredFile(directory, fileName),
    ...getMediaVariantNames(fileName).map((variantName) =>
      removeStoredFile(directory, variantName),
    ),
  ]);

  if (cloudinary?.enabled) {
    await cloudinary.destroyFile({ fileName }).catch(() => {});
  }

  return { fileName, url: mediaUrl };
}

async function generateVariant({ directory, fileName, width }) {
  const variantName = mediaVariantFileName(fileName, width);
  const variantPath = path.join(directory, variantName);
  const cacheKey = `${directory}:${variantName}`;

  if (VARIANT_CONCURRENCY.has(cacheKey)) {
    return VARIANT_CONCURRENCY.get(cacheKey);
  }

  const task = (async () => {
    try {
      await access(variantPath, fileConstants.F_OK);

      return variantPath;
    } catch {
      // La variante se genera con la primera solicitud.
    }

    const original = await readFile(path.join(directory, fileName));
    const buffer = await sharp(original, { failOn: 'error' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    try {
      await writeFile(variantPath, buffer, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }

    return variantPath;
  })();

  VARIANT_CONCURRENCY.set(cacheKey, task);

  try {
    return await task;
  } finally {
    VARIANT_CONCURRENCY.delete(cacheKey);
  }
}

export async function ensureMediaVariant({ directory, fileName, width }) {
  if (!MEDIA_VARIANT_WIDTHS.includes(width) || !isMediaFileName(fileName)) {
    return null;
  }

  const originalPath = resolveStoredFilePath(directory, fileName);

  try {
    await access(originalPath, fileConstants.R_OK);
  } catch {
    return null;
  }

  return generateVariant({ directory, fileName, width });
}

export async function generateMediaVariants({ directory, fileName }) {
  const results = await Promise.all(
    MEDIA_VARIANT_WIDTHS.map(async (width) => {
      try {
        await ensureMediaVariant({ directory, fileName, width });

        return { width, url: buildMediaUrl(mediaVariantFileName(fileName, width)) };
      } catch {
        return null;
      }
    }),
  );

  return results.filter(Boolean);
}
