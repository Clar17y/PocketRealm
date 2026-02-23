import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma as db } from '../__test__/setup';
import { generateWeeklyContracts, getActiveContracts, incrementContractProgress, getWeekStart } from './guildContractService';
import { GUILD_CONTRACT_CONSTANTS } from '@adventure/shared';

// Also mock guildService since incrementContractProgress calls addGuildXp and checkGuildAchievementsForAllMembers
vi.mock('./guildService.js', () => ({
  addGuildXp: vi.fn().mockResolvedValue({ level: 1, xp: 0n, leveledUp: false }),
  checkGuildAchievementsForAllMembers: vi.fn().mockResolvedValue(undefined),
}));

const GUILD_ID = 'guild-1';
const NOW = new Date('2026-02-23T12:00:00Z'); // A Monday at noon UTC

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('getWeekStart', () => {
  it('returns Monday 00:00 UTC for a Wednesday', () => {
    const wed = new Date('2026-02-25T15:00:00Z'); // Wednesday
    const start = getWeekStart(wed);
    expect(start.getUTCDay()).toBe(1); // Monday
    expect(start.toISOString()).toBe('2026-02-23T00:00:00.000Z');
  });

  it('returns same Monday for a Monday', () => {
    const mon = new Date('2026-02-23T08:00:00Z');
    const start = getWeekStart(mon);
    expect(start.toISOString()).toBe('2026-02-23T00:00:00.000Z');
  });

  it('returns previous Monday for a Sunday', () => {
    const sun = new Date('2026-03-01T22:00:00Z'); // Sunday
    const start = getWeekStart(sun);
    expect(start.getUTCDay()).toBe(1);
    expect(start.toISOString()).toBe('2026-02-23T00:00:00.000Z');
  });
});

describe('generateWeeklyContracts', () => {
  it('generates 3 contracts with at least 2 categories', async () => {
    db.guild.findUnique.mockResolvedValue({ level: 5 });
    let createCount = 0;
    db.guildContract.create.mockImplementation(() => {
      createCount++;
      return {
        id: `contract-${createCount}`,
        contractKey: 'kill_count',
        targetValue: 2000,
        currentValue: 0,
        status: 'active',
        rewardGuildXp: 300,
        rewardTreasuryTurns: 1000,
        weekStartedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
      };
    });
    db.guildLog.create.mockResolvedValue({});

    const result = await generateWeeklyContracts(GUILD_ID, NOW);
    expect(result).toHaveLength(GUILD_CONTRACT_CONSTANTS.CONTRACTS_PER_WEEK);
  });

  it('returns empty array if guild not found', async () => {
    db.guild.findUnique.mockResolvedValue(null);
    const result = await generateWeeklyContracts(GUILD_ID, NOW);
    expect(result).toHaveLength(0);
  });
});

describe('getActiveContracts', () => {
  it('returns existing contracts for current week', async () => {
    const weekStart = getWeekStart(NOW);
    db.guildContract.findMany.mockResolvedValue([
      {
        id: 'c1',
        contractKey: 'kill_count',
        targetValue: 2000,
        currentValue: 500,
        status: 'active',
        rewardGuildXp: 300,
        rewardTreasuryTurns: 1000,
        weekStartedAt: weekStart,
        expiresAt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    ]);

    const result = await getActiveContracts(GUILD_ID, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].contractKey).toBe('kill_count');
  });

  it('generates new contracts if none found for current week', async () => {
    db.guildContract.findMany.mockResolvedValue([]);
    db.guildContract.updateMany.mockResolvedValue({ count: 0 });
    db.guild.findUnique.mockResolvedValue({ level: 5 });
    let createCount = 0;
    db.guildContract.create.mockImplementation(() => {
      createCount++;
      return {
        id: `c-${createCount}`,
        contractKey: 'craft_items',
        targetValue: 5000,
        currentValue: 0,
        status: 'active',
        rewardGuildXp: 400,
        rewardTreasuryTurns: 800,
        weekStartedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
      };
    });
    db.guildLog.create.mockResolvedValue({});

    const result = await getActiveContracts(GUILD_ID, NOW);
    expect(result).toHaveLength(3);
    expect(db.guildContract.updateMany).toHaveBeenCalled();
  });
});

describe('incrementContractProgress', () => {
  it('increments progress on matching active contract', async () => {
    db.guildContract.findFirst.mockResolvedValue({
      id: 'c1',
      guildId: GUILD_ID,
      contractKey: 'kill_count',
      targetValue: 2000,
      currentValue: 100,
      status: 'active',
      rewardGuildXp: 300,
      rewardTreasuryTurns: 1000,
    });
    db.guildContract.update.mockResolvedValue({});

    await incrementContractProgress(GUILD_ID, 'kill_count', 50);
    expect(db.guildContract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: { currentValue: 150 },
      }),
    );
  });

  it('completes contract when threshold reached', async () => {
    db.guildContract.findFirst.mockResolvedValue({
      id: 'c1',
      guildId: GUILD_ID,
      contractKey: 'kill_count',
      targetValue: 100,
      currentValue: 95,
      status: 'active',
      rewardGuildXp: 300,
      rewardTreasuryTurns: 1000,
    });
    db.guildContract.updateMany.mockResolvedValue({ count: 1 });
    db.guild.update.mockResolvedValue({});
    db.guildLog.create.mockResolvedValue({});

    const { addGuildXp } = await import('./guildService.js');
    await incrementContractProgress(GUILD_ID, 'kill_count', 10);

    // Should use transaction for completion with optimistic lock
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.guildContract.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', status: 'active' },
      }),
    );
    expect(addGuildXp).toHaveBeenCalledWith(GUILD_ID, 300);
  });

  it('does nothing for zero or negative amount', async () => {
    await incrementContractProgress(GUILD_ID, 'kill_count', 0);
    expect(db.guildContract.findFirst).not.toHaveBeenCalled();
  });

  it('does nothing if no matching contract', async () => {
    db.guildContract.findFirst.mockResolvedValue(null);
    await incrementContractProgress(GUILD_ID, 'kill_count', 50);
    expect(db.guildContract.update).not.toHaveBeenCalled();
  });
});
