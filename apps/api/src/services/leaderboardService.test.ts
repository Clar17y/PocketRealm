import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: {
    zcard: vi.fn(),
    get: vi.fn(),
    zrevrank: vi.fn(),
    zrevrange: vi.fn(),
    zscore: vi.fn(),
    hget: vi.fn(),
    hmget: vi.fn(),
    zadd: vi.fn(),
    hset: vi.fn(),
    del: vi.fn(),
    set: vi.fn(),
  },
}));

import { mockPrisma } from '../__test__/setup';
import { redis } from '../redis';
import { getCategories, getLeaderboard, refreshAllLeaderboards } from './leaderboardService';
import { AppError } from '../middleware/errorHandler';
import { LEADERBOARD_CONSTANTS } from '@adventure/shared';
const mockRedis = redis as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('leaderboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCategories', () => {
    it('returns non-empty groups array', () => {
      const result = getCategories();
      expect(result.groups.length).toBeGreaterThan(0);
    });

    it('includes PvP, Progression, Skills, and Combat groups', () => {
      const result = getCategories();
      const names = result.groups.map((g) => g.name);
      expect(names).toContain('PvP');
      expect(names).toContain('Progression');
      expect(names).toContain('Skills');
      expect(names).toContain('Combat');
    });

    it('PvP group contains pvp_rating category', () => {
      const result = getCategories();
      const pvp = result.groups.find((g) => g.name === 'PvP')!;
      expect(pvp.categories.some((c) => c.slug === 'pvp_rating')).toBe(true);
    });

    it('Skills group contains individual skill categories', () => {
      const result = getCategories();
      const skills = result.groups.find((g) => g.name === 'Skills')!;
      expect(skills.categories.some((c) => c.slug === 'skill_melee')).toBe(true);
      expect(skills.categories.some((c) => c.slug === 'skill_mining')).toBe(true);
    });
  });

  describe('getLeaderboard', () => {
    it('throws AppError for invalid category', async () => {
      await expect(getLeaderboard('nonexistent')).rejects.toThrow(AppError);
      await expect(getLeaderboard('nonexistent')).rejects.toThrow('Invalid leaderboard category');
    });

    it('returns entries with correct rank, score, and metadata', async () => {
      const meta = JSON.stringify({ username: 'Hero', characterLevel: 10, isBot: false });
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('2025-01-01T00:00:00Z');
      mockRedis.zrevrange.mockResolvedValue(['player-1', '500']);
      mockRedis.hmget.mockResolvedValue([meta]);

      const result = await getLeaderboard('pvp_rating');

      expect(result.category).toBe('pvp_rating');
      expect(result.totalPlayers).toBe(1);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        rank: 1,
        playerId: 'player-1',
        username: 'Hero',
        characterLevel: 10,
        score: 500,
        isBot: false,
      });
    });

    it('handles empty leaderboard', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue([]);

      const result = await getLeaderboard('pvp_rating');

      expect(result.entries).toHaveLength(0);
      expect(result.totalPlayers).toBe(0);
      expect(result.lastRefreshedAt).toBeNull();
      expect(result.myRank).toBeNull();
    });

    it('returns myRank when playerId is provided and player is ranked', async () => {
      const meta = JSON.stringify({ username: 'Me', characterLevel: 5, isBot: false });
      mockRedis.zcard.mockResolvedValue(10);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(3); // 0-indexed rank 3 => display rank 4
      mockRedis.zrevrange.mockResolvedValue([]);
      mockRedis.zscore.mockResolvedValue('250');
      mockRedis.hget.mockResolvedValue(meta);

      const result = await getLeaderboard('pvp_rating', 'my-id');

      expect(result.myRank).not.toBeNull();
      expect(result.myRank!.rank).toBe(4);
      expect(result.myRank!.score).toBe(250);
      expect(result.myRank!.username).toBe('Me');
    });

    it('returns null myRank when player is not ranked', async () => {
      mockRedis.zcard.mockResolvedValue(10);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue([]);

      const result = await getLeaderboard('pvp_rating', 'unranked-id');

      expect(result.myRank).toBeNull();
    });

    it('centers window around player when aroundMe is true', async () => {
      const half = Math.floor(LEADERBOARD_CONSTANTS.PAGE_SIZE / 2);
      const playerRank = 50;

      mockRedis.zcard.mockResolvedValue(100);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(playerRank);
      mockRedis.zrevrange.mockResolvedValue([]);
      mockRedis.zscore.mockResolvedValue('100');
      mockRedis.hget.mockResolvedValue(JSON.stringify({ username: 'Me', characterLevel: 1, isBot: false }));

      await getLeaderboard('pvp_rating', 'my-id', true);

      const expectedStart = playerRank - half;
      const expectedStop = expectedStart + LEADERBOARD_CONSTANTS.PAGE_SIZE - 1;
      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:pvp_rating',
        expectedStart,
        expectedStop,
        'WITHSCORES',
      );
    });

    it('uses default metadata when meta is missing from redis', async () => {
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue(['player-1', '100']);
      mockRedis.hmget.mockResolvedValue([null]);

      const result = await getLeaderboard('pvp_rating');

      expect(result.entries[0].username).toBe('Unknown');
      expect(result.entries[0].characterLevel).toBe(1);
      expect(result.entries[0].isBot).toBe(false);
    });
  });

  describe('refreshAllLeaderboards', () => {
    it('writes PvP data to redis', async () => {
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          playerId: 'p1',
          rating: 1200,
          wins: 10,
          bestRating: 1300,
          winStreak: 3,
          player: { username: 'Alice', characterLevel: 5, isBot: false, activeTitle: null },
        },
      ]);
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.guild.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await refreshAllLeaderboards();

      // Should delete old keys and write new data for each PvP category
      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.hset).toHaveBeenCalled();
    });

    it('sets last_refresh timestamp on success', async () => {
      mockPrisma.pvpRating.findMany.mockResolvedValue([]);
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.guild.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await refreshAllLeaderboards();

      expect(mockRedis.set).toHaveBeenCalledWith(
        'leaderboard:last_refresh',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      );
    });

    it('continues refreshing other categories when one fails', async () => {
      mockPrisma.pvpRating.findMany.mockRejectedValue(new Error('PvP query failed'));
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      // Should not throw even though PvP failed
      await expect(refreshAllLeaderboards()).resolves.toBeUndefined();

      // Progression/Skills/Combat still wrote to redis
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('does not set last_refresh when any category fails', async () => {
      mockPrisma.pvpRating.findMany.mockRejectedValue(new Error('fail'));
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await refreshAllLeaderboards();

      expect(mockRedis.set).not.toHaveBeenCalledWith(
        'leaderboard:last_refresh',
        expect.anything(),
      );
    });

    it('writes skill leaderboard data including total_skill_level', async () => {
      mockPrisma.pvpRating.findMany.mockResolvedValue([]);
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([
        { playerId: 'p1', skillType: 'melee', level: 10, player: { username: 'Bob', characterLevel: 3, isBot: false, activeTitle: null } },
        { playerId: 'p1', skillType: 'mining', level: 5, player: { username: 'Bob', characterLevel: 3, isBot: false, activeTitle: null } },
      ]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await refreshAllLeaderboards();

      // zadd called for skill_melee, skill_mining, total_skill_level (among others)
      const zaddCalls = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
      expect(zaddCalls).toContain('leaderboard:skill_melee');
      expect(zaddCalls).toContain('leaderboard:total_skill_level');
    });

    it('aggregates bestiary kills into total_kills leaderboard', async () => {
      mockPrisma.pvpRating.findMany.mockResolvedValue([]);
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([
        { playerId: 'p1', kills: 50, player: { username: 'Slayer', characterLevel: 8, isBot: false, activeTitle: null } },
        { playerId: 'p1', kills: 30, player: { username: 'Slayer', characterLevel: 8, isBot: false, activeTitle: null } },
      ]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await refreshAllLeaderboards();

      // total_kills should aggregate: 50 + 30 = 80
      const zaddCalls = mockRedis.zadd.mock.calls;
      const totalKillsCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:total_kills');
      expect(totalKillsCall).toBeDefined();
      // zadd args: key, score, member => score at index 1 should be 80
      expect(totalKillsCall![1]).toBe(80);
    });
  });
});
