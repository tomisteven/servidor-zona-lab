import { Router } from 'express';

import { validate } from '../../shared/http/validation.js';
import { getCategories, getProductBySlug, listProducts } from './catalog.service.js';
import { publicProductQuerySchema, productSlugSchema } from './product.schemas.js';

export function createCatalogPublicRouter() {
  const router = Router();

  router.get('/categories', (_request, response) => {
    response.status(200).json({ items: getCategories() });
  });

  router.get('/products', async (request, response) => {
    const query = validate(publicProductQuerySchema, request.query);
    const result = await listProducts({ ...query, includeInactive: false });

    response.status(200).json(result);
  });

  router.get('/products/:slug', async (request, response) => {
    const slug = validate(productSlugSchema, request.params.slug, {
      message: 'El producto solicitado no es válido.',
    });
    const product = await getProductBySlug(slug);

    response.status(200).json({ product });
  });

  return router;
}
