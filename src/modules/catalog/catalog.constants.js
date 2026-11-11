export const PRODUCT_CATEGORIES = Object.freeze([
  { value: 'bolsos-deportivos', label: 'Bolsos deportivos' },
  { value: 'mochilas', label: 'Mochilas' },
  { value: 'bolsos', label: 'Bolsos' },
  { value: 'fundas', label: 'Fundas' },
  { value: 'neceseres', label: 'Neceseres' },
  { value: 'paleteros', label: 'Paleteros' },
]);

export const PRODUCT_CATEGORY_VALUES = Object.freeze(
  PRODUCT_CATEGORIES.map((category) => category.value),
);

export const DEFAULT_PRODUCT_PAGE_SIZE = 12;
