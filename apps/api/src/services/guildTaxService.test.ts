import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREMIUM_CONSTANTS, TURN_CONSTANTS } from '@pocketrealm/shared';

vi.mock('./guildService', () => ({
  calculateTreasuryCap: vi.fn().mockReturnValue(110_000),
}));
vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({
    previousTurns: 5000, spent: 100, currentTurns: 4900,
    lastRegenAt: '2026-01-01T00:00:00.000Z', timeToCapMs: null,
  }),
}));
vi.mock('@pocketrealm/game-engine', () => ({
  calculateCurrentTurns: vi.fn().mockReturnValue(5000),
  calculateTimeToCapMs: vi.fn().mockReturnValue(null),
}));

import { mockPrisma } from '../__test__/setup';
import { prisma } from '@pocketrealm/database';
import { calculateCurrentTurns, calculateTimeToCapMs } from '@pocketrealm/game-engine';
import { spendPlayerTurnsTx } from './turnBankService';
import { calculateTreasuryCap } from './guildService';
import {
  getPlayerTaxRateTx,
  getPlayerTaxRate,
  calculateInflatedCost,
  calculateEffectiveTurns,
  taxInfoFromResult,
  spendWithTaxTx,
  applyGuildTaxTx,
  applyGuildTax,
  type TaxResult,
} from './guildTaxService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getPlayerTaxRateTx
// ---------------------------------------------------------------------------

describe('getPlayerTaxRateTx', () => {
  it('returns 0 rate and null guildId when player has no membership', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await getPlayerTaxRateTx(prisma, 'p1');

    expect(result).toEqual({ taxRate: 0, guildId: null });
  });

  it('returns 0 rate and null guildId when guild tax rate is 0', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 0 },
    });

    const result = await getPlayerTaxRateTx(prisma, 'p1');

    expect(result).toEqual({ taxRate: 0, guildId: null });
  });

  it('returns guild tax rate and guildId when guild has a tax rate', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 15 },
    });

    const result = await getPlayerTaxRateTx(prisma, 'p1');

    expect(result).toEqual({ taxRate: 15, guildId: 'g1' });
  });

  it('queries with correct playerId and includes guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    await getPlayerTaxRateTx(prisma, 'player-abc');

    expect(mockPrisma.guildMember.findUnique).toHaveBeenCalledWith({
      where: { playerId: 'player-abc' },
      include: { guild: { select: { id: true, taxRate: true } } },
    });
  });
});

// ---------------------------------------------------------------------------
// getPlayerTaxRate (standalone wrapper)
// ---------------------------------------------------------------------------

describe('getPlayerTaxRate', () => {
  it('delegates to getPlayerTaxRateTx within a $transaction', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await getPlayerTaxRate('p1');

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result).toEqual({ taxRate: 0, guildId: null });
  });

  it('returns guild tax rate through transaction', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g2', taxRate: 10 },
    });

    const result = await getPlayerTaxRate('p1');

    expect(result).toEqual({ taxRate: 10, guildId: 'g2' });
  });
});

// ---------------------------------------------------------------------------
// calculateInflatedCost (pure)
// ---------------------------------------------------------------------------

describe('calculateInflatedCost', () => {
  it('returns base cost when tax rate is 0', () => {
    expect(calculateInflatedCost(100, 0)).toBe(100);
  });

  it('returns base cost when tax rate is negative', () => {
    expect(calculateInflatedCost(100, -5)).toBe(100);
  });

  it('inflates cost by 10% tax: ceil(100 / 0.9) = 112', () => {
    expect(calculateInflatedCost(100, 10)).toBe(112);
  });

  it('inflates cost by 20% tax: ceil(100 / 0.8) = 125', () => {
    expect(calculateInflatedCost(100, 20)).toBe(125);
  });

  it('inflates cost by 5% tax: ceil(33 / 0.95) = 35', () => {
    expect(calculateInflatedCost(33, 5)).toBe(35);
  });

  it('inflates cost by 50% tax: ceil(100 / 0.5) = 200', () => {
    expect(calculateInflatedCost(100, 50)).toBe(200);
  });

  it('handles base cost of 0', () => {
    expect(calculateInflatedCost(0, 10)).toBe(0);
  });

  it('handles base cost of 1 with small tax', () => {
    // ceil(1 / 0.95) = ceil(1.0526...) = 2
    expect(calculateInflatedCost(1, 5)).toBe(2);
  });

  it('handles large values', () => {
    // ceil(10000 / 0.85) = ceil(11764.706...) = 11765
    expect(calculateInflatedCost(10000, 15)).toBe(11765);
  });
});

