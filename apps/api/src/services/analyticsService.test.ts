import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBalanceReport } from './analyticsService';

vi.mock('@pocketrealm/database', () => ({
  Prisma: { sql: vi.fn((...args: unknown[]) => args), raw: vi.fn((s: string) => s) },
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('./cacheService', () => ({
  cachedQuery: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
}));

import { prisma } from '@pocketrealm/database';

function queryText(callIndex: number): string {
  const call = vi.mocked(prisma.$queryRaw).mock.calls[callIndex];
  const strings = call?.[0];
  return Array.isArray(strings) ? strings.join(' ') : String(strings);
}

function mockEmptyBalanceQueries(): void {
  const mockQueryRaw = vi.mocked(prisma.$queryRaw);

  mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
  mockQueryRaw.mockResolvedValueOnce([]);
  mockQueryRaw.mockResolvedValueOnce([]);
  mockQueryRaw.mockResolvedValueOnce([]);
  mockQueryRaw.mockResolvedValueOnce([]);
  mockQueryRaw.mockResolvedValueOnce([]);
  mockQueryRaw.mockResolvedValueOnce([{
    new_accounts: BigInt(0),
    new_players: BigInt(0),
    activated_players: BigInt(0),
    first_combat_players: BigInt(0),
    first_gathering_players: BigInt(0),
    first_crafting_players: BigInt(0),
    first_exploration_players: BigInt(0),
  }]);
  mockQueryRaw.mockResolvedValueOnce([]);
  mockQueryRaw.mockResolvedValueOnce([{
    active_in_period: BigInt(0),
    returning_active_players: BigInt(0),
    eligible_new_players: BigInt(0),
    returned_next_day: BigInt(0),
  }]);
  mockQueryRaw.mockResolvedValueOnce([{
    new_players_without_actions: BigInt(0),
    active_players_below_level_5: BigInt(0),
    stale_tutorial_players: BigInt(0),
  }]);
  mockQueryRaw.mockResolvedValueOnce([]);
}

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBalanceReport', () => {
    it('returns a complete balance report with all sections', async () => {
      const mockQueryRaw = vi.mocked(prisma.$queryRaw);

      mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(100) }]);
      mockQueryRaw.mockResolvedValueOnce([
        { skill_type: 'melee', avg_level: 12.3, median_level: 10, p90_level: 25, player_count: BigInt(80) },
        { skill_type: 'mining', avg_level: 8.1, median_level: 7, p90_level: 15, player_count: BigInt(60) },
      ]);
      mockQueryRaw.mockResolvedValueOnce([
        { activity_type: 'combat', total_turns: BigInt(500000), action_count: BigInt(10000), unique_players: BigInt(75) },
        { activity_type: 'mining', total_turns: BigInt(120000), action_count: BigInt(4000), unique_players: BigInt(40) },
      ]);
      mockQueryRaw.mockResolvedValueOnce([
        { category: 'combat', total_xp: 210000, total_turns: BigInt(500000) },
        { category: 'mining', total_xp: 90000, total_turns: BigInt(120000) },
      ]);
      mockQueryRaw.mockResolvedValueOnce([
        { skill_type: 'melee', at_5: BigInt(80), at_10: BigInt(50), at_15: BigInt(30), at_20: BigInt(10), at_30: BigInt(2) },
        { skill_type: 'mining', at_5: BigInt(60), at_10: BigInt(30), at_15: BigInt(10), at_20: BigInt(3), at_30: BigInt(0) },
      ]);
      mockQueryRaw.mockResolvedValueOnce([
        { zone_name: 'Forest Edge', total_turns: BigInt(200000), action_count: BigInt(5000), unique_players: BigInt(80) },
      ]);
      mockQueryRaw.mockResolvedValueOnce([{
        new_accounts: BigInt(50),
        new_players: BigInt(45),
        activated_players: BigInt(36),
        first_combat_players: BigInt(30),
        first_gathering_players: BigInt(24),
        first_crafting_players: BigInt(12),
        first_exploration_players: BigInt(32),
      }]);
      mockQueryRaw.mockResolvedValueOnce([
        { tutorial_step: -1, player_count: BigInt(4) },
        { tutorial_step: 0, player_count: BigInt(8) },
        { tutorial_step: 7, player_count: BigInt(10) },
        { tutorial_step: 13, player_count: BigInt(20) },
      ]);
      mockQueryRaw.mockResolvedValueOnce([{
        active_in_period: BigInt(85),
        returning_active_players: BigInt(55),
        eligible_new_players: BigInt(30),
        returned_next_day: BigInt(12),
      }]);
      mockQueryRaw.mockResolvedValueOnce([{
        new_players_without_actions: BigInt(9),
        active_players_below_level_5: BigInt(22),
        stale_tutorial_players: BigInt(6),
      }]);
      mockQueryRaw.mockResolvedValueOnce([
        { zone_name: 'Forest Edge', mob_name: 'Wolf', death_count: BigInt(7), unique_players: BigInt(5) },
      ]);

      const report = await getBalanceReport('7d');

      expect(report.period).toBe('7d');
      expect(report.activePlayers).toBe(100);
      expect(report.skillDistribution.melee.avg).toBe(12.3);
      expect(report.skillDistribution.melee.median).toBe(10);
      expect(report.skillDistribution.mining.playerCount).toBe(60);
      expect(report.turnDistribution.combat.totalTurns).toBe(500000);
      expect(report.turnDistribution.combat.avgTurnsPerAction).toBe(50);
      expect(report.turnDistribution.combat.uniquePlayers).toBe(75);
      expect(report.xpEfficiency.combat.xpPerTurn).toBe(0.42);
      expect(report.progressionVelocity.melee.atLevel5).toBe(80);
      expect(report.progressionVelocity.melee.atLevel30).toBe(2);
      expect(report.zoneActivity['Forest Edge'].uniquePlayers).toBe(80);
      expect(report.onboarding.newAccounts).toBe(50);
      expect(report.onboarding.activationRate).toBe(80);
      expect(report.onboarding.firstCombatPlayers).toBe(30);
      expect(report.tutorial.completed).toBe(20);
      expect(report.tutorial.skipped).toBe(4);
      expect(report.tutorial.inProgress).toBe(10);
      expect(report.tutorial.notStarted).toBe(8);
      expect(report.tutorial.byStep['7']).toBe(10);
      expect(report.retention.activeInPeriod).toBe(85);
      expect(report.retention.returningActivePlayers).toBe(55);
      expect(report.retention.nextDayRetentionRate).toBe(40);
      expect(report.friction.newPlayersWithoutActions).toBe(9);
      expect(report.friction.deaths['Forest Edge / Wolf'].count).toBe(7);
      expect(report.generatedAt).toBeDefined();
    });

    it('handles empty data gracefully', async () => {
      mockEmptyBalanceQueries();

      const report = await getBalanceReport('24h');

      expect(report.activePlayers).toBe(0);
      expect(Object.keys(report.skillDistribution)).toHaveLength(0);
      expect(Object.keys(report.turnDistribution)).toHaveLength(0);
      expect(report.onboarding.activationRate).toBe(0);
      expect(report.retention.nextDayRetentionRate).toBe(0);
      expect(Object.keys(report.friction.deaths)).toHaveLength(0);
    });

    it('keeps player-activity metrics on non-bot populations and counts defeat aliases', async () => {
      mockEmptyBalanceQueries();

      await getBalanceReport('7d');

      for (const index of [0, 1, 2, 3, 4, 5, 10]) {
        expect(queryText(index)).toContain('is_bot = false');
      }
      expect(queryText(8)).toContain('active_in_period');
      expect(queryText(8)).not.toContain("NOW() - INTERVAL '7 days'");
      expect(queryText(10)).toContain("IN ('defeat', 'defeated')");
    });
  });
});
