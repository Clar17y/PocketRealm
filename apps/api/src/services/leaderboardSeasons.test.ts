import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'lock-token'),
}));

vi.mock('../redis', () => ({
  redis: {
    zcard: vi.fn(),
    get: vi.fn(),
    zrevrank: vi.fn(),
    zrevrange: vi.fn(),
    zscore: vi.fn(),
    exists: vi.fn(),
    hget: vi.fn(),
    hmget: vi.fn(),
    pipeline: vi.fn(),
    zadd: vi.fn(),
    hset: vi.fn(),
    del: vi.fn(),
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

import { mockPrisma } from '../__test__/setup';
import { redis } from '../redis';
import { getLeaderboard, refreshAllLeaderboards } from './leaderboardService';

const mockRedis = redis as unknown as Record<string, ReturnType<typeof vi.fn>>;

function stubRealmRefreshBase() {
  mockPrisma.pvpRating.findMany.mockResolvedValue([
    {
      id: 'rating-1',
      playerId: 'player-1',
      rating: 1200,
      wins: 12,
      bestRating: 1250,
      winStreak: 4,
      player: {
        username: 'Rook',
        characterLevel: 15,
        isBot: false,
        activeTitle: null,
        account: { role: 'player' },
      },
    },
  ]);
  mockPrisma.player.findMany.mockResolvedValue([]);
  mockPrisma.playerSkill.findMany.mockResolvedValue([]);
  mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
  mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
  mockPrisma.guild.findMany.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([]);
  mockPrisma.season = {
    findMany: vi.fn(),
  };
}

describe('leaderboardService seasonal realm support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.exists.mockResolvedValue(0);
  });

  it('uses the season-scoped Redis keys when fetching a seasonal leaderboard', async () => {
    mockRedis.zcard.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue('2026-04-20T00:00:00.000Z');
    mockRedis.zrevrange.mockResolvedValue(['player-1', '500']);
    mockRedis.hmget.mockResolvedValue([
      JSON.stringify({ username: 'Rook', characterLevel: 15, isBot: false, isAdmin: false }),
    ]);

    await (getLeaderboard as any)('pvp_rating', undefined, false, 'season-1');

    expect(mockRedis.zcard).toHaveBeenCalledWith('leaderboard:season-1:pvp_rating');
    expect(mockRedis.zrevrange).toHaveBeenCalledWith('leaderboard:season-1:pvp_rating', 0, 24, 'WITHSCORES');
    expect(mockRedis.hmget).toHaveBeenCalledWith('leaderboard:meta:season-1:pvp_rating', 'player-1');
  });

  it('refreshes permanent and active seasonal leaderboards separately', async () => {
    stubRealmRefreshBase();
    mockPrisma.season.findMany.mockResolvedValue([{ id: 'season-1' }]);

    await refreshAllLeaderboards();

    const zaddKeys = mockRedis.zadd.mock.calls.map((call) => call[0]);
    expect(zaddKeys).toContain('leaderboard:permanent:pvp_rating');
    expect(zaddKeys).toContain('leaderboard:season-1:pvp_rating');
  });
});
