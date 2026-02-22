import { Prisma, prisma } from '@adventure/database';
import { getAllMobPrefixes } from '@adventure/shared';

// Counter-only keys that remain in the player_stats table
type CounterKey =
  | 'totalCrafts' | 'totalRaresCrafted'
  | 'totalEpicsCrafted' | 'totalLegendariesCrafted'
  | 'totalSalvages' | 'totalForgeUpgrades'
  | 'totalGatheringActions' | 'totalTurnsSpent'
  | 'totalDeaths' | 'tutorialCompleted';

export type StatsIncrements = Partial<Record<CounterKey, number>>;

// All stat keys used by the achievement system
export type DerivedStatKey =
  | 'totalKills' | 'totalBossKills' | 'totalBossDamage'
  | 'totalPvpWins' | 'bestPvpWinStreak'
  | 'totalZonesDiscovered' | 'totalZonesFullyExplored'
  | 'totalRecipesLearned' | 'totalBestiaryCompleted'
  | 'totalUniqueMonsterKills'
  | 'highestCharacterLevel' | 'highestSkillLevel';

export type StatKey = CounterKey | DerivedStatKey;

export type ResolvedStats = Record<StatKey, number>;

const TOTAL_PREFIX_COUNT = getAllMobPrefixes().length;

// ---------------------------------------------------------------------------
// Counter persistence (player_stats table — only non-derivable counters)
// ---------------------------------------------------------------------------

export async function incrementStats(playerId: string, increments: StatsIncrements) {
  const createData: Record<string, number> = {};
  const updateData: Record<string, { increment: number }> = {};

  for (const [key, value] of Object.entries(increments)) {
    if (value && value > 0) {
      createData[key] = value;
      updateData[key] = { increment: value };
    }
  }

  if (Object.keys(updateData).length === 0) return;

  return prisma.playerStats.upsert({
    where: { playerId },
    create: { playerId, ...createData },
    update: updateData,
  });
}

// ---------------------------------------------------------------------------
// Derived stat resolution — queries source-of-truth tables
// ---------------------------------------------------------------------------

interface DerivedRow {
  total_kills: number;
  total_boss_kills: number;
  total_boss_damage: number;
  total_pvp_wins: number;
  best_pvp_win_streak: number;
  total_zones_discovered: number;
  total_zones_fully_explored: number;
  total_recipes_learned: number;
  total_bestiary_completed: number;
  total_unique_monster_kills: number;
  highest_character_level: number;
  highest_skill_level: number;
}

