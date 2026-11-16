import assert from 'node:assert/strict';
import test from 'node:test';

import { productInputSchema } from '../../src/modules/catalog/product.schemas.js';

function buildProduct(overrides = {}) {
  return {
    name: 'Bolso de prueba',
    category: 'bolsos',
    shortDescription: 'Un bolso para pruebas.',
    description: '',
    features: [],
    imageUrl: '',
    active: true,
    minimumQuantity: 10,
    personalizationFee: 0,
    priceTiers: [{ minQuantity: 10, maxQuantity: null, unitPrice: 10000 }],
    optionGroups: [],
    ...overrides,
  };
}

function issuePaths(result) {
  return result.error.issues.map((issue) => issue.path.join('.'));
}

test('ordena tramos desordenados sin reportar superposición', () => {
  const result = productInputSchema.safeParse(
    buildProduct({
      priceTiers: [
        { minQuantity: 100, maxQuantity: null, unitPrice: 9000 },
        { minQuantity: 10, maxQuantity: 99, unitPrice: 10000 },
      ],
    }),
  );

  assert.equal(result.success, true);
});

test('reporta la superposición en el índice original del tramo', () => {
  const result = productInputSchema.safeParse(
    buildProduct({
      priceTiers: [
        { minQuantity: 100, maxQuantity: 200, unitPrice: 9000 },
        { minQuantity: 10, maxQuantity: 120, unitPrice: 10000 },
      ],
    }),
  );

  assert.equal(result.success, false);
  assert.ok(issuePaths(result).includes('priceTiers.0.minQuantity'));
});

test('acepta una galería de imágenes y rechaza duplicadas', () => {
  const valid = productInputSchema.safeParse(
    buildProduct({
      imageUrl: '/uploads/media/portada.jpg',
      images: [
        '/uploads/media/portada.jpg',
        '/uploads/media/detalle.jpg',
        '/uploads/media/uso.jpg',
      ],
    }),
  );

  assert.equal(valid.success, true);

  const duplicate = productInputSchema.safeParse(
    buildProduct({
      images: ['/uploads/media/portada.jpg', '/uploads/media/portada.jpg'],
    }),
  );

  assert.equal(duplicate.success, false);
  assert.ok(issuePaths(duplicate).includes('images'));
});

test('rechaza grupos y opciones duplicadas', () => {
  const result = productInputSchema.safeParse(
    buildProduct({
      optionGroups: [
        {
          name: 'Color',
          required: true,
          choices: [
            { label: 'Negro', additionalUnitPrice: 0 },
            { label: 'Negro', additionalUnitPrice: 100 },
          ],
        },
        {
          name: 'color',
          required: false,
          choices: [{ label: 'Azul', additionalUnitPrice: 0 }],
        },
      ],
    }),
  );

  assert.equal(result.success, false);
  const paths = issuePaths(result);

  assert.ok(paths.includes('optionGroups.0.choices.1.label'));
  assert.ok(paths.includes('optionGroups.1.name'));
});