// ---------------------------------------------------------------------------
// calculateEffectiveTurns (pure)
// ---------------------------------------------------------------------------

describe('calculateEffectiveTurns', () => {
  it('returns full turns when tax rate is 0', () => {
    expect(calculateEffectiveTurns(1000, 0)).toBe(1000);
  });

  it('returns full turns when tax rate is negative', () => {
    expect(calculateEffectiveTurns(1000, -5)).toBe(1000);
  });

  it('reduces turns by 10% tax: floor(1000 * 0.9) = 900', () => {
    expect(calculateEffectiveTurns(1000, 10)).toBe(900);
  });

  it('reduces turns by 20% tax: floor(1000 * 0.8) = 800', () => {
    expect(calculateEffectiveTurns(1000, 20)).toBe(800);
  });

  it('floors fractional results: floor(33 * 0.95) = floor(31.35) = 31', () => {
    expect(calculateEffectiveTurns(33, 5)).toBe(31);
  });

  it('handles 0 turns', () => {
    expect(calculateEffectiveTurns(0, 10)).toBe(0);
  });

  it('handles 100% tax', () => {
    expect(calculateEffectiveTurns(1000, 100)).toBe(0);
  });

  it('handles large values', () => {
    expect(calculateEffectiveTurns(50000, 15)).toBe(42500);
  });
});

// ---------------------------------------------------------------------------
// taxInfoFromResult (pure)
// ---------------------------------------------------------------------------

describe('taxInfoFromResult', () => {
  it('returns null when guildId is null', () => {
    const result: TaxResult = {
      preTaxAmount: 100, taxAmount: 10, postTaxAmount: 90,
      taxRatePercent: 10, guildId: null,
    };
    expect(taxInfoFromResult(result)).toBeNull();
  });

  it('returns null when taxAmount is 0', () => {
    const result: TaxResult = {
      preTaxAmount: 100, taxAmount: 0, postTaxAmount: 100,
      taxRatePercent: 0, guildId: 'g1',
    };
    expect(taxInfoFromResult(result)).toBeNull();
  });

  it('returns TaxInfo when guildId present and taxAmount > 0', () => {
    const result: TaxResult = {
      preTaxAmount: 1000, taxAmount: 100, postTaxAmount: 900,
      taxRatePercent: 10, guildId: 'g1',
    };
    expect(taxInfoFromResult(result)).toEqual({
      rate: 10,
      amount: 100,
      guildId: 'g1',
    });
  });

  it('returns TaxInfo with large tax values', () => {
    const result: TaxResult = {
      preTaxAmount: 50000, taxAmount: 10000, postTaxAmount: 40000,
      taxRatePercent: 20, guildId: 'guild-abc',
    };
    expect(taxInfoFromResult(result)).toEqual({
      rate: 20,
      amount: 10000,
      guildId: 'guild-abc',
    });
  });
});

// ---------------------------------------------------------------------------
// spendWithTaxTx
// ---------------------------------------------------------------------------

