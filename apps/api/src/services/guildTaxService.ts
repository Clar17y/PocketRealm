import { Prisma, prisma } from '@adventure/database';
import type { TaxInfo } from '@adventure/shared';
import { calculateTreasuryCap } from './guildService';

export interface TaxResult {
  preTaxAmount: number;
  taxAmount: number;
  postTaxAmount: number;
  taxRatePercent: number;
  guildId: string | null;
}

const NO_TAX = (turnAmount: number): TaxResult => ({
  preTaxAmount: turnAmount, taxAmount: 0, postTaxAmount: turnAmount, taxRatePercent: 0, guildId: null,
});

export async function getPlayerTaxRateTx(
  tx: Prisma.TransactionClient,
  playerId: string,
): Promise<{ taxRate: number; guildId: string | null }> {
  const membership = await tx.guildMember.findUnique({
    where: { playerId },
    include: { guild: { select: { id: true, taxRate: true } } },
  });
  if (!membership || membership.guild.taxRate === 0) return { taxRate: 0, guildId: null };
  return { taxRate: membership.guild.taxRate, guildId: membership.guild.id };
}

export async function getPlayerTaxRate(playerId: string): Promise<{ taxRate: number; guildId: string | null }> {
  return prisma.$transaction(async (tx) => getPlayerTaxRateTx(tx, playerId));
}

export function calculateInflatedCost(baseCost: number, taxRatePercent: number): number {
  if (taxRatePercent <= 0) return baseCost;
  return Math.ceil(baseCost / (1 - taxRatePercent / 100));
}

export function taxInfoFromResult(result: TaxResult): TaxInfo | null {
  if (!result.guildId || result.taxAmount === 0) return null;
  return {
    rate: result.taxRatePercent,
    amount: result.taxAmount,
    guildId: result.guildId,
  };
}

/**
 * Apply guild tax within an existing Prisma transaction.
 * Use this inside routes that already have a $transaction block
 * to keep tax and turn-spend atomic.
 */
export async function applyGuildTaxTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  turnAmount: number,
): Promise<TaxResult> {
  const membership = await tx.guildMember.findUnique({
    where: { playerId },
    include: { guild: { select: { id: true, taxRate: true, treasuryTurns: true, level: true } } },
  });

  if (!membership || membership.guild.taxRate === 0) {
    return NO_TAX(turnAmount);
  }

  const taxRate = membership.guild.taxRate / 100;
  const taxAmount = Math.floor(turnAmount * taxRate);
  const postTaxAmount = turnAmount - taxAmount;

  if (taxAmount > 0) {
    const cap = calculateTreasuryCap(membership.guild.level);
    const actualTax = Math.min(taxAmount, cap - membership.guild.treasuryTurns);

    if (actualTax > 0) {
      await tx.guild.update({
        where: { id: membership.guild.id },
        data: { treasuryTurns: { increment: actualTax } },
      });
      await tx.guildMember.update({
        where: { guildId_playerId: { guildId: membership.guild.id, playerId } },
        data: {
          totalTurnsContributed: { increment: actualTax },
          weeklyTurnsContributed: { increment: actualTax },
          lastActiveAt: new Date(),
        },
      });
    }
  }

  return {
    preTaxAmount: turnAmount,
    taxAmount,
    postTaxAmount,
    taxRatePercent: membership.guild.taxRate,
    guildId: membership.guild.id,
  };
}

/**
 * Standalone guild tax — wraps applyGuildTaxTx in its own transaction.
 * Only use in routes that cannot use the Tx variant (e.g., where the
 * turn spend is inside a service function that owns its own transaction).
 */
export async function applyGuildTax(
  playerId: string,
  turnAmount: number,
): Promise<TaxResult> {
  return prisma.$transaction(async (tx) => {
    return applyGuildTaxTx(tx, playerId, turnAmount);
  });
}
