import { z } from 'zod';

const selectionSchema = z.object({
  groupId: z.string().trim().min(1, 'El grupo seleccionado no es válido.').max(64),
  choiceId: z.string().trim().min(1, 'La opción seleccionada no es válida.').max(64),
});

const estimateSchema = z.object({
  productId: z.string().trim().min(1, 'Seleccioná un producto.').max(64),
  quantity: z.coerce
    .number()
    .int('La cantidad debe ser un número entero.')
    .min(1, 'La cantidad debe ser mayor que cero.')
    .max(1000000, 'La cantidad es demasiado alta.'),
  selections: z.array(selectionSchema).max(10, 'La selección es demasiado extensa.').default([]),
});

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá tu nombre.').max(80),
  brandName: z.string().trim().max(80, 'El nombre de la marca es demasiado largo.').default(''),
  phone: z
    .string()
    .trim()
    .min(1, 'Ingresá un teléfono de contacto.')
    .max(30, 'El teléfono es demasiado largo.')
    .refine((value) => {
      const digits = value.replace(/\D/g, '');
      return /^\+?[\d\s()-]+$/.test(value) && digits.length >= 6 && digits.length <= 15;
    }, 'Ingresá un teléfono válido.'),
  email: z
    .union([z.literal(''), z.string().trim().max(254).email('Ingresá un correo válido.')])
    .optional()
    .default(''),
  observations: z
    .string()
    .trim()
    .max(1000, 'Las observaciones admiten hasta 1000 caracteres.')
    .default(''),
});

export const quoteEstimateSchema = estimateSchema;

export const quoteRequestInputSchema = estimateSchema.extend({
  designNotes: z
    .string()
    .trim()
    .max(2000, 'Las indicaciones de diseño admiten hasta 2000 caracteres.')
    .default(''),
  customer: customerSchema,
});

export const quoteListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
});

export const quoteFileKindSchema = z.enum(['logo', 'reference']);
