import { AuditLog } from './audit.model.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createAuditMiddleware({ logger } = {}) {
  return function auditAdminMutation(request, response, next) {
    if (!MUTATION_METHODS.has(request.method)) {
      next();
      return;
    }

    response.on('finish', () => {
      if (response.statusCode >= 400) {
        return;
      }

      AuditLog.create({
        action: `${request.method} ${request.baseUrl}${request.path}`.slice(0, 200),
        method: request.method,
        path: `${request.baseUrl}${request.path}`.slice(0, 300),
        actor: request.adminSession?.sub ?? '',
        statusCode: response.statusCode,
        requestId: String(request.id ?? ''),
      }).catch((error) => {
        logger?.warn({ err: error }, 'audit_log_failed');
      });
    });

    next();
  };
}