describe('spendWithTaxTx', () => {
  it('short-circuits when baseCost is 0', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1', currentTurns: 5000,
      lastRegenAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await spendWithTaxTx(prisma, 'p1', 0);

    expect(result.turnSpend.spent).toBe(0);
    expect(result.turnSpend.currentTurns).toBe(5000);
    expect(result.taxResult.taxAmount).toBe(0);
    expect(result.taxResult.guildId).toBeNull();
    expect(spendPlayerTurnsTx).not.toHaveBeenCalled();
  });

  it('short-circuits when baseCost is negative', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1', currentTurns: 3000,
      lastRegenAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await spendWithTaxTx(prisma, 'p1', -10);

    expect(result.turnSpend.spent).toBe(0);
    expect(result.taxResult.taxAmount).toBe(0);
    expect(spendPlayerTurnsTx).not.toHaveBeenCalled();
  });

  it('throws when turn bank not found for baseCost=0', async () => {
    mockPrisma.turnBank.findUnique.mockResolvedValue(null);

    await expect(spendWithTaxTx(prisma, 'p1', 0)).rejects.toThrow('Turn bank not found');
  });

  it('calls calculateCurrentTurns and calculateTimeToCapMs for baseCost=0', async () => {
    const lastRegenAt = new Date('2026-01-01T00:00:00.000Z');
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1', currentTurns: 2000, lastRegenAt,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    vi.mocked(calculateTimeToCapMs).mockReturnValue(3600000);

    const result = await spendWithTaxTx(prisma, 'p1', 0);

    expect(calculateCurrentTurns).toHaveBeenCalledWith(
      2000,
      lastRegenAt,
      expect.any(Date),
      TURN_CONSTANTS.REGEN_RATE,
      TURN_CONSTANTS.BANK_CAP,
    );
    expect(calculateTimeToCapMs).toHaveBeenCalledWith(
      5000,
      TURN_CONSTANTS.REGEN_RATE,
      TURN_CONSTANTS.BANK_CAP,
    );
    expect(result.turnSpend.timeToCapMs).toBe(3600000);
  });

  it('uses Champion turn overrides for premium players when baseCost is 0', async () => {
    const lastRegenAt = new Date('2026-01-01T00:00:00.000Z');
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1', currentTurns: 2000, lastRegenAt,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: true });

    await spendWithTaxTx(prisma, 'p1', 0);

    expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { isPremium: true },
    });
    expect(calculateCurrentTurns).toHaveBeenCalledWith(
      2000,
      lastRegenAt,
      expect.any(Date),
      PREMIUM_CONSTANTS.TURN_REGEN_RATE,
      PREMIUM_CONSTANTS.TURN_BANK_CAP,
    );
    expect(calculateTimeToCapMs).toHaveBeenCalledWith(
      5000,
      PREMIUM_CONSTANTS.TURN_REGEN_RATE,
      PREMIUM_CONSTANTS.TURN_BANK_CAP,
    );
  });

  it('spends inflated cost when player has guild tax', async () => {
    // Player has 10% tax, baseCost=100 -> inflated=ceil(100/0.9)=112
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guild: { id: 'g1', taxRate: 10 } }) // getPlayerTaxRateTx
      .mockResolvedValueOnce({ guild: { id: 'g1', taxRate: 10, treasuryTurns: 0, level: 1 } }); // applyGuildTaxTx
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    const result = await spendWithTaxTx(prisma, 'p1', 100);

    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(prisma, 'p1', 112);
    expect(result.taxResult.preTaxAmount).toBe(112);
    expect(result.taxResult.taxAmount).toBe(11); // floor(112 * 0.1)
    expect(result.taxResult.postTaxAmount).toBe(101);
    expect(result.taxResult.guildId).toBe('g1');
  });

  it('spends base cost when player has no guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await spendWithTaxTx(prisma, 'p1', 100);

    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(prisma, 'p1', 100);
    expect(result.taxResult.taxAmount).toBe(0);
    expect(result.taxResult.postTaxAmount).toBe(100);
  });

  it('returns the turnSpend result from spendPlayerTurnsTx', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    const mockSpendResult = {
      previousTurns: 8000, spent: 200, currentTurns: 7800,
      lastRegenAt: '2026-02-01T00:00:00.000Z', timeToCapMs: 12345,
    };
    vi.mocked(spendPlayerTurnsTx).mockResolvedValue(mockSpendResult);

    const result = await spendWithTaxTx(prisma, 'p1', 200);

    expect(result.turnSpend).toEqual(mockSpendResult);
  });

  it('passes the correct inflated cost for 20% tax', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guild: { id: 'g2', taxRate: 20 } })
      .mockResolvedValueOnce({ guild: { id: 'g2', taxRate: 20, treasuryTurns: 0, level: 1 } });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    await spendWithTaxTx(prisma, 'p1', 500);

    // ceil(500 / 0.8) = 625
    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(prisma, 'p1', 625);
  });
});

// ---------------------------------------------------------------------------
// applyGuildTaxTx
// ---------------------------------------------------------------------------

