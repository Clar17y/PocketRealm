import { describe, it, expect, afterEach, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
    vi.resetModules();
  });

  it('exports a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('supports child loggers', () => {
    const child = logger.child({ module: 'test' });
    expect(typeof child.info).toBe('function');
  });

  it('defaults to debug level in test env', () => {
    expect(logger.level).toBe('debug');
  });

  it('respects LOG_LEVEL env var', async () => {
    process.env.LOG_LEVEL = 'warn';
    vi.resetModules();
    const { logger: reloaded } = await import('./logger.js');
    expect(reloaded.level).toBe('warn');
  });
});
