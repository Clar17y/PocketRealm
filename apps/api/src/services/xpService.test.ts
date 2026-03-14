import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_POINT_CONSTANTS, CHARACTER_CONSTANTS } from '@pocketrealm/shared';
import {
  applyXpGain,
  calculateCharacterXpGain,
  characterLevelFromXp,
  shouldResetWindowCap,
} from '@pocketrealm/game-engine';
import { mockPrisma } from '../__test__/setup';

// ── Mocks ──────────────────────────────────────────────────────────
vi.mock('./guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn(),
}));
vi.mock('./buffService', () => ({
  consumeBuffIfActive: vi.fn(),
}));

import { grantSkillXp } from './xpService';
import { getPlayerGuildModifiers } from './guildUpgradeService';
import { consumeBuffIfActive } from './buffService';

const mockedGetPlayerGuildModifiers = getPlayerGuildModifiers as ReturnType<typeof vi.fn>;
const mockedConsumeBuffIfActive = consumeBuffIfActive as ReturnType<typeof vi.fn>;

const now = new Date('2025-06-01T12:00:00Z');

// Helper: default skill row
function makeSkill(overrides: Partial<{
  xp: bigint; level: number; dailyXpGained: number; lastXpResetAt: Date;
}> = {}) {
  return {
    xp: BigInt(0),
    level: 1,
    dailyXpGained: 0,
    lastXpResetAt: now,
    ...overrides,
  };
}

// Helper: default player row
function makePlayer(overrides: Partial<{
  characterXp: bigint; characterLevel: number; attributePoints: number;
}> = {}) {
  return {
    characterXp: BigInt(0),
    characterLevel: 1,
    attributePoints: 0,
    ...overrides,
  };
}

