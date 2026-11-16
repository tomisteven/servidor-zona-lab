import { Router } from 'express';

import { validate } from '../../shared/http/validation.js';
import {
  getAdminSiteSettings,
  getPublicSiteSettings,
  updateSiteSettings,
} from './site-settings.service.js';
import { siteSettingsInputSchema } from './site-settings.schemas.js';

export function createSettingsPublicRouter({ defaultWhatsappNumber }) {
  const router = Router();

  router.get('/public', async (_request, response) => {
    const settings = await getPublicSiteSettings({ defaultWhatsappNumber });
    response.status(200).json({ settings });
  });

  return router;
}

export function createSettingsAdminRouter({
  defaultWhatsappNumber,
  encryptionSecret = '',
  notifier,
}) {
  const router = Router();

  router.get('/', async (_request, response) => {
    const settings = await getAdminSiteSettings({ defaultWhatsappNumber });
    response.status(200).json({ settings });
  });

  router.put('/', async (request, response) => {
    const input = validate(siteSettingsInputSchema, request.body);
    const settings = await updateSiteSettings(input, { encryptionSecret });
    response.status(200).json({ settings });
  });

  router.post('/test-email', async (_request, response) => {
    await notifier.sendTest();
    response.status(200).json({ sent: true });
  });

  return router;
}
