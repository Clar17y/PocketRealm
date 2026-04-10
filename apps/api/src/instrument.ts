// NOTE: This file MUST be imported FIRST in apps/api/src/index.ts
// (before any other import) so Sentry's auto-instrumentation can patch
// Node internals (http, undici, etc.) before Express/Prisma load.

import * as Sentry from '@sentry/node';
import { logger } from './logger';
import { resolveAppVersion } from './constants/appVersion';

const dsn = process.env.SENTRY_DSN;
const environment =
  process.env.SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: resolveAppVersion(),
    // 10% of transactions traced in production, 100% in dev.
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Don't send PII by default — we explicitly attach playerId via setUser.
    sendDefaultPii: false,
    // Drop noisy low-severity events at the SDK boundary.
    beforeSend(event, hint) {
      // Never forward 4xx AppErrors — they're client errors, not bugs.
      const err = hint?.originalException as { statusCode?: number } | undefined;
      if (err && typeof err.statusCode === 'number' && err.statusCode < 500) {
        return null;
      }
      return event;
    },
  });

  logger.info({ environment, release: resolveAppVersion() }, 'Sentry initialized');

  // Process-level safety net. Express's error middleware only catches
  // errors that flow through req/next — this catches rogue promises and
  // anything that escapes async contexts entirely.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection');
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException');
    Sentry.captureException(err);
    // Let the process crash after flushing — Render will restart it.
    Sentry.close(2000).finally(() => process.exit(1));
  });
} else {
  logger.warn('SENTRY_DSN not set — Sentry disabled');
}
