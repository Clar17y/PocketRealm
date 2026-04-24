import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CROWN_CONSTANTS, LEADERBOARD_CONSTANTS } from '@pocketrealm/shared';
import type { CrownCollectorSnapshotEntry } from './crownLeaderboardService';

const mocks = vi.hoisted(() => ({
  prisma: {
    playerCrown: {
      findMany: vi.fn(),
    },
  },
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
  },
}));

vi.mock('@pocketrealm/database', () => ({ prisma: mocks.prisma }));
vi.mock('../redis', () => ({ redis: mocks.redis }));

import {
  getCachedCrownCollectorRows,
  getCrownCollectorLeaderboard,
  invalidateCrownCollectorSnapshot,
  rebuildCrownCollectorSnapshot,
} from './crownLeaderboardService';

const SNAPSHOT_KEY = 'leaderboard:crowns:lifetime:snapshot';

interface CrownRow {
  playerId: string;
  category: string;
  rank: number;
  player: {
    username: string;
    characterLevel: number;
    isBot: boolean;
    activeTitle: string | null;
  };
}

function crownRow(
  playerId: string,
  username: string,
  rank: number,
  category = 'pvp_wins',
  isBot = false,
): CrownRow {
  return {
    playerId,
    category,
    rank,
    player: {
      username,
      characterLevel: 10,
      isBot,
      activeTitle: null,
    },
  };
}

function cachedCollectorRow(
  playerId: string,
  rank: number,
  username: string,
): CrownCollectorSnapshotEntry {
  return {
    playerId,
    rank,
    username,
    characterLevel: 10,
    crowns: { gold: 0, silver: 0, bronze: 1, total: 1 },
    topGroups: [{ group: 'pvp', count: 1 }],
  };
}

function cachedSnapshot(entries: CrownCollectorSnapshotEntry[]) {
  return JSON.stringify({
    entries,
    totalPlayers: entries.length,
    lastRefreshedAt: '2026-04-24T12:00:00.000Z',
  });
}