describe('applyGuildTaxTx', () => {
  it('returns full amount when player has no guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await applyGuildTaxTx(prisma, 'p1', 1000);

    expect(result.preTaxAmount).toBe(1000);
    expect(result.taxAmount).toBe(0);
    expect(result.postTaxAmount).toBe(1000);
    expect(result.guildId).toBeNull();
  });

  it('returns full amount when guild tax rate is 0', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 0, treasuryTurns: 0, level: 1 },
    });

    const result = await applyGuildTaxTx(prisma, 'p1', 1000);

    expect(result.taxAmount).toBe(0);
    expect(result.postTaxAmount).toBe(1000);
  });

  it('calculates tax and updates treasury within transaction', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 10, treasuryTurns: 0, level: 1 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    const result = await applyGuildTaxTx(prisma, 'p1', 1000);

    expect(result.preTaxAmount).toBe(1000);
    expect(result.taxAmount).toBe(100);
    expect(result.postTaxAmount).toBe(900);
    expect(result.guildId).toBe('g1');
    expect(mockPrisma.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1' },
        data: { treasuryTurns: { increment: 100 } },
      }),
    );
  });

  it('caps treasury contribution at cap', async () => {
    // Treasury is nearly full (cap at level 1 = 110,000)
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 20, treasuryTurns: 109_990, level: 1 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    const result = await applyGuildTaxTx(prisma, 'p1', 1000);

    // Tax = 200, but only 10 can fit in treasury
    expect(result.taxAmount).toBe(200);
    expect(result.postTaxAmount).toBe(800);
    expect(mockPrisma.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { treasuryTurns: { increment: 10 } },
      }),
    );
  });

  it('floors tax amount', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 5, treasuryTurns: 0, level: 1 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    const result = await applyGuildTaxTx(prisma, 'p1', 33);

    // 5% of 33 = 1.65, floor = 1
    expect(result.taxAmount).toBe(1);
    expect(result.postTaxAmount).toBe(32);
  });

  it('does not update treasury when treasury is at cap', async () => {
    vi.mocked(calculateTreasuryCap).mockReturnValue(110_000);
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 10, treasuryTurns: 110_000, level: 1 },
    });

    const result = await applyGuildTaxTx(prisma, 'p1', 1000);

    // Tax is still calculated and returned, but no DB update
    expect(result.taxAmount).toBe(100);
    expect(result.postTaxAmount).toBe(900);
    expect(result.guildId).toBe('g1');
    expect(mockPrisma.guild.update).not.toHaveBeenCalled();
    expect(mockPrisma.guildMember.update).not.toHaveBeenCalled();
  });

  it('does not update when tax rounds to 0 (very small amount)', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 1, treasuryTurns: 0, level: 1 },
    });

    const result = await applyGuildTaxTx(prisma, 'p1', 5);

    // floor(5 * 0.01) = 0
    expect(result.taxAmount).toBe(0);
    expect(result.postTaxAmount).toBe(5);
    expect(result.guildId).toBe('g1');
    expect(result.taxRatePercent).toBe(1);
    expect(mockPrisma.guild.update).not.toHaveBeenCalled();
    expect(mockPrisma.guildMember.update).not.toHaveBeenCalled();
  });

  it('updates guildMember contribution stats when tax is deposited', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 10, treasuryTurns: 0, level: 1 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    await applyGuildTaxTx(prisma, 'player-1', 1000);

    expect(mockPrisma.guildMember.update).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'player-1' } },
      data: {
        totalTurnsContributed: { increment: 100 },
        weeklyTurnsContributed: { increment: 100 },
        lastActiveAt: expect.any(Date),
      },
    });
  });

  it('uses calculateTreasuryCap with guild level', async () => {
    vi.mocked(calculateTreasuryCap).mockReturnValue(200_000);
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 10, treasuryTurns: 199_990, level: 10 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    await applyGuildTaxTx(prisma, 'p1', 1000);

    expect(calculateTreasuryCap).toHaveBeenCalledWith(10);
    // 10% of 1000 = 100, but only 10 fits
    expect(mockPrisma.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { treasuryTurns: { increment: 10 } },
      }),
    );
  });

  it('deposits exact tax when plenty of room', async () => {
    vi.mocked(calculateTreasuryCap).mockReturnValue(500_000);
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 15, treasuryTurns: 1000, level: 5 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    await applyGuildTaxTx(prisma, 'p1', 2000);

    // floor(2000 * 0.15) = 300, plenty of room
    expect(mockPrisma.guild.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { treasuryTurns: { increment: 300 } },
      }),
    );
  });

  it('returns taxRatePercent from guild membership', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 17, treasuryTurns: 0, level: 1 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    const result = await applyGuildTaxTx(prisma, 'p1', 1000);

    expect(result.taxRatePercent).toBe(17);
  });

  it('queries with correct where/include', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    await applyGuildTaxTx(prisma, 'test-player', 500);

    expect(mockPrisma.guildMember.findUnique).toHaveBeenCalledWith({
      where: { playerId: 'test-player' },
      include: { guild: { select: { id: true, taxRate: true, treasuryTurns: true, level: true } } },
    });
  });
});

// ---------------------------------------------------------------------------
// applyGuildTax (standalone wrapper)
// ---------------------------------------------------------------------------

describe('applyGuildTax', () => {
  it('delegates to applyGuildTaxTx within a $transaction', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await applyGuildTax('p1', 500);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result.taxAmount).toBe(0);
    expect(result.postTaxAmount).toBe(500);
  });

  it('returns full tax result when guild has tax', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guild: { id: 'g1', taxRate: 10, treasuryTurns: 0, level: 1 },
    });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildMember.update.mockResolvedValue({});

    const result = await applyGuildTax('p1', 1000);

    expect(result.taxAmount).toBe(100);
    expect(result.postTaxAmount).toBe(900);
    expect(result.guildId).toBe('g1');
  });
});
