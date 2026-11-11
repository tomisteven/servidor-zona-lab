import { z } from 'zod';

import { PRODUCT_CATEGORY_VALUES } from './catalog.constants.js';

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'El slug debe tener al menos 2 caracteres.')
  .max(140, 'El slug admite hasta 140 caracteres.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'El slug solo admite minúsculas, números y guiones simples.',
  );

const imageUrlSchema = z
  .string()
  .trim()
  .max(500, 'La URL de imagen es demasiado larga.')
  .refine(
    (value) => value === '' || /^\/uploads\/media\/[A-Za-z0-9._-]+$/.test(value),
    'La imagen debe provenir de una carga válida.',
  )
  .default('');

const priceTierSchema = z.object({
  minQuantity: z.coerce
    .number()
    .int('La cantidad mínima debe ser entera.')
    .min(1, 'La cantidad mínima debe ser mayor que cero.')
    .max(1000000, 'La cantidad mínima es demasiado alta.'),
  maxQuantity: z.preprocess(
    (value) => (value === '' || value === undefined || value === null ? null : value),
    z.coerce
      .number()
      .int('La cantidad máxima debe ser entera.')
      .min(1, 'La cantidad máxima debe ser mayor que cero.')
      .max(1000000, 'La cantidad máxima es demasiado alta.')
      .nullable(),
  ),
  unitPrice: z.coerce
    .number()
    .min(0, 'El precio unitario no puede ser negativo.')
    .max(100000000, 'El precio unitario es demasiado alto.'),
});

const choiceSchema = z.object({
  label: z.string().trim().min(1, 'La opción necesita un nombre.').max(80),
  additionalUnitPrice: z.coerce
    .number()
    .min(0, 'El adicional no puede ser negativo.')
    .max(10000000, 'El adicional es demasiado alto.')
    .default(0),
});

const optionGroupSchema = z.object({
  name: z.string().trim().min(1, 'El grupo necesita un nombre.').max(80),
  required: z.boolean().default(false),
  choices: z
    .array(choiceSchema)
    .min(1, 'Cada grupo debe tener al menos una opción.')
    .max(30, 'Cada grupo admite hasta 30 opciones.'),
});

function validateTiers(tiers, context) {
  const sortedTiers = [...tiers].sort((left, right) => left.minQuantity - right.minQuantity);
  let previousMax = 0;

  sortedTiers.forEach((tier, index) => {
    if (tier.maxQuantity !== null && tier.maxQuantity < tier.minQuantity) {
      context.addIssue({
        code: 'custom',
        path: ['priceTiers', index, 'maxQuantity'],
        message: 'La cantidad máxima no puede ser menor que la mínima.',
      });
    }

    if (tier.minQuantity <= previousMax) {
      context.addIssue({
        code: 'custom',
        path: ['priceTiers', index, 'minQuantity'],
        message: 'Los tramos de cantidad no pueden superponerse.',
      });
    }

    if (previousMax === null) {
      context.addIssue({
        code: 'custom',
        path: ['priceTiers', index, 'minQuantity'],
        message: 'Un tramo abierto debe ser el último.',
      });
    }

    if (tier.maxQuantity === null && index !== sortedTiers.length - 1) {
      context.addIssue({
        code: 'custom',
        path: ['priceTiers', index, 'maxQuantity'],
        message: 'Solo el último tramo puede no tener cantidad máxima.',
      });
    }

    previousMax = tier.maxQuantity;
  });
}

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, 'El nombre es obligatorio.').max(120),
    slug: z.preprocess(
      (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
      slugSchema.optional(),
    ),
    category: z.enum(PRODUCT_CATEGORY_VALUES, {
      error: 'Seleccioná una categoría válida.',
    }),
    shortDescription: z.string().trim().min(1, 'La descripción breve es obligatoria.').max(240),
    description: z.string().trim().max(5000).default(''),
    features: z
      .array(z.string().trim().min(1).max(120))
      .max(12, 'Agregá hasta 12 características.')
      .default([]),
    imageUrl: imageUrlSchema,
    active: z.boolean().default(true),
    minimumQuantity: z.coerce
      .number()
      .int('La cantidad mínima debe ser entera.')
      .min(1, 'La cantidad mínima debe ser mayor que cero.')
      .max(1000000),
    personalizationFee: z.coerce
      .number()
      .min(0, 'El costo de personalización no puede ser negativo.')
      .max(100000000)
      .default(0),
    priceTiers: z
      .array(priceTierSchema)
      .min(1, 'Agregá al menos un tramo de precio.')
      .max(20, 'Admitís hasta 20 tramos de precio.'),
    optionGroups: z
      .array(optionGroupSchema)
      .max(10, 'Admitís hasta 10 grupos de opciones.')
      .default([]),
  })
  .superRefine((product, context) => {
    validateTiers(product.priceTiers, context);

    const groupNames = new Set();

    product.optionGroups.forEach((group, groupIndex) => {
      const normalizedName = group.name.toLowerCase();

      if (groupNames.has(normalizedName)) {
        context.addIssue({
          code: 'custom',
          path: ['optionGroups', groupIndex, 'name'],
          message: 'Los nombres de los grupos no pueden repetirse.',
        });
      }

      groupNames.add(normalizedName);

      const choiceLabels = new Set();

      group.choices.forEach((choice, choiceIndex) => {
        const normalizedLabel = choice.label.toLowerCase();

        if (choiceLabels.has(normalizedLabel)) {
          context.addIssue({
            code: 'custom',
            path: ['optionGroups', groupIndex, 'choices', choiceIndex, 'label'],
            message: 'Las opciones de un grupo no pueden repetirse.',
          });
        }

        choiceLabels.add(normalizedLabel);
      });
    });
  });

export const productStatusSchema = z.object({
  active: z.boolean({ error: 'El estado debe ser verdadero o falso.' }),
});

function createProductQuerySchema(maxLimit) {
  return z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(12),
    category: z.enum(PRODUCT_CATEGORY_VALUES).optional(),
    search: z.string().trim().max(80, 'La búsqueda admite hasta 80 caracteres.').optional(),
  });
}

export const publicProductQuerySchema = createProductQuerySchema(24);
export const adminProductQuerySchema = createProductQuerySchema(100);
export const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
