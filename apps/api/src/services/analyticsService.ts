import { Prisma, prisma } from '@pocketrealm/database';
import { TUTORIAL_COMPLETED, TUTORIAL_SKIPPED } from '@pocketrealm/shared';
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
  uniquePlayers: number;
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

interface OnboardingReport {
  newAccounts: number;
  newPlayers: number;
  activatedPlayers: number;
  activationRate: number;
  firstCombatPlayers: number;
  firstGatheringPlayers: number;
  firstCraftingPlayers: number;
  firstExplorationPlayers: number;
}

interface TutorialReport {
  completed: number;
  skipped: number;
  inProgress: number;
  notStarted: number;
  completionRate: number;
  byStep: Record<string, number>;
}

interface RetentionReport {
  activeInPeriod: number;
  returningActivePlayers: number;
  eligibleNewPlayers: number;
  returnedNextDay: number;
  nextDayRetentionRate: number;
}

interface FrictionReport {
  newPlayersWithoutActions: number;
  activePlayersBelowLevel5: number;
  staleTutorialPlayers: number;
  deaths: Record<string, { count: number; uniquePlayers: number }>;
}

export interface BalanceReport {
  period: string;
  generatedAt: string;
  activePlayers: number;
  onboarding: OnboardingReport;
  tutorial: TutorialReport;
  retention: RetentionReport;
  friction: FrictionReport;
  skillDistribution: Record<string, SkillDistEntry>;
  turnDistribution: Record<string, TurnDistEntry>;
  xpEfficiency: Record<string, XpEffEntry>;
  progressionVelocity: Record<string, ProgressionEntry>;
  zoneActivity: Record<string, ZoneActivityEntry>;
}

export type BalancePeriod = '1h' | '24h' | '7d' | '30d';

