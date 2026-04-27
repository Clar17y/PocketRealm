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
    rename: vi.fn(),
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

import { mockPrisma } from '../__test__/setup';
import { redis } from '../redis';
import { ensureLeaderboardsFresh, getCategories, getLeaderboard, refreshAllLeaderboards } from './leaderboardService';
import { AppError } from '../middleware/errorHandler';
import { LEADERBOARD_CONSTANTS, PREMIUM_CONSTANTS } from '@pocketrealm/shared';
const mockRedis = redis as unknown as Record<string, ReturnType<typeof vi.fn>>;

// Helper: set up all prisma mocks to return empty so refresh doesn't throw
function stubEmptyRefresh() {
  mockPrisma.season = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  mockPrisma.pvpRating.findMany.mockResolvedValue([]);
  mockPrisma.player.findMany.mockResolvedValue([]);
  mockPrisma.playerSkill.findMany.mockResolvedValue([]);
  mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
  mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
  mockPrisma.guild.findMany.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([]);
}

describe('leaderboardService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.exists.mockResolvedValue(0);
    mockPrisma.playerCrown.groupBy.mockResolvedValue([]);
    mockPrisma.season = {
      findMany: vi.fn().mockResolvedValue([]),
    };
  });

  describe('ensureLeaderboardsFresh', () => {
    it('skips refresh when last_refresh is within TTL', async () => {
      mockRedis.get.mockResolvedValue(new Date().toISOString());

      await ensureLeaderboardsFresh();

      expect(mockPrisma.pvpRating.findMany).not.toHaveBeenCalled();
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('refreshes when last_refresh is stale and lock is acquired', async () => {
      stubEmptyRefresh();
      mockRedis.get
        .mockResolvedValueOnce(new Date(Date.now() - LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS - 1).toISOString())
        .mockResolvedValueOnce('lock-token');
      mockRedis.set.mockResolvedValue('OK');

      await ensureLeaderboardsFresh();

      expect(mockRedis.set).toHaveBeenCalledWith(
        'leaderboard:refresh_lock',
        'lock-token',
        'PX',
        LEADERBOARD_CONSTANTS.REFRESH_LOCK_TTL_MS,
        'NX',
      );
      expect(mockPrisma.pvpRating.findMany).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith('leaderboard:last_refresh', expect.any(String));
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("del"'),
        1,
        'leaderboard:refresh_lock',
        'lock-token',
      );
    });

    it('skips refresh when lock cannot be acquired', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue(null);

      await ensureLeaderboardsFresh();

      expect(mockPrisma.pvpRating.findMany).not.toHaveBeenCalled();
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });

    it('skips refresh while the weekly crown job lock is active', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.exists.mockResolvedValue(1);

      await ensureLeaderboardsFresh();

      expect(mockRedis.set).not.toHaveBeenCalledWith(
        'leaderboard:refresh_lock',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(mockPrisma.pvpRating.findMany).not.toHaveBeenCalled();
    });
  });

  // ── getCategories ────────────────────────────────────────────────────────

  describe('getCategories', () => {
    it('returns non-empty groups array', () => {
      const result = getCategories();
      expect(result.groups.length).toBeGreaterThan(0);
    });

    it('includes PvP, Progression, Skills, Combat, Guilds, and Casino groups', () => {
      const result = getCategories();
      const names = result.groups.map((g) => g.name);
      expect(names).toContain('PvP');
      expect(names).toContain('Progression');
      expect(names).toContain('Skills');
      expect(names).toContain('Combat');
      expect(names).toContain('Guilds');
      expect(names).toContain('Casino');
    });

    it('PvP group contains all four PvP categories', () => {
      const result = getCategories();
      const pvp = result.groups.find((g) => g.name === 'PvP')!;
      const slugs = pvp.categories.map((c) => c.slug);
      expect(slugs).toContain('pvp_rating');
      expect(slugs).toContain('pvp_wins');
      expect(slugs).toContain('pvp_best_rating');
      expect(slugs).toContain('pvp_win_streak');
    });

    it('Skills group contains individual skill categories', () => {
      const result = getCategories();
      const skills = result.groups.find((g) => g.name === 'Skills')!;
      expect(skills.categories.some((c) => c.slug === 'skill_melee')).toBe(true);
      expect(skills.categories.some((c) => c.slug === 'skill_mining')).toBe(true);
      expect(skills.categories.some((c) => c.slug === 'skill_alchemy')).toBe(true);
    });

    it('Guilds group contains guild_level, guild_renown, and guild_members', () => {
      const result = getCategories();
      const guilds = result.groups.find((g) => g.name === 'Guilds')!;
      const slugs = guilds.categories.map((c) => c.slug);
      expect(slugs).toEqual(['guild_level', 'guild_renown', 'guild_members']);
    });

    it('Casino group contains casino_profit and casino_wagered', () => {
      const result = getCategories();
      const casino = result.groups.find((g) => g.name === 'Casino')!;
      const slugs = casino.categories.map((c) => c.slug);
      expect(slugs).toEqual(['casino_profit', 'casino_wagered']);
    });

    it('each category has a slug and a label', () => {
      const result = getCategories();
      for (const group of result.groups) {
        for (const cat of group.categories) {
          expect(cat.slug).toBeTruthy();
          expect(cat.label).toBeTruthy();
        }
      }
    });

    it('Progression group contains character_level, character_xp, and total_skill_level', () => {
      const result = getCategories();
      const prog = result.groups.find((g) => g.name === 'Progression')!;
      const slugs = prog.categories.map((c) => c.slug);
      expect(slugs).toEqual(['character_level', 'character_xp', 'total_skill_level']);
    });
  });

  // ── getLeaderboard ───────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('throws AppError for invalid category', async () => {
      await expect(getLeaderboard('nonexistent')).rejects.toThrow(AppError);
      await expect(getLeaderboard('nonexistent')).rejects.toThrow('Invalid leaderboard category');
    });

    it('throws with INVALID_CATEGORY code', async () => {
      try {
        await getLeaderboard('nonexistent');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('INVALID_CATEGORY');
        expect((err as AppError).statusCode).toBe(400);
      }
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
      mockRedis.zrevrank.mockResolvedValue(3);
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
        'leaderboard:permanent:pvp_rating',
        expectedStart,
        expectedStop,
        'WITHSCORES',
      );
    });

    it('clamps aroundMe start to 0 when player rank is near top', async () => {
      // Player at rank index 2 with PAGE_SIZE/2 > 2 means start would go negative
      const half = Math.floor(LEADERBOARD_CONSTANTS.PAGE_SIZE / 2);
      expect(half).toBeGreaterThan(2); // sanity check

      mockRedis.zcard.mockResolvedValue(100);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(2); // near the top
      mockRedis.zrevrange.mockResolvedValue([]);
      mockRedis.zscore.mockResolvedValue('999');
      mockRedis.hget.mockResolvedValue(JSON.stringify({ username: 'Top', characterLevel: 50, isBot: false }));

      await getLeaderboard('pvp_rating', 'top-id', true);

      // start should be clamped to 0, not negative
      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:permanent:pvp_rating',
        0,
        LEADERBOARD_CONSTANTS.PAGE_SIZE - 1,
        'WITHSCORES',
      );
    });

    it('clamps aroundMe start near the bottom to keep a full page when possible', async () => {
      mockRedis.zcard.mockResolvedValue(100);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(98);
      mockRedis.zrevrange.mockResolvedValue([]);
      mockRedis.zscore.mockResolvedValue('10');
      mockRedis.hget.mockResolvedValue(JSON.stringify({ username: 'Bottom', characterLevel: 1, isBot: false }));

      await getLeaderboard('pvp_rating', 'bottom-id', true);

      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:permanent:pvp_rating',
        100 - LEADERBOARD_CONSTANTS.PAGE_SIZE,
        99,
        'WITHSCORES',
      );
    });

    it('ignores aroundMe when playerId is not provided', async () => {
      mockRedis.zcard.mockResolvedValue(100);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue([]);

      await getLeaderboard('pvp_rating', undefined, true);

      // Should use default window (0 to PAGE_SIZE-1)
      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:permanent:pvp_rating',
        0,
        LEADERBOARD_CONSTANTS.PAGE_SIZE - 1,
        'WITHSCORES',
      );
      // zrevrank should not be called when no playerId
      expect(mockRedis.zrevrank).not.toHaveBeenCalled();
    });

    it('ignores aroundMe when player is not ranked', async () => {
      mockRedis.zcard.mockResolvedValue(100);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(null); // not ranked
      mockRedis.zrevrange.mockResolvedValue([]);

      await getLeaderboard('pvp_rating', 'unranked-id', true);

      // Should use default window since myRankIndex is null
      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:permanent:pvp_rating',
        0,
        LEADERBOARD_CONSTANTS.PAGE_SIZE - 1,
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
      expect(result.entries[0].isAdmin).toBe(false);
    });

    it('parses multiple entries from interleaved WITHSCORES response', async () => {
      const meta1 = JSON.stringify({ username: 'Alice', characterLevel: 10, isBot: false, isAdmin: false });
      const meta2 = JSON.stringify({ username: 'Bob', characterLevel: 8, isBot: true, isAdmin: true });
      mockRedis.zcard.mockResolvedValue(2);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue(['p1', '1500', 'p2', '1200']);
      mockRedis.hmget.mockResolvedValue([meta1, meta2]);

      const result = await getLeaderboard('pvp_rating');

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toMatchObject({ rank: 1, playerId: 'p1', score: 1500, username: 'Alice' });
      expect(result.entries[1]).toMatchObject({ rank: 2, playerId: 'p2', score: 1200, username: 'Bob' });
    });

    it('coerces isAdmin to boolean via !! operator', async () => {
      // isAdmin is undefined in meta => !!undefined === false
      const metaNoAdmin = JSON.stringify({ username: 'User', characterLevel: 1, isBot: false });
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue(['p1', '100']);
      mockRedis.hmget.mockResolvedValue([metaNoAdmin]);

      const result = await getLeaderboard('pvp_rating');
      expect(result.entries[0].isAdmin).toBe(false);
    });

    it('includes isAdmin=true when meta has isAdmin=true', async () => {
      const meta = JSON.stringify({ username: 'Admin', characterLevel: 50, isBot: false, isAdmin: true });
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue(['admin-1', '2000']);
      mockRedis.hmget.mockResolvedValue([meta]);

      const result = await getLeaderboard('pvp_rating');
      expect(result.entries[0].isAdmin).toBe(true);
    });

    it('includes title and titleTier from meta in entries', async () => {
      const meta = JSON.stringify({
        username: 'Titled', characterLevel: 20, isBot: false, isAdmin: false,
        title: 'The Warrior', titleTier: 1,
      });
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue(['p1', '300']);
      mockRedis.hmget.mockResolvedValue([meta]);

      const result = await getLeaderboard('pvp_rating');
      expect(result.entries[0].title).toBe('The Warrior');
      expect(result.entries[0].titleTier).toBe(1);
    });

    it('includes title and titleTier in myRank', async () => {
      const meta = JSON.stringify({
        username: 'Me', characterLevel: 10, isBot: false, isAdmin: false,
        title: 'The Slayer', titleTier: 2,
      });
      mockRedis.zcard.mockResolvedValue(10);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(5);
      mockRedis.zrevrange.mockResolvedValue([]);
      mockRedis.zscore.mockResolvedValue('500');
      mockRedis.hget.mockResolvedValue(meta);

      const result = await getLeaderboard('pvp_rating', 'my-id');
      expect(result.myRank!.title).toBe('The Slayer');
      expect(result.myRank!.titleTier).toBe(2);
      expect(result.myRank!.isAdmin).toBe(false);
    });

    it('uses default meta for myRank when hget returns null', async () => {
      mockRedis.zcard.mockResolvedValue(10);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(0);
      mockRedis.zrevrange.mockResolvedValue([]);
      mockRedis.zscore.mockResolvedValue('1000');
      mockRedis.hget.mockResolvedValue(null);

      const result = await getLeaderboard('pvp_rating', 'unknown-meta-id');
      expect(result.myRank!.username).toBe('Unknown');
      expect(result.myRank!.characterLevel).toBe(1);
      expect(result.myRank!.isBot).toBe(false);
      expect(result.myRank!.isAdmin).toBe(false);
    });

    it('skips hmget when no entries returned', async () => {
      mockRedis.zcard.mockResolvedValue(0);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue([]);

      await getLeaderboard('pvp_rating');

      expect(mockRedis.hmget).not.toHaveBeenCalled();
    });

    it('works with all valid category slugs', async () => {
      const validSlugs = [
        'pvp_rating', 'pvp_wins', 'pvp_best_rating', 'pvp_win_streak',
        'character_level', 'character_xp', 'total_skill_level',
        'skill_melee', 'skill_ranged', 'skill_magic', 'skill_mining',
        'total_kills', 'boss_damage',
        'guild_level', 'guild_renown', 'guild_members',
        'casino_profit', 'casino_wagered',
      ];

      for (const slug of validSlugs) {
        mockRedis.zcard.mockResolvedValue(0);
        mockRedis.get.mockResolvedValue(null);
        mockRedis.zrevrange.mockResolvedValue([]);
        const result = await getLeaderboard(slug);
        expect(result.category).toBe(slug);
      }
    });

    it('computes correct rank offset when aroundMe shifts window', async () => {
      const playerRank = 50;
      const half = Math.floor(LEADERBOARD_CONSTANTS.PAGE_SIZE / 2);
      const start = playerRank - half;

      const meta = JSON.stringify({ username: 'P1', characterLevel: 1, isBot: false });
      mockRedis.zcard.mockResolvedValue(200);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(playerRank);
      mockRedis.zrevrange.mockResolvedValue(['px', '100']);
      mockRedis.hmget.mockResolvedValue([meta]);
      mockRedis.zscore.mockResolvedValue('100');
      mockRedis.hget.mockResolvedValue(meta);

      const result = await getLeaderboard('pvp_rating', 'my-id', true);
      // First entry rank should be start + 1 (not just 1)
      expect(result.entries[0].rank).toBe(start + 1);
    });
  });

  // ── refreshAllLeaderboards ───────────────────────────────────────────────

  describe('refreshAllLeaderboards', () => {
    it('writes PvP data to redis', async () => {
      mockPrisma.pvpRating.findMany.mockResolvedValue([
        {
          id: 'pvp-1',
          playerId: 'p1',
          rating: 1200,
          wins: 10,
          bestRating: 1300,
          winStreak: 3,
          player: { username: 'Alice', characterLevel: 5, isBot: false, role: 'player', activeTitle: null },
        },
      ]);
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.guild.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await refreshAllLeaderboards();

      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.hset).toHaveBeenCalled();
    });

    it('sets last_refresh timestamp on success', async () => {
      stubEmptyRefresh();

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
      mockPrisma.guild.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(refreshAllLeaderboards()).resolves.toBeUndefined();

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('does not set last_refresh when any category fails', async () => {
      mockPrisma.pvpRating.findMany.mockRejectedValue(new Error('fail'));
      mockPrisma.player.findMany.mockResolvedValue([]);
      mockPrisma.playerSkill.findMany.mockResolvedValue([]);
      mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
      mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
      mockPrisma.guild.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await refreshAllLeaderboards();

      expect(mockRedis.set).not.toHaveBeenCalledWith(
        'leaderboard:last_refresh',
        expect.anything(),
      );
    });

    it('sets last_refresh when permanent refresh succeeds even if an active season fails', async () => {
      mockPrisma.season.findMany.mockResolvedValue([{ id: 'season-1' }]);
      mockPrisma.pvpRating.findMany
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('season fail'));
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

    // ── refreshPvp ─────────────────────────────────────────────────────────

    describe('refreshPvp', () => {
      it('writes all four PvP categories to redis', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-1', playerId: 'p1', rating: 1500, wins: 20, bestRating: 1600, winStreak: 5,
            player: { username: 'Warrior', characterLevel: 30, isBot: false, role: 'player', activeTitle: null },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).toContain('leaderboard:permanent:pvp_rating');
        expect(zaddKeys).toContain('leaderboard:permanent:pvp_wins');
      expect(zaddKeys).toContain('leaderboard:permanent:pvp_best_rating');
      expect(zaddKeys).toContain('leaderboard:permanent:pvp_win_streak');
    });

      it('stores crown counts in Redis metadata during refresh', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-1', playerId: 'p1', rating: 1500, wins: 20, bestRating: 1600, winStreak: 5,
            player: { username: 'Warrior', characterLevel: 30, isBot: false, role: 'player', activeTitle: null },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);
        mockPrisma.playerCrown.groupBy.mockImplementation((args: { where?: { category?: string } }) =>
          Promise.resolve(args.where?.category === 'pvp_wins'
            ? [
                { playerId: 'p1', rank: 1, _count: { id: 2 } },
                { playerId: 'p1', rank: 3, _count: { id: 1 } },
              ]
            : []),
        );

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const winsMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:pvp_wins');
        const meta = JSON.parse(winsMeta![2] as string);
        expect(meta.crowns).toEqual({ gold: 2, silver: 0, bronze: 1 });
      });

      it('maps correct scores for each PvP category', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-1', playerId: 'p1', rating: 1500, wins: 20, bestRating: 1600, winStreak: 5,
            player: { username: 'W', characterLevel: 1, isBot: false, role: 'player', activeTitle: null },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const zaddCalls = mockRedis.zadd.mock.calls;
        const ratingCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:pvp_rating');
        const winsCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:pvp_wins');
        const bestCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:pvp_best_rating');
        const streakCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:pvp_win_streak');

        // zadd(key, score, member) => score at [1]
        expect(ratingCall![1]).toBe(1500);
        expect(winsCall![1]).toBe(20);
        expect(bestCall![1]).toBe(1600);
        expect(streakCall![1]).toBe(5);
      });

      it('sets isAdmin true for admin role players', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-admin', playerId: 'admin1', rating: 2000, wins: 100, bestRating: 2100, winStreak: 10,
            player: { username: 'Admin', characterLevel: 99, isBot: false, role: 'admin', activeTitle: null },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        // Check hset call contains isAdmin: true in the JSON
        const hsetCalls = mockRedis.hset.mock.calls;
        const pvpRatingMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:pvp_rating');
        expect(pvpRatingMeta).toBeDefined();
        // pvpRatingMeta: [key, playerId, jsonStr]
        const meta = JSON.parse(pvpRatingMeta![2] as string);
        expect(meta.isAdmin).toBe(true);
      });

      it('resolves title from activeTitle via ACHIEVEMENTS_BY_ID', async () => {
        // Use a real achievement ID that has a titleReward — 'kill_100' gives 'The Warrior'
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-titled', playerId: 'titled-p', rating: 1000, wins: 1, bestRating: 1000, winStreak: 0,
            player: { username: 'Titled', characterLevel: 5, isBot: false, role: 'player', activeTitle: 'combat_kills_500' },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const pvpRatingMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:pvp_rating');
        const meta = JSON.parse(pvpRatingMeta![2] as string);
        expect(meta.title).toBe('The Warrior');
        expect(meta.titleTier).toBe(2);
        expect(meta.titleStyle).toBeUndefined();
      });

      it('persists titleStyle when a styled title is active', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-supporter', playerId: 'supporter-p', rating: 1000, wins: 1, bestRating: 1000, winStreak: 0,
            player: {
              username: 'Supporter',
              characterLevel: 5,
              isBot: false,
              role: 'player',
              activeTitle: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID,
            },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const pvpRatingMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:pvp_rating');
        const meta = JSON.parse(pvpRatingMeta![2] as string);
        expect(meta.title).toBe(PREMIUM_CONSTANTS.SUPPORT_TITLE);
        expect(meta.titleStyle).toBe('rainbow');
      });

      it('returns empty title for null activeTitle', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-notitle', playerId: 'no-title', rating: 1000, wins: 0, bestRating: 1000, winStreak: 0,
            player: { username: 'NoTitle', characterLevel: 1, isBot: false, role: 'player', activeTitle: null },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const pvpMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:pvp_rating');
        const meta = JSON.parse(pvpMeta![2] as string);
        expect(meta.title).toBeUndefined();
        expect(meta.titleTier).toBeUndefined();
      });

      it('returns empty title for unknown activeTitle ID', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-badtitle', playerId: 'bad-title', rating: 1000, wins: 0, bestRating: 1000, winStreak: 0,
            player: { username: 'Bad', characterLevel: 1, isBot: false, role: 'player', activeTitle: 'nonexistent_achievement_id' },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const pvpMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:pvp_rating');
        const meta = JSON.parse(pvpMeta![2] as string);
        expect(meta.title).toBeUndefined();
      });

      it('skips zadd/hset for empty PvP ratings', async () => {
        stubEmptyRefresh();

        await refreshAllLeaderboards();

        // del is still called (clearing old data), but zadd should not be called for pvp_rating
        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).not.toContain('leaderboard:permanent:pvp_rating');
      });
    });

    describe('weekly deltas', () => {
      function makePipeline() {
        return {
          zscore: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue([]),
        };
      }

      it('writes weekly deltas using realm-scoped snapshot keys', async () => {
        const readPipeline = makePipeline();
        readPipeline.exec.mockResolvedValue([[null, '1100'], [null, null]]);
        mockRedis.pipeline.mockReturnValueOnce(readPipeline);
        mockRedis.exists.mockImplementation((key: string) =>
          Promise.resolve(key === 'leaderboard:weekly_start:season-1:pvp_rating' ? 1 : 0),
        );
        mockPrisma.season.findMany.mockResolvedValue([{ id: 'season-1' }]);
        mockPrisma.pvpRating.findMany.mockResolvedValue([
          {
            id: 'pvp-1',
            playerId: 'p1',
            rating: 1200,
            wins: 10,
            bestRating: 1300,
            winStreak: 3,
            player: { username: 'Alice', characterLevel: 5, isBot: false, activeTitle: null, account: { role: 'player' } },
          },
          {
            id: 'pvp-2',
            playerId: 'p2',
            rating: 900,
            wins: 5,
            bestRating: 950,
            winStreak: 1,
            player: { username: 'Bob', characterLevel: 4, isBot: false, activeTitle: null, account: { role: 'player' } },
          },
        ]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        expect(readPipeline.zscore).toHaveBeenCalledWith('leaderboard:weekly_start:season-1:pvp_rating', 'p1');
        expect(readPipeline.zscore).toHaveBeenCalledWith('leaderboard:weekly_start:season-1:pvp_rating', 'p2');
        expect(mockRedis.zadd).toHaveBeenCalledWith(
          'leaderboard:weekly_delta:season-1:pvp_rating:tmp:lock-token',
          100,
          'p1',
        );
        expect(mockRedis.zadd).not.toHaveBeenCalledWith(
          expect.stringContaining('leaderboard:weekly_delta:season-1:pvp_rating'),
          900,
          'p2',
        );
        expect(mockRedis.rename).toHaveBeenCalledWith(
          'leaderboard:weekly_delta:season-1:pvp_rating:tmp:lock-token',
          'leaderboard:weekly_delta:season-1:pvp_rating',
        );
      });

      it('uses skill XP rather than level when computing weekly skill deltas', async () => {
        const readPipeline = makePipeline();
        readPipeline.exec.mockResolvedValue([[null, '1000']]);
        mockRedis.pipeline.mockReturnValueOnce(readPipeline);
        mockRedis.exists.mockImplementation((key: string) =>
          Promise.resolve(key === 'leaderboard:weekly_start_xp:permanent:skill_melee' ? 1 : 0),
        );
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([
          {
            id: 'skill-1',
            playerId: 'p1',
            skillType: 'melee',
            level: 12,
            xp: BigInt(1500),
            player: { username: 'Alice', characterLevel: 5, isBot: false, activeTitle: null, account: { role: 'player' } },
          },
        ]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        expect(readPipeline.zscore).toHaveBeenCalledWith('leaderboard:weekly_start_xp:permanent:skill_melee', 'p1');
        expect(mockRedis.zadd).toHaveBeenCalledWith(
          'leaderboard:weekly_delta:permanent:skill_melee:tmp:lock-token',
          500,
          'p1',
        );
        expect(mockRedis.rename).toHaveBeenCalledWith(
          'leaderboard:weekly_delta:permanent:skill_melee:tmp:lock-token',
          'leaderboard:weekly_delta:permanent:skill_melee',
        );
      });
    });

    it('reads weekly delta scores when period is weekly', async () => {
      const meta = JSON.stringify({ username: 'Hero', characterLevel: 10, isBot: false });
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue('2026-04-20T00:00:00Z');
      mockRedis.zrevrange.mockResolvedValue(['player-1', '125']);
      mockRedis.hmget.mockResolvedValue([meta]);

      const result = await getLeaderboard('pvp_wins', undefined, false, null, 'weekly');

      expect(result.period).toBe('weekly');
      expect(mockRedis.zcard).toHaveBeenCalledWith('leaderboard:weekly_delta:permanent:pvp_wins');
      expect(mockRedis.zrevrange).toHaveBeenCalledWith(
        'leaderboard:weekly_delta:permanent:pvp_wins',
        0,
        LEADERBOARD_CONSTANTS.PAGE_SIZE - 1,
        'WITHSCORES',
      );
      expect(result.entries[0].score).toBe(125);
    });

    it('reads cached crown counts from leaderboard metadata without hitting Postgres', async () => {
      const meta = JSON.stringify({
        username: 'Hero',
        characterLevel: 10,
        isBot: false,
        crowns: { gold: 2, silver: 0, bronze: 1 },
      });
      mockRedis.zcard.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrange.mockResolvedValue(['player-1', '500']);
      mockRedis.hmget.mockResolvedValue([meta]);

      const result = await getLeaderboard('pvp_wins');

      expect(mockPrisma.playerCrown.groupBy).not.toHaveBeenCalled();
      expect(result.entries[0].crowns).toEqual({ gold: 2, silver: 0, bronze: 1 });
    });

    it('reads cached crown counts to myRank when the player is outside the current page', async () => {
      const pageMeta = JSON.stringify({ username: 'Hero', characterLevel: 10, isBot: false });
      const myMeta = JSON.stringify({
        username: 'Me',
        characterLevel: 12,
        isBot: false,
        crowns: { gold: 0, silver: 3, bronze: 0 },
      });
      mockRedis.zcard.mockResolvedValue(10);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.zrevrank.mockResolvedValue(4);
      mockRedis.zrevrange.mockResolvedValue(['player-1', '500']);
      mockRedis.hmget.mockResolvedValue([pageMeta]);
      mockRedis.zscore.mockResolvedValue('250');
      mockRedis.hget.mockResolvedValue(myMeta);

      const result = await getLeaderboard('pvp_wins', 'my-id');

      expect(mockPrisma.playerCrown.groupBy).not.toHaveBeenCalled();
      expect(result.myRank?.crowns).toEqual({ gold: 0, silver: 3, bronze: 0 });
    });

    // ── refreshProgression ─────────────────────────────────────────────────

    describe('refreshProgression', () => {
      it('writes character_level and character_xp categories', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'Hero', characterLevel: 25, characterXp: BigInt(50000), isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).toContain('leaderboard:permanent:character_level');
        expect(zaddKeys).toContain('leaderboard:permanent:character_xp');
      });

      it('uses characterLevel as score for character_level', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'H', characterLevel: 42, characterXp: BigInt(100000), isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const levelCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:character_level');
        expect(levelCall![1]).toBe(42);
      });

      it('converts BigInt characterXp to Number for character_xp score', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'H', characterLevel: 10, characterXp: BigInt(123456), isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const xpCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:character_xp');
        expect(xpCall![1]).toBe(123456);
      });

      it('marks admin role player as isAdmin in meta', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'admin1', username: 'Admin', characterLevel: 99, characterXp: BigInt(0), isBot: false, role: 'admin', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const levelMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:character_level');
        const meta = JSON.parse(levelMeta![2] as string);
        expect(meta.isAdmin).toBe(true);
      });
    });

    // ── refreshSkills ──────────────────────────────────────────────────────

    describe('refreshSkills', () => {
      it('writes skill leaderboard data including total_skill_level', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([
          { id: 'skill-1', playerId: 'p1', skillType: 'melee', level: 10, player: { username: 'Bob', characterLevel: 3, isBot: false, role: 'player', activeTitle: null } },
          { id: 'skill-2', playerId: 'p1', skillType: 'mining', level: 5, player: { username: 'Bob', characterLevel: 3, isBot: false, role: 'player', activeTitle: null } },
        ]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const zaddCalls = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddCalls).toContain('leaderboard:permanent:skill_melee');
        expect(zaddCalls).toContain('leaderboard:permanent:total_skill_level');
      });

      it('aggregates total_skill_level across multiple skills for same player', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([
          { id: 'skill-1', playerId: 'p1', skillType: 'melee', level: 10, player: { username: 'A', characterLevel: 5, isBot: false, role: 'player', activeTitle: null } },
          { id: 'skill-2', playerId: 'p1', skillType: 'ranged', level: 8, player: { username: 'A', characterLevel: 5, isBot: false, role: 'player', activeTitle: null } },
          { id: 'skill-3', playerId: 'p1', skillType: 'mining', level: 12, player: { username: 'A', characterLevel: 5, isBot: false, role: 'player', activeTitle: null } },
        ]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const totalCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:total_skill_level');
        expect(totalCall).toBeDefined();
        // 10 + 8 + 12 = 30
        expect(totalCall![1]).toBe(30);
      });

      it('aggregates total_skill_level separately per player', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([
          { id: 'skill-1', playerId: 'p1', skillType: 'melee', level: 10, player: { username: 'A', characterLevel: 5, isBot: false, role: 'player', activeTitle: null } },
          { id: 'skill-2', playerId: 'p2', skillType: 'melee', level: 20, player: { username: 'B', characterLevel: 8, isBot: false, role: 'player', activeTitle: null } },
          { id: 'skill-3', playerId: 'p1', skillType: 'mining', level: 5, player: { username: 'A', characterLevel: 5, isBot: false, role: 'player', activeTitle: null } },
        ]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const totalCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:total_skill_level');
        // zadd args: key, score1, member1, score2, member2
        // p1: 10+5=15, p2: 20
        const args = totalCall!.slice(1); // remove key
        const p1Idx = args.indexOf('p1');
        const p2Idx = args.indexOf('p2');
        expect(args[p1Idx - 1]).toBe(15);
        expect(args[p2Idx - 1]).toBe(20);
      });

      it('does not write individual skill leaderboard when no skills of that type exist', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([
          { id: 'skill-1', playerId: 'p1', skillType: 'melee', level: 10, player: { username: 'A', characterLevel: 1, isBot: false, role: 'player', activeTitle: null } },
        ]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        // skill_melee should be written, but skill_ranged should not (empty, only del is called)
        expect(zaddKeys).toContain('leaderboard:permanent:skill_melee');
        expect(zaddKeys).not.toContain('leaderboard:permanent:skill_ranged');
      });
    });

    // ── refreshCombat ──────────────────────────────────────────────────────

    describe('refreshCombat', () => {
      it('aggregates bestiary kills into total_kills leaderboard', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([
          { id: 'bestiary-1', playerId: 'p1', kills: 50, player: { username: 'Slayer', characterLevel: 8, isBot: false, role: 'player', activeTitle: null } },
          { id: 'bestiary-2', playerId: 'p1', kills: 30, player: { username: 'Slayer', characterLevel: 8, isBot: false, role: 'player', activeTitle: null } },
        ]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const totalKillsCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:total_kills');
        expect(totalKillsCall).toBeDefined();
        expect(totalKillsCall![1]).toBe(80);
      });

      it('writes boss_damage leaderboard from bossParticipant', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([
          { id: 'boss-1', playerId: 'p1', totalDamage: 5000, player: { username: 'BossKiller', characterLevel: 40, isBot: false, role: 'player', activeTitle: null } },
        ]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const bossDmgCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:boss_damage');
        expect(bossDmgCall).toBeDefined();
        expect(bossDmgCall![1]).toBe(5000);
        expect(bossDmgCall![2]).toBe('p1');
      });

      it('aggregates boss_damage across multiple participations for same player', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([
          { id: 'boss-1', playerId: 'p1', totalDamage: 3000, player: { username: 'A', characterLevel: 30, isBot: false, role: 'player', activeTitle: null } },
          { id: 'boss-2', playerId: 'p1', totalDamage: 2000, player: { username: 'A', characterLevel: 30, isBot: false, role: 'player', activeTitle: null } },
          { id: 'boss-3', playerId: 'p2', totalDamage: 1000, player: { username: 'B', characterLevel: 20, isBot: false, role: 'player', activeTitle: null } },
        ]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const bossDmgCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:boss_damage');
        expect(bossDmgCall).toBeDefined();
        const args = bossDmgCall!.slice(1);
        const p1Idx = args.indexOf('p1');
        const p2Idx = args.indexOf('p2');
        expect(args[p1Idx - 1]).toBe(5000); // 3000 + 2000
        expect(args[p2Idx - 1]).toBe(1000);
      });

      it('silently handles P2021 missing table error for bossParticipant', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);

        // Simulate P2021: table does not exist
        // The code checks: err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2021'
        // Since our mock Prisma doesn't have PrismaClientKnownRequestError, a plain error
        // with code 'P2021' won't pass instanceof check, so it will be re-thrown.
        // This means the combat refresh will fail, but refreshAllLeaderboards catches it.
        // The test verifies the overall behavior: other refreshes still complete.
        const p2021Error = new Error('table not found');
        (p2021Error as unknown as { code: string }).code = 'P2021';
        mockPrisma.bossParticipant.findMany.mockRejectedValue(p2021Error);

        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        // Should not throw - refreshAllLeaderboards catches per-category errors
        await expect(refreshAllLeaderboards()).resolves.toBeUndefined();

        // But last_refresh should NOT be set since combat failed
        expect(mockRedis.set).not.toHaveBeenCalledWith(
          'leaderboard:last_refresh',
          expect.anything(),
        );
      });

      it('re-throws non-P2021 errors from bossParticipant (caught by refreshAllLeaderboards)', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockRejectedValue(new Error('connection refused'));
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        // Non-P2021 error is re-thrown by refreshCombat, caught by refreshAllLeaderboards
        await expect(refreshAllLeaderboards()).resolves.toBeUndefined();

        // failures > 0, so no last_refresh
        expect(mockRedis.set).not.toHaveBeenCalledWith(
          'leaderboard:last_refresh',
          expect.anything(),
        );
      });
    });

    // ── refreshGuilds ──────────────────────────────────────────────────────

    describe('refreshGuilds', () => {
      it('writes guild_level, guild_renown, and guild_members categories', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([
          { id: 'g1', name: 'Warriors', tag: 'WAR', level: 5, renown: 1000, _count: { members: 10 } },
        ]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).toContain('leaderboard:permanent:guild_level');
        expect(zaddKeys).toContain('leaderboard:permanent:guild_renown');
        expect(zaddKeys).toContain('leaderboard:permanent:guild_members');
      });

      it('formats guild username as [TAG] Name', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([
          { id: 'g1', name: 'Knights', tag: 'KNT', level: 3, renown: 500, _count: { members: 5 } },
        ]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const guildMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:guild_level');
        expect(guildMeta).toBeDefined();
        const meta = JSON.parse(guildMeta![2] as string);
        expect(meta.username).toBe('[KNT] Knights');
      });

      it('uses correct scores for each guild category', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([
          { id: 'g1', name: 'G', tag: 'G', level: 7, renown: 2500, _count: { members: 15 } },
        ]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const zaddCalls = mockRedis.zadd.mock.calls;
        const levelCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:guild_level');
        const renownCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:guild_renown');
        const membersCall = zaddCalls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:guild_members');

        expect(levelCall![1]).toBe(7);
        expect(renownCall![1]).toBe(2500);
        expect(membersCall![1]).toBe(15);
      });

      it('sets isBot=false and isAdmin=false for guilds', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([
          { id: 'g1', name: 'G', tag: 'G', level: 1, renown: 0, _count: { members: 1 } },
        ]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const guildMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:guild_level');
        const meta = JSON.parse(guildMeta![2] as string);
        expect(meta.isBot).toBe(false);
        expect(meta.isAdmin).toBe(false);
      });

      it('uses guild level as characterLevel in meta', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([
          { id: 'g1', name: 'G', tag: 'G', level: 12, renown: 0, _count: { members: 1 } },
        ]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const guildMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:guild_level');
        const meta = JSON.parse(guildMeta![2] as string);
        expect(meta.characterLevel).toBe(12);
      });
    });

    // ── refreshCasino ──────────────────────────────────────────────────────

    describe('refreshCasino', () => {
      it('returns early when no casino rows', async () => {
        stubEmptyRefresh();

        await refreshAllLeaderboards();

        // No zadd for casino categories
        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).not.toContain('leaderboard:permanent:casino_profit');
        expect(zaddKeys).not.toContain('leaderboard:permanent:casino_wagered');
      });

      it('writes casino_profit and casino_wagered categories', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'Gambler', characterLevel: 15, isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'p1', totalWagered: 10000, totalPayout: 12000 },
        ]);

        await refreshAllLeaderboards();

        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).toContain('leaderboard:permanent:casino_profit');
        expect(zaddKeys).toContain('leaderboard:permanent:casino_wagered');
      });

      it('calculates casino_profit as totalPayout - totalWagered', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'Lucky', characterLevel: 10, isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'p1', totalWagered: 5000, totalPayout: 8000 },
        ]);

        await refreshAllLeaderboards();

        const profitCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:casino_profit');
        expect(profitCall![1]).toBe(3000); // 8000 - 5000
      });

      it('calculates negative casino_profit when player lost money', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'Unlucky', characterLevel: 10, isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'p1', totalWagered: 10000, totalPayout: 3000 },
        ]);

        await refreshAllLeaderboards();

        const profitCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:casino_profit');
        expect(profitCall![1]).toBe(-7000); // 3000 - 10000
      });

      it('uses totalWagered as score for casino_wagered', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'G', characterLevel: 1, isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'p1', totalWagered: 25000, totalPayout: 10000 },
        ]);

        await refreshAllLeaderboards();

        const wageredCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:casino_wagered');
        expect(wageredCall![1]).toBe(25000);
      });

      it('skips casino rows whose players are missing from the current realm snapshot', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        // Player not found in second query
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'ghost', totalWagered: 100, totalPayout: 50 },
        ]);

        await refreshAllLeaderboards();

        expect(mockRedis.zadd).not.toHaveBeenCalledWith(
          'leaderboard:permanent:casino_profit',
          expect.anything(),
        );
        expect(mockRedis.hset).not.toHaveBeenCalledWith(
          'leaderboard:meta:permanent:casino_profit',
          expect.anything(),
          expect.anything(),
        );
      });

      it('handles multiple casino players', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'A', characterLevel: 10, isBot: false, role: 'player', activeTitle: null },
          { id: 'p2', username: 'B', characterLevel: 20, isBot: false, role: 'admin', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'p1', totalWagered: 1000, totalPayout: 1500 },
          { playerId: 'p2', totalWagered: 2000, totalPayout: 500 },
        ]);

        await refreshAllLeaderboards();

        const profitCall = mockRedis.zadd.mock.calls.find((c: unknown[]) => c[0] === 'leaderboard:permanent:casino_profit');
        expect(profitCall).toBeDefined();
        const args = profitCall!.slice(1);
        const p1Idx = args.indexOf('p1');
        const p2Idx = args.indexOf('p2');
        expect(args[p1Idx - 1]).toBe(500);   // 1500 - 1000
        expect(args[p2Idx - 1]).toBe(-1500);  // 500 - 2000
      });

      it('marks admin casino player as isAdmin in meta', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'admin1', username: 'AdminGambler', characterLevel: 99, isBot: false, role: 'admin', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'admin1', totalWagered: 100, totalPayout: 200 },
        ]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const casinoMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:casino_profit');
        const meta = JSON.parse(casinoMeta![2] as string);
        expect(meta.isAdmin).toBe(true);
      });

      it('resolves title for casino players with activeTitle', async () => {
        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'Titled', characterLevel: 10, isBot: false, role: 'player', activeTitle: 'combat_kills_500' },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([
          { playerId: 'p1', totalWagered: 100, totalPayout: 150 },
        ]);

        await refreshAllLeaderboards();

        const hsetCalls = mockRedis.hset.mock.calls;
        const casinoMeta = hsetCalls.find((c: unknown[]) => c[0] === 'leaderboard:meta:permanent:casino_profit');
        const meta = JSON.parse(casinoMeta![2] as string);
        expect(meta.title).toBe('The Warrior');
        expect(meta.titleTier).toBe(2);
      });
    });

    // ── writeToZset edge cases ─────────────────────────────────────────────

    describe('writeToZset behavior', () => {
      it('calls del for old data even when rows are empty', async () => {
        stubEmptyRefresh();

        await refreshAllLeaderboards();

        // del should be called for clearing old keys for every category
        expect(mockRedis.del).toHaveBeenCalled();
      });

      it('does not call zadd/hset when empty rows (only del)', async () => {
        stubEmptyRefresh();

        await refreshAllLeaderboards();

        // pvp_rating has no data, so zadd should not be called for it
        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).not.toContain('leaderboard:permanent:pvp_rating');
      });
    });

    // ── Multiple failures ──────────────────────────────────────────────────

    describe('failure isolation', () => {
      it('counts multiple failures and does not set last_refresh', async () => {
        mockPrisma.pvpRating.findMany.mockRejectedValue(new Error('pvp fail'));
        mockPrisma.player.findMany.mockRejectedValue(new Error('progression fail'));
        mockPrisma.playerSkill.findMany.mockRejectedValue(new Error('skills fail'));
        mockPrisma.playerBestiary.findMany.mockRejectedValue(new Error('combat fail'));
        mockPrisma.guild.findMany.mockRejectedValue(new Error('guilds fail'));
        mockPrisma.$queryRaw.mockRejectedValue(new Error('casino fail'));

        await expect(refreshAllLeaderboards()).resolves.toBeUndefined();

        expect(mockRedis.set).not.toHaveBeenCalledWith(
          'leaderboard:last_refresh',
          expect.anything(),
        );
      });

      it('only pvp fails, others still write to redis', async () => {
        mockPrisma.pvpRating.findMany.mockRejectedValue(new Error('pvp fail'));
        mockPrisma.player.findMany.mockResolvedValue([
          { id: 'p1', username: 'A', characterLevel: 5, characterXp: BigInt(100), isBot: false, role: 'player', activeTitle: null },
        ]);
        mockPrisma.playerSkill.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        // character_level should still be written even though pvp failed
        const zaddKeys = mockRedis.zadd.mock.calls.map((c: unknown[]) => c[0]);
        expect(zaddKeys).toContain('leaderboard:permanent:character_level');
        // but no last_refresh
        expect(mockRedis.set).not.toHaveBeenCalledWith(
          'leaderboard:last_refresh',
          expect.anything(),
        );
      });
    });

    // ── paginated batching ─────────────────────────────────────────────────

    describe('paginated batching', () => {
      it('fetches playerSkill in batches when rows exceed batch size', async () => {
        const batchSize = LEADERBOARD_CONSTANTS.BATCH_SIZE;
        const makeBatch = (count: number, startId: number) =>
          Array.from({ length: count }, (_, i) => ({
            id: `skill-${startId + i}`,
            playerId: `p${startId + i}`,
            skillType: 'melee',
            level: 10 + i,
            player: { username: `Player${startId + i}`, characterLevel: 5, isBot: false, role: 'player', activeTitle: null },
          }));

        const batch1 = makeBatch(batchSize, 0);
        const batch2 = makeBatch(3, batchSize);

        mockPrisma.playerSkill.findMany
          .mockResolvedValueOnce(batch1)
          .mockResolvedValueOnce(batch2);

        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        expect(mockPrisma.playerSkill.findMany).toHaveBeenCalledTimes(2);

        const secondCall = mockPrisma.playerSkill.findMany.mock.calls[1][0];
        expect(secondCall).toMatchObject({
          take: batchSize,
          skip: 1,
          cursor: { id: batch1[batch1.length - 1].id },
        });
      });

      it('fetches in a single batch when rows are fewer than batch size', async () => {
        const smallBatch = [
          { id: 'skill-1', playerId: 'p1', skillType: 'melee', level: 10,
            player: { username: 'Player1', characterLevel: 5, isBot: false, role: 'player', activeTitle: null } },
        ];
        mockPrisma.playerSkill.findMany.mockResolvedValueOnce(smallBatch);

        mockPrisma.pvpRating.findMany.mockResolvedValue([]);
        mockPrisma.player.findMany.mockResolvedValue([]);
        mockPrisma.playerBestiary.findMany.mockResolvedValue([]);
        mockPrisma.bossParticipant.findMany.mockResolvedValue([]);
        mockPrisma.guild.findMany.mockResolvedValue([]);
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await refreshAllLeaderboards();

        expect(mockPrisma.playerSkill.findMany).toHaveBeenCalledTimes(1);
      });
    });
  });
});

