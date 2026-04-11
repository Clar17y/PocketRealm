// NOTE: This file MUST be imported FIRST in apps/api/src/index.ts
// (before any other import) so Sentry's auto-instrumentation can patch
// Node internals (http, undici, etc.) before Express/Prisma load.
//
// dotenv/config is loaded here (not in index.ts) because Sentry reads
// SENTRY_DSN / SENTRY_ENVIRONMENT / APP_VERSION at module-top-level.
// Loading .env from index.ts would happen AFTER this file and would
// silently disable Sentry under `npm run dev` / `npm start` flows.
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { logger } from './logger';
import { APP_VERSION } from './constants/appVersion';

const dsn = process.env.SENTRY_DSN;
const environment =
  process.env.SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: APP_VERSION,
    // 10% of transactions traced in production, 100% in dev.
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Don't send PII by default — we explicitly attach playerId via setUser.
    sendDefaultPii: false,
    // Drop noisy low-severity events at the SDK boundary.
    beforeSend(event, hint) {
      const err = hint?.originalException as
        | { name?: string; statusCode?: number }
        | undefined;
      // Never forward Zod validation failures — they're 400s, they name
      // request field paths/values (PII-adjacent), and the errorHandler
      // already translates them into a clean client response.
      if (err?.name === 'ZodError') {
        return null;
      }
      // Never forward 4xx AppErrors — they're client errors, not bugs.
      if (err && typeof err.statusCode === 'number' && err.statusCode < 500) {
        return null;
      }
      return event;
    },
  });

  logger.info({ environment, release: APP_VERSION }, 'Sentry initialized');

  // Process-level safety net. Express's error middleware only catches
  // errors that flow through req/next — this catches rogue promises and
  // anything that escapes async contexts entirely.
  // Both unhandledRejection and uncaughtException crash fast after
  // flushing to Sentry so Render can restart on corrupt state — silently
  // swallowing either would hide real bugs and risk data corruption.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection');
    Sentry.captureException(reason);
    Sentry.close(2000).finally(() => process.exit(1));
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException');
    Sentry.captureException(err);
    Sentry.close(2000).finally(() => process.exit(1));
  });
} else {
  logger.warn('SENTRY_DSN not set — Sentry disabled');
}
