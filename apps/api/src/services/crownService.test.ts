import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const pipeline = {
    hget: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  };

  return {
    prisma: {
      playerCrown: {
        createMany: vi.fn(),
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
    },
    redis: {
      zrevrange: vi.fn(),
      pipeline: vi.fn(() => pipeline),
    },
    pipeline,
    checkAchievements: vi.fn(),
  };
});

vi.mock('@pocketrealm/database', () => ({ prisma: mocks.prisma }));
vi.mock('../redis', () => ({ redis: mocks.redis }));
vi.mock('./achievementService', () => ({ checkAchievements: mocks.checkAchievements }));

import {
  awardCrownsForCategory,
  computeCrownWinners,
  getCrownCountsForCategory,
  getPlayerCrownCollection,
  transferCrownsToPlayerTx,
} from './crownService';

describe('crownService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkAchievements.mockResolvedValue([]);
    mocks.prisma.playerCrown.createMany.mockResolvedValue({ count: 0 });
  });

  describe('computeCrownWinners', () => {
    it('awards gold, silver, and bronze to the top three deltas', () => {
      const winners = computeCrownWinners([
        { playerId: 'p1', score: 100, isBot: false },
        { playerId: 'p2', score: 80, isBot: false },
        { playerId: 'p3', score: 60, isBot: false },
        { playerId: 'p4', score: 40, isBot: false },
      ]);

      expect(winners).toEqual([
        { playerId: 'p1', rank: 1 },
        { playerId: 'p2', rank: 2 },
        { playerId: 'p3', rank: 3 },
      ]);
    });

    it('gives tied players the same rank', () => {
      const winners = computeCrownWinners([
        { playerId: 'p1', score: 100, isBot: false },
        { playerId: 'p2', score: 100, isBot: false },
        { playerId: 'p3', score: 60, isBot: false },
      ]);

      expect(winners).toEqual([
        { playerId: 'p1', rank: 1 },
        { playerId: 'p2', rank: 1 },
        { playerId: 'p3', rank: 3 },
      ]);
    });

    it('filters bots and non-positive deltas', () => {
      const winners = computeCrownWinners([
        { playerId: 'bot', score: 500, isBot: true },
        { playerId: 'zero', score: 0, isBot: false },
        { playerId: 'p1', score: 10, isBot: false },
      ]);

      expect(winners).toEqual([{ playerId: 'p1', rank: 1 }]);
    });
  });

  describe('awardCrownsForCategory', () => {
    it('reads weekly deltas for the requested realm and checks crown achievements', async () => {
      const weekStart = new Date('2026-04-20T00:00:00.000Z');
      mocks.redis.zrevrange
        .mockResolvedValueOnce(['p1', '50', 'bot', '40', 'p2', '30'])
        .mockResolvedValueOnce([]);
      mocks.pipeline.exec.mockResolvedValueOnce([
        [null, JSON.stringify({ isBot: false })],
        [null, JSON.stringify({ isBot: true })],
        [null, JSON.stringify({ isBot: false })],
      ]);

      const winners = await awardCrownsForCategory('pvp_wins', weekStart, 'season-1');

      expect(winners).toEqual([
        { playerId: 'p1', rank: 1 },
        { playerId: 'p2', rank: 2 },
      ]);
      expect(mocks.redis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:weekly_delta:season-1:pvp_wins',
        0,
        49,
        'WITHSCORES',
      );
      expect(mocks.pipeline.hget).toHaveBeenCalledWith('leaderboard:meta:season-1:pvp_wins', 'p1');
      expect(mocks.prisma.playerCrown.createMany).toHaveBeenCalledWith({
        data: [
          { playerId: 'p1', category: 'pvp_wins', realmId: 'season-1', rank: 1, weekStart },
          { playerId: 'p2', category: 'pvp_wins', realmId: 'season-1', rank: 2, weekStart },
        ],
        skipDuplicates: true,
      });
      expect(mocks.checkAchievements).toHaveBeenCalledWith('p1', { statKeys: ['crowns_pvp'] });
      expect(mocks.checkAchievements).toHaveBeenCalledWith('p2', { statKeys: ['crowns_pvp'] });
    });

    it('continues scanning when top weekly delta rows are bots', async () => {
      const weekStart = new Date('2026-04-20T00:00:00.000Z');
      mocks.redis.zrevrange
        .mockResolvedValueOnce(['bot-1', '1000', 'bot-2', '900'])
        .mockResolvedValueOnce(['p1', '800', 'p2', '700', 'p3', '600'])
        .mockResolvedValueOnce([]);
      mocks.pipeline.exec
        .mockResolvedValueOnce([
          [null, JSON.stringify({ isBot: true })],
          [null, JSON.stringify({ isBot: true })],
        ])
        .mockResolvedValueOnce([
          [null, JSON.stringify({ isBot: false })],
          [null, JSON.stringify({ isBot: false })],
          [null, JSON.stringify({ isBot: false })],
        ]);

      const winners = await awardCrownsForCategory('pvp_wins', weekStart);

      expect(mocks.redis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:weekly_delta:permanent:pvp_wins',
        50,
        99,
        'WITHSCORES',
      );
      expect(winners).toEqual([
        { playerId: 'p1', rank: 1 },
        { playerId: 'p2', rank: 2 },
        { playerId: 'p3', rank: 3 },
      ]);
    });
  });

  describe('crown reads', () => {
    it('returns crown counts by rank for leaderboard entries', async () => {
      mocks.prisma.playerCrown.groupBy.mockResolvedValue([
        { playerId: 'p1', rank: 1, _count: { id: 2 } },
        { playerId: 'p1', rank: 3, _count: { id: 1 } },
        { playerId: 'p2', rank: 2, _count: { id: 1 } },
      ]);

      const result = await getCrownCountsForCategory('pvp_wins', ['p1', 'p2']);

      expect(result.get('p1')).toEqual({ gold: 2, silver: 0, bronze: 1 });
      expect(result.get('p2')).toEqual({ gold: 0, silver: 1, bronze: 0 });
    });

    it('returns a player crown collection and totals by group', async () => {
      const weekStart = new Date('2026-04-20T00:00:00.000Z');
      mocks.prisma.playerCrown.findMany.mockResolvedValue([
        { category: 'pvp_wins', realmId: 'permanent', rank: 1, weekStart },
        { category: 'skill_alchemy', realmId: 'season-1', rank: 2, weekStart },
      ]);

      const result = await getPlayerCrownCollection('p1');

      expect(result.crowns).toEqual([
        { category: 'pvp_wins', realmId: 'permanent', rank: 1, weekStart: '2026-04-20' },
        { category: 'skill_alchemy', realmId: 'season-1', rank: 2, weekStart: '2026-04-20' },
      ]);
      expect(result.totalByGroup).toMatchObject({
        pvp: 1,
        crafting: 1,
        combat: 0,
      });
    });

    it('preserves crown origin realm when transferring seasonal crowns', async () => {
      const weekStart = new Date('2026-04-20T00:00:00.000Z');
      const awardedAt = new Date('2026-04-21T00:00:00.000Z');
      const findMany = vi.fn().mockResolvedValue([
        { category: 'pvp_wins', realmId: 'season-1', rank: 1, weekStart, awardedAt },
        { category: 'pvp_wins', realmId: 'permanent', rank: 2, weekStart, awardedAt },
      ]);
      const createMany = vi.fn().mockResolvedValue({ count: 2 });
      const tx = {
        playerCrown: { findMany, createMany },
      } as unknown as Parameters<typeof transferCrownsToPlayerTx>[0];

      const count = await transferCrownsToPlayerTx(tx, 'seasonal-1', 'perm-1');

      expect(count).toBe(2);
      expect(createMany).toHaveBeenCalledWith({
        data: [
          { playerId: 'perm-1', category: 'pvp_wins', realmId: 'season-1', rank: 1, weekStart, awardedAt },
          { playerId: 'perm-1', category: 'pvp_wins', realmId: 'permanent', rank: 2, weekStart, awardedAt },
        ],
        skipDuplicates: true,
      });
    });
  });
});
