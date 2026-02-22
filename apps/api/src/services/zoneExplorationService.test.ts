import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { calculateExplorationPercent, getExplorationPercent, addExplorationTurns } from './zoneExplorationService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getExplorationPercent', () => {
  it('returns 0 when no exploration record exists', async () => {
    mockPrisma.playerZoneExploration.findUnique.mockResolvedValue(null);
    mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });

    const result = await getExplorationPercent('player1', 'zone1');
    expect(result).toEqual({ turnsExplored: 0, percent: 0, turnsToExplore: 30000 });
  });

  it('calculates correct percent', async () => {
    mockPrisma.playerZoneExploration.findUnique.mockResolvedValue({ turnsExplored: 7500 });
    mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });

    const result = await getExplorationPercent('player1', 'zone1');
    expect(result.percent).toBe(25);
    expect(result.turnsExplored).toBe(7500);
  });

  it('caps at 100%', async () => {
    mockPrisma.playerZoneExploration.findUnique.mockResolvedValue({ turnsExplored: 50000 });
    mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: 30000 });

    const result = await getExplorationPercent('player1', 'zone1');
    expect(result.percent).toBe(100);
  });

  it('returns 100% if zone has no turnsToExplore (town)', async () => {
    mockPrisma.playerZoneExploration.findUnique.mockResolvedValue(null);
    mockPrisma.zone.findUnique.mockResolvedValue({ turnsToExplore: null });

    const result = await getExplorationPercent('player1', 'zone1');
    expect(result.percent).toBe(100);
  });
});

describe('calculateExplorationPercent', () => {
  it('returns 100 for null turnsToExplore', () => {
    expect(calculateExplorationPercent(5000, null)).toBe(100);
  });

  it('returns 100 for zero turnsToExplore', () => {
    expect(calculateExplorationPercent(5000, 0)).toBe(100);
  });

  it('calculates correct percent', () => {
    expect(calculateExplorationPercent(7500, 30000)).toBe(25);
  });

  it('caps at 100', () => {
    expect(calculateExplorationPercent(50000, 30000)).toBe(100);
  });
});

describe('addExplorationTurns', () => {
  it('upserts with increment', async () => {
    mockPrisma.playerZoneExploration.upsert.mockResolvedValue({ turnsExplored: 500 });

    await addExplorationTurns('player1', 'zone1', 500);

    expect(mockPrisma.playerZoneExploration.upsert).toHaveBeenCalledWith({
      where: { playerId_zoneId: { playerId: 'player1', zoneId: 'zone1' } },
      create: { playerId: 'player1', zoneId: 'zone1', turnsExplored: 500 },
      update: { turnsExplored: { increment: 500 } },
    });
  });

  it('does nothing for zero turns', async () => {
    await addExplorationTurns('player1', 'zone1', 0);
    expect(mockPrisma.playerZoneExploration.upsert).not.toHaveBeenCalled();
  });

  it('does nothing for negative turns', async () => {
    await addExplorationTurns('player1', 'zone1', -10);
    expect(mockPrisma.playerZoneExploration.upsert).not.toHaveBeenCalled();
  });
});

// --- negative / edge cases ---

describe('getExplorationPercent edge cases', () => {
  it('returns 100% when zone is not found', async () => {
    mockPrisma.playerZoneExploration.findUnique.mockResolvedValue(null);
    mockPrisma.zone.findUnique.mockResolvedValue(null);

    const result = await getExplorationPercent('player1', 'missing-zone');
    expect(result).toEqual({ turnsExplored: 0, percent: 100, turnsToExplore: null });
  });

  it('returns 100% when turnsToExplore is negative', () => {
    expect(calculateExplorationPercent(100, -5)).toBe(100);
  });

  it('returns 0% when turnsExplored is 0 and zone exists', () => {
    expect(calculateExplorationPercent(0, 30000)).toBe(0);
  });

  it('handles fractional percentages correctly', () => {
    // 1 / 30000 * 100 = 0.00333...
    const result = calculateExplorationPercent(1, 30000);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });
});

describe('addExplorationTurns edge cases', () => {
  it('handles very large turn values', async () => {
    mockPrisma.playerZoneExploration.upsert.mockResolvedValue({ turnsExplored: 1_000_000 });

    await addExplorationTurns('player1', 'zone1', 1_000_000);

    expect(mockPrisma.playerZoneExploration.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ turnsExplored: 1_000_000 }),
        update: { turnsExplored: { increment: 1_000_000 } },
      }),
    );
  });
});
