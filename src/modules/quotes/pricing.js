import { AppError } from '../../shared/errors/app-error.js';

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveSelections(product, selections) {
  const groups = product.optionGroups ?? [];
  const groupsById = new Map(groups.map((group) => [String(group._id), group]));
  const selectedGroups = new Map();

  for (const selection of selections) {
    const group = groupsById.get(selection.groupId);

    if (!group) {
      throw new AppError({
        message: 'Una de las opciones seleccionadas ya no está disponible.',
        statusCode: 400,
        code: 'INVALID_SELECTION',
      });
    }

    if (selectedGroups.has(selection.groupId)) {
      throw new AppError({
        message: 'No podés elegir dos opciones del mismo grupo.',
        statusCode: 400,
        code: 'INVALID_SELECTION',
      });
    }

    const choice = (group.choices ?? []).find(
      (candidate) => String(candidate._id) === selection.choiceId,
    );

    if (!choice) {
      throw new AppError({
        message: 'Una de las opciones seleccionadas ya no está disponible.',
        statusCode: 400,
        code: 'INVALID_SELECTION',
      });
    }

    selectedGroups.set(selection.groupId, { group, choice });
  }

  const missingGroups = groups
    .filter((group) => group.required && !selectedGroups.has(String(group._id)))
    .map((group) => ({ id: String(group._id), name: group.name }));

  if (missingGroups.length > 0) {
    throw new AppError({
      message: 'Completá las opciones obligatorias del producto.',
      statusCode: 400,
      code: 'REQUIRED_OPTION_MISSING',
      details: { missingGroups },
    });
  }

  return [...selectedGroups.entries()].map(([groupId, { group, choice }]) => ({
    groupId,
    groupName: group.name,
    choiceId: String(choice._id),
    choiceLabel: choice.label,
    additionalUnitPrice: choice.additionalUnitPrice ?? 0,
  }));
}

export function calculateQuotePricing({ product, quantity, resolvedSelections }) {
  if (quantity < product.minimumQuantity) {
    throw new AppError({
      message: `La cantidad mínima para este producto es ${product.minimumQuantity}.`,
      statusCode: 400,
      code: 'MINIMUM_QUANTITY',
      details: { minimumQuantity: product.minimumQuantity },
    });
  }

  const tier = (product.priceTiers ?? []).find(
    (candidate) =>
      quantity >= candidate.minQuantity &&
      (candidate.maxQuantity === null ||
        candidate.maxQuantity === undefined ||
        quantity <= candidate.maxQuantity),
  );

  const optionsUnitTotal = roundMoney(
    resolvedSelections.reduce((total, selection) => total + selection.additionalUnitPrice, 0),
  );
  const personalizationFee = roundMoney(product.personalizationFee ?? 0);

  if (!tier) {
    return {
      status: 'custom',
      tier: null,
      unitBasePrice: null,
      optionsUnitTotal,
      unitPrice: null,
      personalizationFee,
      estimatedTotal: null,
      currency: 'ARS',
      computedAt: new Date(),
      customReason: 'La cantidad solicitada no tiene un precio publicado.',
    };
  }

  const unitBasePrice = roundMoney(tier.unitPrice);
  const unitPrice = roundMoney(unitBasePrice + optionsUnitTotal);
  const estimatedTotal = roundMoney(unitPrice * quantity + personalizationFee);

  return {
    status: 'estimated',
    tier: {
      minQuantity: tier.minQuantity,
      maxQuantity: tier.maxQuantity ?? null,
    },
    unitBasePrice,
    optionsUnitTotal,
    unitPrice,
    personalizationFee,
    estimatedTotal,
    currency: 'ARS',
    computedAt: new Date(),
    customReason: null,
  };
}
