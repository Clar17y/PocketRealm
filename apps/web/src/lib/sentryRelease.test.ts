import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClientSentryRelease, getServerSentryRelease } from './sentryRelease';

describe('sentry release helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers APP_VERSION when available', () => {
    expect(getServerSentryRelease({ APP_VERSION: '1.2.3', NEXT_PUBLIC_APP_VERSION: '0.9.0' })).toBe('1.2.3');
  });

  it('falls back to NEXT_PUBLIC_APP_VERSION on the server', () => {
    expect(getServerSentryRelease({ NEXT_PUBLIC_APP_VERSION: '0.9.0' })).toBe('0.9.0');
  });

  it('returns the public version for the client helper', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '0.9.0');
    vi.stubEnv('APP_VERSION', '1.2.3');

    expect(getClientSentryRelease()).toBe('0.9.0');
  });

  it('returns unknown on the client when NEXT_PUBLIC_APP_VERSION is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    vi.stubEnv('APP_VERSION', '1.2.3');

    expect(getClientSentryRelease()).toBe('unknown');
  });

  it('returns unknown on the server when no version env is set', () => {
    expect(getServerSentryRelease({})).toBe('unknown');
  });
});
