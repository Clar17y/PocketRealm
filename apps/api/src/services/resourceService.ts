import { prisma } from '@pocketrealm/database';
import {
  calculateMaxStamina,
  calculateStaminaRegenPerSecond,
  calculateStaminaRegenPerRound,
  calculateCurrentStamina,
  calculateStaminaRestHealing,
  calculateMaxMana,
  calculateManaRegenPerSecond,
  calculateManaRegenPerRound,
  calculateCurrentMana,
  calculateManaRestHealing,
} from '@pocketrealm/game-engine';
import type { ResourceState } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';
import {
  applyGuildTaxTx,
  getPlayerTaxRateTx,
  calculateInflatedCost,
  calculateEffectiveTurns,
  type TaxResult,
} from './guildTaxService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SkillLevels {
  melee: number;
  ranged: number;
  magic: number;
  evasion: number;
}

async function getSkillLevels(playerId: string): Promise<SkillLevels> {
  const skills = await prisma.playerSkill.findMany({
    where: { playerId },
    select: { skillType: true, level: true },
  });
  const map: Record<string, number> = {};
  for (const s of skills) map[s.skillType] = s.level;
  return {
    melee: map['melee'] ?? 1,
    ranged: map['ranged'] ?? 1,
    magic: map['magic'] ?? 1,
    evasion: map['evasion'] ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Get resource state (lazy regen)
// ---------------------------------------------------------------------------

export interface CombatResourceState {
  stamina: ResourceState;
  mana: ResourceState;
}

export async function getResourceState(
  playerId: string,
  now: Date = new Date(),
): Promise<CombatResourceState> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      currentStamina: true,
      lastStaminaRegenAt: true,
      currentMana: true,
      lastManaRegenAt: true,
    },
  });

  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  const skills = await getSkillLevels(playerId);

  // Stamina
  const maxStamina = calculateMaxStamina({
    meleeLevel: skills.melee,
    rangedLevel: skills.ranged,
    evasionLevel: skills.evasion,
    equipmentStaminaBonus: 0, // no equipment stamina bonus yet
  });
  const staminaRegenPerSecond = calculateStaminaRegenPerSecond();
  const currentStamina = calculateCurrentStamina(
    player.currentStamina,
    player.lastStaminaRegenAt,
    maxStamina,
    staminaRegenPerSecond,
    now,
  );
  const staminaRegenPerRound = calculateStaminaRegenPerRound(
    skills.melee,
    skills.ranged,
    skills.evasion,
  );

  // Mana
  const maxMana = calculateMaxMana({
    magicLevel: skills.magic,
    equipmentManaBonus: 0, // no equipment mana bonus yet
  });
  const manaRegenPerSecond = calculateManaRegenPerSecond();
  const currentMana = calculateCurrentMana(
    player.currentMana,
    player.lastManaRegenAt,
    maxMana,
    manaRegenPerSecond,
    now,
  );
  const manaRegenPerRound = calculateManaRegenPerRound(skills.magic);

  return {
    stamina: {
      current: currentStamina,
      max: maxStamina,
      regenPerRound: staminaRegenPerRound,
      regenPerSecond: staminaRegenPerSecond,
    },
    mana: {
      current: currentMana,
      max: maxMana,
      regenPerRound: manaRegenPerRound,
      regenPerSecond: manaRegenPerSecond,
    },
  };
}

// ---------------------------------------------------------------------------
// Rest (spend turns to recover resource)
// ---------------------------------------------------------------------------

export interface RestResourceResult {
  turnsUsed: number;
  turnsSpent: number;
  healedAmount: number;
  previousValue: number;
  newValue: number;
  max: number;
  taxResult: TaxResult;
}

