import { describe, expect, it } from 'vitest';
import { getSentryRelease } from './sentryRelease';

describe('getSentryRelease', () => {
  it('prefers APP_VERSION when available', () => {
    expect(getSentryRelease({ APP_VERSION: '1.2.3', NEXT_PUBLIC_APP_VERSION: '0.9.0' })).toBe('1.2.3');
  });

  it('falls back to NEXT_PUBLIC_APP_VERSION', () => {
    expect(getSentryRelease({ NEXT_PUBLIC_APP_VERSION: '0.9.0' })).toBe('0.9.0');
  });

  it('returns unknown when no version env is set', () => {
    expect(getSentryRelease({})).toBe('unknown');
  });
});
