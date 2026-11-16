import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { createStoragePaths } from './config/storage.js';
import { createAuditMiddleware } from './modules/audit/audit.middleware.js';
import { createAuditRouter } from './modules/audit/audit.routes.js';
import { createAdminAuth } from './modules/auth/admin-auth.service.js';
import { createAdminAuthRouter } from './modules/auth/admin-auth.routes.js';
import { createCatalogAdminRouter } from './modules/catalog/catalog-admin.routes.js';
import { createCatalogPublicRouter } from './modules/catalog/catalog.routes.js';
import { createContactRouter } from './modules/contact/contact.routes.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createQuoteNotifier } from './modules/notifications/quote-notifier.js';
import {
  createQuotesAdminRouter,
  createQuotesPublicRouter,
} from './modules/quotes/quotes.routes.js';
import { createQuoteService } from './modules/quotes/quote.service.js';
import {
  createReviewsAdminRouter,
  createReviewsPublicRouter,
} from './modules/reviews/review.routes.js';
import {
  createSettingsAdminRouter,
  createSettingsPublicRouter,
} from './modules/settings/settings.routes.js';
import { createAdminUploadsRouter } from './modules/uploads/admin-uploads.routes.js';
import { createMediaDeliveryRouter } from './modules/uploads/media.routes.js';
import { createUploadMiddleware } from './modules/uploads/upload.middleware.js';
import { AppError } from './shared/errors/app-error.js';
import { errorHandler } from './shared/http/error-handler.js';
import { notFoundHandler } from './shared/http/not-found-handler.js';
import { createRedisRateLimitStore } from './shared/http/redis-rate-limit-store.js';
import { createHttpLogger } from './shared/logger.js';

const BODY_LIMIT = '100kb';
const STATIC_MEDIA_MAX_AGE = '7d';

export function createApp({
  logger,
  corsOrigins = [],
  getDatabaseStatus,
  whatsappNumber = '',
  adminAuth,
  rateLimitEnabled = true,
  settingsEncryptionSecret = '',
  notificationTransportFactory,
  storageRoot,
  trustProxy = false,
  cloudinary = null,
  redisClient = null,
} = {}) {
  if (!logger) {
    throw new TypeError('createApp requiere un logger.');
  }

  const app = express();
  const storagePaths = createStoragePaths(storageRoot);
  const rateLimitStoreFor = redisClient
    ? (name) => createRedisRateLimitStore({ client: redisClient, prefix: `zl:rl:${name}` })
    : null;
  const auth = adminAuth ?? createAdminAuth({ enabled: false });
  const quoteService = createQuoteService({
    storagePaths,
    defaultWhatsappNumber: whatsappNumber,
  });
  const quoteNotifier = createQuoteNotifier({
    encryptionSecret: settingsEncryptionSecret,
    logger,
    createTransport: notificationTransportFactory,
  });
  const quoteUpload = createUploadMiddleware('quote');
  const mediaUpload = createUploadMiddleware('media');

  app.disable('x-powered-by');

  if (trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(createHttpLogger(logger));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(
          new AppError({
            message: 'Origen no permitido.',
            statusCode: 403,
            code: 'CORS_NOT_ALLOWED',
          }),
        );
      },
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));

  app.use('/api/health', createHealthRouter({ getDatabaseStatus }));
  app.use('/api/catalog', createCatalogPublicRouter());
  app.use('/api/catalog', createReviewsPublicRouter({ rateLimitEnabled, rateLimitStoreFor }));
  app.use('/api/settings', createSettingsPublicRouter({ defaultWhatsappNumber: whatsappNumber }));
  app.use(
    '/api/contact',
    createContactRouter({ notifier: quoteNotifier, rateLimitEnabled, rateLimitStoreFor }),
  );
  app.use(
    '/api/quotes',
    createQuotesPublicRouter({
      quoteService,
      notifier: quoteNotifier,
      upload: quoteUpload,
      rateLimitEnabled,
      rateLimitStoreFor,
    }),
  );

  app.use('/api/admin', (_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/admin', createAuditMiddleware({ logger }));
  app.use('/api/admin/audit', auth.requireAdmin, createAuditRouter());
  app.use('/api/admin/dashboard', auth.requireAdmin, createDashboardRouter());
  app.use(
    '/api/admin/auth',
    createAdminAuthRouter({ adminAuth: auth, rateLimitEnabled, rateLimitStoreFor }),
  );
  app.use('/api/admin/products', auth.requireAdmin, auth.requireCsrf, createCatalogAdminRouter());
  app.use(
    '/api/admin/quotes',
    auth.requireAdmin,
    auth.requireCsrf,
    createQuotesAdminRouter({ quoteService, notifier: quoteNotifier }),
  );
  app.use('/api/admin/reviews', auth.requireAdmin, auth.requireCsrf, createReviewsAdminRouter());
  app.use(
    '/api/admin/settings',
    auth.requireAdmin,
    auth.requireCsrf,
    createSettingsAdminRouter({
      defaultWhatsappNumber: whatsappNumber,
      encryptionSecret: settingsEncryptionSecret,
      notifier: quoteNotifier,
    }),
  );
  app.use(
    '/api/admin/uploads',
    auth.requireAdmin,
    auth.requireCsrf,
    createAdminUploadsRouter({ upload: mediaUpload, storagePaths, cloudinary }),
  );

  app.use('/uploads/media', createMediaDeliveryRouter({ storagePaths, cloudinary }));
  app.use(
    '/uploads/media',
    express.static(storagePaths.media, {
      dotfiles: 'deny',
      index: false,
      immutable: true,
      maxAge: STATIC_MEDIA_MAX_AGE,
      fallthrough: true,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
