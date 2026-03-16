import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./statsService', () => ({
  resolveStats: vi.fn(),
  resolveAllStats: vi.fn(),
  resolveFamilyKills: vi.fn(),
  resolveAllFamilyKills: vi.fn(),
  incrementStats: vi.fn(),
}));

vi.mock('./activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({}),
}));

const mockEmit = vi.fn();
const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
vi.mock('../socket', () => ({
  getIo: vi.fn(() => null),
}));

import { mockPrisma } from '../__test__/setup';
import {
  checkAchievements,
  claimReward,
  setActiveTitle,
  getPlayerAchievements,
  getUnclaimedCount,
  emitAchievementNotifications,
} from './achievementService';
import { resolveStats, resolveAllStats, resolveFamilyKills, resolveAllFamilyKills } from './statsService';
import { createActivityLog } from './activityLogService';
import { getIo } from '../socket';
import { ACHIEVEMENTS_BY_ID } from '@pocketrealm/shared';

const mockResolveStats = resolveStats as ReturnType<typeof vi.fn>;
const mockResolveAllStats = resolveAllStats as ReturnType<typeof vi.fn>;
const mockResolveFamilyKills = resolveFamilyKills as ReturnType<typeof vi.fn>;
const mockResolveAllFamilyKills = resolveAllFamilyKills as ReturnType<typeof vi.fn>;
const mockCreateActivityLog = createActivityLog as ReturnType<typeof vi.fn>;
const mockGetIo = getIo as ReturnType<typeof vi.fn>;

