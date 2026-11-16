import { isValidObjectId } from 'mongoose';

import { AppError } from '../../shared/errors/app-error.js';
import { Product } from '../catalog/product.model.js';
import { Review } from './review.model.js';

function assertValidId(id) {
  if (!isValidObjectId(id)) {
    throw new AppError({
      message: 'Producto no encontrado.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }
}

function toPublicReview(review) {
  return {
    id: review._id.toString(),
    name: review.name,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}

function toAdminReview(review) {
  return {
    ...toPublicReview(review),
    productId: review.productId.toString(),
    productName: review.productName,
    productSlug: review.productSlug,
    approved: review.approved,
  };
}

export async function listApprovedReviews(productId) {
  assertValidId(productId);

  const reviews = await Review.find({ productId, approved: true })
    .sort({ createdAt: -1, _id: -1 })
    .limit(30)
    .lean();
  const count = reviews.length;
  const average =
    count > 0
      ? Math.round((reviews.reduce((total, review) => total + review.rating, 0) / count) * 10) / 10
      : null;

  return {
    items: reviews.map(toPublicReview),
    summary: {
      count,
      average,
    },
  };
}

export async function createReview(productId, input) {
  assertValidId(productId);

  const product = await Product.findOne({ _id: productId, active: true, deletedAt: null })
    .select('name slug')
    .lean();

  if (!product) {
    throw new AppError({
      message: 'El producto no está disponible.',
      statusCode: 404,
      code: 'PRODUCT_NOT_FOUND',
    });
  }

  await Review.create({
    productId: product._id,
    productName: product.name,
    productSlug: product.slug,
    name: input.name,
    rating: input.rating,
    comment: input.comment,
    approved: false,
  });

  return { published: false };
}

export async function listAdminReviews({ status = 'pending', page = 1, limit = 20 }) {
  const filter = status === 'all' ? {} : { approved: status === 'approved' };
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return {
    items: reviews.map(toAdminReview),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

export async function setReviewApproved(id, approved) {
  if (!isValidObjectId(id)) {
    throw new AppError({
      message: 'Reseña no encontrada.',
      statusCode: 404,
      code: 'REVIEW_NOT_FOUND',
    });
  }

  const review = await Review.findByIdAndUpdate(
    id,
    { $set: { approved } },
    { returnDocument: 'after' },
  ).lean();

  if (!review) {
    throw new AppError({
      message: 'Reseña no encontrada.',
      statusCode: 404,
      code: 'REVIEW_NOT_FOUND',
    });
  }

  return { review: toAdminReview(review) };
}

export async function removeReview(id) {
  if (!isValidObjectId(id)) {
    throw new AppError({
      message: 'Reseña no encontrada.',
      statusCode: 404,
      code: 'REVIEW_NOT_FOUND',
    });
  }

  const review = await Review.findByIdAndDelete(id).lean();

  if (!review) {
    throw new AppError({
      message: 'Reseña no encontrada.',
      statusCode: 404,
      code: 'REVIEW_NOT_FOUND',
    });
  }
}
