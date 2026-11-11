import { Router } from 'express';

export function createHealthRouter({ getDatabaseStatus = () => 'unknown' } = {}) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'zona-lab-api',
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  router.get('/ready', (_req, res) => {
    const database = getDatabaseStatus();
    const ready = database === 'connected';

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: {
        database,
      },
    });
  });

  return router;
}
