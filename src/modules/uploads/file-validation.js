import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';

import { AppError } from '../../shared/errors/app-error.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_SIGNATURE = Buffer.from('%PDF-');
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_MARKER = Buffer.from('WEBP');
const MAX_SVG_BYTES = 2 * 1024 * 1024;
const SVG_UNSAFE_PATTERNS = [
  /<script[\s>]/i,
  /<foreignObject[\s>]/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<!ENTITY/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /\b(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/)/i,
];

export const MEDIA_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const QUOTE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
]);

function startsWith(buffer, signature) {
  return (
    buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature)
  );
}

export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (startsWith(buffer, PNG_SIGNATURE)) {
    return { extension: 'png', mimeType: 'image/png' };
  }

  if (startsWith(buffer, JPEG_SIGNATURE)) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }

  if (
    startsWith(buffer, WEBP_RIFF) &&
    buffer.length >= 12 &&
    buffer.subarray(8, 12).equals(WEBP_MARKER)
  ) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  if (startsWith(buffer, PDF_SIGNATURE) || buffer.subarray(0, 1024).includes(PDF_SIGNATURE)) {
    return { extension: 'pdf', mimeType: 'application/pdf' };
  }

  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const svgStart = /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i;

  if (svgStart.test(text)) {
    return { extension: 'svg', mimeType: 'image/svg+xml' };
  }

  return null;
}

function isSafeSvg(buffer) {
  if (buffer.length > MAX_SVG_BYTES) {
    return false;
  }

  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');

  return !SVG_UNSAFE_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeOriginalName(originalName) {
  const baseName = path.basename(String(originalName ?? ''));
  const cleaned = [...baseName]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim();

  if (!cleaned) {
    return 'archivo';
  }

  return cleaned.slice(0, 180);
}

export async function saveUploadedFile({
  file,
  directory,
  allowedMimeTypes,
  publicPathPrefix = null,
}) {
  if (!file?.buffer || typeof file.originalname !== 'string') {
    throw new AppError({
      message: 'No se recibió un archivo válido.',
      statusCode: 400,
      code: 'FILE_REQUIRED',
    });
  }

  const detected = detectFileType(file.buffer);

  if (!detected || !allowedMimeTypes.has(detected.mimeType)) {
    throw new AppError({
      message: 'El archivo debe ser una imagen PNG, JPG o WEBP válida.',
      statusCode: 415,
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  }

  if (detected.mimeType === 'application/pdf' && !allowedMimeTypes.has('application/pdf')) {
    throw new AppError({
      message: 'El tipo de archivo no está permitido.',
      statusCode: 415,
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  }

  if (detected.mimeType === 'image/svg+xml' && !isSafeSvg(file.buffer)) {
    throw new AppError({
      message: 'El SVG contiene contenido no permitido.',
      statusCode: 415,
      code: 'UNSAFE_FILE',
    });
  }

  const storageKey = `${randomUUID()}.${detected.extension}`;
  const filePath = path.join(directory, storageKey);

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, file.buffer, { flag: 'wx', mode: 0o600 });

  return {
    storageKey,
    originalName: sanitizeOriginalName(file.originalname),
    mimeType: detected.mimeType,
    sizeBytes: file.size,
    url: publicPathPrefix ? `${publicPathPrefix}/${storageKey}` : null,
  };
}

export async function removeStoredFile(directory, storageKey) {
  if (!storageKey) {
    return;
  }

  try {
    await unlink(path.join(directory, storageKey));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export function resolveStoredFilePath(directory, storageKey) {
  if (!storageKey || path.basename(storageKey) !== storageKey) {
    throw new AppError({
      message: 'Archivo no encontrado.',
      statusCode: 404,
      code: 'FILE_NOT_FOUND',
    });
  }

  return path.join(directory, storageKey);
}
