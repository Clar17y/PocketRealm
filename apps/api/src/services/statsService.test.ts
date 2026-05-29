import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { incrementStats, resolveAllStats, resolveCrownStats, resolveFamilyKills, resolveAllFamilyKills, resolveStats } from './statsService';

describe('statsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.playerCrown.findMany.mockResolvedValue([]);
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

    it('includes crown stats for achievement progress', async () => {
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
      mockPrisma.playerCrown.findMany.mockResolvedValue([
        { category: 'pvp_wins' },
        { category: 'pvp_rating' },
        { category: 'skill_alchemy' },
      ]);

      const result = await resolveAllStats('p1');

      expect(result.crowns_pvp).toBe(2);
      expect(result.crowns_crafting).toBe(1);
      expect(result.crowns_combat).toBe(0);
    });

    it('includes vocation mastery stats from vocation rows and counters', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{
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
        }])
        .mockResolvedValueOnce([{
          guild_level: 0,
          guild_contracts_completed: 0,
          guild_turns_contributed: 0,
          guild_member_count: 0,
        }])
        .mockResolvedValueOnce([{
          highest_vocation_rank: 12,
          vocation_rank_5_count: 3,
          vocation_rank_10_count: 1,
          vocation_rank_20_count: 0,
          total_vocation_techniques_learned: 9,
          vocation_technique_vocation_count: 4,
        }])
        .mockResolvedValueOnce([
          { stat_key: 'vocation_honed_turns_total', value: 3100 },
          { stat_key: 'vocation_honed_turns_weaponsmith', value: 1400 },
          { stat_key: 'vocation_honed_turns_tailor', value: 900 },
          { stat_key: 'vocation_crafts_weaponsmith', value: 80 },
          { stat_key: 'vocation_crafts_tailor', value: 20 },
          { stat_key: 'vocation_gathers_prospector', value: 55 },
          { stat_key: 'vocation_technique_uses_weaponsmith_blood_groove', value: 18 },
          { stat_key: 'vocation_technique_uses_prospector_bright_inclusion', value: 9 },
          { stat_key: 'vocation_mark_crafted_weaponsmith_blood_groove_blood_groove_mark', value: 12 },
          { stat_key: 'vocation_mark_crafted_tailor_pocket_layout_pocket_layout_mark', value: 4 },
          { stat_key: 'vocation_gather_crits_prospector_bright_inclusion_gem_crit', value: 7 },
          { stat_key: 'vocation_respecs_total', value: 2 },
        ]);
      mockPrisma.playerStats.findUnique.mockResolvedValue(null);

      const result = await resolveAllStats('p1');

      expect(result.totalVocationHonedTurns).toBe(3100);
      expect(result.vocationHonedTurns_weaponsmith).toBe(1400);
      expect(result.vocationHonedTurns_tailor).toBe(900);
      expect(result.highestVocationRank).toBe(12);
      expect(result.vocationRank5Count).toBe(3);
      expect(result.vocationRank10Count).toBe(1);
      expect(result.totalVocationTechniquesLearned).toBe(9);
      expect(result.vocationTechniqueVocationCount).toBe(4);
      expect(result.totalVocationCrafts).toBe(100);
      expect(result.vocationCrafts_weaponsmith).toBe(80);
      expect(result.totalVocationGathers).toBe(55);
      expect(result.vocationGathers_prospector).toBe(55);
      expect(result.totalVocationTechniqueUses).toBe(27);
      expect(result.distinctVocationTechniquesUsed).toBe(2);
      expect(result.totalVocationCraftMarks).toBe(16);
      expect(result.distinctVocationCraftMarks).toBe(2);
      expect(result.totalVocationGatherCrits).toBe(7);
      expect(result.totalVocationRespecs).toBe(2);
    });
  });

  describe('resolveCrownStats', () => {
    it('counts player crowns by category group', async () => {
      mockPrisma.playerCrown.findMany.mockResolvedValue([
        { category: 'pvp_wins' },
        { category: 'boss_damage' },
        { category: 'skill_foraging' },
        { category: 'guild_level' },
      ]);

      const result = await resolveCrownStats('p1');

      expect(result).toMatchObject({
        crowns_pvp: 1,
        crowns_combat: 1,
        crowns_gathering: 1,
        crowns_crafting: 0,
      });
      expect(result).not.toHaveProperty('crowns_guild');
    });

    it('resolves requested crown stat keys', async () => {
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
      mockPrisma.playerCrown.findMany.mockResolvedValue([
        { category: 'pvp_wins' },
        { category: 'pvp_rating' },
      ]);

      const result = await resolveStats('p1', ['crowns_pvp']);

      expect(result).toEqual({ crowns_pvp: 2 });
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
