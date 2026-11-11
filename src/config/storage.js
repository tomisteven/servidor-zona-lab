import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DEFAULT_STORAGE_ROOT = path.join(BACKEND_ROOT, 'storage');

export function createStoragePaths(root = DEFAULT_STORAGE_ROOT) {
  const resolvedRoot = path.resolve(root);

  return Object.freeze({
    root: resolvedRoot,
    media: path.join(resolvedRoot, 'media'),
    logos: path.join(resolvedRoot, 'logos'),
  });
}
