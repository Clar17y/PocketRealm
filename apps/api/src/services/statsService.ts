import { Prisma, prisma } from '@pocketrealm/database';
import { CROWN_CONSTANTS, getAllMobPrefixes, VOCATION_IDS, type VocationId } from '@pocketrealm/shared';

// Counter-only keys that remain in the player_stats table
type CounterKey =
  | 'totalCrafts' | 'totalRaresCrafted'
  | 'totalEpicsCrafted' | 'totalLegendariesCrafted'
  | 'totalSalvages' | 'totalForgeUpgrades'
  | 'totalGatheringActions' | 'totalTurnsSpent'
  | 'totalDeaths' | 'tutorialCompleted'
  | 'totalBetsPlaced' | 'totalGoldWagered'
  | 'totalTurnsExchanged' | 'peakGoldHeld';

export type StatsIncrements = Partial<Record<CounterKey, number>>;

// All stat keys used by the achievement system
export type DerivedStatKey =
  | 'totalKills' | 'totalBossKills' | 'totalBossDamage'
  | 'totalPvpWins' | 'bestPvpWinStreak'
  | 'totalZonesDiscovered' | 'totalZonesFullyExplored'
  | 'totalRecipesLearned' | 'totalBestiaryCompleted'
  | 'totalUniqueMonsterKills'
  | 'highestCharacterLevel' | 'highestSkillLevel'
  | 'guildLevel' | 'guildContractsCompleted' | 'guildTurnsContributed' | 'guildMemberCount'
  | VocationSummaryStatKey | VocationHonedTurnsKey | VocationCraftsKey | VocationGathersKey;

type CrownGroup = keyof typeof CROWN_CONSTANTS.CATEGORY_GROUPS;
type CrownStatKey = `crowns_${CrownGroup}`;
type VocationHonedTurnsKey = `vocationHonedTurns_${VocationId}`;
type VocationCraftsKey = `vocationCrafts_${VocationId}`;
type VocationGathersKey = `vocationGathers_${VocationId}`;
type VocationSummaryStatKey =
  | 'totalVocationHonedTurns'
  | 'highestVocationRank'
  | 'vocationRank5Count'
  | 'vocationRank10Count'
  | 'vocationRank20Count'
  | 'totalVocationTechniquesLearned'
  | 'vocationTechniqueVocationCount'
  | 'totalVocationTechniqueUses'
  | 'distinctVocationTechniquesUsed'
  | 'totalVocationCrafts'
  | 'totalVocationGathers'
  | 'totalVocationCraftMarks'
  | 'distinctVocationCraftMarks'
  | 'totalVocationGatherCrits'
  | 'totalVocationRespecs';

export type StatKey = CounterKey | DerivedStatKey | CrownStatKey;

export type ResolvedStats = Record<StatKey, number> & Record<string, number>;

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

interface GuildStatRow {
  guild_level: number;
  guild_contracts_completed: number;
  guild_turns_contributed: number;
  guild_member_count: number;
}

interface VocationProgressStatRow {
  highest_vocation_rank?: number;
  vocation_rank_5_count?: number;
  vocation_rank_10_count?: number;
  vocation_rank_20_count?: number;
  total_vocation_techniques_learned?: number;
  vocation_technique_vocation_count?: number;
}

interface VocationCounterStatRow {
  stat_key?: string | null;
  value?: number | bigint | null;
}

type VocationStatKey = VocationSummaryStatKey | VocationHonedTurnsKey | VocationCraftsKey | VocationGathersKey;
type VocationStats = Record<VocationStatKey, number> & Record<string, number>;

