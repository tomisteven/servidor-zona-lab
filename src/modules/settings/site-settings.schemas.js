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

export const siteSettingsInputSchema = z.object({
  whatsappNumber: whatsappNumberSchema,
  heroTitle: z.string().trim().min(1, 'El título es obligatorio.').max(120),
  heroSubtitle: z.string().trim().min(1, 'El subtítulo es obligatorio.').max(300),
  heroImageUrl: heroImageUrlSchema,
});
