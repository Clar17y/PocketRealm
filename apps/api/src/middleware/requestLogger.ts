import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

function getLoggedPath(req: Request): string {
  const originalPath = req.originalUrl?.split('?')[0];
  return originalPath || req.path;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/health')) return next();

  const start = Date.now();
  let logged = false;

  const logRequest = () => {
    if (logged) return;
    logged = true;

    const duration = Date.now() - start;
    const aborted = !res.writableEnded;
    const level = aborted || res.statusCode >= 500
      ? 'error'
      : res.statusCode >= 400
        ? 'warn'
        : 'debug';

    logger[level]({
      requestId: req.requestId,
      method: req.method,
      path: getLoggedPath(req),
      status: res.statusCode,
      duration,
      playerId: req.player?.playerId,
      ...(aborted && { aborted: true }),
    }, 'request');
  };

  res.on('finish', logRequest);
  res.on('close', logRequest);

  next();
}
