import { describe, it, expect } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
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
});
