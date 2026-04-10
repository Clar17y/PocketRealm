import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { resolveAppVersion } from './appVersion';

const ORIGINAL = process.env.APP_VERSION;

describe('resolveAppVersion', () => {
  beforeEach(() => { delete process.env.APP_VERSION; });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = ORIGINAL;
  });

  it('returns APP_VERSION when set', () => {
    process.env.APP_VERSION = '1.2.3';
    expect(resolveAppVersion()).toBe('1.2.3');
  });

  it('falls back to "unknown" when not set', () => {
    expect(resolveAppVersion()).toBe('unknown');
  });

  it('trims whitespace', () => {
    process.env.APP_VERSION = '  4.5.6  ';
    expect(resolveAppVersion()).toBe('4.5.6');
  });
});
