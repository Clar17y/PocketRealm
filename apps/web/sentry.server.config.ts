import * as Sentry from '@sentry/nextjs';
import { getServerSentryRelease } from './src/lib/sentryRelease';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment =
  process.env.SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: getServerSentryRelease(),
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
