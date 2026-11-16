import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MANIFEST_CACHE_MS = 3000;
const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1';
const CLOUDINARY_IMAGE_PREFIX = 'https://res.cloudinary.com';

export function signCloudinaryParams(params, apiSecret) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
}

export function buildCloudinaryUrl({ cloudName, publicId, version = null, width = null }) {
  const transformation = width ? `w_${width},c_limit,q_auto,f_auto` : 'q_auto,f_auto';
  const versionPath = version ? `/v${version}` : '';
  const encodedPublicId = publicId.split('/').map(encodeURIComponent).join('/');

  return `${CLOUDINARY_IMAGE_PREFIX}/${cloudName}/image/upload/${transformation}${versionPath}/${encodedPublicId}`;
}

function toTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export function createCloudinaryService({
  enabled = false,
  cloudName = '',
  apiKey = '',
  apiSecret = '',
  folder = 'zona-lab/media',
  manifestPath,
  logger = null,
} = {}) {
  let cache = { files: {}, loadedAt: 0 };

  if (!enabled) {
    return {
      enabled: false,
      async getEntry() {
        return null;
      },
      async uploadFile() {
        return null;
      },
      async destroyFile() {
        return false;
      },
      async verifyCredentials() {
        return true;
      },
      async syncManifest() {
        return 0;
      },
      async ensureManifest() {
        return 0;
      },
      buildUrl() {
        return '';
      },
    };
  }

  async function loadManifest() {
    if (Date.now() - cache.loadedAt < MANIFEST_CACHE_MS) {
      return cache.files;
    }

    try {
      const raw = await readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(raw);

      cache = {
        files: parsed && typeof parsed.files === 'object' ? parsed.files : {},
        loadedAt: Date.now(),
      };
    } catch {
      cache = { files: {}, loadedAt: Date.now() };
    }

    return cache.files;
  }

  async function saveManifest(files) {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    const temporaryPath = `${manifestPath}.tmp`;

    await writeFile(temporaryPath, JSON.stringify({ files }, null, 2), 'utf8');
    await rename(temporaryPath, manifestPath);
    cache = { files, loadedAt: Date.now() };
  }

  function publicIdFor(fileName) {
    return `${folder}/${fileName.replace(/\.[^.]+$/, '')}`;
  }

  async function uploadFile({ fileName, buffer, mimeType }) {
    const timestamp = toTimestamp();
    const params = {
      public_id: publicIdFor(fileName),
      overwrite: 'true',
      unique_filename: 'false',
      timestamp,
    };
    const form = new FormData();

    form.set('file', new Blob([buffer], { type: mimeType }), fileName);
    form.set('api_key', apiKey);

    for (const [key, value] of Object.entries(params)) {
      form.set(key, String(value));
    }

    form.set('signature', signCloudinaryParams(params, apiSecret));

    const response = await fetch(
      `${CLOUDINARY_UPLOAD_URL}/${encodeURIComponent(cloudName)}/image/upload`,
      { method: 'POST', body: form },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');

      throw new Error(`Cloudinary rechazó la subida (${response.status}): ${detail.slice(0, 200)}`);
    }

    const body = await response.json();
    const files = await loadManifest();

    files[fileName] = {
      publicId: body.public_id,
      version: body.version ?? null,
      uploadedAt: new Date().toISOString(),
    };
    await saveManifest(files);

    return files[fileName];
  }

  async function destroyFile({ fileName }) {
    const files = await loadManifest();
    const entry = files[fileName];

    if (!entry) {
      return false;
    }

    const timestamp = toTimestamp();
    const params = {
      invalidate: 'true',
      public_id: entry.publicId,
      timestamp,
    };
    const form = new FormData();

    form.set('api_key', apiKey);

    for (const [key, value] of Object.entries(params)) {
      form.set(key, String(value));
    }

    form.set('signature', signCloudinaryParams(params, apiSecret));

    const response = await fetch(
      `${CLOUDINARY_UPLOAD_URL}/${encodeURIComponent(cloudName)}/image/destroy`,
      { method: 'POST', body: form },
    );

    if (!response.ok && response.status !== 404) {
      logger?.warn?.({ status: response.status }, 'cloudinary_destroy_failed');
      return false;
    }

    delete files[fileName];
    await saveManifest(files);

    return true;
  }

  async function getEntry(fileName) {
    const files = await loadManifest();

    return files[fileName] ?? null;
  }

  async function verifyCredentials() {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const response = await fetch(
      `${CLOUDINARY_UPLOAD_URL}/${encodeURIComponent(cloudName)}/resources/image?max_results=1`,
      { headers: { Authorization: `Basic ${auth}` } },
    );

    if (response.status === 401) {
      throw new Error(
        'Cloudinary rechazó las credenciales (api_secret mismatch). Revisá CLOUDINARY_API_SECRET.',
      );
    }

    return true;
  }

  async function syncManifest() {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const files = {};
    let cursor = null;

    do {
      const url = new URL(
        `${CLOUDINARY_UPLOAD_URL}/${encodeURIComponent(cloudName)}/resources/image/upload`,
      );

      url.searchParams.set('prefix', `${folder}/`);
      url.searchParams.set('max_results', '500');

      if (cursor) {
        url.searchParams.set('next_cursor', cursor);
      }

      const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

      if (!response.ok) {
        throw new Error(`Cloudinary rechazó el listado de imágenes (${response.status}).`);
      }

      const body = await response.json();

      for (const resource of body.resources ?? []) {
        const fileName = `${resource.public_id.split('/').pop()}.${resource.format}`;

        files[fileName] = {
          publicId: resource.public_id,
          version: resource.version ?? null,
          uploadedAt: resource.created_at ?? new Date().toISOString(),
        };
      }

      cursor = body.next_cursor ?? null;
    } while (cursor);

    await saveManifest(files);

    return Object.keys(files).length;
  }

  async function ensureManifest() {
    try {
      await access(manifestPath);

      return 0;
    } catch {
      const count = await syncManifest();

      return count;
    }
  }

  function buildUrl(entry, { width = null } = {}) {
    if (!entry?.publicId) {
      return '';
    }

    return buildCloudinaryUrl({
      cloudName,
      publicId: entry.publicId,
      version: entry.version,
      width,
    });
  }

  return {
    enabled: true,
    getEntry,
    uploadFile,
    destroyFile,
    verifyCredentials,
    syncManifest,
    ensureManifest,
    buildUrl,
  };
}