export async function restStamina(
  playerId: string,
  turnsToSpend: number,
  now: Date = new Date(),
): Promise<RestResourceResult> {
  if (!Number.isInteger(turnsToSpend) || turnsToSpend <= 0) {
    throw new AppError(400, 'Turns must be a positive integer', 'INVALID_TURNS');
  }

  const state = await getResourceState(playerId, now);
  if (state.stamina.current >= state.stamina.max) {
    throw new AppError(400, 'Stamina is already full', 'RESOURCE_FULL');
  }

  const { healing, taxResult } = await prisma.$transaction(async (tx) => {
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const effectiveTurns = calculateEffectiveTurns(turnsToSpend, taxRate);

    const innerHealing = calculateStaminaRestHealing(
      state.stamina.current,
      state.stamina.max,
      effectiveTurns,
    );

    const actualTurnsToDeduct = calculateInflatedCost(innerHealing.turnsUsed, taxRate);

    await spendPlayerTurnsTx(tx, playerId, actualTurnsToDeduct, now);
    const tax = await applyGuildTaxTx(tx, playerId, actualTurnsToDeduct);

    await tx.player.update({
      where: { id: playerId },
      data: { currentStamina: innerHealing.newStamina, lastStaminaRegenAt: now },
    });

    return { healing: innerHealing, taxResult: tax };
  });

  return {
    turnsUsed: healing.turnsUsed,
    turnsSpent: taxResult.preTaxAmount,
    healedAmount: healing.healedAmount,
    previousValue: state.stamina.current,
    newValue: healing.newStamina,
    max: state.stamina.max,
    taxResult,
  };
}

export async function restMana(
  playerId: string,
  turnsToSpend: number,
  now: Date = new Date(),
): Promise<RestResourceResult> {
  if (!Number.isInteger(turnsToSpend) || turnsToSpend <= 0) {
    throw new AppError(400, 'Turns must be a positive integer', 'INVALID_TURNS');
  }

  const state = await getResourceState(playerId, now);
  if (state.mana.current >= state.mana.max) {
    throw new AppError(400, 'Mana is already full', 'RESOURCE_FULL');
  }

  const { healing, taxResult } = await prisma.$transaction(async (tx) => {
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const effectiveTurns = calculateEffectiveTurns(turnsToSpend, taxRate);

    const innerHealing = calculateManaRestHealing(
      state.mana.current,
      state.mana.max,
      effectiveTurns,
    );

    const actualTurnsToDeduct = calculateInflatedCost(innerHealing.turnsUsed, taxRate);

    await spendPlayerTurnsTx(tx, playerId, actualTurnsToDeduct, now);
    const tax = await applyGuildTaxTx(tx, playerId, actualTurnsToDeduct);

    await tx.player.update({
      where: { id: playerId },
      data: { currentMana: innerHealing.newMana, lastManaRegenAt: now },
    });

    return { healing: innerHealing, taxResult: tax };
  });

  return {
    turnsUsed: healing.turnsUsed,
    turnsSpent: taxResult.preTaxAmount,
    healedAmount: healing.healedAmount,
    previousValue: state.mana.current,
    newValue: healing.newMana,
    max: state.mana.max,
    taxResult,
  };
}

// ---------------------------------------------------------------------------
// Direct setters (post-combat state updates)
// ---------------------------------------------------------------------------

export async function setStamina(
  playerId: string,
  newValue: number,
  now: Date = new Date(),
): Promise<void> {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentStamina: Math.max(0, Math.floor(newValue)),
      lastStaminaRegenAt: now,
    },
  });
}

export async function setMana(
  playerId: string,
  newValue: number,
  now: Date = new Date(),
): Promise<void> {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentMana: Math.max(0, Math.floor(newValue)),
      lastManaRegenAt: now,
    },
  });
}

export async function setAllResources(
  playerId: string,
  hp: number,
  stamina: number,
  mana: number,
  now: Date = new Date(),
): Promise<void> {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      currentHp: Math.max(0, Math.floor(hp)),
      lastHpRegenAt: now,
      currentStamina: Math.max(0, Math.floor(stamina)),
      lastStaminaRegenAt: now,
      currentMana: Math.max(0, Math.floor(mana)),
      lastManaRegenAt: now,
    },
  });
}
