import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Enriches the current Sentry scope with request-scoped context so any
 * exception captured during this request is automatically tagged with
 * requestId and route. Mirrors the fields attached by the pino request
 * logger (apps/api/src/middleware/requestLogger.ts).
 *
 * Mount after the requestId middleware; no auth dependency. Auth-derived
 * user context is attached separately by `attachSentryUser`, which runs
 * from inside the `authenticate` / `optionalAuthenticate` middleware once
 * `req.player` is populated. Sentry v8+ uses AsyncLocalStorage, so scope
 * mutations made later in the async chain still land on this request's
 * scope.
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

  next();
}

/**
 * Attaches the authenticated player to the current Sentry scope so any
 * exception captured during this request carries playerId + username. Call
 * from inside the auth middleware once `req.player` has been populated.
 * Passes `null` when no player is present to clear any stale user from a
 * previous request on the same scope.
 */
export function attachSentryUser(req: Request): void {
  const scope = Sentry.getCurrentScope();

  if (req.player?.playerId) {
    scope.setUser({
      id: req.player.playerId,
      username: req.player.username,
    });
  } else {
    scope.setUser(null);
  }
}
