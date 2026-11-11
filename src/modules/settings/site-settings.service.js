import { AppError } from '../../shared/errors/app-error.js';
import { SiteSettings } from './site-settings.model.js';

export const DEFAULT_HERO_TITLE = 'CREÁ TU PROPIA LÍNEA DE BOLSOS.';
export const DEFAULT_HERO_SUBTITLE =
  'Personalizá bolsos, mochilas y accesorios para tu marca, club o empresa. Diseño propio, producción por cantidad y atención directa.';

function buildDefaultSettings(defaultWhatsappNumber) {
  return {
    whatsappNumber: defaultWhatsappNumber,
    heroTitle: DEFAULT_HERO_TITLE,
    heroSubtitle: DEFAULT_HERO_SUBTITLE,
    heroImageUrl: '',
    updatedAt: null,
  };
}

function toSettingsDto(settings) {
  return {
    whatsappNumber: settings.whatsappNumber,
    heroTitle: settings.heroTitle,
    heroSubtitle: settings.heroSubtitle,
    heroImageUrl: settings.heroImageUrl ?? '',
    updatedAt: settings.updatedAt ?? null,
  };
}

function assertWhatsappConfigured(number) {
  if (!number) {
    throw new AppError({
      message: 'WhatsApp no está configurado.',
      statusCode: 503,
      code: 'WHATSAPP_NOT_CONFIGURED',
    });
  }

  return number;
}

export async function getSiteSettings({ defaultWhatsappNumber }) {
  const settings = await SiteSettings.findOne({ key: 'main' }).lean();

  if (!settings) {
    return buildDefaultSettings(defaultWhatsappNumber);
  }

  return toSettingsDto(settings);
}

export async function resolveWhatsappNumber({ defaultWhatsappNumber }) {
  const settings = await SiteSettings.findOne({ key: 'main' }).select('whatsappNumber').lean();

  return assertWhatsappConfigured(settings?.whatsappNumber || defaultWhatsappNumber);
}

export async function updateSiteSettings(input) {
  const settings = await SiteSettings.findOneAndUpdate(
    { key: 'main' },
    { $set: input, $setOnInsert: { key: 'main' } },
    {
      returnDocument: 'after',
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return toSettingsDto(settings);
}
