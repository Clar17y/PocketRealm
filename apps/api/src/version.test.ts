import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('APP_VERSION', () => {
  const original = process.env.APP_VERSION;

  beforeEach(() => {
    delete process.env.APP_VERSION;
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.APP_VERSION;
    } else {
      process.env.APP_VERSION = original;
    }
    vi.resetModules();
  });

  it('falls back to 0.0.0-dev when env is unset', async () => {
    const mod = await import('./version.js');
    expect(mod.APP_VERSION).toBe('0.0.0-dev');
  });

  it('uses APP_VERSION from the environment', async () => {
    process.env.APP_VERSION = '1.2.3';
    const mod = await import('./version.js');
    expect(mod.APP_VERSION).toBe('1.2.3');
  });
});
