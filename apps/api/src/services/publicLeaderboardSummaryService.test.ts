import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrownCollectorEntry } from './crownLeaderboardService';

const mocks = vi.hoisted(() => ({
  redis: {
    get: vi.fn(),
    zrevrange: vi.fn(),
    hmget: vi.fn(),
  },
  getCachedCrownCollectorRows: vi.fn(),
}));

vi.mock('../redis', () => ({ redis: mocks.redis }));
vi.mock('./crownLeaderboardService', () => ({
  getCachedCrownCollectorRows: mocks.getCachedCrownCollectorRows,
}));
vi.mock('./leaderboardService', () => ({
  LEADERBOARD_LAST_REFRESH_KEY: 'leaderboard:last_refresh',
  getCategoryLabel: (category: string) => ({
    character_xp: 'Total XP',
    total_kills: 'Total Kills',
    pvp_rating: 'PvP Rating',
    casino_profit: 'Casino Profit',
  })[category] ?? null,
}));

import { getPublicLeaderboardSummary } from './publicLeaderboardSummaryService';

function crownCollector(username: string): CrownCollectorEntry {
  return {
    rank: 1,
    username,
    characterLevel: 30,
    crowns: { gold: 2, silver: 1, bronze: 0, total: 3 },
    topGroups: [{ group: 'pvp', count: 2 }],
  };
}

describe('publicLeaderboardSummaryService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reads cached crown collectors and weekly leaders from Redis only', async () => {
    const crownCollectors = [crownCollector('Crown Keeper')];
    mocks.getCachedCrownCollectorRows.mockResolvedValue(crownCollectors);
    mocks.redis.zrevrange.mockImplementation((key: string) => {
      const playerIdByKey: Record<string, string> = {
        'leaderboard:weekly_delta:permanent:character_xp': 'xp-player',
        'leaderboard:weekly_delta:permanent:total_kills': 'kills-player',
        'leaderboard:weekly_delta:permanent:pvp_rating': 'pvp-player',
        'leaderboard:weekly_delta:permanent:casino_profit': 'casino-player',
      };

      const playerId = playerIdByKey[key];
      return Promise.resolve(playerId ? [playerId, '1234'] : []);
    });
    mocks.redis.hmget.mockImplementation((_key: string, playerId: string) => Promise.resolve([
      JSON.stringify({
        username: `${playerId}-name`,
        characterLevel: 42,
      }),
    ]));
    mocks.redis.get.mockResolvedValue('2026-04-24T12:00:00.000Z');

    const result = await getPublicLeaderboardSummary();

    expect(mocks.getCachedCrownCollectorRows).toHaveBeenCalledWith(3);
    expect(mocks.redis.zrevrange).toHaveBeenCalledWith(
      'leaderboard:weekly_delta:permanent:character_xp',
      0,
      0,
      'WITHSCORES',
    );
    expect(mocks.redis.zrevrange).toHaveBeenCalledWith(
      'leaderboard:weekly_delta:permanent:casino_profit',
      0,
      0,
      'WITHSCORES',
    );
    expect(mocks.redis.hmget).toHaveBeenCalledWith(
      'leaderboard:meta:permanent:character_xp',
      'xp-player',
    );
    expect(result).toEqual({
      crownCollectors,
      weeklyLeaders: [
        {
          category: 'character_xp',
          label: 'Total XP',
          rank: 1,
          username: 'xp-player-name',
          characterLevel: 42,
          score: 1234,
        },
        {
          category: 'total_kills',
          label: 'Total Kills',
          rank: 1,
          username: 'kills-player-name',
          characterLevel: 42,
          score: 1234,
        },
        {
          category: 'pvp_rating',
          label: 'PvP Rating',
          rank: 1,
          username: 'pvp-player-name',
          characterLevel: 42,
          score: 1234,
        },
        {
          category: 'casino_profit',
          label: 'Casino Profit',
          rank: 1,
          username: 'casino-player-name',
          characterLevel: 42,
          score: 1234,
        },
      ],
      lastRefreshedAt: '2026-04-24T12:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('playerId');
  });

  it('returns empty arrays and null lastRefreshedAt when Redis snapshots are missing', async () => {
    mocks.getCachedCrownCollectorRows.mockResolvedValue([]);
    mocks.redis.zrevrange.mockResolvedValue([]);
    mocks.redis.get.mockResolvedValue(null);

    const result = await getPublicLeaderboardSummary();

    expect(result).toEqual({
      crownCollectors: [],
      weeklyLeaders: [],
      lastRefreshedAt: null,
    });
    expect(mocks.redis.hmget).not.toHaveBeenCalled();
  });

  it('skips weekly leaders with missing or malformed metadata', async () => {
    mocks.getCachedCrownCollectorRows.mockResolvedValue([]);
    mocks.redis.zrevrange.mockResolvedValue(['player-1', '99']);
    mocks.redis.hmget
      .mockResolvedValueOnce([null])
      .mockResolvedValueOnce(['{not-json'])
      .mockResolvedValueOnce([JSON.stringify({ username: 'Missing Level' })])
      .mockResolvedValueOnce([JSON.stringify({ username: 'Valid', characterLevel: 12 })]);
    mocks.redis.get.mockResolvedValue(null);

    const result = await getPublicLeaderboardSummary();

    expect(result.weeklyLeaders).toEqual([
      {
        category: 'casino_profit',
        label: 'Casino Profit',
        rank: 1,
        username: 'Valid',
        characterLevel: 12,
        score: 99,
      },
    ]);
  });
});
