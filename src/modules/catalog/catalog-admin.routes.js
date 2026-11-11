import { Router } from 'express';

import { validate } from '../../shared/http/validation.js';
import {
  createProduct,
  deleteProduct,
  getProductForAdmin,
  listProducts,
  setProductActive,
  updateProduct,
} from './catalog.service.js';
import {
  adminProductQuerySchema,
  productInputSchema,
  productStatusSchema,
} from './product.schemas.js';

export function createCatalogAdminRouter() {
  const router = Router();

  router.get('/', async (request, response) => {
    const query = validate(adminProductQuerySchema, request.query);
    const result = await listProducts({ ...query, includeInactive: true });

    response.status(200).json(result);
  });

  router.post('/', async (request, response) => {
    const input = validate(productInputSchema, request.body);
    const product = await createProduct(input);

    response.status(201).json({ product });
  });

  router.get('/:id', async (request, response) => {
    const product = await getProductForAdmin(request.params.id);

    response.status(200).json({ product });
  });

  router.put('/:id', async (request, response) => {
    const input = validate(productInputSchema, request.body);
    const product = await updateProduct(request.params.id, input);

    response.status(200).json({ product });
  });

  router.patch('/:id/status', async (request, response) => {
    const { active } = validate(productStatusSchema, request.body);
    const product = await setProductActive(request.params.id, active);

    response.status(200).json({ product });
  });

  router.delete('/:id', async (request, response) => {
    await deleteProduct(request.params.id);
    response.status(204).end();
  });

  return router;
}
