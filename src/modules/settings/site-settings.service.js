import { AppError } from '../../shared/errors/app-error.js';
import { decryptSecret, encryptSecret } from '../../shared/crypto/secret-box.js';
import { SiteSettings } from './site-settings.model.js';

export const DEFAULT_HERO_TITLE = 'CREÁ TU PROPIA LÍNEA DE BOLSOS.';
export const DEFAULT_HERO_SUBTITLE =
  'Personalizá bolsos, mochilas y accesorios para tu marca, club o empresa. Diseño propio, producción por cantidad y atención directa.';
export const DEFAULT_SMTP_PORT = 587;

function buildDefaultPublicSettings(defaultWhatsappNumber) {
  return {
    whatsappNumber: defaultWhatsappNumber,
    heroTitle: DEFAULT_HERO_TITLE,
    heroSubtitle: DEFAULT_HERO_SUBTITLE,
    heroImageUrl: '',
    updatedAt: null,
  };
}

function buildDefaultAdminSettings(defaultWhatsappNumber) {
  return {
    ...buildDefaultPublicSettings(defaultWhatsappNumber),
    emailNotificationsEnabled: false,
    notificationEmail: '',
    smtpHost: '',
    smtpPort: DEFAULT_SMTP_PORT,
    smtpSecure: false,
    smtpUser: '',
    hasSmtpAppPassword: false,
  };
}

function toPublicSettingsDto(settings) {
  return {
    whatsappNumber: settings.whatsappNumber,
    heroTitle: settings.heroTitle,
    heroSubtitle: settings.heroSubtitle,
    heroImageUrl: settings.heroImageUrl ?? '',
    updatedAt: settings.updatedAt ?? null,
  };
}

function toAdminSettingsDto(settings) {
  return {
    ...toPublicSettingsDto(settings),
    emailNotificationsEnabled: Boolean(settings.emailNotificationsEnabled),
    notificationEmail: settings.notificationEmail ?? '',
    smtpHost: settings.smtpHost ?? '',
    smtpPort: settings.smtpPort ?? DEFAULT_SMTP_PORT,
    smtpSecure: Boolean(settings.smtpSecure),
    smtpUser: settings.smtpUser ?? '',
    hasSmtpAppPassword: Boolean(settings.smtpAppPasswordEncrypted),
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

function resolveEncryptedPassword({ input, existingEncryptedPassword, encryptionSecret }) {
  if (input.clearSmtpAppPassword) {
    return '';
  }

  const newPassword = String(input.smtpAppPassword ?? '').trim();

  if (!newPassword) {
    return existingEncryptedPassword ?? '';
  }

  if (!encryptionSecret) {
    throw new AppError({
      message: 'No se puede guardar la contraseña de aplicación sin un secreto de cifrado.',
      statusCode: 503,
      code: 'SETTINGS_ENCRYPTION_UNAVAILABLE',
    });
  }

  try {
    return encryptSecret(newPassword, encryptionSecret);
  } catch {
    throw new AppError({
      message: 'No se pudo cifrar la contraseña de aplicación.',
      statusCode: 500,
      code: 'SETTINGS_ENCRYPTION_FAILED',
    });
  }
}

export async function getPublicSiteSettings({ defaultWhatsappNumber }) {
  const settings = await SiteSettings.findOne({ key: 'main' }).lean();

  if (!settings) {
    return buildDefaultPublicSettings(defaultWhatsappNumber);
  }

  return toPublicSettingsDto(settings);
}

export async function getAdminSiteSettings({ defaultWhatsappNumber }) {
  const settings = await SiteSettings.findOne({ key: 'main' }).lean();

  if (!settings) {
    return buildDefaultAdminSettings(defaultWhatsappNumber);
  }

  return toAdminSettingsDto(settings);
}

export async function resolveWhatsappNumber({ defaultWhatsappNumber }) {
  const settings = await SiteSettings.findOne({ key: 'main' }).select('whatsappNumber').lean();

  return assertWhatsappConfigured(settings?.whatsappNumber || defaultWhatsappNumber);
}

export async function updateSiteSettings(input, { encryptionSecret = '' } = {}) {
  const existing = await SiteSettings.findOne({ key: 'main' }).lean();
  const settingsInput = { ...input };

  delete settingsInput.smtpAppPassword;
  delete settingsInput.clearSmtpAppPassword;

  const encryptedPassword = resolveEncryptedPassword({
    input,
    existingEncryptedPassword: existing?.smtpAppPasswordEncrypted,
    encryptionSecret,
  });

  if (input.emailNotificationsEnabled && !encryptedPassword) {
    throw new AppError({
      message: 'Ingresá la contraseña de aplicación para activar las notificaciones.',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [
        {
          field: 'smtpAppPassword',
          message: 'La contraseña de aplicación es obligatoria.',
        },
      ],
    });
  }

  const settings = await SiteSettings.findOneAndUpdate(
    { key: 'main' },
    {
      $set: {
        ...settingsInput,
        smtpAppPasswordEncrypted: encryptedPassword,
      },
      $setOnInsert: { key: 'main' },
    },
    {
      returnDocument: 'after',
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return toAdminSettingsDto(settings);
}

export async function getNotificationConfig({ encryptionSecret = '' } = {}) {
  const settings = await SiteSettings.findOne({ key: 'main' }).lean();

  if (!settings?.emailNotificationsEnabled) {
    return null;
  }

  const password = decryptSecret(settings.smtpAppPasswordEncrypted, encryptionSecret);

  if (!settings.notificationEmail || !settings.smtpHost || !settings.smtpUser || !password) {
    return null;
  }

  return {
    to: settings.notificationEmail,
    host: settings.smtpHost,
    port: settings.smtpPort ?? DEFAULT_SMTP_PORT,
    secure: Boolean(settings.smtpSecure),
    user: settings.smtpUser,
    password,
  };
}
