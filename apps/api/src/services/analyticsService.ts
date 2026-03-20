import { Prisma, prisma } from '@pocketrealm/database';
import { cachedQuery } from './cacheService';

interface SkillDistEntry {
  avg: number;
  median: number;
  p90: number;
  playerCount: number;
}

interface TurnDistEntry {
  totalTurns: number;
  actionCount: number;
  avgTurnsPerAction: number;
}

interface XpEffEntry {
  totalXpGained: number;
  totalTurnsSpent: number;
  xpPerTurn: number;
}

interface ProgressionEntry {
  atLevel5: number;
  atLevel10: number;
  atLevel15: number;
  atLevel20: number;
  atLevel30: number;
}

interface ZoneActivityEntry {
  totalTurns: number;
  actionCount: number;
  uniquePlayers: number;
}

export interface BalanceReport {
  period: string;
  generatedAt: string;
  activePlayers: number;
  skillDistribution: Record<string, SkillDistEntry>;
  turnDistribution: Record<string, TurnDistEntry>;
  xpEfficiency: Record<string, XpEffEntry>;
  progressionVelocity: Record<string, ProgressionEntry>;
  zoneActivity: Record<string, ZoneActivityEntry>;
}

const PERIOD_MAP: Record<string, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export type BalancePeriod = '1h' | '24h' | '7d' | '30d';

