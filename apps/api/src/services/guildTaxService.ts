import { Prisma, prisma } from '@pocketrealm/database';
import { PREMIUM_CONSTANTS, TURN_CONSTANTS, type TaxInfo } from '@pocketrealm/shared';
import { calculateCurrentTurns, calculateTimeToCapMs, calculateTurnProgress } from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import { calculateTreasuryCap } from './guildService';
import { getHasActivePremiumEntitlement } from './premiumEntitlement';
import { assertPlayerCanSpendTurnsTx, spendPlayerTurnsTx, type SpendTurnsResult } from './turnBankService';

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

export function calculateEffectiveTurns(turns: number, taxRatePercent: number): number {
  if (taxRatePercent <= 0) return turns;
  return Math.floor(turns * (1 - taxRatePercent / 100));
}

export interface TaxAffordabilityResult {
  baseCost: number;
  inflatedCost: number;
  taxRatePercent: number;
  guildId: string | null;
  currentTurns: number;
}

export async function assertCanSpendWithTaxTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  baseCost: number,
  now: Date = new Date(),
): Promise<TaxAffordabilityResult> {
  if (!Number.isInteger(baseCost) || baseCost < 0) {
    throw new AppError(400, 'Turn spend amount must be a non-negative integer', 'INVALID_TURNS');
  }

  const { taxRate, guildId } = baseCost > 0
    ? await getPlayerTaxRateTx(tx, playerId)
    : { taxRate: 0, guildId: null };
  const inflatedCost = calculateInflatedCost(baseCost, taxRate);
  const affordability = await assertPlayerCanSpendTurnsTx(tx, playerId, inflatedCost, now);

  return {
    baseCost,
    inflatedCost,
    taxRatePercent: taxRate,
    guildId,
    currentTurns: affordability.currentTurns,
  };
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
 * Inflate a fixed turn cost by the guild tax rate, spend the inflated amount,
 * and route the tax to the guild treasury — all in one atomic step.
 * Use for fixed-cost routes (crafting, forge, salvage, travel).
 */
export async function spendWithTaxTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  baseCost: number,
): Promise<{ turnSpend: SpendTurnsResult; taxResult: TaxResult }> {
  if (baseCost <= 0) {
    const now = new Date();
    const [bank, hasActivePremiumEntitlement] = await Promise.all([
      tx.turnBank.findUnique({ where: { playerId } }),
      getHasActivePremiumEntitlement(tx, playerId),
    ]);
    if (!bank) throw new AppError(404, 'Turn bank not found', 'NOT_FOUND');
    const regenRate = hasActivePremiumEntitlement ? PREMIUM_CONSTANTS.TURN_REGEN_RATE : TURN_CONSTANTS.REGEN_RATE;
    const bankCap = hasActivePremiumEntitlement ? PREMIUM_CONSTANTS.TURN_BANK_CAP : TURN_CONSTANTS.BANK_CAP;
    const current = calculateCurrentTurns(
      bank.currentTurns,
      bank.lastRegenAt,
      now,
      regenRate,
      bankCap,
      bank.regenProgress,
    );
    const regenProgress = calculateTurnProgress(
      bank.lastRegenAt,
      now,
      regenRate,
      bank.regenProgress,
    );
    return {
      turnSpend: {
        previousTurns: current, spent: 0, currentTurns: current,
        lastRegenAt: bank.lastRegenAt.toISOString(),
        timeToCapMs: calculateTimeToCapMs(
          current,
          regenRate,
          bankCap,
          current >= bankCap ? 0 : regenProgress,
        ),
      },
      taxResult: NO_TAX(0),
    };
  }

  const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
  const actualCost = calculateInflatedCost(baseCost, taxRate);
  const turnSpend = await spendPlayerTurnsTx(tx, playerId, actualCost);
  const taxResult = await applyGuildTaxTx(tx, playerId, actualCost);
  return { turnSpend, taxResult };
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
