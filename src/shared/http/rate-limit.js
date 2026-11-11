import { rateLimit } from 'express-rate-limit';

export function createRateLimiter({ windowMs, limit, message, enabled = true }) {
  if (!enabled) {
    return (_request, _response, next) => next();
  }

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(request, response) {
      request.log?.warn({ code: 'RATE_LIMITED', path: request.path }, 'request_rate_limited');
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message,
        },
      });
    },
  });
}
