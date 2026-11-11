import { isValidObjectId } from 'mongoose';

import { AppError } from '../../shared/errors/app-error.js';
import { PRODUCT_CATEGORIES } from './catalog.constants.js';
import { Product } from './product.model.js';
import {
  toAdminProduct,
  toAdminProductSummary,
  toProductSummary,
  toPublicProduct,
} from './product.serializer.js';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(value) {
  return (
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
      .replace(/-+$/g, '') || 'producto'
  );
}

async function findAvailableSlug(baseSlug) {
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const exists = await Product.exists({ slug });

    if (!exists) {
      return slug;
    }
  }

  throw new AppError({
    message: 'No se pudo generar un slug único para el producto.',
    statusCode: 409,
    code: 'SLUG_TAKEN',
  });
}

function normalizeProductData(input) {
  return {
    ...input,
    features: [...input.features],
    priceTiers: [...input.priceTiers]
      .sort((left, right) => left.minQuantity - right.minQuantity)
      .map((tier) => ({ ...tier })),
    optionGroups: input.optionGroups.map((group) => ({
      ...group,
      choices: group.choices.map((choice) => ({ ...choice })),
    })),
  };
}

function throwDuplicateSlug() {
  throw new AppError({
    message: 'Ya existe un producto con ese slug.',
    statusCode: 409,
    code: 'SLUG_TAKEN',
    details: [{ field: 'slug', message: 'Elegí otro slug.' }],
  });
}

function assertValidId(id) {
  if (!isValidObjectId(id)) {
    throw new AppError({
      message: 'Producto no encontrado.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }
}

function buildListFilter({ category, search, includeInactive }) {
  const filter = { deletedAt: null };

  if (!includeInactive) {
    filter.active = true;
  }

  if (category) {
    filter.category = category;
  }

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), 'i');
    filter.$or = [{ name: pattern }, { shortDescription: pattern }, { description: pattern }];
  }

  return filter;
}

export function getCategories() {
  return PRODUCT_CATEGORIES.map((category) => ({ ...category }));
}

export async function listProducts({ page, limit, category, search, includeInactive = false }) {
  const filter = buildListFilter({ category, search, includeInactive });
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  return {
    items: products.map(includeInactive ? toAdminProductSummary : toProductSummary),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

export async function getProductBySlug(slug) {
  const product = await Product.findOne({
    slug: String(slug).toLowerCase(),
    active: true,
    deletedAt: null,
  }).lean();

  if (!product) {
    throw new AppError({
      message: 'Producto no encontrado.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }

  return toPublicProduct(product);
}

export async function getProductForAdmin(id) {
  assertValidId(id);

  const product = await Product.findOne({ _id: id, deletedAt: null }).lean();

  if (!product) {
    throw new AppError({
      message: 'Producto no encontrado.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }

  return toAdminProduct(product);
}

export async function getActiveProductForQuote(id) {
  assertValidId(id);

  const product = await Product.findOne({ _id: id, active: true, deletedAt: null }).lean();

  if (!product) {
    throw new AppError({
      message: 'El producto no está disponible.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }

  return product;
}

export async function createProduct(input) {
  const data = normalizeProductData(input);
  const slug = data.slug ?? (await findAvailableSlug(slugify(data.name)));

  try {
    const product = await Product.create({ ...data, slug });
    return toAdminProduct(product.toObject());
  } catch (error) {
    if (error?.code === 11000) {
      throwDuplicateSlug();
    }

    throw error;
  }
}

export async function updateProduct(id, input) {
  assertValidId(id);

  const { slug: requestedSlug, ...fields } = normalizeProductData(input);
  const update = {
    ...fields,
    imageUrl: fields.imageUrl ?? '',
  };

  if (requestedSlug !== undefined) {
    const slugOwner = await Product.exists({ slug: requestedSlug, _id: { $ne: id } });

    if (slugOwner) {
      throwDuplicateSlug();
    }

    update.slug = requestedSlug;
  }

  try {
    const product = await Product.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: update },
      { returnDocument: 'after', runValidators: true },
    ).lean();

    if (!product) {
      throw new AppError({
        message: 'Producto no encontrado.',
        statusCode: 404,
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    return toAdminProduct(product);
  } catch (error) {
    if (error?.code === 11000) {
      throwDuplicateSlug();
    }

    throw error;
  }
}

export async function setProductActive(id, active) {
  assertValidId(id);

  const product = await Product.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { active } },
    { returnDocument: 'after' },
  ).lean();

  if (!product) {
    throw new AppError({
      message: 'Producto no encontrado.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }

  return toAdminProduct(product);
}

export async function deleteProduct(id) {
  assertValidId(id);

  const product = await Product.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { active: false, deletedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();

  if (!product) {
    throw new AppError({
      message: 'Producto no encontrado.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }
}
