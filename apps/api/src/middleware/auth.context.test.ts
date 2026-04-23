import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { prisma } from '@pocketrealm/database';

describe('authenticate season context', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('attaches account and cached season details when the token includes a season', async () => {
    const cachedSeason = {
      id: 'season-1',
      name: 'Season 1',
      status: 'active',
      startsAt: new Date('2026-04-01T00:00:00.000Z'),
      endsAt: new Date('2026-05-01T00:00:00.000Z'),
      constantOverrides: null,
      features: ['double_xp'],
    };

    vi.doMock('../services/seasonCacheService', () => ({
      getCachedSeason: vi.fn(() => cachedSeason),
    }));

    const mod = await import('./auth.js');
    const payload = {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: 'season-1',
      role: 'player',
    };

    const token = mod.generateAccessToken(payload);
    const req: any = {
      headers: { authorization: `Bearer ${token}` },
    };
    const next = vi.fn();
    (prisma as any).player.update.mockResolvedValue({});

    mod.authenticate(req, {} as any, next);

    expect(req.player).toEqual(expect.objectContaining(payload));
    expect(req.account).toEqual({ id: 'account-1', role: 'player' });
    expect(req.season).toEqual(cachedSeason);
    expect(next).toHaveBeenCalledTimes(1);
    expect((prisma as any).player.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: { lastActiveAt: expect.any(Date) },
    });
  });

  it('still attaches account context when the player is in the permanent realm', async () => {
    vi.doMock('../services/seasonCacheService', () => ({
      getCachedSeason: vi.fn(() => undefined),
    }));

    const mod = await import('./auth.js');
    const payload = {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      seasonId: null,
      role: 'admin',
    };

    const token = mod.generateAccessToken(payload);
    const req: any = {
      headers: { authorization: `Bearer ${token}` },
    };
    const next = vi.fn();
    (prisma as any).player.update.mockResolvedValue({});

    mod.authenticate(req, {} as any, next);

    expect(req.player).toEqual(expect.objectContaining(payload));
    expect(req.account).toEqual({ id: 'account-1', role: 'admin' });
    expect(req.season).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
