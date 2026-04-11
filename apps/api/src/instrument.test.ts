import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const initMock = vi.fn();

vi.mock('@sentry/node', () => ({
  init: initMock,
  captureException: vi.fn(),
  close: vi.fn().mockResolvedValue(true),
}));

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

type RejectionListener = NodeJS.UnhandledRejectionListener;
type ExceptionListener = NodeJS.UncaughtExceptionListener;

describe('instrument', () => {
  const ORIGINAL_ENV = { ...process.env };
  let priorRejection: RejectionListener[] = [];
  let priorException: ExceptionListener[] = [];

  beforeEach(() => {
    initMock.mockReset();
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // Snapshot pre-existing listeners so we can strip anything instrument.ts
    // adds on import without disturbing vitest's own handlers.
    priorRejection = process.listeners('unhandledRejection') as RejectionListener[];
    priorException = process.listeners('uncaughtException') as ExceptionListener[];
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    const rej = process.listeners('unhandledRejection') as RejectionListener[];
    for (const l of rej) {
      if (!priorRejection.includes(l)) process.off('unhandledRejection', l);
    }
    const exc = process.listeners('uncaughtException') as ExceptionListener[];
    for (const l of exc) {
      if (!priorException.includes(l)) process.off('uncaughtException', l);
    }
  });

  it('does not call Sentry.init when SENTRY_DSN is missing', async () => {
    delete process.env.SENTRY_DSN;
    await import('./instrument.js');
    expect(initMock).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with DSN, environment, and release', async () => {
    process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/1';
    process.env.NODE_ENV = 'production';
    process.env.APP_VERSION = '9.9.9';
    await import('./instrument.js');
    expect(initMock).toHaveBeenCalledTimes(1);
    const opts = initMock.mock.calls[0][0];
    expect(opts.dsn).toBe('https://key@o0.ingest.sentry.io/1');
    expect(opts.environment).toBe('production');
    expect(opts.release).toBe('9.9.9');
    expect(opts.tracesSampleRate).toBeTypeOf('number');
  });

  it('uses staging tag when SENTRY_ENVIRONMENT is set', async () => {
    process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/1';
    process.env.SENTRY_ENVIRONMENT = 'staging';
    await import('./instrument.js');
    expect(initMock.mock.calls[0][0].environment).toBe('staging');
  });

  describe('beforeSend filter', () => {
    async function getBeforeSend() {
      process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/1';
      await import('./instrument.js');
      return initMock.mock.calls[0][0].beforeSend as (
        event: unknown,
        hint: { originalException?: unknown },
      ) => unknown;
    }

    it('drops ZodError events (identified by err.name)', async () => {
      const beforeSend = await getBeforeSend();
      const zodError = Object.assign(new Error('Expected string'), { name: 'ZodError' });
      const result = beforeSend({ event_id: 'x' }, { originalException: zodError });
      expect(result).toBeNull();
    });

    it('drops 4xx AppErrors with statusCode < 500', async () => {
      const beforeSend = await getBeforeSend();
      const appError = Object.assign(new Error('Bad request'), { statusCode: 404 });
      const result = beforeSend({ event_id: 'x' }, { originalException: appError });
      expect(result).toBeNull();
    });

    it('keeps 5xx AppErrors', async () => {
      const beforeSend = await getBeforeSend();
      const appError = Object.assign(new Error('Server error'), { statusCode: 500 });
      const event = { event_id: 'x' };
      expect(beforeSend(event, { originalException: appError })).toBe(event);
    });

    it('keeps generic Errors without statusCode', async () => {
      const beforeSend = await getBeforeSend();
      const event = { event_id: 'x' };
      expect(beforeSend(event, { originalException: new Error('boom') })).toBe(event);
    });
  });
});
