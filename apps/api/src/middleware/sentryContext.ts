import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Enriches the current Sentry scope with request-scoped context so any
 * exception captured during this request is automatically tagged with
 * requestId, playerId, and route. Mirrors the fields attached by the
 * pino request logger (apps/api/src/middleware/requestLogger.ts).
 *
 * Mount AFTER the requestId middleware and AFTER `optionalAuthenticate`
 * so `req.player` is populated when available.
 */
export function sentryContext(req: Request, _res: Response, next: NextFunction): void {
  const scope = Sentry.getCurrentScope();

  if (req.requestId) {
    scope.setTag('requestId', req.requestId);
  }

  scope.setContext('route', {
    method: req.method,
    path: req.path,
  });

  if (req.player?.playerId) {
    scope.setUser({
      id: req.player.playerId,
      username: req.player.username,
    });
  } else {
    scope.setUser(null);
  }

  next();
}
