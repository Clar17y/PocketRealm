import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));

import { prisma } from '@adventure/database';
import { applyGuildTax, applyGuildTaxTx } from './guildTaxService';

const mockPrisma = prisma as unknown as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
});

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
});

describe('applyGuildTax (standalone wrapper)', () => {
  it('delegates to applyGuildTaxTx within a $transaction', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await applyGuildTax('p1', 500);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result.taxAmount).toBe(0);
    expect(result.postTaxAmount).toBe(500);
  });
});
