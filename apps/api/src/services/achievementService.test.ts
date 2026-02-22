import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./statsService', () => ({
  resolveStats: vi.fn(),
  resolveAllStats: vi.fn(),
  resolveFamilyKills: vi.fn(),
  resolveAllFamilyKills: vi.fn(),
  incrementStats: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { checkAchievements, claimReward, setActiveTitle, getPlayerAchievements } from './achievementService';
import { resolveStats, resolveAllStats, resolveFamilyKills, resolveAllFamilyKills } from './statsService';
const mockResolveStats = resolveStats as ReturnType<typeof vi.fn>;
const mockResolveAllStats = resolveAllStats as ReturnType<typeof vi.fn>;
const mockResolveFamilyKills = resolveFamilyKills as ReturnType<typeof vi.fn>;
const mockResolveAllFamilyKills = resolveAllFamilyKills as ReturnType<typeof vi.fn>;

describe('achievementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      mockPrisma.playerAchievement.create.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_100',
        rewardClaimed: false,
      });

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
      mockPrisma.playerAchievement.create.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'family_wolves_500',
        rewardClaimed: false,
      });

      const result = await checkAchievements('p1', { statKeys: ['totalKills'], familyId: 'wolves-id' });
      expect(result.some((a) => a.id === 'family_wolves_500')).toBe(true);
    });
  });

  describe('getPlayerAchievements', () => {
    it('returns progress for all achievements using resolved stats', async () => {
      mockResolveAllStats.mockResolvedValue({
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
      });
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
  });

  describe('claimReward', () => {
    it('marks achievement as claimed and returns rewards', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.update.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: true,
      });
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
  });

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
  });
});
