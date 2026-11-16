export const MEDIA_VARIANT_WIDTHS = [480, 960, 1600];

export const MEDIA_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:png|jpe?g|webp)$/i;
const VARIANT_FILE_PATTERN = /^(.+)-(480|960|1600)\.webp$/i;
const MIME_TYPES = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
]);

export function buildMediaUrl(fileName) {
  return `/uploads/media/${fileName}`;
}

export function isMediaVariantFileName(fileName) {
  return VARIANT_FILE_PATTERN.test(String(fileName ?? ''));
}

export function isMediaFileName(fileName) {
  return MEDIA_FILE_PATTERN.test(String(fileName ?? '')) && !isMediaVariantFileName(fileName);
}

export function mediaVariantFileName(fileName, width) {
  const baseName = String(fileName ?? '').replace(/\.[^.]+$/, '');

  return `${baseName}-${width}.webp`;
}

export function getMediaMimeType(fileName) {
  const extension =
    String(fileName ?? '')
      .split('.')
      .pop()
      ?.toLowerCase() ?? '';

  return MIME_TYPES.get(extension) ?? 'application/octet-stream';
}

export function getMediaVariantNames(fileName) {
  return MEDIA_VARIANT_WIDTHS.map((width) => mediaVariantFileName(fileName, width));
}
