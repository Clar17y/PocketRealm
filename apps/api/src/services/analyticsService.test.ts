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
        { activity_type: 'combat', total_turns: BigInt(500000), action_count: BigInt(10000) },
        { activity_type: 'mining', total_turns: BigInt(120000), action_count: BigInt(4000) },
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

      const report = await getBalanceReport('7d');

      expect(report.period).toBe('7d');
      expect(report.activePlayers).toBe(100);
      expect(report.skillDistribution.melee.avg).toBe(12.3);
      expect(report.skillDistribution.melee.median).toBe(10);
      expect(report.skillDistribution.mining.playerCount).toBe(60);
      expect(report.turnDistribution.combat.totalTurns).toBe(500000);
      expect(report.turnDistribution.combat.avgTurnsPerAction).toBe(50);
      expect(report.xpEfficiency.combat.xpPerTurn).toBe(0.42);
      expect(report.progressionVelocity.melee.atLevel5).toBe(80);
      expect(report.progressionVelocity.melee.atLevel30).toBe(2);
      expect(report.zoneActivity['Forest Edge'].uniquePlayers).toBe(80);
      expect(report.generatedAt).toBeDefined();
    });

    it('handles empty data gracefully', async () => {
      const mockQueryRaw = vi.mocked(prisma.$queryRaw);

      mockQueryRaw.mockResolvedValueOnce([{ count: BigInt(0) }]);
      mockQueryRaw.mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValueOnce([]);
      mockQueryRaw.mockResolvedValueOnce([]);

      const report = await getBalanceReport('24h');

      expect(report.activePlayers).toBe(0);
      expect(Object.keys(report.skillDistribution)).toHaveLength(0);
      expect(Object.keys(report.turnDistribution)).toHaveLength(0);
    });
  });
});
