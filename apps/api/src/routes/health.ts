import { Router, type Request, type Response } from 'express';
import {
  checkDatabase,
  checkRedis,
  getSocketIoStats,
  isShuttingDown,
} from '../services/healthChecks';
import { getIo } from '../socket';

export const healthRouter = Router();

/**
 * Liveness probe — always 200 while the process is alive.
 * Does NOT touch dependencies. Safe for high-frequency polling from orchestrators.
 */
healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Readiness probe — 200 when DB + Redis are reachable, 503 otherwise.
 * Used by Render and external uptime monitors (see docs/reference/deployment.md).
 */
healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  // During graceful shutdown, flip to 503 immediately so the load balancer
  // can stop routing new traffic before dependencies actually close.
  if (isShuttingDown()) {
    res.status(503).json({ status: 'shutting_down' });
    return;
  }
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = database === 'ok' && redis === 'ok';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'error',
    dependencies: { database, redis },
  });
});

/**
 * Full health view — informational snapshot including version, uptime, socket count.
 * Always returns 200 (use /health/ready for a hard gate).
 */
healthRouter.get('/health', async (_req: Request, res: Response) => {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const socketio = getSocketIoStats(getIo());
  const degraded = database !== 'ok' || redis !== 'ok';

  res.status(200).json({
    status: degraded ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    // TODO(#210): switch to canonical apps/api/src/version.ts once Phase 2.4 lands.
    version: process.env.APP_VERSION ?? 'unknown',
    uptime: Math.round(process.uptime()),
    dependencies: {
      database,
      redis,
      socketio,
    },
  });
});
