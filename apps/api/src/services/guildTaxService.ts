import { prisma } from '@adventure/database';
import { GUILD_CONSTANTS } from '@adventure/shared';
import { calculateTreasuryCap } from './guildService';

export interface TaxResult {
  preTaxAmount: number;
  taxAmount: number;
  postTaxAmount: number;
  guildId: string | null;
}

/**
 * Calculate and apply guild tax to a turn spend.
 * Tax goes to the guild treasury; returns post-tax amount.
 */
export async function applyGuildTax(
  playerId: string,
  turnAmount: number,
): Promise<TaxResult> {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: { guild: { select: { id: true, taxRate: true, treasuryTurns: true, level: true } } },
  });

  if (!membership || membership.guild.taxRate === 0) {
    return { preTaxAmount: turnAmount, taxAmount: 0, postTaxAmount: turnAmount, guildId: null };
  }

  const taxRate = membership.guild.taxRate / 100;
  const taxAmount = Math.floor(turnAmount * taxRate);
  const postTaxAmount = turnAmount - taxAmount;

  if (taxAmount > 0) {
    const cap = calculateTreasuryCap(membership.guild.level);
    const actualTax = Math.min(taxAmount, cap - membership.guild.treasuryTurns);

    if (actualTax > 0) {
      await prisma.$transaction([
        prisma.guild.update({
          where: { id: membership.guild.id },
          data: { treasuryTurns: { increment: actualTax } },
        }),
        prisma.guildMember.update({
          where: { guildId_playerId: { guildId: membership.guild.id, playerId } },
          data: {
            totalTurnsContributed: { increment: actualTax },
            weeklyTurnsContributed: { increment: actualTax },
            lastActiveAt: new Date(),
          },
        }),
      ]);
    }
  }

  return {
    preTaxAmount: turnAmount,
    taxAmount,
    postTaxAmount,
    guildId: membership.guild.id,
  };
}