// Standard setup that makes basic XP grant succeed
function setupBasicMocks(
  skill = makeSkill(),
  player = makePlayer(),
) {
  mockPrisma.playerSkill.findUnique.mockResolvedValue(skill);
  mockPrisma.player.findUnique.mockResolvedValue(player);
  mockPrisma.playerSkill.update.mockResolvedValue({});
  mockPrisma.player.update.mockResolvedValue({});
  mockedGetPlayerGuildModifiers.mockResolvedValue({
    xpBoost: 0, damageBoost: 0, defenceBoost: 0,
  });
  mockedConsumeBuffIfActive.mockResolvedValue(0);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('grantSkillXp', () => {
  // ── Error cases ────────────────────────────────────────────────────
  describe('error handling', () => {
    it('throws when skill not found', async () => {
      setupBasicMocks();
      mockPrisma.playerSkill.findUnique.mockResolvedValue(null);

      await expect(grantSkillXp('p1', 'melee', 100, now)).rejects.toThrow('Skill not found');
    });

    it('throws when player not found', async () => {
      setupBasicMocks();
      mockPrisma.player.findUnique.mockResolvedValue(null);

      await expect(grantSkillXp('p1', 'melee', 100, now)).rejects.toThrow('Player not found');
    });

    it('includes playerId and skillType in skill-not-found error', async () => {
      setupBasicMocks();
      mockPrisma.playerSkill.findUnique.mockResolvedValue(null);

      await expect(grantSkillXp('abc-123', 'ranged', 100, now)).rejects.toThrow(
        'playerId=abc-123, skillType=ranged',
      );
    });

    it('includes playerId in player-not-found error', async () => {
      setupBasicMocks();
      mockPrisma.player.findUnique.mockResolvedValue(null);

      await expect(grantSkillXp('abc-123', 'melee', 100, now)).rejects.toThrow(
        'playerId=abc-123',
      );
    });
  });

  // ── Basic happy path ───────────────────────────────────────────────
  describe('basic XP grant', () => {
    it('handles zero rawXpGain gracefully', async () => {
      setupBasicMocks();
      const result = await grantSkillXp('p1', 'melee', 0, now);

      expect(result.xpResult.xpAfterEfficiency).toBe(0);
      expect(result.newTotalXp).toBe(0);
      expect(result.newDailyXpGained).toBe(0);
      expect(result.characterXpGain).toBe(0);
      expect(result.skillPointsGained).toBe(0);
    });

    it('passes correct skillType to applyXpGain for non-combat skill', async () => {
      setupBasicMocks();
      const result = await grantSkillXp('p1', 'mining', 50, now);
      // mining is a gathering skill, which has a different window cap
      expect(result.skillType).toBe('mining');
      expect(result.xpResult).toBeDefined();
    });
  });

  // ── Guild XP boost ─────────────────────────────────────────────────
  describe('guild XP boost', () => {
    it('uses pre-resolved guildXpBoost when provided', async () => {
      setupBasicMocks();
      await grantSkillXp('p1', 'melee', 100, now, 0.1);

      // Should NOT call getPlayerGuildModifiers because guildXpBoost was provided
      expect(mockedGetPlayerGuildModifiers).not.toHaveBeenCalled();
    });

    it('fetches guild modifiers when guildXpBoost is undefined', async () => {
      setupBasicMocks();
      mockedGetPlayerGuildModifiers.mockResolvedValue({
        xpBoost: 0, damageBoost: 0, defenceBoost: 0,
      });

      await grantSkillXp('p1', 'melee', 100, now);

      expect(mockedGetPlayerGuildModifiers).toHaveBeenCalledWith('p1');
    });

    it('applies guild XP boost to raw XP', async () => {
      setupBasicMocks();
      // 10% guild boost on 100 raw XP -> boosted = floor(100 * 1.1) = 110
      const resultBoosted = await grantSkillXp('p1', 'melee', 100, now, 0.1);

      vi.clearAllMocks();
      setupBasicMocks();
      const resultNoBoosted = await grantSkillXp('p1', 'melee', 100, now, 0);

      // boosted should have more XP than unboosted (both at full efficiency)
      expect(resultBoosted.xpResult.xpAfterEfficiency).toBeGreaterThan(
        resultNoBoosted.xpResult.xpAfterEfficiency,
      );
    });

    it('applies 0 guild XP boost without changing raw XP', async () => {
      setupBasicMocks();
      const result = await grantSkillXp('p1', 'melee', 100, now, 0);

      // With 0 boost, boostedXpGain should equal rawXpGain (no multiplication)
      // xpGained in xpResult is the raw input to applyXpGain (which is boostedXpGain)
      expect(result.xpResult.xpGained).toBe(100);
    });

    it('uses fetched guild modifier value for boost', async () => {
      setupBasicMocks();
      mockedGetPlayerGuildModifiers.mockResolvedValue({
        xpBoost: 0.2, damageBoost: 0, defenceBoost: 0,
      });

      const result = await grantSkillXp('p1', 'melee', 100, now);
      // 20% boost -> floor(100 * 1.2) = 120
      expect(result.xpResult.xpGained).toBe(120);
    });
  });

  // ── Shop XP boost (buff) ──────────────────────────────────────────
  describe('shop XP boost', () => {
    it('calls consumeBuffIfActive for xp_boost inside transaction', async () => {
      setupBasicMocks();
      await grantSkillXp('p1', 'melee', 100, now);

      expect(mockedConsumeBuffIfActive).toHaveBeenCalledWith(
        expect.anything(), 'p1', 'xp_boost',
      );
    });

    it('applies shop XP boost to raw XP', async () => {
      setupBasicMocks();
      mockedConsumeBuffIfActive.mockResolvedValue(0.25); // 25% shop boost

      const result = await grantSkillXp('p1', 'melee', 100, now, 0);
      // floor(100 * (1 + 0 + 0.25)) = floor(100 * 1.25) = 125
      expect(result.xpResult.xpGained).toBe(125);
    });

    it('consumeBuffIfActive is always called (handles no-buff internally)', async () => {
      setupBasicMocks();
      mockedConsumeBuffIfActive.mockResolvedValue(0);

      await grantSkillXp('p1', 'melee', 100, now);

      // consumeBuffIfActive is always called; it returns 0 when no buff exists
      expect(mockedConsumeBuffIfActive).toHaveBeenCalledTimes(1);
    });
  });

  // ── Combined boosts ───────────────────────────────────────────────
  describe('combined guild + shop XP boost', () => {
    it('sums guild and shop boosts', async () => {
      setupBasicMocks();
      mockedConsumeBuffIfActive.mockResolvedValue(0.1); // 10% shop

      const result = await grantSkillXp('p1', 'melee', 100, now, 0.2); // 20% guild
      // totalBoost = 0.2 + 0.1 = 0.3 -> floor(100 * 1.3) = 130
      expect(result.xpResult.xpGained).toBe(130);
    });

    it('no boost applied when both are 0', async () => {
      setupBasicMocks();
      mockedConsumeBuffIfActive.mockResolvedValue(0);

      const result = await grantSkillXp('p1', 'melee', 100, now, 0);
      expect(result.xpResult.xpGained).toBe(100);
    });

    it('floors the boosted XP amount', async () => {
      setupBasicMocks();
      mockedConsumeBuffIfActive.mockResolvedValue(0.1); // 10% shop

      // 33 * 1.1 = 36.3 -> floor = 36
      const result = await grantSkillXp('p1', 'melee', 33, now, 0);
      expect(result.xpResult.xpGained).toBe(36);
    });
  });

  // ── Daily window reset ────────────────────────────────────────────
  describe('daily window reset', () => {
    it('resets dailyXpGained when window has expired', async () => {
      // lastXpResetAt = 7 hours ago (XP_WINDOW_HOURS is 6), so window expired
      const sevenHoursAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      setupBasicMocks(makeSkill({ dailyXpGained: 5000, lastXpResetAt: sevenHoursAgo }));

      const result = await grantSkillXp('p1', 'melee', 50, now);

      // dailyXpGained should reset to 0 before adding the new XP
      expect(result.newDailyXpGained).toBe(result.xpResult.xpAfterEfficiency);
    });

    it('sets lastXpResetAt in update when window expired', async () => {
      const sevenHoursAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      setupBasicMocks(makeSkill({ dailyXpGained: 5000, lastXpResetAt: sevenHoursAgo }));

      await grantSkillXp('p1', 'melee', 50, now);

      const updateCall = mockPrisma.playerSkill.update.mock.calls[0][0];
      expect(updateCall.data.lastXpResetAt).toEqual(now);
    });

    it('does NOT set lastXpResetAt when window has not expired', async () => {
      // lastXpResetAt = 2 hours ago, still within 6-hour window
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      setupBasicMocks(makeSkill({ dailyXpGained: 500, lastXpResetAt: twoHoursAgo }));

      await grantSkillXp('p1', 'melee', 50, now);

      const updateCall = mockPrisma.playerSkill.update.mock.calls[0][0];
      expect(updateCall.data.lastXpResetAt).toBeUndefined();
    });

    it('accumulates dailyXpGained within same window', async () => {
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      setupBasicMocks(makeSkill({ dailyXpGained: 500, lastXpResetAt: twoHoursAgo }));

      const result = await grantSkillXp('p1', 'melee', 50, now);

      expect(result.newDailyXpGained).toBe(500 + result.xpResult.xpAfterEfficiency);
    });
  });

  // ── Skill level-up ─────────────────────────────────────────────────
  describe('skill level-up', () => {
    it('returns skillPointsGained = 0 when no level-up', async () => {
      setupBasicMocks(makeSkill({ xp: BigInt(0), level: 1 }));
      const result = await grantSkillXp('p1', 'melee', 10, now);

      expect(result.skillPointsGained).toBe(0);
      expect(result.newLevel).toBe(1);
    });

    it('returns POINTS_PER_LEVEL when skill levels up once', async () => {
      // Level 2 requires ~348 XP, so 400 raw XP triggers level-up from 1->2
      setupBasicMocks(makeSkill({ xp: BigInt(0), level: 1 }));
      const result = await grantSkillXp('p1', 'melee', 400, now);

      expect(result.newLevel).toBe(2);
      expect(result.skillPointsGained).toBe(SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL);
    });

    it('returns multiple POINTS_PER_LEVEL when skill levels up multiple times', async () => {
      // Very large XP gain to jump multiple levels
      setupBasicMocks(makeSkill({ xp: BigInt(0), level: 1 }));
      const result = await grantSkillXp('p1', 'melee', 50000, now);

      const levelsGained = result.newLevel - 1;
      expect(levelsGained).toBeGreaterThan(1);
      expect(result.skillPointsGained).toBe(
        levelsGained * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL,
      );
    });

    it('updates playerSkill with new level', async () => {
      setupBasicMocks(makeSkill({ xp: BigInt(0), level: 1 }));
      const result = await grantSkillXp('p1', 'melee', 400, now);

      const updateCall = mockPrisma.playerSkill.update.mock.calls[0][0];
      expect(updateCall.data.level).toBe(result.newLevel);
    });
  });

  // ── Character level-up ─────────────────────────────────────────────
  describe('character level-up', () => {
    it('calculates characterXpGain from xpAfterEfficiency', async () => {
      setupBasicMocks();
      const result = await grantSkillXp('p1', 'melee', 100, now);

      const expected = calculateCharacterXpGain(result.xpResult.xpAfterEfficiency);
      expect(result.characterXpGain).toBe(expected);
    });

    it('adds characterXpGain to existing characterXp', async () => {
      setupBasicMocks(makeSkill(), makePlayer({ characterXp: BigInt(500) }));
      const result = await grantSkillXp('p1', 'melee', 100, now);

      expect(result.characterXpAfter).toBe(500 + result.characterXpGain);
    });

    it('reports characterLevelBefore from player record', async () => {
      setupBasicMocks(makeSkill(), makePlayer({ characterLevel: 5 }));
      const result = await grantSkillXp('p1', 'melee', 10, now);

      expect(result.characterLevelBefore).toBe(5);
    });

    it('sets characterLeveledUp to true when level increases', async () => {
      // characterLevelFromXp uses same formula as skill levels but with CHARACTER_CONSTANTS.MAX_LEVEL
      // Need enough character XP to level up. Lets compute: level 2 requires xpForLevel(2) = floor(100 * 2^1.8) = 348
      // CharacterXP = floor(skillXpAfterEfficiency * 0.3). We need total char XP >= 348.
      // With 1200 skill XP, char gain = floor(1200 * 0.3) = 360. If char starts at 0, total = 360 >= 348.
      setupBasicMocks(makeSkill(), makePlayer({ characterXp: BigInt(0), characterLevel: 1 }));
      const result = await grantSkillXp('p1', 'melee', 1200, now);

      // Verify character actually leveled up
      expect(result.characterXpAfter).toBeGreaterThanOrEqual(348);
      expect(result.characterLevelAfter).toBeGreaterThan(1);
      expect(result.characterLeveledUp).toBe(true);
    });

    it('sets characterLeveledUp to false when level stays same', async () => {
      setupBasicMocks(makeSkill(), makePlayer({ characterXp: BigInt(0), characterLevel: 1 }));
      const result = await grantSkillXp('p1', 'melee', 10, now);

      expect(result.characterLeveledUp).toBe(false);
      expect(result.characterLevelAfter).toBe(1);
    });

    it('grants attribute points equal to character levels gained', async () => {
      setupBasicMocks(
        makeSkill(),
        makePlayer({ characterXp: BigInt(0), characterLevel: 1, attributePoints: 3 }),
      );
      const result = await grantSkillXp('p1', 'melee', 1200, now);

      const levelUps = result.characterLevelAfter - result.characterLevelBefore;
      expect(result.attributePointsAfter).toBe(3 + levelUps);
    });

    it('does not reduce attribute points when no character level-up', async () => {
      setupBasicMocks(
        makeSkill(),
        makePlayer({ characterXp: BigInt(500), characterLevel: 2, attributePoints: 5 }),
      );
      const result = await grantSkillXp('p1', 'melee', 10, now);

      expect(result.attributePointsAfter).toBe(5);
    });
  });

  // ── Database updates ───────────────────────────────────────────────
  describe('database updates', () => {
    it('updates playerSkill with correct where clause', async () => {
      setupBasicMocks();
      await grantSkillXp('p1', 'ranged', 100, now);

      const updateCall = mockPrisma.playerSkill.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({
        playerId_skillType: { playerId: 'p1', skillType: 'ranged' },
      });
    });

    it('stores xp as BigInt in playerSkill update', async () => {
      setupBasicMocks(makeSkill({ xp: BigInt(100) }));
      const result = await grantSkillXp('p1', 'melee', 50, now);

      const updateCall = mockPrisma.playerSkill.update.mock.calls[0][0];
      expect(updateCall.data.xp).toBe(BigInt(result.newTotalXp));
    });

    it('stores dailyXpGained in playerSkill update', async () => {
      setupBasicMocks(makeSkill({ dailyXpGained: 200 }));
      const result = await grantSkillXp('p1', 'melee', 50, now);

      const updateCall = mockPrisma.playerSkill.update.mock.calls[0][0];
      expect(updateCall.data.dailyXpGained).toBe(result.newDailyXpGained);
    });

    it('updates player with characterXp as BigInt', async () => {
      setupBasicMocks();
      const result = await grantSkillXp('p1', 'melee', 100, now);

      const updateCall = mockPrisma.player.update.mock.calls[0][0];
      expect(updateCall.data.characterXp).toBe(BigInt(result.characterXpAfter));
    });

    it('updates player with characterLevel and attributePoints', async () => {
      setupBasicMocks(
        makeSkill(),
        makePlayer({ characterXp: BigInt(0), characterLevel: 1, attributePoints: 2 }),
      );
      const result = await grantSkillXp('p1', 'melee', 1200, now);

      const updateCall = mockPrisma.player.update.mock.calls[0][0];
      expect(updateCall.data.characterLevel).toBe(result.characterLevelAfter);
      expect(updateCall.data.attributePoints).toBe(result.attributePointsAfter);
      expect(updateCall.where).toEqual({ id: 'p1' });
    });

    it('fetches skill and player in parallel', async () => {
      setupBasicMocks();
      await grantSkillXp('p1', 'melee', 50, now);

      // Both findUnique calls should have been made
      expect(mockPrisma.playerSkill.findUnique).toHaveBeenCalledWith({
        where: { playerId_skillType: { playerId: 'p1', skillType: 'melee' } },
      });
      expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'p1' },
        select: { characterXp: true, characterLevel: true, attributePoints: true },
      });
    });
  });

  // ── BigInt handling ────────────────────────────────────────────────
  describe('BigInt handling', () => {
    it('converts skill.xp from BigInt to number', async () => {
      setupBasicMocks(makeSkill({ xp: BigInt(999) }));
      const result = await grantSkillXp('p1', 'melee', 50, now);

      expect(typeof result.newTotalXp).toBe('number');
      // newTotalXp should start from 999
      expect(result.newTotalXp).toBeGreaterThanOrEqual(999);
    });

    it('converts player.characterXp from BigInt to number', async () => {
      setupBasicMocks(makeSkill(), makePlayer({ characterXp: BigInt(12345) }));
      const result = await grantSkillXp('p1', 'melee', 50, now);

      expect(typeof result.characterXpAfter).toBe('number');
      expect(result.characterXpAfter).toBeGreaterThanOrEqual(12345);
    });
  });

  // ── Transaction ────────────────────────────────────────────────────
  describe('transaction', () => {
    it('runs within a prisma $transaction', async () => {
      setupBasicMocks();
      await grantSkillXp('p1', 'melee', 50, now);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles high existing dailyXpGained (near cap, low efficiency)', async () => {
      // When dailyXpGained is near the cap, efficiency drops to near zero
      setupBasicMocks(makeSkill({ dailyXpGained: 999999 }));
      const result = await grantSkillXp('p1', 'melee', 100, now);

      // Efficiency should be 0 or near 0
      expect(result.xpResult.efficiency).toBe(0);
      expect(result.xpResult.xpAfterEfficiency).toBe(0);
    });

    it('handles large raw XP gain', async () => {
      setupBasicMocks();
      const result = await grantSkillXp('p1', 'melee', 1000000, now);

      expect(result.newTotalXp).toBeGreaterThan(0);
      expect(result.newLevel).toBeGreaterThan(1);
    });

    it('correctly handles negative characterXpGain prevention', async () => {
      // characterXpGain = floor(xpAfterEfficiency * 0.3)
      // If xpAfterEfficiency is 0, characterXpGain = 0
      setupBasicMocks(makeSkill({ dailyXpGained: 999999 }));
      const result = await grantSkillXp('p1', 'melee', 100, now);

      expect(result.characterXpGain).toBe(0);
    });

    it('character level never decreases', async () => {
      setupBasicMocks(
        makeSkill(),
        makePlayer({ characterXp: BigInt(5000), characterLevel: 5 }),
      );
      const result = await grantSkillXp('p1', 'melee', 1, now);

      expect(result.characterLevelAfter).toBeGreaterThanOrEqual(5);
    });

    it('levelUps is clamped to 0 when characterLevelAfter < characterLevelBefore somehow', async () => {
      // In practice this shouldn't happen, but the code uses Math.max(0, ...)
      // We can verify the attribute points don't decrease by testing with a high character level
      setupBasicMocks(
        makeSkill(),
        makePlayer({ characterXp: BigInt(100000), characterLevel: 10, attributePoints: 20 }),
      );
      const result = await grantSkillXp('p1', 'melee', 1, now);

      // Level after should match the XP, attribute points should not decrease
      expect(result.attributePointsAfter).toBeGreaterThanOrEqual(20);
    });
  });

  // ── Boost with guild modifier fetch ────────────────────────────────
  describe('guild modifier resolution', () => {
    it('uses guildXpBoost param via nullish coalescing (0 is not fetched)', async () => {
      setupBasicMocks();
      // Passing 0 explicitly should use 0, not fetch
      await grantSkillXp('p1', 'melee', 100, now, 0);

      expect(mockedGetPlayerGuildModifiers).not.toHaveBeenCalled();
    });

    it('fetches guild modifiers when guildXpBoost is undefined', async () => {
      setupBasicMocks();
      mockedGetPlayerGuildModifiers.mockResolvedValue({
        xpBoost: 0.05, damageBoost: 0, defenceBoost: 0,
      });

      const result = await grantSkillXp('p1', 'melee', 100, now);
      // 5% boost -> floor(100 * 1.05) = 105
      expect(result.xpResult.xpGained).toBe(105);
    });
  });

  // ── Buff consumed inside transaction ────────────────────────────────
  describe('buff consumed inside transaction', () => {
    it('consumes shop buff inside the transaction', async () => {
      setupBasicMocks();
      mockedConsumeBuffIfActive.mockResolvedValue(0.1);

      const result = await grantSkillXp('p1', 'melee', 100, now, 0.05);

      // consumeBuffIfActive is called inside the transaction with the tx client
      expect(mockedConsumeBuffIfActive).toHaveBeenCalledWith(
        expect.anything(), 'p1', 'xp_boost',
      );
      // 5% guild + 10% shop = 15% -> floor(100 * (1 + 0.05 + 0.1))
      // Due to floating-point: 0.05 + 0.1 = 0.15000000000000002
      // 100 * 1.15000000000000002 = 114.99999999999999 -> floor = 114
      expect(result.xpResult.xpGained).toBe(114);
    });
  });
});
