import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/health')) return next();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';

    logger[level]({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      playerId: req.player?.playerId,
    }, 'request');
  });

  next();
}
