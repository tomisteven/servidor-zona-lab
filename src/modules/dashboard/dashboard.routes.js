import { Router } from 'express';

import { Product } from '../catalog/product.model.js';
import { QuoteRequest } from '../quotes/quote-request.model.js';

function toStatusCounts(groups) {
  const counts = { new: 0, contacted: 0, closed: 0 };

  for (const group of groups) {
    counts[group._id] = group.count;
  }

  return counts;
}

export function createDashboardRouter() {
  const router = Router();

  router.get('/', async (_request, response) => {
    const [productsTotal, productsActive, quotesTotal, statusGroups, revenue, recent, topProducts] =
      await Promise.all([
        Product.countDocuments({ deletedAt: null }),
        Product.countDocuments({ deletedAt: null, active: true }),
        QuoteRequest.countDocuments({}),
        QuoteRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        QuoteRequest.aggregate([
          { $match: { 'pricing.status': 'estimated' } },
          { $group: { _id: null, total: { $sum: '$pricing.estimatedTotal' } } },
        ]),
        QuoteRequest.find({})
          .sort({ createdAt: -1, _id: -1 })
          .limit(5)
          .select(
            'code status createdAt product.name customer.name pricing.status pricing.estimatedTotal',
          )
          .lean(),
        QuoteRequest.aggregate([
          { $group: { _id: '$product.name', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 5 },
        ]),
      ]);

    response.status(200).json({
      metrics: {
        products: {
          total: productsTotal,
          active: productsActive,
        },
        quotes: {
          total: quotesTotal,
          byStatus: toStatusCounts(statusGroups),
          estimatedRevenue: revenue[0]?.total ?? 0,
        },
      },
      recentQuotes: recent.map((quote) => ({
        id: quote._id.toString(),
        code: quote.code,
        status: quote.status ?? 'new',
        createdAt: quote.createdAt,
        productName: quote.product?.name ?? '',
        customerName: quote.customer?.name ?? '',
        pricingStatus: quote.pricing?.status ?? 'custom',
        estimatedTotal: quote.pricing?.estimatedTotal ?? null,
      })),
      topProducts: topProducts.map((product) => ({
        name: product._id,
        quotes: product.count,
      })),
    });
  });

  return router;
}
