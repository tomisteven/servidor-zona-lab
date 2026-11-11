import { Router } from 'express';

import { validate } from '../../shared/http/validation.js';
import { getSiteSettings, updateSiteSettings } from './site-settings.service.js';
import { siteSettingsInputSchema } from './site-settings.schemas.js';

export function createSettingsPublicRouter({ defaultWhatsappNumber }) {
  const router = Router();

  router.get('/public', async (_request, response) => {
    const settings = await getSiteSettings({ defaultWhatsappNumber });
    response.status(200).json({ settings });
  });

  return router;
}

export function createSettingsAdminRouter({ defaultWhatsappNumber }) {
  const router = Router();

  router.get('/', async (_request, response) => {
    const settings = await getSiteSettings({ defaultWhatsappNumber });
    response.status(200).json({ settings });
  });

  router.put('/', async (request, response) => {
    const input = validate(siteSettingsInputSchema, request.body);
    const settings = await updateSiteSettings(input);
    response.status(200).json({ settings });
  });

  return router;
}
