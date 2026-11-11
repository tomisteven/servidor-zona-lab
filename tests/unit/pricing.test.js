import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateQuotePricing, resolveSelections } from '../../src/modules/quotes/pricing.js';

const PRODUCT = {
  minimumQuantity: 10,
  personalizationFee: 1000,
  priceTiers: [
    { minQuantity: 10, maxQuantity: 99, unitPrice: 10000 },
    { minQuantity: 100, maxQuantity: null, unitPrice: 9000 },
  ],
  optionGroups: [
    {
      _id: 'group-color',
      name: 'Color',
      required: true,
      choices: [
        { _id: 'choice-black', label: 'Negro', additionalUnitPrice: 0 },
        { _id: 'choice-white', label: 'Blanco', additionalUnitPrice: 500 },
      ],
    },
    {
      _id: 'group-embroidery',
      name: 'Bordado',
      required: false,
      choices: [{ _id: 'choice-logo', label: 'Logo', additionalUnitPrice: 250 }],
    },
  ],
};

test('resuelve opciones y calcula un precio estimado en servidor', () => {
  const selections = resolveSelections(PRODUCT, [
    { groupId: 'group-color', choiceId: 'choice-white' },
    { groupId: 'group-embroidery', choiceId: 'choice-logo' },
  ]);
  const pricing = calculateQuotePricing({
    product: PRODUCT,
    quantity: 10,
    resolvedSelections: selections,
  });

  assert.equal(selections.length, 2);
  assert.equal(pricing.status, 'estimated');
  assert.equal(pricing.unitBasePrice, 10000);
  assert.equal(pricing.optionsUnitTotal, 750);
  assert.equal(pricing.unitPrice, 10750);
  assert.equal(pricing.personalizationFee, 1000);
  assert.equal(pricing.estimatedTotal, 108500);
});

test('deriva a cotización personalizada cuando no existe tramo', () => {
  const selections = resolveSelections(PRODUCT, [
    { groupId: 'group-color', choiceId: 'choice-black' },
  ]);
  const pricing = calculateQuotePricing({
    product: {
      ...PRODUCT,
      priceTiers: [{ minQuantity: 10, maxQuantity: 99, unitPrice: 10000 }],
    },
    quantity: 1000,
    resolvedSelections: selections,
  });

  assert.equal(pricing.status, 'custom');
  assert.equal(pricing.estimatedTotal, null);
  assert.match(pricing.customReason, /no tiene un precio publicado/);
});

test('rechaza cantidades por debajo del mínimo', () => {
  const selections = resolveSelections(PRODUCT, [
    { groupId: 'group-color', choiceId: 'choice-black' },
  ]);

  assert.throws(
    () =>
      calculateQuotePricing({
        product: PRODUCT,
        quantity: 5,
        resolvedSelections: selections,
      }),
    (error) => {
      assert.equal(error.code, 'MINIMUM_QUANTITY');
      assert.equal(error.details.minimumQuantity, 10);
      return true;
    },
  );
});

test('exige las opciones obligatorias y rechaza opciones desconocidas', () => {
  assert.throws(
    () => resolveSelections(PRODUCT, []),
    (error) => {
      assert.equal(error.code, 'REQUIRED_OPTION_MISSING');
      assert.deepEqual(error.details.missingGroups, [{ id: 'group-color', name: 'Color' }]);
      return true;
    },
  );

  assert.throws(
    () => resolveSelections(PRODUCT, [{ groupId: 'group-color', choiceId: 'missing' }]),
    (error) => {
      assert.equal(error.code, 'INVALID_SELECTION');
      return true;
    },
  );
});