function toStatNumber(value: unknown): number {
  const numeric = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

async function resolveGuildStats(playerId: string): Promise<GuildStatRow> {
  const rows = await prisma.$queryRaw<GuildStatRow[]>(Prisma.sql`
    SELECT
      COALESCE(g.level, 0)::int AS guild_level,
      COALESCE((
        SELECT COUNT(*)::int FROM guild_contracts gc
        WHERE gc.guild_id = gm.guild_id AND gc.status = 'completed'
      ), 0) AS guild_contracts_completed,
      COALESCE(gm.total_turns_contributed, 0)::int AS guild_turns_contributed,
      COALESCE((
        SELECT COUNT(*)::int FROM guild_members gm2
        WHERE gm2.guild_id = gm.guild_id
      ), 0) AS guild_member_count
    FROM guild_members gm
    JOIN guilds g ON g.id = gm.guild_id
    WHERE gm.player_id = ${playerId}
    LIMIT 1
  `);
  const row = rows[0];
  return {
    guild_level: toStatNumber(row?.guild_level),
    guild_contracts_completed: toStatNumber(row?.guild_contracts_completed),
    guild_turns_contributed: toStatNumber(row?.guild_turns_contributed),
    guild_member_count: toStatNumber(row?.guild_member_count),
  };
}

async function resolveVocationStats(playerId: string): Promise<VocationStats> {
  const [progressRows, counterRows] = await Promise.all([
    prisma.$queryRaw<VocationProgressStatRow[]>(Prisma.sql`
      SELECT
        COALESCE(MAX(rank), 0)::int AS highest_vocation_rank,
        COUNT(*) FILTER (WHERE rank >= 5)::int AS vocation_rank_5_count,
        COUNT(*) FILTER (WHERE rank >= 10)::int AS vocation_rank_10_count,
        COUNT(*) FILTER (WHERE rank >= 20)::int AS vocation_rank_20_count,
        COALESCE((
          SELECT COUNT(*)::int
          FROM player_vocation_techniques pvt
          WHERE pvt.player_id = ${playerId}
        ), 0) AS total_vocation_techniques_learned,
        COALESCE((
          SELECT COUNT(DISTINCT pvt.vocation_id)::int
          FROM player_vocation_techniques pvt
          WHERE pvt.player_id = ${playerId}
        ), 0) AS vocation_technique_vocation_count
      FROM player_vocations pv
      WHERE pv.player_id = ${playerId}
    `),
    prisma.$queryRaw<VocationCounterStatRow[]>(Prisma.sql`
      SELECT stat_key, value
      FROM player_vocation_counters
      WHERE player_id = ${playerId}
    `),
  ]);

  const stats = buildEmptyVocationStats();
  const progress = progressRows[0];
  stats.highestVocationRank = toStatNumber(progress?.highest_vocation_rank);
  stats.vocationRank5Count = toStatNumber(progress?.vocation_rank_5_count);
  stats.vocationRank10Count = toStatNumber(progress?.vocation_rank_10_count);
  stats.vocationRank20Count = toStatNumber(progress?.vocation_rank_20_count);
  stats.totalVocationTechniquesLearned = toStatNumber(progress?.total_vocation_techniques_learned);
  stats.vocationTechniqueVocationCount = toStatNumber(progress?.vocation_technique_vocation_count);

  let summedHonedTurns = 0;
  for (const row of counterRows) {
    if (typeof row.stat_key !== 'string') continue;

    const value = toStatNumber(row.value);
    if (row.stat_key === 'vocation_honed_turns_total') {
      stats.totalVocationHonedTurns = value;
      continue;
    }
    if (row.stat_key.startsWith('vocation_mark_crafted_')) {
      stats.totalVocationCraftMarks += value;
      if (value > 0) stats.distinctVocationCraftMarks += 1;
      continue;
    }
    if (row.stat_key.startsWith('vocation_technique_uses_')) {
      const techniqueId = row.stat_key.slice('vocation_technique_uses_'.length);
      stats.totalVocationTechniqueUses += value;
      if (value > 0) stats.distinctVocationTechniquesUsed += 1;
      stats[`vocationTechniqueUses_${techniqueId}`] = value;
      continue;
    }
    if (row.stat_key.startsWith('vocation_gather_crits_')) {
      stats.totalVocationGatherCrits += value;
      continue;
    }
    if (row.stat_key === 'vocation_respecs_total') {
      stats.totalVocationRespecs = value;
      continue;
    }

    for (const vocationId of VOCATION_IDS) {
      if (row.stat_key === `vocation_honed_turns_${vocationId}`) {
        stats[`vocationHonedTurns_${vocationId}`] = value;
        summedHonedTurns += value;
        break;
      }
      if (row.stat_key === `vocation_crafts_${vocationId}`) {
        stats[`vocationCrafts_${vocationId}`] = value;
        stats.totalVocationCrafts += value;
        break;
      }
      if (row.stat_key === `vocation_gathers_${vocationId}`) {
        stats[`vocationGathers_${vocationId}`] = value;
        stats.totalVocationGathers += value;
        break;
      }
      if (row.stat_key === `vocation_respecs_${vocationId}`) {
        stats[`vocationRespecs_${vocationId}`] = value;
        break;
      }
    }
  }

  if (stats.totalVocationHonedTurns === 0 && summedHonedTurns > 0) {
    stats.totalVocationHonedTurns = summedHonedTurns;
  }

  return stats;
}

function buildEmptyVocationStats(): VocationStats {
  const stats = {
    totalVocationHonedTurns: 0,
    highestVocationRank: 0,
    vocationRank5Count: 0,
    vocationRank10Count: 0,
    vocationRank20Count: 0,
    totalVocationTechniquesLearned: 0,
    vocationTechniqueVocationCount: 0,
    totalVocationTechniqueUses: 0,
    distinctVocationTechniquesUsed: 0,
    totalVocationCrafts: 0,
    totalVocationGathers: 0,
    totalVocationCraftMarks: 0,
    distinctVocationCraftMarks: 0,
    totalVocationGatherCrits: 0,
    totalVocationRespecs: 0,
  } as VocationStats;

  for (const vocationId of VOCATION_IDS) {
    stats[`vocationHonedTurns_${vocationId}`] = 0;
    stats[`vocationCrafts_${vocationId}`] = 0;
    stats[`vocationGathers_${vocationId}`] = 0;
  }

  return stats;
}

export async function resolveCrownStats(playerId: string): Promise<Record<CrownStatKey, number>> {
  const crowns = await prisma.playerCrown.findMany({
    where: { playerId },
    select: { category: true },
  });

  const counts = {} as Record<CrownStatKey, number>;
  for (const group of Object.keys(CROWN_CONSTANTS.CATEGORY_GROUPS) as CrownGroup[]) {
    const key = `crowns_${group}` as CrownStatKey;
    counts[key] = 0;
  }

  for (const crown of crowns) {
    for (const group of Object.keys(CROWN_CONSTANTS.CATEGORY_GROUPS) as CrownGroup[]) {
      if (CROWN_CONSTANTS.CATEGORY_GROUPS[group].includes(crown.category)) {
        counts[`crowns_${group}` as CrownStatKey]++;
        break;
      }
    }
  }

  return counts;
}

/** Resolve all stats (derived + counters) for a player in a single call. */
export async function resolveAllStats(playerId: string): Promise<ResolvedStats> {
  const [derivedRows, counters, guildStats, crownStats, vocationStats] = await Promise.all([
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
    resolveGuildStats(playerId),
    resolveCrownStats(playerId),
    resolveVocationStats(playerId),
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
    totalBetsPlaced: counters?.totalBetsPlaced ?? 0,
    totalGoldWagered: counters?.totalGoldWagered ?? 0,
    totalTurnsExchanged: counters?.totalTurnsExchanged ?? 0,
    peakGoldHeld: counters?.peakGoldHeld ?? 0,
    guildLevel: guildStats.guild_level,
    guildContractsCompleted: guildStats.guild_contracts_completed,
    guildTurnsContributed: guildStats.guild_turns_contributed,
    guildMemberCount: guildStats.guild_member_count,
    ...vocationStats,
    ...crownStats,
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