/** Resolve all stats (derived + counters) for a player in a single call. */
export async function resolveAllStats(playerId: string): Promise<ResolvedStats> {
  const [derivedRows, counters] = await Promise.all([
    prisma.$queryRaw<DerivedRow[]>(Prisma.sql`
      SELECT
        COALESCE((SELECT SUM(kills)::int FROM player_bestiary WHERE player_id = ${playerId}), 0) AS total_kills,
        COALESCE((
          SELECT COUNT(DISTINCT bp.encounter_id)::int
          FROM boss_participants bp
          JOIN boss_encounters be ON be.id = bp.encounter_id
          WHERE bp.player_id = ${playerId} AND be.status = 'defeated'
        ), 0) AS total_boss_kills,
        COALESCE((SELECT SUM(total_damage)::int FROM boss_participants WHERE player_id = ${playerId}), 0) AS total_boss_damage,
        COALESCE((SELECT wins FROM pvp_ratings WHERE player_id = ${playerId}), 0) AS total_pvp_wins,
        COALESCE((SELECT best_win_streak FROM pvp_ratings WHERE player_id = ${playerId}), 0) AS best_pvp_win_streak,
        COALESCE((SELECT COUNT(*)::int FROM player_zone_discoveries WHERE player_id = ${playerId}), 0) AS total_zones_discovered,
        COALESCE((
          SELECT COUNT(*)::int
          FROM player_zone_explorations pze
          JOIN zones z ON z.id = pze.zone_id
          WHERE pze.player_id = ${playerId}
            AND z.turns_to_explore IS NOT NULL
            AND pze.turns_explored >= z.turns_to_explore
        ), 0) AS total_zones_fully_explored,
        COALESCE((SELECT COUNT(*)::int FROM player_recipes WHERE player_id = ${playerId}), 0) AS total_recipes_learned,
        COALESCE((
          SELECT COUNT(*)::int FROM (
            SELECT pb.mob_template_id
            FROM player_bestiary_prefixes pb
            WHERE pb.player_id = ${playerId}
            GROUP BY pb.mob_template_id
            HAVING COUNT(DISTINCT pb.prefix) >= ${TOTAL_PREFIX_COUNT}
          ) completed
        ), 0) AS total_bestiary_completed,
        COALESCE((SELECT COUNT(*)::int FROM player_bestiary WHERE player_id = ${playerId} AND kills > 0), 0) AS total_unique_monster_kills,
        COALESCE((SELECT character_level FROM players WHERE id = ${playerId}), 1) AS highest_character_level,
        COALESCE((SELECT MAX(level) FROM player_skills WHERE player_id = ${playerId}), 1) AS highest_skill_level
    `),
    prisma.playerStats.findUnique({ where: { playerId } }),
  ]);

  const d = derivedRows[0]!;

  return {
    totalKills: d.total_kills,
    totalBossKills: d.total_boss_kills,
    totalBossDamage: d.total_boss_damage,
    totalPvpWins: d.total_pvp_wins,
    bestPvpWinStreak: d.best_pvp_win_streak,
    totalZonesDiscovered: d.total_zones_discovered,
    totalZonesFullyExplored: d.total_zones_fully_explored,
    totalRecipesLearned: d.total_recipes_learned,
    totalBestiaryCompleted: d.total_bestiary_completed,
    totalUniqueMonsterKills: d.total_unique_monster_kills,
    highestCharacterLevel: d.highest_character_level,
    highestSkillLevel: d.highest_skill_level,
    totalCrafts: counters?.totalCrafts ?? 0,
    totalRaresCrafted: counters?.totalRaresCrafted ?? 0,
    totalEpicsCrafted: counters?.totalEpicsCrafted ?? 0,
    totalLegendariesCrafted: counters?.totalLegendariesCrafted ?? 0,
    totalSalvages: counters?.totalSalvages ?? 0,
    totalForgeUpgrades: counters?.totalForgeUpgrades ?? 0,
    totalGatheringActions: counters?.totalGatheringActions ?? 0,
    totalTurnsSpent: counters?.totalTurnsSpent ?? 0,
    totalDeaths: counters?.totalDeaths ?? 0,
    tutorialCompleted: counters?.tutorialCompleted ?? 0,
  };
}

/** Resolve a subset of stats by key. Uses the same batch query for simplicity. */
export async function resolveStats(playerId: string, statKeys: string[]): Promise<Record<string, number>> {
  const all = await resolveAllStats(playerId);
  const result: Record<string, number> = {};
  for (const key of statKeys) {
    if (key in all) {
      result[key] = all[key as StatKey];
    }
  }
  return result;
}

/** Resolve total kills for a specific mob family (derived from bestiary + mob_family_members). */
export async function resolveFamilyKills(playerId: string, mobFamilyId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ kills: number }[]>(Prisma.sql`
    SELECT COALESCE(SUM(pb.kills)::int, 0) AS kills
    FROM player_bestiary pb
    JOIN mob_family_members mfm ON mfm.mob_template_id = pb.mob_template_id
    WHERE pb.player_id = ${playerId}
      AND mfm.mob_family_id = ${mobFamilyId}
  `);
  return rows[0]?.kills ?? 0;
}

/** Resolve family kills for all families a player has killed mobs in. */
export async function resolveAllFamilyKills(playerId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ mob_family_id: string; kills: number }[]>(Prisma.sql`
    SELECT mfm.mob_family_id, COALESCE(SUM(pb.kills)::int, 0) AS kills
    FROM player_bestiary pb
    JOIN mob_family_members mfm ON mfm.mob_template_id = pb.mob_template_id
    WHERE pb.player_id = ${playerId}
    GROUP BY mfm.mob_family_id
  `);
  return new Map(rows.map((r) => [r.mob_family_id, r.kills]));
}
