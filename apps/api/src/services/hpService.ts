import { prisma } from '@pocketrealm/database';
import {
  calculateMaxHp,
  calculateRegenPerSecond,
  calculateCurrentHp,
  calculateHealPerTurn,
  calculateRestHealing,
  calculateRecoveryCost,
  calculateRecoveryExitHp,
} from '@pocketrealm/game-engine';
import type { HpState, RestResult, RecoveryResult } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { getEquipmentStats } from './equipmentService';
import { spendPlayerTurnsTx } from './turnBankService';
import { applyGuildTaxTx, getPlayerTaxRateTx, calculateInflatedCost, calculateEffectiveTurns, type TaxResult } from './guildTaxService';
import { normalizePlayerAttributes } from './attributesService';

async function getVitalityLevel(playerId: string): Promise<number> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { attributes: true },
  });
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  return normalizePlayerAttributes(player.attributes).vitality;
}

export async function getHpState(
  playerId: string,
  now: Date = new Date()
): Promise<HpState> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      currentHp: true,
      lastHpRegenAt: true,
      isRecovering: true,
      recoveryCost: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const vitalityLevel = await getVitalityLevel(playerId);
  const equipmentStats = await getEquipmentStats(playerId);

  const maxHp = calculateMaxHp({
    vitalityLevel,
    equipmentHealthBonus: equipmentStats.health,
  });

  const regenPerSecond = calculateRegenPerSecond(vitalityLevel);

  const currentHp = calculateCurrentHp(
    player.currentHp,
    player.lastHpRegenAt,
    maxHp,
    regenPerSecond,
    player.isRecovering,
    now
  );

  return {
    currentHp,
    maxHp,
    regenPerSecond,
    lastHpRegenAt: player.lastHpRegenAt.toISOString(),
    isRecovering: player.isRecovering,
    recoveryCost: player.recoveryCost,
  };
}

export async function rest(
  playerId: string,
  turnsToSpend: number,
  now: Date = new Date()
): Promise<RestResult & { taxResult: TaxResult }> {
  if (!Number.isInteger(turnsToSpend) || turnsToSpend <= 0) {
    throw new AppError(400, 'Turns must be a positive integer', 'INVALID_TURNS');
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      currentHp: true,
      lastHpRegenAt: true,
      isRecovering: true,
      recoveryCost: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  if (player.isRecovering) {
    throw new AppError(400, 'Cannot rest while recovering. Spend recovery turns first.', 'IS_RECOVERING');
  }

  const vitalityLevel = await getVitalityLevel(playerId);
  const equipmentStats = await getEquipmentStats(playerId);

  const maxHp = calculateMaxHp({
    vitalityLevel,
    equipmentHealthBonus: equipmentStats.health,
  });

  const regenPerSecond = calculateRegenPerSecond(vitalityLevel);
  const currentHp = calculateCurrentHp(
    player.currentHp,
    player.lastHpRegenAt,
    maxHp,
    regenPerSecond,
    false,
    now
  );

  if (currentHp >= maxHp) {
    throw new AppError(400, 'Already at full HP', 'FULL_HP');
  }

  const healPerTurn = calculateHealPerTurn(vitalityLevel);

  // Spend turns, apply tax, and update HP atomically.
  const { healing, taxResult } = await prisma.$transaction(async (tx) => {
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const effectiveTurns = calculateEffectiveTurns(turnsToSpend, taxRate);

    const innerHealing = calculateRestHealing(currentHp, maxHp, healPerTurn, effectiveTurns);

    // Inflate the effective turns used back to the actual bank cost
    const actualTurnsToDeduct = calculateInflatedCost(innerHealing.turnsUsed, taxRate);

    await spendPlayerTurnsTx(tx, playerId, actualTurnsToDeduct, now);
    const tax = await applyGuildTaxTx(tx, playerId, actualTurnsToDeduct);

    const updated = await tx.player.updateMany({
      where: {
        id: playerId,
        currentHp: player.currentHp,
        lastHpRegenAt: player.lastHpRegenAt,
        isRecovering: false,
      },
      data: {
        currentHp: innerHealing.newHp,
        lastHpRegenAt: now,
      },
    });

    if (updated.count !== 1) {
      throw new AppError(409, 'HP state changed; try again', 'HP_STATE_CHANGED');
    }

    return { healing: innerHealing, taxResult: tax };
  });

  return {
    previousHp: currentHp,
    healedAmount: healing.healedAmount,
    currentHp: healing.newHp,
    maxHp,
    turnsSpent: taxResult.preTaxAmount,
    taxResult,
  };
}

export async function recover(
  playerId: string,
  now: Date = new Date()
): Promise<RecoveryResult> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      isRecovering: true,
      recoveryCost: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  if (!player.isRecovering) {
    throw new AppError(400, 'Not in recovering state', 'NOT_RECOVERING');
  }

  const recoveryCost = player.recoveryCost ?? 0;

  const vitalityLevel = await getVitalityLevel(playerId);
  const equipmentStats = await getEquipmentStats(playerId);

  const maxHp = calculateMaxHp({
    vitalityLevel,
    equipmentHealthBonus: equipmentStats.health,
  });

  const exitHp = calculateRecoveryExitHp(maxHp);

  // Spend turns and exit recovering state atomically.
  await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, playerId, recoveryCost, now);

    const updated = await tx.player.updateMany({
      where: {
        id: playerId,
        isRecovering: true,
        recoveryCost: player.recoveryCost,
      },
      data: {
        currentHp: exitHp,
        lastHpRegenAt: now,
        isRecovering: false,
        recoveryCost: null,
      },
    });

    if (updated.count !== 1) {
      throw new AppError(409, 'Recovery state changed; try again', 'RECOVERY_STATE_CHANGED');
    }
  });

  return {
    previousState: 'recovering',
    currentHp: exitHp,
    maxHp,
    turnsSpent: recoveryCost,
  };
}

export async function setHp(
  playerId: string,
  newHp: number,
  now: Date = new Date()
): Promise<void> {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentHp: Math.max(0, newHp),
      lastHpRegenAt: now,
    },
  });
}

export async function enterRecoveringState(
  playerId: string,
  maxHp: number,
  now: Date = new Date()
): Promise<void> {
  const recoveryCost = calculateRecoveryCost(maxHp);

  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentHp: 0,
      lastHpRegenAt: now,
      isRecovering: true,
      recoveryCost,
    },
  });
}
