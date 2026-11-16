import { Router } from 'express';
import { z } from 'zod';

import { createRateLimiter } from '../../shared/http/rate-limit.js';
import { validate } from '../../shared/http/validation.js';
import {
  createReview,
  listAdminReviews,
  listApprovedReviews,
  removeReview,
  setReviewApproved,
} from './review.service.js';

const reviewInputSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá tu nombre.').max(80),
  rating: z.coerce.number().int().min(1, 'Elegí una puntuación.').max(5),
  comment: z.string().trim().min(10, 'Contanos un poco más.').max(1000),
});

const reviewStatusSchema = z.object({
  approved: z.boolean(),
});

const adminReviewQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'all']).default('pending'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createReviewsPublicRouter({
  rateLimitEnabled = true,
  rateLimitStoreFor = null,
} = {}) {
  const router = Router();
  const limiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message: 'Recibimos demasiadas reseñas desde esta conexión.',
    enabled: rateLimitEnabled,
    store: rateLimitStoreFor?.('reviews'),
  });

  router.get('/products/:id/reviews', async (request, response) => {
    const result = await listApprovedReviews(request.params.id);
    response.status(200).json(result);
  });

  router.post('/products/:id/reviews', limiter, async (request, response) => {
    const input = validate(reviewInputSchema, request.body);
    const result = await createReview(request.params.id, input);

    response.status(201).json(result);
  });

  return router;
}

export function createReviewsAdminRouter() {
  const router = Router();

  router.get('/', async (request, response) => {
    const query = validate(adminReviewQuerySchema, request.query);
    const result = await listAdminReviews(query);

    response.status(200).json(result);
  });

  router.patch('/:id', async (request, response) => {
    const { approved } = validate(reviewStatusSchema, request.body);
    const result = await setReviewApproved(request.params.id, approved);

    response.status(200).json(result);
  });

  router.delete('/:id', async (request, response) => {
    await removeReview(request.params.id);
    response.status(204).end();
  });

  return router;
}
