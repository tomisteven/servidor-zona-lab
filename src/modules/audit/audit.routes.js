import { Router } from 'express';
import { z } from 'zod';

import { validate } from '../../shared/http/validation.js';
import { AuditLog } from './audit.model.js';

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

function toAuditDto(entry) {
  return {
    id: entry._id.toString(),
    action: entry.action,
    method: entry.method,
    path: entry.path,
    actor: entry.actor,
    statusCode: entry.statusCode,
    requestId: entry.requestId,
    createdAt: entry.createdAt,
  };
}

export function createAuditRouter() {
  const router = Router();

  router.get('/', async (request, response) => {
    const { page, limit } = validate(auditQuerySchema, request.query);
    const [items, total] = await Promise.all([
      AuditLog.find({})
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments({}),
    ]);

    response.status(200).json({
      items: items.map(toAuditDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    });
  });

  return router;
}
