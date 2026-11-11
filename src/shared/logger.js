import { randomUUID } from 'node:crypto';

import pino from 'pino';
import pinoHttp from 'pino-http';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function createLogger({ level = 'info', service = 'zona-lab-api' } = {}) {
  return pino({
    level,
    base: {
      service,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[REDACTED]',
    },
  });
}

export function createHttpLogger(logger) {
  return pinoHttp({
    logger,
    genReqId(req, res) {
      const receivedId = req.headers['x-request-id'];
      const requestId =
        typeof receivedId === 'string' && REQUEST_ID_PATTERN.test(receivedId)
          ? receivedId
          : randomUUID();

      res.setHeader('x-request-id', requestId);
      return requestId;
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          path: (req.url ?? '').split('?')[0],
          remoteAddress: req.remoteAddress,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
    customLogLevel(_req, res, error) {
      if (error || res.statusCode >= 500) {
        return 'error';
      }

      if (res.statusCode >= 400) {
        return 'warn';
      }

      return 'info';
    },
    customSuccessMessage() {
      return 'request_completed';
    },
    customErrorMessage() {
      return 'request_failed';
    },
  });
}