const CUTOFFS: Record<BalancePeriod, Prisma.Sql> = {
  '1h':  Prisma.sql`NOW() - INTERVAL '1 hour'`,
  '24h': Prisma.sql`NOW() - INTERVAL '24 hours'`,
  '7d':  Prisma.sql`NOW() - INTERVAL '7 days'`,
  '30d': Prisma.sql`NOW() - INTERVAL '30 days'`,
};

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export async function getBalanceReport(period: BalancePeriod): Promise<BalanceReport> {
  const cacheKey = `analytics:balance:v2:${period}`;

  return cachedQuery(cacheKey, async () => {
    const cutoff = CUTOFFS[period];

    // Run all queries in parallel; none depend on each other's results.
    const [
      activeResult,
      skillDist,
      turnDist,
      xpEff,
      progression,
      zoneAct,
      onboardingResult,
      tutorialRows,
      retentionResult,
      frictionResult,
      deathRows,
    ] = await Promise.all([
      // Active players in period
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(DISTINCT a.player_id) as count
        FROM activity_logs a
        JOIN players p ON p.id = a.player_id
        WHERE a.created_at >= ${cutoff}
          AND p.is_bot = false
      `,

      // Skill distribution for active players
      prisma.$queryRaw<Array<{
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
        JOIN players p ON p.id = ps.player_id
        WHERE ps.player_id IN (
          SELECT DISTINCT player_id FROM activity_logs WHERE created_at >= ${cutoff}
        )
        AND p.is_bot = false
        AND ps.level >= 1
        GROUP BY ps.skill_type
        ORDER BY ps.skill_type
      `,

      // Turn distribution by activity type
      prisma.$queryRaw<Array<{
        activity_type: string;
        total_turns: bigint;
        action_count: bigint;
        unique_players: bigint;
      }>>`
        SELECT
          a.activity_type,
          COALESCE(SUM(a.turns_spent), 0) as total_turns,
          COUNT(*) as action_count,
          COUNT(DISTINCT a.player_id) as unique_players
        FROM activity_logs a
        JOIN players p ON p.id = a.player_id
        WHERE a.created_at >= ${cutoff}
          AND p.is_bot = false
        GROUP BY a.activity_type
        ORDER BY total_turns DESC
      `,

      // XP efficiency by skill category
      prisma.$queryRaw<Array<{
        category: string;
        total_xp: number;
        total_turns: bigint;
      }>>`
        SELECT category, COALESCE(SUM(xp), 0) as total_xp, COALESCE(SUM(turns_spent), 0) as total_turns
        FROM (
          SELECT
            'combat' as category,
            COALESCE(g.xp, 0) as xp,
            a.turns_spent
          FROM activity_logs a
          JOIN players p ON p.id = a.player_id
          LEFT JOIN LATERAL (
            SELECT SUM((elem->>'xpAfterEfficiency')::numeric) as xp
            FROM jsonb_array_elements(a.result->'rewards'->'skillXpGrants') as elem
          ) g ON true
          WHERE a.activity_type = 'combat'
            AND a.created_at >= ${cutoff}
            AND p.is_bot = false

          UNION ALL

          SELECT
            a.activity_type as category,
            COALESCE((a.result->'xp'->>'xpAfterEfficiency')::numeric, 0) as xp,
            a.turns_spent
          FROM activity_logs a
          JOIN players p ON p.id = a.player_id
          WHERE a.activity_type IN ('mining', 'foraging', 'woodcutting')
            AND a.created_at >= ${cutoff}
            AND p.is_bot = false

          UNION ALL

          SELECT
            'crafting' as category,
            COALESCE((a.result->'xp'->>'xpAfterEfficiency')::numeric, 0) as xp,
            a.turns_spent
          FROM activity_logs a
          JOIN players p ON p.id = a.player_id
          WHERE a.activity_type = 'crafting'
            AND a.created_at >= ${cutoff}
            AND p.is_bot = false
        ) sub
        GROUP BY category
        ORDER BY category
      `,

      // Progression velocity
      prisma.$queryRaw<Array<{
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
        JOIN players p ON p.id = ps.player_id
        WHERE ps.player_id IN (
          SELECT DISTINCT player_id FROM activity_logs WHERE created_at >= ${cutoff}
        )
        AND p.is_bot = false
        GROUP BY ps.skill_type
        ORDER BY ps.skill_type
      `,

      // Zone activity
      prisma.$queryRaw<Array<{
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
            a.player_id,
            a.turns_spent,
            COALESCE(
              a.result->>'zoneName',
              a.result->'zone'->>'name',
              'unknown'
            ) as zone_name
          FROM activity_logs a
          JOIN players p ON p.id = a.player_id
          WHERE a.created_at >= ${cutoff}
            AND a.activity_type IN ('combat', 'exploration', 'mining', 'foraging', 'woodcutting')
            AND p.is_bot = false
        ) sub
        WHERE zone_name != 'unknown'
        GROUP BY zone_name
        ORDER BY total_turns DESC
      `,

      // New-player activation funnel
      prisma.$queryRaw<Array<{
        new_accounts: bigint;
        new_players: bigint;
        activated_players: bigint;
        first_combat_players: bigint;
        first_gathering_players: bigint;
        first_crafting_players: bigint;
        first_exploration_players: bigint;
      }>>`
        WITH new_players AS (
          SELECT id
          FROM players
          WHERE is_bot = false
            AND created_at >= ${cutoff}
        )
        SELECT
          (SELECT COUNT(*) FROM accounts WHERE created_at >= ${cutoff}) as new_accounts,
          COUNT(*) as new_players,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM activity_logs a WHERE a.player_id = new_players.id
            )
          ) as activated_players,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM activity_logs a
              WHERE a.player_id = new_players.id
                AND a.activity_type = 'combat'
            )
          ) as first_combat_players,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM activity_logs a
              WHERE a.player_id = new_players.id
                AND a.activity_type IN ('mining', 'foraging', 'woodcutting')
            )
          ) as first_gathering_players,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM activity_logs a
              WHERE a.player_id = new_players.id
                AND a.activity_type = 'crafting'
            )
          ) as first_crafting_players,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM activity_logs a
              WHERE a.player_id = new_players.id
                AND a.activity_type = 'exploration'
            )
          ) as first_exploration_players
        FROM new_players
      `,

      // Tutorial status for players created in period
      prisma.$queryRaw<Array<{
        tutorial_step: number;
        player_count: bigint;
      }>>`
        SELECT tutorial_step, COUNT(*) as player_count
        FROM players
        WHERE is_bot = false
          AND created_at >= ${cutoff}
        GROUP BY tutorial_step
        ORDER BY tutorial_step
      `,

      // Retention snapshot
      prisma.$queryRaw<Array<{
        active_in_period: bigint;
        returning_active_players: bigint;
        eligible_new_players: bigint;
        returned_next_day: bigint;
      }>>`
        WITH active_period AS (
          SELECT DISTINCT p.id, p.created_at
          FROM players p
          JOIN activity_logs a ON a.player_id = p.id
          WHERE p.is_bot = false
            AND a.created_at >= ${cutoff}
        ),
        eligible_new_players AS (
          SELECT id, created_at
          FROM players
          WHERE is_bot = false
            AND created_at >= ${cutoff}
            AND created_at < NOW() - INTERVAL '24 hours'
        )
        SELECT
          (SELECT COUNT(*) FROM active_period) as active_in_period,
          (SELECT COUNT(*) FROM active_period WHERE created_at < ${cutoff}) as returning_active_players,
          (SELECT COUNT(*) FROM eligible_new_players) as eligible_new_players,
          (
            SELECT COUNT(*)
            FROM eligible_new_players p
            WHERE EXISTS (
              SELECT 1
              FROM activity_logs a
              WHERE a.player_id = p.id
                AND a.created_at >= p.created_at + INTERVAL '24 hours'
                AND a.created_at < p.created_at + INTERVAL '48 hours'
            )
          ) as returned_next_day
      `,

      // Friction summary
      prisma.$queryRaw<Array<{
        new_players_without_actions: bigint;
        active_players_below_level_5: bigint;
        stale_tutorial_players: bigint;
      }>>`
        WITH new_players AS (
          SELECT id, created_at, tutorial_step
          FROM players
          WHERE is_bot = false
            AND created_at >= ${cutoff}
        )
        SELECT
          (
            SELECT COUNT(*)
            FROM new_players p
            WHERE NOT EXISTS (
              SELECT 1 FROM activity_logs a WHERE a.player_id = p.id
            )
          ) as new_players_without_actions,
          (
            SELECT COUNT(DISTINCT p.id)
            FROM players p
            JOIN activity_logs a ON a.player_id = p.id
            WHERE p.is_bot = false
              AND p.character_level < 5
              AND a.created_at >= ${cutoff}
          ) as active_players_below_level_5,
          (
            SELECT COUNT(*)
            FROM new_players p
            WHERE p.created_at < NOW() - INTERVAL '24 hours'
              AND p.tutorial_step >= 0
              AND p.tutorial_step < ${TUTORIAL_COMPLETED}
          ) as stale_tutorial_players
      `,

      // Combat deaths by zone and mob
      prisma.$queryRaw<Array<{
        zone_name: string;
        mob_name: string;
        death_count: bigint;
        unique_players: bigint;
      }>>`
        SELECT
          COALESCE(a.result->>'zoneName', a.result->'zone'->>'name', 'unknown') as zone_name,
          COALESCE(a.result->>'mobDisplayName', a.result->>'mobName', 'unknown') as mob_name,
          COUNT(*) as death_count,
          COUNT(DISTINCT a.player_id) as unique_players
        FROM activity_logs a
        JOIN players p ON p.id = a.player_id
        WHERE a.created_at >= ${cutoff}
          AND a.activity_type = 'combat'
          AND p.is_bot = false
          AND a.result->>'outcome' IN ('defeat', 'defeated')
        GROUP BY zone_name, mob_name
        ORDER BY death_count DESC
        LIMIT 20
      `,
    ]);

    const activePlayers = Number(activeResult[0].count);

    const skillDistribution: Record<string, SkillDistEntry> = {};
    for (const row of skillDist) {
      skillDistribution[row.skill_type] = {
        avg: Number(row.avg_level),
        median: Number(row.median_level),
        p90: Number(row.p90_level),
        playerCount: Number(row.player_count),
      };
    }

    const turnDistribution: Record<string, TurnDistEntry> = {};
    for (const row of turnDist) {
      const total = Number(row.total_turns);
      const count = Number(row.action_count);
      turnDistribution[row.activity_type] = {
        totalTurns: total,
        actionCount: count,
        avgTurnsPerAction: count > 0 ? Math.round(total / count) : 0,
        uniquePlayers: Number(row.unique_players),
      };
    }

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

    const zoneActivity: Record<string, ZoneActivityEntry> = {};
    for (const row of zoneAct) {
      zoneActivity[row.zone_name] = {
        totalTurns: Number(row.total_turns),
        actionCount: Number(row.action_count),
        uniquePlayers: Number(row.unique_players),
      };
    }

    const onboardingRow = onboardingResult[0];
    const newPlayers = Number(onboardingRow.new_players);
    const activatedPlayers = Number(onboardingRow.activated_players);
    const onboarding: OnboardingReport = {
      newAccounts: Number(onboardingRow.new_accounts),
      newPlayers,
      activatedPlayers,
      activationRate: percentage(activatedPlayers, newPlayers),
      firstCombatPlayers: Number(onboardingRow.first_combat_players),
      firstGatheringPlayers: Number(onboardingRow.first_gathering_players),
      firstCraftingPlayers: Number(onboardingRow.first_crafting_players),
      firstExplorationPlayers: Number(onboardingRow.first_exploration_players),
    };

    const byStep: Record<string, number> = {};
    let completed = 0;
    let skipped = 0;
    let inProgress = 0;
    let notStarted = 0;
    for (const row of tutorialRows) {
      const count = Number(row.player_count);
      byStep[String(row.tutorial_step)] = count;
      if (row.tutorial_step >= TUTORIAL_COMPLETED) completed += count;
      else if (row.tutorial_step === TUTORIAL_SKIPPED) skipped += count;
      else if (row.tutorial_step === 0) notStarted += count;
      else inProgress += count;
    }
    const tutorialTotal = completed + skipped + inProgress + notStarted;
    const tutorial: TutorialReport = {
      completed,
      skipped,
      inProgress,
      notStarted,
      completionRate: percentage(completed, tutorialTotal),
      byStep,
    };

    const retentionRow = retentionResult[0];
    const eligibleNewPlayers = Number(retentionRow.eligible_new_players);
    const returnedNextDay = Number(retentionRow.returned_next_day);
    const retention: RetentionReport = {
      activeInPeriod: Number(retentionRow.active_in_period),
      returningActivePlayers: Number(retentionRow.returning_active_players),
      eligibleNewPlayers,
      returnedNextDay,
      nextDayRetentionRate: percentage(returnedNextDay, eligibleNewPlayers),
    };

    const frictionRow = frictionResult[0];
    const deaths: FrictionReport['deaths'] = {};
    for (const row of deathRows) {
      deaths[`${row.zone_name} / ${row.mob_name}`] = {
        count: Number(row.death_count),
        uniquePlayers: Number(row.unique_players),
      };
    }
    const friction: FrictionReport = {
      newPlayersWithoutActions: Number(frictionRow.new_players_without_actions),
      activePlayersBelowLevel5: Number(frictionRow.active_players_below_level_5),
      staleTutorialPlayers: Number(frictionRow.stale_tutorial_players),
      deaths,
    };

    return {
      period,
      generatedAt: new Date().toISOString(),
      activePlayers,
      onboarding,
      tutorial,
      retention,
      friction,
      skillDistribution,
      turnDistribution,
      xpEfficiency,
      progressionVelocity,
      zoneActivity,
    };
  }, 600); // 10 minute cache
}
