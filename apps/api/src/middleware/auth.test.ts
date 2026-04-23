import { describe, expect, it, vi } from 'vitest';

describe('auth config', () => {
  it('defaults to 15 minutes access + 30 days refresh', async () => {
    vi.resetModules();
    delete process.env.ACCESS_TOKEN_TTL_MINUTES;
    delete process.env.REFRESH_TOKEN_TTL_DAYS;
    delete process.env.SESSION_INACTIVITY_WINDOW_HOURS;

    const mod = await import('./auth.js');
    expect(mod.authConfig.accessTokenTtlMinutes).toBe(15);
    expect(mod.authConfig.refreshTokenTtlDays).toBe(30);
    expect(mod.authConfig.sessionInactivityWindowHours).toBe(24);
  });

  it('reads TTL values from env', async () => {
    vi.resetModules();
    process.env.ACCESS_TOKEN_TTL_MINUTES = '60';
    process.env.REFRESH_TOKEN_TTL_DAYS = '7';
    process.env.SESSION_INACTIVITY_WINDOW_HOURS = '48';

    const mod = await import('./auth.js');
    expect(mod.authConfig.accessTokenTtlMinutes).toBe(60);
    expect(mod.authConfig.refreshTokenTtlDays).toBe(7);
    expect(mod.authConfig.sessionInactivityWindowHours).toBe(48);
  });

  it('computes refresh expiry timestamp', async () => {
    vi.resetModules();
    process.env.REFRESH_TOKEN_TTL_DAYS = '7';

    const mod = await import('./auth.js');
    const nowMs = 1_700_000_000_000;
    expect(mod.refreshTokenExpiresAt(nowMs).getTime()).toBe(nowMs + 7 * 24 * 60 * 60 * 1000);
  });

  it('generates unique refresh tokens for the same payload', async () => {
    vi.resetModules();

    const mod = await import('./auth.js');
    const payload = {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'player',
      seasonId: null,
      role: 'player',
    };

    const tokenA = mod.generateRefreshToken(payload);
    const tokenB = mod.generateRefreshToken(payload);

    expect(tokenA).not.toBe(tokenB);
  });

  it('returns a clean payload from refresh token verification', async () => {
    vi.resetModules();

    const mod = await import('./auth.js');
    const payload = {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'player',
      seasonId: 'season-1',
      role: 'player',
    };

    const refreshToken = mod.generateRefreshToken(payload);
    const verified = mod.verifyRefreshToken(refreshToken);

    expect(verified).toEqual(payload);
    expect(() => mod.generateAccessToken(verified)).not.toThrow();
    expect(() => mod.generateRefreshToken(verified)).not.toThrow();
  });
});
