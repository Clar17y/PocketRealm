import { prisma } from '@pocketrealm/database';
import {
  buildPlayerCombatStats, calculateMaxHp, runTemplateCombat,
  calculateMaxStamina, calculateStaminaRegenPerRound,
  calculateMaxMana, calculateManaRegenPerRound,
} from '@pocketrealm/game-engine';
import { SPAR_CONSTANTS, type SkillType } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';
import { normalizePlayerAttributes } from './attributesService';
import { buildPlayerTemplateCombatant } from './combatOrchestrationService';
import { mapTemplateCombatLog } from './combatLogMapper';
import { getSkillLevel } from './combatStatsService';
import { getActiveTemplate } from './combatTemplateService';
import { getEquipmentStats } from './equipmentService';
import { getHpState } from './hpService';
import { getResourceState } from './resourceService';
import { getSkillPoints } from './skillPointService';
import { spendPlayerTurnsTx } from './turnBankService';
import { sendSystemMail } from './friendMailService';

interface SparValidation {
  attackerId: string;
  defenderId: string;
}

export async function validateSpar(
  attackerId: string,
  friendshipId: string,
): Promise<SparValidation> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: attackerId }, { receiverId: attackerId }],
    },
    select: { senderId: true, receiverId: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  const defenderId = friendship.senderId === attackerId
    ? friendship.receiverId
    : friendship.senderId;

  // HP check
  const hpState = await getHpState(attackerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot spar while recovering', 'IS_RECOVERING');
  }

  // Block check
  if (await isBlocked(defenderId, attackerId)) {
    throw new AppError(400, 'Cannot spar with this player', 'BLOCKED');
  }

  return { attackerId, defenderId };
}

export async function spendSparTurns(attackerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, attackerId, SPAR_CONSTANTS.TURN_COST);
  });
}

export async function sendSparResultMail(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  attackerWon: boolean,
  winnerHp: number,
): Promise<void> {
  const subject = 'Friendly Spar Result';
  const body = attackerWon
    ? `${attackerName} beat you in a friendly spar! They ended on ${winnerHp} HP.`
    : `${attackerName} lost to you in a friendly spar! You showed them who's boss.`;

  await sendSystemMail(attackerId, defenderId, subject, body);
}

// ── Build combatant for spar ────────────────────────────────────────

type AttackStyle = 'melee' | 'ranged' | 'magic';

async function getAttackStyle(playerId: string): Promise<AttackStyle> {
  const mainHand = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot: 'main_hand' } },
    include: { item: { include: { template: true } } },
  });
  const reqSkill = mainHand?.item?.template?.requiredSkill as string | null;
  if (reqSkill === 'ranged') return 'ranged';
  if (reqSkill === 'magic') return 'magic';
  return 'melee';
}

async function buildSparCombatant(
  playerId: string,
  username: string,
  useCurrentResources: boolean,
) {
  const [player, equipStats, attackStyle, template, skillPoints] = await Promise.all([
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { attributes: true },
    }),
    getEquipmentStats(playerId),
    getAttackStyle(playerId),
    getActiveTemplate(playerId),
    getSkillPoints(playerId),
  ]);

  const attributes = normalizePlayerAttributes(player.attributes);

  const [meleeLevel, rangedLevel, evasionLevel, magicLevel] = await Promise.all([
    getSkillLevel(playerId, 'melee'),
    getSkillLevel(playerId, 'ranged'),
    getSkillLevel(playerId, 'evasion' as SkillType),
    getSkillLevel(playerId, 'magic'),
  ]);

  const skillLevel = attackStyle === 'ranged' ? rangedLevel
    : attackStyle === 'magic' ? magicLevel
    : meleeLevel;

  const maxHp = calculateMaxHp({
    vitalityLevel: attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });

  // Attacker uses current HP; defender uses max HP (ghost snapshot)
  let currentHp = maxHp;
  let stamina: number;
  let maxStamina: number;
  let mana: number;
  let maxMana: number;

  if (useCurrentResources) {
    const [hpState, resources] = await Promise.all([
      getHpState(playerId),
      getResourceState(playerId),
    ]);
    currentHp = hpState.currentHp;
    stamina = resources.stamina.current;
    maxStamina = resources.stamina.max;
    mana = resources.mana.current;
    maxMana = resources.mana.max;
  } else {
    maxStamina = calculateMaxStamina({
      meleeLevel, rangedLevel, evasionLevel, equipmentStaminaBonus: 0,
    });
    stamina = maxStamina;
    maxMana = calculateMaxMana({ magicLevel, equipmentManaBonus: 0 });
    mana = maxMana;
  }

  const stats = buildPlayerCombatStats(
    currentHp, maxHp,
    { attackStyle, skillLevel, attributes },
    equipStats,
  );

  return buildPlayerTemplateCombatant({
    playerId,
    username,
    playerStats: stats,
    template,
    stamina,
    maxStamina,
    staminaRegenPerRound: calculateStaminaRegenPerRound(meleeLevel, rangedLevel, evasionLevel),
    mana,
    maxMana,
    manaRegenPerRound: calculateManaRegenPerRound(magicLevel),
    unlockedActions: skillPoints.unlockedActions,
  });
}

// ── Run spar ────────────────────────────────────────────────────────

export interface SparResult {
  winnerId: string | null;
  isDraw: boolean;
  attackerName: string;
  defenderName: string;
  attackerHpRemaining: number;
  defenderHpRemaining: number;
  combat: {
    outcome: string;
    log: ReturnType<typeof mapTemplateCombatLog>;
  };
}

export async function runSpar(
  attackerId: string,
  attackerName: string,
  defenderId: string,
): Promise<SparResult> {
  // Load defender username
  const defender = await prisma.player.findUniqueOrThrow({
    where: { id: defenderId },
    select: { username: true },
  });

  // Build combatants: attacker uses current resources, defender uses max (ghost)
  const [attackerCombatant, defenderCombatant] = await Promise.all([
    buildSparCombatant(attackerId, attackerName, true),
    buildSparCombatant(defenderId, defender.username, false),
  ]);

  const result = runTemplateCombat(attackerCombatant, defenderCombatant);

  const isDraw = result.outcome === 'draw';
  const attackerWon = result.outcome === 'victory';
  const winnerId = isDraw ? null : attackerWon ? attackerId : defenderId;
  const winnerHp = attackerWon ? result.combatantAHpRemaining : result.combatantBHpRemaining;

  // Notify defender via system mail (fire-and-forget)
  sendSparResultMail(attackerId, attackerName, defenderId, attackerWon, winnerHp).catch(() => {});

  return {
    winnerId,
    isDraw,
    attackerName,
    defenderName: defender.username,
    attackerHpRemaining: result.combatantAHpRemaining,
    defenderHpRemaining: result.combatantBHpRemaining,
    combat: {
      outcome: result.outcome,
      log: mapTemplateCombatLog(result.log),
    },
  };
}
