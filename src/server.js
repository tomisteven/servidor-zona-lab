import path from 'node:path';

import { createClient } from 'redis';

import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase, getDatabaseStatus } from './config/database.js';
import env from './config/env.js';
import { createStoragePaths } from './config/storage.js';
import { createAdminAuth } from './modules/auth/admin-auth.service.js';
import { createCloudinaryService } from './modules/uploads/cloudinary.service.js';
import { createLogger } from './shared/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const logger = createLogger({ level: env.logLevel });
const storagePaths = createStoragePaths();
const cloudinary = createCloudinaryService({
  enabled: env.cloudinaryEnabled,
  cloudName: env.cloudinaryCloudName,
  apiKey: env.cloudinaryApiKey,
  apiSecret: env.cloudinaryApiSecret,
  folder: env.cloudinaryFolder,
  manifestPath: path.join(storagePaths.root, 'cloudinary-media.json'),
  logger,
});
const adminAuth = createAdminAuth({
  enabled: env.adminEnabled,
  email: env.adminEmail,
  passwordHash: env.adminPasswordHash,
  sessionSecret: env.sessionSecret,
  secureCookies: env.isProduction,
  sameSite: env.cookieSameSite,
});
let httpServer = null;
let redisClient = null;
let shuttingDown = false;

async function connectRedis() {
  if (!env.redisUrl) {
    return null;
  }

  const client = createClient({ url: env.redisUrl });

  client.on('error', (error) => {
    logger.warn({ err: error }, 'redis_error');
  });

  try {
    await client.connect();
    logger.info('redis_connected');

    return client;
  } catch (error) {
    logger.warn({ err: error }, 'redis_connection_failed');
    await client.disconnect().catch(() => {});

    return null;
  }
}

async function start() {
  await connectDatabase(env.mongodbUri);
  redisClient = await connectRedis();

  if (cloudinary.enabled) {
    try {
      const images = await cloudinary.ensureManifest();

      if (images > 0) {
        logger.info({ images }, 'cloudinary_manifest_synced');
      }
    } catch (error) {
      logger.warn({ err: error }, 'cloudinary_manifest_sync_failed');
    }
  }

  if (!adminAuth.enabled) {
    logger.warn('admin_access_disabled');
  }

  const app = createApp({
    logger,
    corsOrigins: env.corsOrigins,
    getDatabaseStatus,
    whatsappNumber: env.whatsappNumber,
    adminAuth,
    settingsEncryptionSecret: env.sessionSecret,
    trustProxy: env.trustProxy,
    storageRoot: storagePaths.root,
    cloudinary,
    redisClient,
  });

  httpServer = app.listen(env.port, () => {
    logger.info({ environment: env.nodeEnv, port: env.port }, 'server_started');
  });
}

function closeHttpServer() {
  if (!httpServer) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info({ signal }, 'shutdown_started');

  const timeout = setTimeout(() => {
    logger.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown_timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  timeout.unref();

  try {
    await closeHttpServer();
    await disconnectDatabase();
    if (redisClient) {
      await redisClient.quit().catch(() => {});
    }
    clearTimeout(timeout);
    logger.info('shutdown_completed');
  } catch (error) {
    clearTimeout(timeout);
    process.exitCode = 1;
    logger.error({ err: error }, 'shutdown_failed');
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

start().catch(async (error) => {
  logger.fatal({ err: error }, 'server_start_failed');
  process.exitCode = 1;

  try {
    await disconnectDatabase();
  } catch (disconnectError) {
    logger.error({ err: disconnectError }, 'database_disconnect_failed');
  }
});
