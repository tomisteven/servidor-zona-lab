import { z } from 'zod';

const whatsappNumberSchema = z
  .string()
  .trim()
  .min(1, 'El número de WhatsApp es obligatorio.')
  .max(30, 'El número de WhatsApp es demasiado largo.')
  .refine(
    (value) => /^\+?[\d\s()-]+$/.test(value),
    'El WhatsApp solo admite dígitos, espacios, paréntesis, guiones y un + inicial.',
  )
  .transform((value) => value.replace(/\D/g, ''))
  .refine(
    (value) => value.length >= 10 && value.length <= 15,
    'El WhatsApp debe tener entre 10 y 15 dígitos.',
  );

const heroImageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value === '' || /^\/uploads\/media\/[A-Za-z0-9._-]+$/.test(value),
    'La imagen debe provenir de una carga válida.',
  )
  .default('');

const notificationEmailSchema = z
  .union([
    z.literal(''),
    z.string().trim().max(254).email('Ingresá un correo de notificación válido.'),
  ])
  .default('');

const optionalText = (max) => z.string().trim().max(max).default('');

export const siteSettingsInputSchema = z
  .object({
    whatsappNumber: whatsappNumberSchema,
    heroTitle: z.string().trim().min(1, 'El título es obligatorio.').max(120),
    heroSubtitle: z.string().trim().min(1, 'El subtítulo es obligatorio.').max(300),
    heroImageUrl: heroImageUrlSchema,
    emailNotificationsEnabled: z.boolean().default(false),
    notificationEmail: notificationEmailSchema,
    smtpHost: optionalText(255),
    smtpPort: z.coerce
      .number()
      .int('El puerto SMTP debe ser un número entero.')
      .min(1, 'El puerto SMTP no es válido.')
      .max(65535, 'El puerto SMTP no es válido.')
      .default(587),
    smtpSecure: z.boolean().default(false),
    smtpUser: optionalText(254),
    smtpAppPassword: z
      .string()
      .max(200, 'La contraseña de aplicación es demasiado larga.')
      .optional(),
    clearSmtpAppPassword: z.boolean().default(false),
  })
  .superRefine((settings, context) => {
    if (!settings.emailNotificationsEnabled) {
      return;
    }

    if (!settings.notificationEmail) {
      context.addIssue({
        code: 'custom',
        path: ['notificationEmail'],
        message: 'Indicá el correo que recibirá las notificaciones.',
      });
    }

    if (!settings.smtpHost) {
      context.addIssue({
        code: 'custom',
        path: ['smtpHost'],
        message: 'Indicá el servidor SMTP.',
      });
    }

    if (!settings.smtpUser) {
      context.addIssue({
        code: 'custom',
        path: ['smtpUser'],
        message: 'Indicá el usuario SMTP.',
      });
    }
  });
