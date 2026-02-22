import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { incrementStats, resolveAllStats, resolveFamilyKills, resolveAllFamilyKills } from './statsService';

describe('statsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('incrementStats', () => {
    it('upserts counter stats with increment values', async () => {
      const updated = { playerId: 'p1', totalCrafts: 1, totalTurnsSpent: 50 };
      mockPrisma.playerStats.upsert.mockResolvedValue(updated);

      await incrementStats('p1', { totalCrafts: 1, totalTurnsSpent: 50 });
      expect(mockPrisma.playerStats.upsert).toHaveBeenCalledWith({
        where: { playerId: 'p1' },
        create: { playerId: 'p1', totalCrafts: 1, totalTurnsSpent: 50 },
        update: { totalCrafts: { increment: 1 }, totalTurnsSpent: { increment: 50 } },
      });
    });

    it('does nothing when all increments are zero', async () => {
      await incrementStats('p1', {});
      expect(mockPrisma.playerStats.upsert).not.toHaveBeenCalled();
    });
  });

  describe('resolveAllStats', () => {
    it('combines derived stats from raw SQL with counter stats from player_stats', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{
        total_kills: 22,
        total_boss_kills: 3,
        total_boss_damage: 5000,
        total_pvp_wins: 10,
        best_pvp_win_streak: 5,
        total_zones_discovered: 4,
        total_zones_fully_explored: 1,
        total_recipes_learned: 7,
        total_bestiary_completed: 2,
        total_unique_monster_kills: 15,
        highest_character_level: 12,
        highest_skill_level: 8,
      }]);
      mockPrisma.playerStats.findUnique.mockResolvedValue({
        playerId: 'p1',
        totalCrafts: 50,
        totalRaresCrafted: 3,
        totalEpicsCrafted: 1,
        totalLegendariesCrafted: 0,
        totalSalvages: 20,
        totalForgeUpgrades: 5,
        totalGatheringActions: 100,
        totalTurnsSpent: 9999,
        totalDeaths: 2,
      });

      const result = await resolveAllStats('p1');

      expect(result.totalKills).toBe(22);
      expect(result.totalBossKills).toBe(3);
      expect(result.totalPvpWins).toBe(10);
      expect(result.bestPvpWinStreak).toBe(5);
      expect(result.highestCharacterLevel).toBe(12);
      expect(result.totalCrafts).toBe(50);
      expect(result.totalDeaths).toBe(2);
      expect(result.totalTurnsSpent).toBe(9999);
    });

    it('returns zeros when player has no stats', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{
        total_kills: 0,
        total_boss_kills: 0,
        total_boss_damage: 0,
        total_pvp_wins: 0,
        best_pvp_win_streak: 0,
        total_zones_discovered: 0,
        total_zones_fully_explored: 0,
        total_recipes_learned: 0,
        total_bestiary_completed: 0,
        total_unique_monster_kills: 0,
        highest_character_level: 1,
        highest_skill_level: 1,
      }]);
      mockPrisma.playerStats.findUnique.mockResolvedValue(null);

      const result = await resolveAllStats('p1');
      expect(result.totalKills).toBe(0);
      expect(result.totalCrafts).toBe(0);
      expect(result.totalDeaths).toBe(0);
    });
  });

  describe('resolveFamilyKills', () => {
    it('returns kill count from raw SQL query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ kills: 42 }]);

      const result = await resolveFamilyKills('p1', 'wolves-family-id');
      expect(result).toBe(42);
    });

    it('returns 0 when no kills found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ kills: 0 }]);

      const result = await resolveFamilyKills('p1', 'wolves-family-id');
      expect(result).toBe(0);
    });
  });

  describe('resolveAllFamilyKills', () => {
    it('returns map of family ID to kill count', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { mob_family_id: 'f1', kills: 10 },
        { mob_family_id: 'f2', kills: 25 },
      ]);

      const result = await resolveAllFamilyKills('p1');
      expect(result.get('f1')).toBe(10);
      expect(result.get('f2')).toBe(25);
      expect(result.size).toBe(2);
    });
  });
});
