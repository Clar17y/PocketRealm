import { prisma } from '@pocketrealm/database';
import { runTemplateCombat } from '@pocketrealm/game-engine';
import { SPAR_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';
import { mapTemplateCombatLog } from './combatLogMapper';
import { getHpState } from './hpService';
import { buildPvpCombatant } from './pvpCombatantBuilder';
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
    combatantAMaxHp: number;
    combatantBMaxHp: number;
    combatantAMaxStamina: number;
    combatantBMaxStamina: number;
    combatantAMaxMana: number;
    combatantBMaxMana: number;
    attackerStartHp: number;
    attackerStartStamina: number;
    attackerStartMana: number;
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
    buildPvpCombatant(attackerId, attackerName, true),
    buildPvpCombatant(defenderId, defender.username, false),
  ]);

  // Capture attacker start resources before combat resolves
  const attackerStartHp = attackerCombatant.stats.hp;
  const attackerStartStamina = attackerCombatant.stamina;
  const attackerStartMana = attackerCombatant.mana;

  const result = runTemplateCombat(attackerCombatant, defenderCombatant, { combatMode: 'pvp' });

  const isDraw = result.outcome === 'draw';
  const attackerWon = result.outcome === 'victory';
  const winnerId = isDraw ? null : attackerWon ? attackerId : defenderId;
  const winnerHp = attackerWon ? result.combatantAHpRemaining : result.combatantBHpRemaining;

  // Notify defender via system mail (fire-and-forget)
  sendSparResultMail(attackerId, attackerName, defenderId, attackerWon, winnerHp).catch(err =>
    console.warn('sendSparResultMail failed', { err, attackerId, defenderId })
  );

  return {
    winnerId,
    isDraw,
    attackerName,
    defenderName: defender.username,
    attackerHpRemaining: result.combatantAHpRemaining,
    defenderHpRemaining: result.combatantBHpRemaining,
    combat: {
      outcome: result.outcome,
      combatantAMaxHp: result.combatantAMaxHp,
      combatantBMaxHp: result.combatantBMaxHp,
      combatantAMaxStamina: result.combatantAMaxStamina,
      combatantBMaxStamina: result.combatantBMaxStamina,
      combatantAMaxMana: result.combatantAMaxMana,
      combatantBMaxMana: result.combatantBMaxMana,
      attackerStartHp,
      attackerStartStamina,
      attackerStartMana,
      log: mapTemplateCombatLog(result.log),
    },
  };
}
