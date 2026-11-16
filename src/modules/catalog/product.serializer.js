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
    imageAlt: product.imageAlt ?? '',
    minimumQuantity: product.minimumQuantity,
    startingUnitPrice: getStartingUnitPrice(product),
    personalizationFee: product.personalizationFee ?? 0,
    imageCount: getProductImages(product).length,
    features: (product.features ?? []).slice(0, 3),
    optionGroupCount: (product.optionGroups ?? []).length,
  };
}

function getProductImages(product) {
  const images = (product.images ?? []).filter(Boolean);

  if (images.length > 0) {
    return images;
  }

  return product.imageUrl ? [product.imageUrl] : [];
}

export function toPublicProduct(product) {
  return {
    ...toProductSummary(product),
    images: getProductImages(product),
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
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
