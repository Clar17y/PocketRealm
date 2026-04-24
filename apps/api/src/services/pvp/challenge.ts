import { Prisma, prisma } from '@pocketrealm/database';
import {
  calculateFleeChance,
  runTemplateCombat,
} from '@pocketrealm/game-engine';
import {
  FLEE_CONSTANTS,
  type FleeOutcome,
  PVP_CONSTANTS,
} from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { trackAchievements } from '../../utils/routeHelpers.js';
import { normalizePlayerAttributes } from '../attributesService';
import { getHpState } from '../hpService';
import { setAllResources } from '../resourceService';
import { calculateEloChange } from '../eloService';
import { mapTemplateCombatLog } from '../combatLogMapper';
import { spendPlayerTurnsTx } from '../turnBankService';
import { degradeEquippedDurability } from '../durabilityService';
import { buildPvpCombatant, getAttackStyle } from '../pvpCombatantBuilder';
import { computeBracketBounds, getOrCreateRating } from './ratings';
import { getPlayerRole } from './playerRole';

const REVENGE_WINDOW_DAYS = 7;

export async function challenge(
  attackerId: string,
  attackerUsername: string,
  targetId: string,
) {
  if (attackerId === targetId) {
    throw new AppError(400, 'Cannot challenge yourself', 'SELF_CHALLENGE');
  }

  const hpState = await getHpState(attackerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot challenge while recovering', 'IS_RECOVERING');
  }
  if (hpState.currentHp <= 0) {
    throw new AppError(400, 'Cannot challenge with 0 HP', 'NO_HP');
  }

  const attacker = await prisma.player.findUnique({
    where: { id: attackerId },
    select: {
      characterLevel: true,
      attributes: true,
      currentZone: { select: { id: true, zoneType: true } },
      account: { select: { role: true } },
    },
  });
  if (!attacker) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  if (attacker.currentZone?.zoneType !== 'town') {
    throw new AppError(400, 'Must be in a town to challenge', 'NOT_IN_TOWN');
  }
  if (attacker.characterLevel < PVP_CONSTANTS.MIN_CHARACTER_LEVEL) {
    throw new AppError(
      400,
      `Must be character level ${PVP_CONSTANTS.MIN_CHARACTER_LEVEL}+`,
      'INSUFFICIENT_LEVEL',
    );
  }

  const attackerRole = getPlayerRole(attacker);
  if (attackerRole !== 'admin') {
    const cooldown = await prisma.pvpCooldown.findUnique({
      where: { attackerId_defenderId: { attackerId, defenderId: targetId } },
    });
    if (cooldown && cooldown.expiresAt > new Date()) {
      throw new AppError(400, 'Opponent is on cooldown', 'ON_COOLDOWN');
    }
  }

  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: {
      characterLevel: true,
      attributes: true,
      username: true,
      isBot: true,
      account: { select: { role: true } },
    },
  });
  if (!target) {
    throw new AppError(404, 'Target not found', 'NOT_FOUND');
  }
  if (target.characterLevel < PVP_CONSTANTS.MIN_CHARACTER_LEVEL) {
    throw new AppError(400, 'Target below minimum level', 'TARGET_INSUFFICIENT_LEVEL');
  }

  const attackerRating = await getOrCreateRating(attackerId);
  const defenderRating = await getOrCreateRating(targetId);
  const { lower: lowerBound, upper: upperBound } = computeBracketBounds(attackerRating.rating);
  if (defenderRating.rating < lowerBound || defenderRating.rating > upperBound) {
    throw new AppError(400, 'Target is outside your rating bracket', 'OUT_OF_BRACKET');
  }

  const revengeWindow = new Date(Date.now() - REVENGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const revengeMatch = await prisma.pvpMatch.findFirst({
    where: {
      attackerId: targetId,
      defenderId: attackerId,
      createdAt: { gte: revengeWindow },
    },
    orderBy: { createdAt: 'desc' },
  });
  const isRevenge = Boolean(revengeMatch);
  const turnCost = isRevenge ? PVP_CONSTANTS.REVENGE_TURN_COST : PVP_CONSTANTS.CHALLENGE_TURN_COST;

  const [attackerCombatant, defenderCombatant, attackStyle, defenderStyle] = await Promise.all([
    buildPvpCombatant(attackerId, attackerUsername, true),
    buildPvpCombatant(targetId, target.username, false),
    getAttackStyle(attackerId),
    getAttackStyle(targetId),
  ]);

  const attackerMaxHp = attackerCombatant.stats.maxHp;
  const attackerAttributes = normalizePlayerAttributes(attacker.attributes);
  const combatResult = runTemplateCombat(attackerCombatant, defenderCombatant, { combatMode: 'pvp' });

  const isDraw = combatResult.outcome === 'draw';
  const attackerWon = combatResult.outcome === 'victory';
  const winnerId = isDraw ? null : attackerWon ? attackerId : targetId;

  const score = isDraw ? 0.5 : attackerWon ? 1 : 0;
  const elo = calculateEloChange(
    attackerRating.rating,
    defenderRating.rating,
    PVP_CONSTANTS.K_FACTOR,
    score,
  );
  let attackerRatingChange = elo.deltaA;
  let defenderRatingChange = elo.deltaB;

  const targetRole = getPlayerRole(target);
  if (attackerRole === 'admin' || targetRole === 'admin') {
    attackerRatingChange = 0;
    defenderRatingChange = 0;
  }

  const now = new Date();
  const match = await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, attackerId, turnCost, now);

    const freshAttackerRating = await tx.pvpRating.findUnique({ where: { playerId: attackerId } });
    const freshDefenderRating = await tx.pvpRating.findUnique({ where: { playerId: targetId } });
    if (freshAttackerRating && freshDefenderRating) {
      const { lower: freshLower, upper: freshUpper } = computeBracketBounds(freshAttackerRating.rating);
      if (freshDefenderRating.rating < freshLower || freshDefenderRating.rating > freshUpper) {
        throw new AppError(409, 'Target moved outside your rating bracket', 'OUT_OF_BRACKET');
      }
    }

    // Update attacker rating. On draws, `winStreak: undefined` is a Prisma no-op,
    // which deliberately preserves the current streak across draws.
    const newAttackerRating = Math.max(0, attackerRating.rating + attackerRatingChange);
    const newAttackerStreak = isDraw ? attackerRating.winStreak : attackerWon ? attackerRating.winStreak + 1 : 0;
    await tx.pvpRating.update({
      where: { playerId: attackerId },
      data: {
        rating: newAttackerRating,
        wins: attackerWon ? { increment: 1 } : undefined,
        losses: !isDraw && !attackerWon ? { increment: 1 } : undefined,
        draws: isDraw ? { increment: 1 } : undefined,
        winStreak: isDraw ? undefined : attackerWon ? { increment: 1 } : 0,
        bestWinStreak: Math.max(attackerRating.bestWinStreak, newAttackerStreak),
        bestRating: Math.max(attackerRating.bestRating, newAttackerRating),
        lastFoughtAt: now,
      },
    });

    // Update defender rating. Same draw-preserves-streak invariant as the attacker update.
    const newDefenderRating = Math.max(0, defenderRating.rating + defenderRatingChange);
    const newDefenderStreak = isDraw ? defenderRating.winStreak : attackerWon ? 0 : defenderRating.winStreak + 1;
    await tx.pvpRating.update({
      where: { playerId: targetId },
      data: {
        rating: newDefenderRating,
        wins: !isDraw && !attackerWon ? { increment: 1 } : undefined,
        losses: !isDraw && attackerWon ? { increment: 1 } : undefined,
        draws: isDraw ? { increment: 1 } : undefined,
        winStreak: isDraw ? undefined : attackerWon ? 0 : { increment: 1 },
        bestWinStreak: Math.max(defenderRating.bestWinStreak, newDefenderStreak),
        bestRating: Math.max(defenderRating.bestRating, newDefenderRating),
        lastFoughtAt: now,
      },
    });

    const matchRecord = await tx.pvpMatch.create({
      data: {
        attackerId,
        defenderId: targetId,
        attackerRating: attackerRating.rating,
        defenderRating: defenderRating.rating,
        attackerRatingChange,
        defenderRatingChange,
        winnerId,
        combatLog: JSON.parse(
          JSON.stringify({ ...combatResult, log: mapTemplateCombatLog(combatResult.log) }),
        ) as Prisma.InputJsonValue,
        attackerStyle: attackStyle,
        defenderStyle,
        turnsSpent: turnCost,
        isRevenge,
        attackerRead: true,
        defenderRead: false,
      },
    });

    if (attackerRole !== 'admin') {
      const expiresAt = new Date(now.getTime() + PVP_CONSTANTS.COOLDOWN_HOURS * 60 * 60 * 1000);
      await tx.pvpCooldown.upsert({
        where: { attackerId_defenderId: { attackerId, defenderId: targetId } },
        create: { attackerId, defenderId: targetId, expiresAt },
        update: { expiresAt },
      });
    }

    return matchRecord;
  });

  const [attackerDurability, defenderDurability] = await Promise.all([
    degradeEquippedDurability(attackerId, combatResult.log, 'combatantA'),
    target.isBot ? [] : degradeEquippedDurability(targetId, combatResult.log, 'combatantB'),
  ]);

  // PvP loss: guaranteed escape, no knockout, no gold loss (deliberate divergence from PvE).
  // Higher evasion → higher fleeChance → lower escapeThreshold → more likely clean escape.
  const attackerKnockedOut = false;
  let fleeOutcome: FleeOutcome | null = null;
  if (combatResult.combatantAHpRemaining <= 0) {
    const fleeChance = calculateFleeChance(attackerAttributes.evasion, target.characterLevel);
    const roll = Math.random();
    const escapeThreshold = FLEE_CONSTANTS.HIGH_SUCCESS_THRESHOLD * (1 - fleeChance);

    const remainingHp = roll >= escapeThreshold
      ? (fleeOutcome = 'clean_escape', Math.max(1, Math.floor(attackerMaxHp * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT)))
      : (fleeOutcome = 'wounded_escape', FLEE_CONSTANTS.PARTIAL_SUCCESS_HP);

    await setAllResources(
      attackerId,
      remainingHp,
      combatResult.combatantAStaminaRemaining,
      combatResult.combatantAManaRemaining,
    );
  } else {
    await setAllResources(
      attackerId,
      combatResult.combatantAHpRemaining,
      combatResult.combatantAStaminaRemaining,
      combatResult.combatantAManaRemaining,
    );
  }

  if (winnerId === attackerId && !target.isBot) {
    await trackAchievements(attackerId, {
      pvpWins: 1,
    });
  }

  return {
    matchId: match.id,
    attackerId,
    defenderId: targetId,
    attackerName: attackerUsername,
    defenderName: target.username,
    winnerId,
    isDraw,
    isRevenge,
    turnsSpent: turnCost,
    attackerRating: attackerRating.rating,
    defenderRating: defenderRating.rating,
    attackerRatingChange,
    defenderRatingChange,
    attackerStyle: attackStyle,
    defenderStyle,
    combat: { ...combatResult, log: mapTemplateCombatLog(combatResult.log) },
    attackerStartHp: attackerCombatant.stats.hp,
    attackerStartStamina: attackerCombatant.stamina,
    attackerStartMana: attackerCombatant.mana,
    attackerKnockedOut,
    fleeOutcome,
    durability: {
      attacker: attackerDurability,
      defender: defenderDurability,
    },
  };
}