describe('achievementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIo.mockReturnValue(null);
  });

  // ─── checkAchievements ────────────────────────────────────────────
  describe('checkAchievements', () => {
    it('returns empty when no achievements are newly met', async () => {
      mockResolveStats.mockResolvedValue({ totalKills: 5 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result).toEqual([]);
    });

    it('unlocks achievement when threshold met', async () => {
      mockResolveStats.mockResolvedValue({ totalKills: 100 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('combat_kills_100');
    });

    it('skips already-unlocked achievements', async () => {
      mockResolveStats.mockResolvedValue({ totalKills: 100 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { playerId: 'p1', achievementId: 'combat_kills_100', rewardClaimed: false },
      ]);

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result).toEqual([]);
    });

    it('checks family achievements when familyId provided', async () => {
      mockResolveStats.mockResolvedValue({ totalKills: 1 });
      mockResolveFamilyKills.mockResolvedValue(500);
      mockPrisma.mobFamily.findUnique.mockResolvedValue({ id: 'wolves-id', name: 'Wolves' });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      const result = await checkAchievements('p1', { statKeys: ['totalKills'], familyId: 'wolves-id' });
      expect(result.some((a) => a.id === 'family_wolves_500')).toBe(true);
    });

    // --- New tests ---

    it('skips resolveStats when no statKeys provided', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);

      const result = await checkAchievements('p1', {});
      expect(mockResolveStats).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns empty when familyId references non-existent family', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findUnique.mockResolvedValue(null);

      const result = await checkAchievements('p1', { familyId: 'nonexistent-id' });
      expect(result).toEqual([]);
      expect(mockResolveFamilyKills).not.toHaveBeenCalled();
    });

    it('returns empty when family name has no mapping in FAMILY_NAME_TO_KEY', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findUnique.mockResolvedValue({ id: 'unknown-id', name: 'Dragons' });

      const result = await checkAchievements('p1', { familyId: 'unknown-id' });
      expect(result).toEqual([]);
      expect(mockResolveFamilyKills).not.toHaveBeenCalled();
    });

    it('unlocks multiple achievements when multiple thresholds are met', async () => {
      // totalKills: 1000 should unlock combat_kills_100, combat_kills_500, and combat_kills_1000
      mockResolveStats.mockResolvedValue({ totalKills: 1000 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      const ids = result.map((a) => a.id);
      expect(ids).toContain('combat_kills_100');
      expect(ids).toContain('combat_kills_500');
      expect(ids).toContain('combat_kills_1000');
    });

    it('unlocks at exact threshold boundary (progress == threshold)', async () => {
      mockResolveStats.mockResolvedValue({ totalKills: 100 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result.some((a) => a.id === 'combat_kills_100')).toBe(true);
    });

    it('does not unlock when progress is just below threshold', async () => {
      mockResolveStats.mockResolvedValue({ totalKills: 99 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result).toEqual([]);
    });

    it('handles multiple stat keys from different categories', async () => {
      // totalKills: 100, totalCrafts: 1 → unlocks from both
      mockResolveStats.mockResolvedValue({ totalKills: 100, totalCrafts: 1 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      const result = await checkAchievements('p1', { statKeys: ['totalKills', 'totalCrafts'] });
      const ids = result.map((a) => a.id);
      expect(ids).toContain('combat_kills_100');
      expect(ids).toContain('craft_total_1');
    });

    it('adds newly unlocked to unlockedSet preventing duplicate creates', async () => {
      // With 100 kills, combat_kills_100 is the only unlock; second call should still create only once
      mockResolveStats.mockResolvedValue({ totalKills: 100 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      await checkAchievements('p1', { statKeys: ['totalKills'] });
      // combat_kills_100 is the only one at exactly 100 threshold
      expect(mockPrisma.playerAchievement.createMany).toHaveBeenCalledWith({
        data: [{ playerId: 'p1', achievementId: 'combat_kills_100' }],
        skipDuplicates: true,
      });
    });

    it('uses family kills for progress on family achievements', async () => {
      mockResolveStats.mockResolvedValue({});
      mockResolveFamilyKills.mockResolvedValue(2500);
      mockPrisma.mobFamily.findUnique.mockResolvedValue({ id: 'boars-id', name: 'Boars' });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      const result = await checkAchievements('p1', { familyId: 'boars-id' });
      const ids = result.map((a) => a.id);
      expect(ids).toContain('family_boars_500');
      expect(ids).toContain('family_boars_2500');
      expect(ids).not.toContain('family_boars_5000');
    });

    it('resolves stats with correct statKeys', async () => {
      mockResolveStats.mockResolvedValue({ totalDeaths: 1 });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.createMany.mockResolvedValue({ count: 1 });

      await checkAchievements('p1', { statKeys: ['totalDeaths'] });
      expect(mockResolveStats).toHaveBeenCalledWith('p1', ['totalDeaths']);
    });
  });

  // ─── getPlayerAchievements ──────────────────────────────────────
  describe('getPlayerAchievements', () => {
    const baseStats = {
      totalKills: 150,
      totalBossKills: 0,
      totalBossDamage: 0,
      totalPvpWins: 0,
      bestPvpWinStreak: 0,
      totalZonesDiscovered: 3,
      totalZonesFullyExplored: 0,
      totalRecipesLearned: 0,
      totalBestiaryCompleted: 0,
      totalUniqueMonsterKills: 10,
      highestCharacterLevel: 5,
      highestSkillLevel: 8,
      totalCrafts: 0,
      totalRaresCrafted: 0,
      totalEpicsCrafted: 0,
      totalLegendariesCrafted: 0,
      totalSalvages: 0,
      totalForgeUpgrades: 0,
      totalGatheringActions: 0,
      totalTurnsSpent: 5000,
      totalDeaths: 1,
    };

    it('returns progress for all achievements using resolved stats', async () => {
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { playerId: 'p1', achievementId: 'combat_kills_100', unlockedAt: new Date(), rewardClaimed: false },
      ]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([
        { id: 'wolves-id', name: 'Wolves' },
      ]);

      const result = await getPlayerAchievements('p1');
      expect(result.achievements.length).toBeGreaterThan(0);

      const killsAch = result.achievements.find((a) => a.id === 'combat_kills_100');
      expect(killsAch?.unlocked).toBe(true);
      expect(killsAch?.progress).toBe(100);

      const kills500 = result.achievements.find((a) => a.id === 'combat_kills_500');
      expect(kills500?.unlocked).toBe(false);
      expect(kills500?.progress).toBe(150);
    });

    // --- New tests ---

    it('hides title/description for secret achievements when not unlocked', async () => {
      mockResolveAllStats.mockResolvedValue({ ...baseStats, bestPvpWinStreak: 3 });
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const secretStreak = result.achievements.find((a) => a.id === 'combat_streak_10');
      expect(secretStreak).toBeDefined();
      expect(secretStreak!.title).toBe('???');
      expect(secretStreak!.description).toBe('???');
      expect(secretStreak!.secret).toBe(true);
      expect(secretStreak!.unlocked).toBe(false);
    });

    it('shows real title/description for secret achievements when unlocked', async () => {
      mockResolveAllStats.mockResolvedValue({ ...baseStats, bestPvpWinStreak: 10 });
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { playerId: 'p1', achievementId: 'combat_streak_10', unlockedAt: new Date(), rewardClaimed: false },
      ]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const secretStreak = result.achievements.find((a) => a.id === 'combat_streak_10');
      expect(secretStreak!.title).toBe('Unstoppable');
      expect(secretStreak!.description).toBe('Achieve a 10 PvP win streak');
      expect(secretStreak!.unlocked).toBe(true);
    });

    it('resolves family-based progress through familyKillsByKey', async () => {
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map([['wolves-id', 750]]));
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([
        { id: 'wolves-id', name: 'Wolves' },
      ]);

      const result = await getPlayerAchievements('p1');
      const wolvesAch = result.achievements.find((a) => a.id === 'family_wolves_500');
      expect(wolvesAch).toBeDefined();
      expect(wolvesAch!.progress).toBe(500); // capped at threshold
    });

    it('caps progress at threshold via Math.min', async () => {
      mockResolveAllStats.mockResolvedValue({ ...baseStats, totalKills: 99999 });
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const kills100 = result.achievements.find((a) => a.id === 'combat_kills_100');
      expect(kills100!.progress).toBe(100); // capped at threshold
    });

    it('counts unclaimedCount only for unlocked achievements with rewards', async () => {
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        // combat_kills_1000 has rewards, rewardClaimed=false → count
        { playerId: 'p1', achievementId: 'combat_kills_1000', unlockedAt: new Date(), rewardClaimed: false },
        // combat_kills_100 has NO rewards → skip
        { playerId: 'p1', achievementId: 'combat_kills_100', unlockedAt: new Date(), rewardClaimed: false },
        // combat_kills_5000 has rewards but already claimed → skip
        { playerId: 'p1', achievementId: 'combat_kills_5000', unlockedAt: new Date(), rewardClaimed: true },
      ]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      expect(result.unclaimedCount).toBe(1);
    });

    it('hides titleReward when achievement is not unlocked', async () => {
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const kills500 = result.achievements.find((a) => a.id === 'combat_kills_500');
      expect(kills500!.unlocked).toBe(false);
      expect(kills500!.titleReward).toBeUndefined();
    });

    it('shows titleReward when achievement is unlocked', async () => {
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { playerId: 'p1', achievementId: 'combat_kills_500', unlockedAt: new Date(), rewardClaimed: false },
      ]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const kills500 = result.achievements.find((a) => a.id === 'combat_kills_500');
      expect(kills500!.unlocked).toBe(true);
      expect(kills500!.titleReward).toBe('The Warrior');
    });

    it('skips unmapped family names in familyIdToKey', async () => {
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map([['dragon-id', 999]]));
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([
        { id: 'dragon-id', name: 'Dragons' },
      ]);

      const result = await getPlayerAchievements('p1');
      // Dragon family achievements don't exist, so all family achievements should have 0 progress
      const anyFamilyAch = result.achievements.filter((a) => a.familyKey);
      for (const ach of anyFamilyAch) {
        expect(ach.progress).toBe(0);
      }
    });

    it('includes unlockedAt as ISO string', async () => {
      const date = new Date('2025-01-15T10:30:00Z');
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { playerId: 'p1', achievementId: 'combat_kills_100', unlockedAt: date, rewardClaimed: false },
      ]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const ach = result.achievements.find((a) => a.id === 'combat_kills_100');
      expect(ach!.unlockedAt).toBe(date.toISOString());
    });

    it('returns undefined unlockedAt for not-unlocked achievements', async () => {
      mockResolveAllStats.mockResolvedValue(baseStats);
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const ach = result.achievements.find((a) => a.id === 'combat_kills_100');
      expect(ach!.unlockedAt).toBeUndefined();
    });

    it('returns progress 0 for stat key with no resolved value', async () => {
      mockResolveAllStats.mockResolvedValue({}); // empty stats
      mockResolveAllFamilyKills.mockResolvedValue(new Map());
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.mobFamily.findMany.mockResolvedValue([]);

      const result = await getPlayerAchievements('p1');
      const ach = result.achievements.find((a) => a.id === 'combat_kills_100');
      expect(ach!.progress).toBe(0);
    });
  });

  // ─── claimReward ────────────────────────────────────────────────
  describe('claimReward', () => {
    it('marks achievement as claimed and returns rewards', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.update.mockResolvedValue({});

      const result = await claimReward('p1', 'combat_kills_1000');
      expect(result.success).toBe(true);
      expect(result.rewards).toBeDefined();
    });

    it('throws if achievement not unlocked', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue(null);

      await expect(claimReward('p1', 'combat_kills_1000')).rejects.toThrow();
    });

    it('throws if reward already claimed', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: true,
      });

      await expect(claimReward('p1', 'combat_kills_1000')).rejects.toThrow();
    });

    // --- New tests ---

    it('throws NOT_FOUND for unknown achievement ID', async () => {
      await expect(claimReward('p1', 'nonexistent_achievement'))
        .rejects
        .toThrow('Unknown achievement');
    });

    it('throws with NOT_FOUND code for unknown achievement', async () => {
      try {
        await claimReward('p1', 'nonexistent_achievement');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('NOT_FOUND');
        expect(err.statusCode).toBe(404);
      }
    });

    it('throws NOT_UNLOCKED with 400 status', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue(null);

      try {
        await claimReward('p1', 'combat_kills_1000');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('NOT_UNLOCKED');
        expect(err.statusCode).toBe(400);
      }
    });

    it('throws ALREADY_CLAIMED with 400 status', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: true,
      });

      try {
        await claimReward('p1', 'combat_kills_1000');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('ALREADY_CLAIMED');
        expect(err.statusCode).toBe(400);
      }
    });

    it('grants attribute_points reward via player.update increment', async () => {
      // combat_kills_1000 has reward: { type: 'attribute_points', amount: 1 }
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.player.update.mockResolvedValue({});

      await claimReward('p1', 'combat_kills_1000');

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { attributePoints: { increment: 1 } },
      });
    });

    it('grants turns reward via refundPlayerTurnsTx (respects bank cap)', async () => {
      // explore_zones_3 has reward: { type: 'turns', amount: 1000 }
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'explore_zones_3',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.turnBank.findUnique.mockResolvedValue({
        playerId: 'p1',
        currentTurns: 50000,
        lastRegenAt: new Date(),
      });
      mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });

      await claimReward('p1', 'explore_zones_3');

      expect(mockPrisma.turnBank.findUnique).toHaveBeenCalledWith({
        where: { playerId: 'p1' },
      });
      expect(mockPrisma.turnBank.updateMany).toHaveBeenCalled();
    });

    it('grants item reward when template exists', async () => {
      // family_vermin_5000 has reward: { type: 'item', amount: 1, itemTemplateId: 'achievement_vermin_gloves' }
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'family_vermin_5000',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.itemTemplate.findUnique.mockResolvedValue({ id: 'achievement_vermin_gloves', name: 'Vermin Gloves' });
      mockPrisma.item.create.mockResolvedValue({});

      await claimReward('p1', 'family_vermin_5000');

      expect(mockPrisma.itemTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: 'achievement_vermin_gloves' },
      });
      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: {
          ownerId: 'p1',
          templateId: 'achievement_vermin_gloves',
          rarity: 'legendary',
          quantity: 1,
        },
      });
    });

    it('skips item creation when template not found', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'family_vermin_5000',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.itemTemplate.findUnique.mockResolvedValue(null);

      await claimReward('p1', 'family_vermin_5000');

      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });

    it('handles achievement with no rewards (empty rewards array)', async () => {
      // combat_kills_100 has no rewards
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_100',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.updateMany.mockResolvedValue({ count: 1 });

      const result = await claimReward('p1', 'combat_kills_100');
      expect(result.success).toBe(true);
      expect(result.rewards).toEqual([]);
      // No player/turnBank/item updates should be called
      expect(mockPrisma.player.update).not.toHaveBeenCalled();
      expect(mockPrisma.turnBank.update).not.toHaveBeenCalled();
      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });

    it('marks rewardClaimed=true via optimistic lock updateMany', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_100',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.updateMany.mockResolvedValue({ count: 1 });

      await claimReward('p1', 'combat_kills_100');

      expect(mockPrisma.playerAchievement.updateMany).toHaveBeenCalledWith({
        where: { playerId: 'p1', achievementId: 'combat_kills_100', rewardClaimed: false },
        data: { rewardClaimed: true },
      });
    });
  });

  // ─── setActiveTitle ─────────────────────────────────────────────
  describe('setActiveTitle', () => {
    it('sets active title from unlocked achievement', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_500',
      });
      mockPrisma.player.update.mockResolvedValue({ activeTitle: 'combat_kills_500' });

      const result = await setActiveTitle('p1', 'combat_kills_500');
      expect(result.activeTitle).toBe('combat_kills_500');
    });

    it('clears title when null passed', async () => {
      mockPrisma.player.update.mockResolvedValue({ activeTitle: null });

      const result = await setActiveTitle('p1', null);
      expect(result.activeTitle).toBeNull();
    });

    it('throws if achievement not unlocked', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue(null);

      await expect(setActiveTitle('p1', 'combat_kills_500')).rejects.toThrow();
    });

    // --- New tests ---

    it('throws NO_TITLE_REWARD for achievement with no titleReward', async () => {
      // combat_kills_100 has no titleReward
      try {
        await setActiveTitle('p1', 'combat_kills_100');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('NO_TITLE_REWARD');
        expect(err.statusCode).toBe(400);
      }
    });

    it('throws NO_TITLE_REWARD for unknown achievement ID', async () => {
      try {
        await setActiveTitle('p1', 'nonexistent_id');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('NO_TITLE_REWARD');
      }
    });

    it('does not query playerAchievement when clearing title (null)', async () => {
      mockPrisma.player.update.mockResolvedValue({ activeTitle: null });

      await setActiveTitle('p1', null);
      expect(mockPrisma.playerAchievement.findUnique).not.toHaveBeenCalled();
    });

    it('throws NOT_UNLOCKED when achievement exists but player has not unlocked it', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue(null);

      try {
        await setActiveTitle('p1', 'combat_kills_500');
        expect.unreachable('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('NOT_UNLOCKED');
        expect(err.statusCode).toBe(400);
      }
    });

    it('sets the correct achievementId in player update', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_500',
      });
      mockPrisma.player.update.mockResolvedValue({ activeTitle: 'combat_kills_500' });

      await setActiveTitle('p1', 'combat_kills_500');

      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { activeTitle: 'combat_kills_500' },
        select: { activeTitle: true },
      });
    });
  });

  // ─── getUnclaimedCount ──────────────────────────────────────────
  describe('getUnclaimedCount', () => {
    it('returns 0 when no unclaimed achievements', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);

      const count = await getUnclaimedCount('p1');
      expect(count).toBe(0);
    });

    it('counts only achievements that have rewards defined', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        // combat_kills_1000 has rewards: [{ type: 'attribute_points', amount: 1 }]
        { achievementId: 'combat_kills_1000' },
        // combat_kills_100 has NO rewards
        { achievementId: 'combat_kills_100' },
      ]);

      const count = await getUnclaimedCount('p1');
      expect(count).toBe(1);
    });

    it('skips unknown achievement IDs', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { achievementId: 'totally_bogus_id' },
      ]);

      const count = await getUnclaimedCount('p1');
      expect(count).toBe(0);
    });

    it('counts multiple unclaimed achievements with rewards', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { achievementId: 'combat_kills_1000' },   // has rewards
        { achievementId: 'combat_kills_5000' },   // has rewards
        { achievementId: 'explore_zones_3' },     // has rewards (turns)
      ]);

      const count = await getUnclaimedCount('p1');
      expect(count).toBe(3);
    });

    it('queries with rewardClaimed=false filter', async () => {
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);

      await getUnclaimedCount('p1');

      expect(mockPrisma.playerAchievement.findMany).toHaveBeenCalledWith({
        where: { playerId: 'p1', rewardClaimed: false },
        select: { achievementId: true },
      });
    });

    it('skips achievements with empty rewards array', async () => {
      // combat_kills_500 has tier 2, titleReward but no rewards array
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { achievementId: 'combat_kills_500' },
      ]);

      const count = await getUnclaimedCount('p1');
      expect(count).toBe(0);
    });
  });

  // ─── emitAchievementNotifications ───────────────────────────────
  describe('emitAchievementNotifications', () => {
    it('does nothing for empty achievements array', async () => {
      await emitAchievementNotifications('p1', []);

      expect(mockCreateActivityLog).not.toHaveBeenCalled();
    });

    it('creates activity log per achievement', async () => {
      const achievements = [
        ACHIEVEMENTS_BY_ID.get('combat_kills_100')!,
        ACHIEVEMENTS_BY_ID.get('combat_kills_500')!,
      ];

      await emitAchievementNotifications('p1', achievements);

      expect(mockCreateActivityLog).toHaveBeenCalledTimes(2);
      expect(mockCreateActivityLog).toHaveBeenCalledWith({
        playerId: 'p1',
        activityType: 'achievement',
        turnsSpent: 0,
        result: { achievementId: 'combat_kills_100', title: 'Monster Hunter' },
      });
      expect(mockCreateActivityLog).toHaveBeenCalledWith({
        playerId: 'p1',
        activityType: 'achievement',
        turnsSpent: 0,
        result: { achievementId: 'combat_kills_500', title: 'Warrior' },
      });
    });

    it('emits socket event per achievement when io is available', async () => {
      mockGetIo.mockReturnValue({ to: mockTo });

      const achievements = [ACHIEVEMENTS_BY_ID.get('combat_kills_100')!];

      await emitAchievementNotifications('p1', achievements);

      expect(mockTo).toHaveBeenCalledWith('p1');
      expect(mockEmit).toHaveBeenCalledWith('achievement_unlocked', {
        id: 'combat_kills_100',
        title: 'Monster Hunter',
        category: 'combat',
      });
    });

    it('skips socket emit when io is null', async () => {
      mockGetIo.mockReturnValue(null);

      const achievements = [ACHIEVEMENTS_BY_ID.get('combat_kills_100')!];

      await emitAchievementNotifications('p1', achievements);

      // Activity log still created
      expect(mockCreateActivityLog).toHaveBeenCalledTimes(1);
      // No socket calls
      expect(mockTo).not.toHaveBeenCalled();
    });

    it('emits for each achievement in sequence', async () => {
      mockGetIo.mockReturnValue({ to: mockTo });

      const achievements = [
        ACHIEVEMENTS_BY_ID.get('combat_kills_100')!,
        ACHIEVEMENTS_BY_ID.get('explore_zones_3')!,
      ];

      await emitAchievementNotifications('p1', achievements);

      expect(mockEmit).toHaveBeenCalledTimes(2);
      expect(mockEmit).toHaveBeenCalledWith('achievement_unlocked', expect.objectContaining({ id: 'combat_kills_100' }));
      expect(mockEmit).toHaveBeenCalledWith('achievement_unlocked', expect.objectContaining({ id: 'explore_zones_3' }));
    });

    it('includes category in socket event', async () => {
      mockGetIo.mockReturnValue({ to: mockTo });

      const achievements = [ACHIEVEMENTS_BY_ID.get('explore_zones_3')!];

      await emitAchievementNotifications('p1', achievements);

      expect(mockEmit).toHaveBeenCalledWith('achievement_unlocked', {
        id: 'explore_zones_3',
        title: 'Wanderer',
        category: 'exploration',
      });
    });
  });
});
