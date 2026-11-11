import { PRODUCT_CATEGORIES } from './catalog.constants.js';

const CATEGORY_LABELS = new Map(
  PRODUCT_CATEGORIES.map((category) => [category.value, category.label]),
);

function toId(value) {
  return value?.toString?.() ?? null;
}

function getStartingUnitPrice(product) {
  const prices = (product.priceTiers ?? []).map((tier) => tier.unitPrice);

  return prices.length > 0 ? Math.min(...prices) : null;
}

export function toProductSummary(product) {
  return {
    id: toId(product._id),
    name: product.name,
    slug: product.slug,
    category: product.category,
    categoryLabel: CATEGORY_LABELS.get(product.category) ?? product.category,
    shortDescription: product.shortDescription,
    imageUrl: product.imageUrl ?? '',
    minimumQuantity: product.minimumQuantity,
    startingUnitPrice: getStartingUnitPrice(product),
  };
}

export function toPublicProduct(product) {
  return {
    ...toProductSummary(product),
    description: product.description ?? '',
    features: product.features ?? [],
    personalizationFee: product.personalizationFee,
    priceTiers: (product.priceTiers ?? []).map((tier) => ({
      minQuantity: tier.minQuantity,
      maxQuantity: tier.maxQuantity ?? null,
      unitPrice: tier.unitPrice,
    })),
    optionGroups: (product.optionGroups ?? []).map((group) => ({
      id: toId(group._id),
      name: group.name,
      required: group.required,
      choices: (group.choices ?? []).map((choice) => ({
        id: toId(choice._id),
        label: choice.label,
        additionalUnitPrice: choice.additionalUnitPrice,
      })),
    })),
  };
}

export function toAdminProduct(product) {
  return {
    ...toPublicProduct(product),
    active: product.active,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function toAdminProductSummary(product) {
  return {
    ...toProductSummary(product),
    active: product.active,
    priceTierCount: product.priceTiers?.length ?? 0,
    optionGroupCount: product.optionGroups?.length ?? 0,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