export async function getBalanceReport(period: BalancePeriod): Promise<BalanceReport> {
  const intervalSql = PERIOD_MAP[period] ?? '7 days';
  const cacheKey = `analytics:balance:v1:${period}`;

  return cachedQuery(cacheKey, async () => {
    // SAFETY: intervalSql is always from PERIOD_MAP (hardcoded values), never user input
    const cutoff = Prisma.sql`NOW() - INTERVAL ${Prisma.raw(`'${intervalSql}'`)}`;

    // Active players in period
    const activeResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT player_id) as count
      FROM activity_logs
      WHERE created_at >= ${cutoff}
    `;
    const activePlayers = Number(activeResult[0].count);

    // Skill distribution for active players
    const skillDist = await prisma.$queryRaw<Array<{
      skill_type: string;
      avg_level: number;
      median_level: number;
      p90_level: number;
      player_count: bigint;
    }>>`
      SELECT
        ps.skill_type,
        ROUND(AVG(ps.level)::numeric, 1) as avg_level,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ps.level)::numeric, 1) as median_level,
        ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ps.level)::numeric, 1) as p90_level,
        COUNT(*) as player_count
      FROM player_skills ps
      WHERE ps.player_id IN (
        SELECT DISTINCT player_id FROM activity_logs WHERE created_at >= ${cutoff}
      )
      AND ps.level >= 1
      GROUP BY ps.skill_type
      ORDER BY ps.skill_type
    `;

    const skillDistribution: Record<string, SkillDistEntry> = {};
    for (const row of skillDist) {
      skillDistribution[row.skill_type] = {
        avg: Number(row.avg_level),
        median: Number(row.median_level),
        p90: Number(row.p90_level),
        playerCount: Number(row.player_count),
      };
    }

    // Turn distribution by activity type
    const turnDist = await prisma.$queryRaw<Array<{
      activity_type: string;
      total_turns: bigint;
      action_count: bigint;
    }>>`
      SELECT
        activity_type,
        COALESCE(SUM(turns_spent), 0) as total_turns,
        COUNT(*) as action_count
      FROM activity_logs
      WHERE created_at >= ${cutoff}
      GROUP BY activity_type
      ORDER BY total_turns DESC
    `;

    const turnDistribution: Record<string, TurnDistEntry> = {};
    for (const row of turnDist) {
      const total = Number(row.total_turns);
      const count = Number(row.action_count);
      turnDistribution[row.activity_type] = {
        totalTurns: total,
        actionCount: count,
        avgTurnsPerAction: count > 0 ? Math.round(total / count) : 0,
      };
    }

    // XP efficiency by skill category
    const xpEff = await prisma.$queryRaw<Array<{
      category: string;
      total_xp: number;
      total_turns: bigint;
    }>>`
      SELECT category, COALESCE(SUM(xp), 0) as total_xp, COALESCE(SUM(turns_spent), 0) as total_turns
      FROM (
        -- Combat XP (sum all skillXpGrants entries, not just first)
        SELECT
          'combat' as category,
          COALESCE(g.xp, 0) as xp,
          a.turns_spent
        FROM activity_logs a
        LEFT JOIN LATERAL (
          SELECT SUM((elem->>'xpAfterEfficiency')::numeric) as xp
          FROM jsonb_array_elements(a.result->'rewards'->'skillXpGrants') as elem
        ) g ON true
        WHERE a.activity_type = 'combat'
          AND a.created_at >= ${cutoff}

        UNION ALL

        -- Gathering XP
        SELECT
          activity_type as category,
          COALESCE((result->'xp'->>'xpAfterEfficiency')::numeric, 0) as xp,
          turns_spent
        FROM activity_logs
        WHERE activity_type IN ('mining', 'foraging', 'woodcutting')
          AND created_at >= ${cutoff}

        UNION ALL

        -- Crafting XP
        SELECT
          'crafting' as category,
          COALESCE((result->'xp'->>'xpAfterEfficiency')::numeric, 0) as xp,
          turns_spent
        FROM activity_logs
        WHERE activity_type = 'crafting'
          AND created_at >= ${cutoff}
      ) sub
      GROUP BY category
      ORDER BY category
    `;

    const xpEfficiency: Record<string, XpEffEntry> = {};
    for (const row of xpEff) {
      const totalXp = Number(row.total_xp);
      const totalTurns = Number(row.total_turns);
      xpEfficiency[row.category] = {
        totalXpGained: Math.round(totalXp),
        totalTurnsSpent: totalTurns,
        xpPerTurn: totalTurns > 0 ? Math.round((totalXp / totalTurns) * 100) / 100 : 0,
      };
    }

    // Progression velocity
    const progression = await prisma.$queryRaw<Array<{
      skill_type: string;
      at_5: bigint;
      at_10: bigint;
      at_15: bigint;
      at_20: bigint;
      at_30: bigint;
    }>>`
      SELECT
        ps.skill_type,
        COUNT(*) FILTER (WHERE ps.level >= 5) as at_5,
        COUNT(*) FILTER (WHERE ps.level >= 10) as at_10,
        COUNT(*) FILTER (WHERE ps.level >= 15) as at_15,
        COUNT(*) FILTER (WHERE ps.level >= 20) as at_20,
        COUNT(*) FILTER (WHERE ps.level >= 30) as at_30
      FROM player_skills ps
      WHERE ps.player_id IN (
        SELECT DISTINCT player_id FROM activity_logs WHERE created_at >= ${cutoff}
      )
      GROUP BY ps.skill_type
      ORDER BY ps.skill_type
    `;

    const progressionVelocity: Record<string, ProgressionEntry> = {};
    for (const row of progression) {
      const pct = (n: bigint) => activePlayers > 0 ? Math.round((Number(n) / activePlayers) * 100) : 0;
      progressionVelocity[row.skill_type] = {
        atLevel5: pct(row.at_5),
        atLevel10: pct(row.at_10),
        atLevel15: pct(row.at_15),
        atLevel20: pct(row.at_20),
        atLevel30: pct(row.at_30),
      };
    }

    // Zone activity
    const zoneAct = await prisma.$queryRaw<Array<{
      zone_name: string;
      total_turns: bigint;
      action_count: bigint;
      unique_players: bigint;
    }>>`
      SELECT
        zone_name,
        COALESCE(SUM(turns_spent), 0) as total_turns,
        COUNT(*) as action_count,
        COUNT(DISTINCT player_id) as unique_players
      FROM (
        SELECT
          player_id,
          turns_spent,
          COALESCE(
            result->>'zoneName',
            result->'zone'->>'name',
            'unknown'
          ) as zone_name
        FROM activity_logs
        WHERE created_at >= ${cutoff}
          AND activity_type IN ('combat', 'exploration', 'mining', 'foraging', 'woodcutting')
      ) sub
      WHERE zone_name != 'unknown'
      GROUP BY zone_name
      ORDER BY total_turns DESC
    `;

    const zoneActivity: Record<string, ZoneActivityEntry> = {};
    for (const row of zoneAct) {
      zoneActivity[row.zone_name] = {
        totalTurns: Number(row.total_turns),
        actionCount: Number(row.action_count),
        uniquePlayers: Number(row.unique_players),
      };
    }

    return {
      period,
      generatedAt: new Date().toISOString(),
      activePlayers,
      skillDistribution,
      turnDistribution,
      xpEfficiency,
      progressionVelocity,
      zoneActivity,
    };
  }, 600); // 10 minute cache
}