describe('crownLeaderboardService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.del.mockResolvedValue(1);
    mocks.redis.eval.mockResolvedValue(1);
  });

  it('rebuildCrownCollectorSnapshot ranks lifetime crown collectors by total, medal counts, then username', async () => {
    mocks.prisma.playerCrown.findMany.mockResolvedValue([
      crownRow('p-total', 'Delta', CROWN_CONSTANTS.BRONZE, 'pvp_wins'),
      crownRow('p-total', 'Delta', CROWN_CONSTANTS.BRONZE, 'pvp_wins'),
      crownRow('p-total', 'Delta', CROWN_CONSTANTS.BRONZE, 'boss_damage'),
      crownRow('p-total', 'Delta', CROWN_CONSTANTS.BRONZE, 'skill_mining'),
      crownRow('p-gold', 'Gold', CROWN_CONSTANTS.GOLD),
      crownRow('p-gold', 'Gold', CROWN_CONSTANTS.GOLD),
      crownRow('p-gold', 'Gold', CROWN_CONSTANTS.BRONZE),
      crownRow('p-silver', 'Silver', CROWN_CONSTANTS.GOLD),
      crownRow('p-silver', 'Silver', CROWN_CONSTANTS.SILVER),
      crownRow('p-silver', 'Silver', CROWN_CONSTANTS.SILVER),
      crownRow('p-zeta', 'Zeta', CROWN_CONSTANTS.GOLD),
      crownRow('p-zeta', 'Zeta', CROWN_CONSTANTS.SILVER),
      crownRow('p-zeta', 'Zeta', CROWN_CONSTANTS.BRONZE),
      crownRow('p-alpha', 'Alpha', CROWN_CONSTANTS.GOLD),
      crownRow('p-alpha', 'Alpha', CROWN_CONSTANTS.SILVER),
      crownRow('p-alpha', 'Alpha', CROWN_CONSTANTS.BRONZE),
      crownRow('bot', 'Bot', CROWN_CONSTANTS.GOLD, 'pvp_wins', true),
      crownRow('bot', 'Bot', CROWN_CONSTANTS.GOLD, 'pvp_wins', true),
      crownRow('bot', 'Bot', CROWN_CONSTANTS.GOLD, 'pvp_wins', true),
      crownRow('bot', 'Bot', CROWN_CONSTANTS.GOLD, 'pvp_wins', true),
      crownRow('bot', 'Bot', CROWN_CONSTANTS.GOLD, 'pvp_wins', true),
    ]);

    const snapshot = await rebuildCrownCollectorSnapshot();

    expect(snapshot.entries.map((entry) => `${entry.rank}:${entry.username}`)).toEqual([
      '1:Delta',
      '2:Gold',
      '3:Silver',
      '4:Alpha',
      '5:Zeta',
    ]);
    expect(snapshot.entries[0]).toMatchObject({
      playerId: 'p-total',
      crowns: { gold: 0, silver: 0, bronze: 4, total: 4 },
      topGroups: [
        { group: 'pvp', count: 2 },
        { group: 'combat', count: 1 },
        { group: 'skills', count: 1 },
      ],
    });
    expect(snapshot.totalPlayers).toBe(5);
    expect(mocks.redis.set).toHaveBeenCalledWith(
      SNAPSHOT_KEY,
      expect.stringContaining('"lastRefreshedAt"'),
    );
  });

  it('getCrownCollectorLeaderboard strips player IDs from public entries while preserving authenticated myRank', async () => {
    mocks.redis.get.mockResolvedValue(cachedSnapshot([
      cachedCollectorRow('p1', 1, 'Alice'),
      cachedCollectorRow('p2', 2, 'Bob'),
    ]));

    const result = await getCrownCollectorLeaderboard('p2');

    expect(result.entries).toEqual([
      {
        rank: 1,
        username: 'Alice',
        characterLevel: 10,
        crowns: { gold: 0, silver: 0, bronze: 1, total: 1 },
        topGroups: [{ group: 'pvp', count: 1 }],
      },
      {
        rank: 2,
        username: 'Bob',
        characterLevel: 10,
        crowns: { gold: 0, silver: 0, bronze: 1, total: 1 },
        topGroups: [{ group: 'pvp', count: 1 }],
      },
    ]);
    expect(result.myRank).toEqual(result.entries[1]);
    expect(JSON.stringify(result)).not.toContain('playerId');
  });

  it('around_me centers the page on the authenticated player', async () => {
    const entries = Array.from({ length: 30 }, (_, index) =>
      cachedCollectorRow(`p${index + 1}`, index + 1, `Player ${index + 1}`));
    mocks.redis.get.mockResolvedValue(cachedSnapshot(entries));

    const result = await getCrownCollectorLeaderboard('p20', true, 5);

    expect(result.entries.map((entry) => entry.rank)).toEqual([18, 19, 20, 21, 22]);
    expect(result.myRank?.rank).toBe(20);
  });

  it('around_me fills the page when the authenticated player is near the bottom', async () => {
    const entries = Array.from({ length: 5 }, (_, index) =>
      cachedCollectorRow(`p${index + 1}`, index + 1, `Player ${index + 1}`));
    mocks.redis.get.mockResolvedValue(cachedSnapshot(entries));

    const result = await getCrownCollectorLeaderboard('p5', true, 3);

    expect(result.entries.map((entry) => entry.rank)).toEqual([3, 4, 5]);
    expect(result.myRank?.rank).toBe(5);
  });

  it('returns empty cached rows for malformed JSON without rebuilding', async () => {
    mocks.redis.get.mockResolvedValue('{not-json');

    const rows = await getCachedCrownCollectorRows(10);

    expect(rows).toEqual([]);
    expect(mocks.prisma.playerCrown.findMany).not.toHaveBeenCalled();
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it('returns an empty leaderboard for malformed snapshot shape without crashing', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify({ entries: null }));
    mocks.redis.set.mockResolvedValue(null);

    const result = await getCrownCollectorLeaderboard('p1');

    expect(result).toEqual({
      entries: [],
      myRank: null,
      totalPlayers: 0,
      lastRefreshedAt: null,
    });
    expect(mocks.prisma.playerCrown.findMany).not.toHaveBeenCalled();
  });

  it('waits briefly for a snapshot when another request holds the refresh lock', async () => {
    mocks.redis.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(cachedSnapshot([cachedCollectorRow('p1', 1, 'Alice')]));
    mocks.redis.set.mockResolvedValue(null);

    const result = await getCrownCollectorLeaderboard();

    expect(result.entries.map((entry) => entry.username)).toEqual(['Alice']);
    expect(mocks.prisma.playerCrown.findMany).not.toHaveBeenCalled();
    expect(mocks.redis.get).toHaveBeenCalledTimes(3);
  });

  it('returns empty after bounded lock-contention retries when the snapshot stays missing', async () => {
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue(null);

    const result = await getCrownCollectorLeaderboard();

    expect(result.entries).toEqual([]);
    expect(result.totalPlayers).toBe(0);
    expect(mocks.redis.get).toHaveBeenCalledTimes(4);
  });

  it('getCachedCrownCollectorRows returns empty rows without rebuilding when the snapshot is missing', async () => {
    mocks.redis.get.mockResolvedValue(null);

    const rows = await getCachedCrownCollectorRows(10);

    expect(rows).toEqual([]);
    expect(mocks.prisma.playerCrown.findMany).not.toHaveBeenCalled();
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it('invalidateCrownCollectorSnapshot deletes the Redis snapshot key', async () => {
    await invalidateCrownCollectorSnapshot();

    expect(mocks.redis.del).toHaveBeenCalledWith(SNAPSHOT_KEY);
  });

  it('clamps requested limit to the public page size', async () => {
    const entries = Array.from({ length: LEADERBOARD_CONSTANTS.PAGE_SIZE + 5 }, (_, index) =>
      cachedCollectorRow(`p${index + 1}`, index + 1, `Player ${index + 1}`));
    mocks.redis.get.mockResolvedValue(cachedSnapshot(entries));

    const result = await getCrownCollectorLeaderboard(undefined, false, 999);

    expect(result.entries).toHaveLength(LEADERBOARD_CONSTANTS.PAGE_SIZE);
  });
});
