import * as Sentry from '@sentry/nextjs';
import { getSentryRelease } from './src/lib/sentryRelease';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: getSentryRelease(),
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Session Replay is opt-in later; disable at launch to avoid PII surprises.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Instrument App Router navigations so transactions are linked across pages.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
