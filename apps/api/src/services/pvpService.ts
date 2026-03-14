import { Prisma, prisma } from '@pocketrealm/database';
import {
  calculateMaxStamina, calculateMaxMana,
  runTemplateCombat,
  calculateFleeChance,
} from '@pocketrealm/game-engine';
import {
  PVP_CONSTANTS, ACHIEVEMENTS_BY_ID, BASE_ACTION_DEFINITIONS,
  TALENT_TREE_DEFINITIONS, FLEE_CONSTANTS,
  type ActionDefinition,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { buildPagination, trackAchievements } from '../utils/routeHelpers.js';
import { calculateEloChange } from './eloService';
import { getEquipmentStats } from './equipmentService';
import { spendPlayerTurnsTx } from './turnBankService';
import { degradeEquippedDurability } from './durabilityService';
import { normalizePlayerAttributes } from './attributesService';
import { getHpState, setHp } from './hpService';
import { getActiveTemplate } from './combatTemplateService';
import { setAllResources } from './resourceService';
import { getSkillPoints } from './skillPointService';
import { mapTemplateCombatLog } from './combatLogMapper';
import { getAttackStyle, buildPvpCombatant } from './pvpCombatantBuilder';

const REVENGE_WINDOW_DAYS = 7;

export function computeBracketBounds(rating: number): { lower: number; upper: number } {
  const percentLower = Math.floor(rating * (1 - PVP_CONSTANTS.BRACKET_RANGE));
  const percentUpper = Math.ceil(rating * (1 + PVP_CONSTANTS.BRACKET_RANGE));
  return {
    lower: Math.max(0, Math.min(percentLower, rating - PVP_CONSTANTS.MIN_BRACKET_HALF_WIDTH)),
    upper: Math.max(percentUpper, rating + PVP_CONSTANTS.MIN_BRACKET_HALF_WIDTH),
  };
}

// ---------------------------------------------------------------------------
// getOrCreateRating
// ---------------------------------------------------------------------------

export async function getOrCreateRating(playerId: string) {
  return prisma.pvpRating.upsert({
    where: { playerId },
    update: {},
    create: {
      playerId,
      rating: PVP_CONSTANTS.STARTING_RATING,
      bestRating: PVP_CONSTANTS.STARTING_RATING,
    },
  });
}

// ---------------------------------------------------------------------------
// getLadder
// ---------------------------------------------------------------------------

export async function getLadder(playerId: string) {
  const myRating = await getOrCreateRating(playerId);
  const { lower: lowerBound, upper: upperBound } = computeBracketBounds(myRating.rating);

  // Admins bypass cooldowns for testing
  const isAdmin = (await prisma.player.findUnique({ where: { id: playerId }, select: { role: true } }))?.role === 'admin';

  const cooldowns = isAdmin ? [] : await prisma.pvpCooldown.findMany({
    where: { attackerId: playerId, expiresAt: { gt: new Date() } },
    select: { defenderId: true },
  });
  const cooldownIds = new Set(cooldowns.map((c) => c.defenderId));

  // Find opponents in bracket, widening if too few results
  const WIDEN_STEP = 50;
  const MAX_WIDEN_ITERATIONS = 10;
  let currentLower = lowerBound;
  let currentUpper = upperBound;

  const findAndFilter = async (lower: number, upper: number) => {
    const candidates = await prisma.pvpRating.findMany({
      where: {
        playerId: { not: playerId },
        rating: { gte: lower, lte: upper },
        player: { characterLevel: { gte: PVP_CONSTANTS.MIN_CHARACTER_LEVEL } },
      },
      include: {
        player: { select: { username: true, characterLevel: true, role: true, activeTitle: true } },
      },
      orderBy: { rating: 'desc' },
    });
    return candidates
      .filter((c) => !cooldownIds.has(c.playerId))
      .map((c) => {
        const titleDef = c.player.activeTitle ? ACHIEVEMENTS_BY_ID.get(c.player.activeTitle) : null;
        return {
          playerId: c.playerId,
          username: c.player.username,
          rating: c.rating,
          characterLevel: c.player.characterLevel,
          isAdmin: c.player.role === 'admin',
          title: titleDef?.titleReward,
          titleTier: titleDef?.tier,
        };
      });
  };

  let opponents = await findAndFilter(currentLower, currentUpper);

  let widenCount = 0;
  while (opponents.length < PVP_CONSTANTS.MIN_OPPONENTS_SHOWN && widenCount < MAX_WIDEN_ITERATIONS) {
    widenCount++;
    currentLower = Math.max(0, currentLower - WIDEN_STEP);
    currentUpper = currentUpper + WIDEN_STEP;
    opponents = await findAndFilter(currentLower, currentUpper);
  }

  return {
    myRating: {
      rating: myRating.rating,
      wins: myRating.wins,
      losses: myRating.losses,
      draws: myRating.draws,
      winStreak: myRating.winStreak,
      bestRating: myRating.bestRating,
    },
    opponents,
  };
}

// ---------------------------------------------------------------------------
// scoutOpponent
// ---------------------------------------------------------------------------

export async function scoutOpponent(attackerId: string, targetId: string) {
  // HP/knockout check
  const hpState = await getHpState(attackerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot scout while recovering', 'IS_RECOVERING');
  }

  // Town zone check
  const attackerZone = await prisma.player.findUnique({
    where: { id: attackerId },
    select: { currentZone: { select: { zoneType: true } } },
  });
  if (attackerZone?.currentZone?.zoneType !== 'town') {
    throw new AppError(400, 'Must be in a town to scout', 'NOT_IN_TOWN');
  }

  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: {
      characterLevel: true,
      attributes: true,
    },
  });

  if (!target) {
    throw new AppError(404, 'Target player not found', 'NOT_FOUND');
  }

  // Spend turns for scouting (after validation so turns aren't lost on bad targetId)
  await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, attackerId, PVP_CONSTANTS.SCOUT_TURN_COST);
  });

  const [targetEquipment, [targetPower, myPower], targetTemplate, targetSkills, skillPoints] = await Promise.all([
    prisma.playerEquipment.findMany({
      where: { playerId: targetId, itemId: { not: null } },
      include: { item: { include: { template: true } } },
    }),
    Promise.all([calculatePowerRating(targetId), calculatePowerRating(attackerId)]),
    getActiveTemplate(targetId),
    prisma.playerSkill.findMany({
      where: { playerId: targetId },
      select: { skillType: true, level: true },
    }),
    getSkillPoints(targetId),
  ]);

  // Determine attack style from main hand weapon
  const mainHand = targetEquipment.find((e) => e.slot === 'main_hand');
  const weaponSkill = mainHand?.item?.template?.requiredSkill as string | null;
  const attackStyle = weaponSkill === 'ranged' ? 'ranged'
    : weaponSkill === 'magic' ? 'magic'
    : 'melee';

  // Determine armor class from chest armor
  const chest = targetEquipment.find((e) => e.slot === 'chest');
  const weightClass = chest?.item?.template?.weightClass as string | null;
  const armorClass = weightClass ?? 'none';

  const categoryBreakdown = computeTemplateCategoryBreakdown(
    targetTemplate,
    BASE_ACTION_DEFINITIONS,
  );

  const skillMap: Record<string, number> = {};
  for (const s of targetSkills) skillMap[s.skillType] = s.level;

  const maxStamina = calculateMaxStamina({
    meleeLevel: skillMap['melee'] ?? 1,
    rangedLevel: skillMap['ranged'] ?? 1,
    evasionLevel: skillMap['evasion'] ?? 1,
    equipmentStaminaBonus: 0,
  });
  const maxMana = calculateMaxMana({
    magicLevel: skillMap['magic'] ?? 1,
    equipmentManaBonus: 0,
  });
  const talentInvestment = computeTalentInvestment(skillPoints.allocations);

  // Create scout notification
  await prisma.pvpScoutLog.create({
    data: { scouterId: attackerId, targetId },
  });

  return {
    combatLevel: target.characterLevel,
    attackStyle,
    armorClass,
    powerRating: targetPower,
    myPowerRating: myPower,
    templateInfo: {
      templateLength: targetTemplate.length,
      ...categoryBreakdown,
      maxStamina,
      maxMana,
      talentInvestment,
    },
  };
}

// ---------------------------------------------------------------------------
// challenge
// ---------------------------------------------------------------------------

async function calculatePowerRating(playerId: string): Promise<number> {
  const [equipStats, player, combatSkills] = await Promise.all([
    getEquipmentStats(playerId),
    prisma.player.findUnique({
      where: { id: playerId },
      select: { attributes: true },
    }),
    prisma.playerSkill.findMany({
      where: { playerId, skillType: { in: ['melee', 'ranged', 'magic'] } },
      select: { level: true },
    }),
  ]);

  const statTotal = equipStats.attack + equipStats.rangedPower + equipStats.magicPower
    + equipStats.armor + equipStats.magicDefence + equipStats.health
    + equipStats.dodge + equipStats.accuracy;

  const attrs = normalizePlayerAttributes(player?.attributes);
  const attrTotal = attrs.vitality + attrs.strength + attrs.dexterity
    + attrs.intelligence + attrs.luck + attrs.evasion;

  const skillTotal = combatSkills.reduce((sum, s) => sum + s.level, 0);

  return statTotal + attrTotal + skillTotal;
}

function computeTemplateCategoryBreakdown(
  template: Array<{ actionId: string }>,
  actionDefs: Record<string, ActionDefinition>,
): { offensiveCount: number; defensiveCount: number; supportiveCount: number } {
  let offensiveCount = 0;
  let defensiveCount = 0;
  let supportiveCount = 0;
  for (const action of template) {
    const def = actionDefs[action.actionId];
    if (!def) continue;
    switch (def.category) {
      case 'offensive': offensiveCount++; break;
      case 'defensive': defensiveCount++; break;
      case 'supportive': supportiveCount++; break;
    }
  }
  return { offensiveCount, defensiveCount, supportiveCount };
}

function computeTalentInvestment(
  allocations: Record<string, number>,
): Record<string, number> {
  const investment: Record<string, number> = { melee: 0, ranged: 0, magic: 0, survival: 0 };
  for (const nodeId of Object.keys(allocations)) {
    for (const [tree, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        investment[tree] = Math.max(investment[tree], node.tier);
      }
    }
  }
  return investment;
}

export async function challenge(
  attackerId: string,
  attackerUsername: string,
  targetId: string,
) {
  // Validation: not self
  if (attackerId === targetId) {
    throw new AppError(400, 'Cannot challenge yourself', 'SELF_CHALLENGE');
  }

  // HP/knockout check
  const hpState = await getHpState(attackerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot challenge while recovering', 'IS_RECOVERING');
  }
  if (hpState.currentHp <= 0) {
    throw new AppError(400, 'Cannot challenge with 0 HP', 'NO_HP');
  }

  // Validation: attacker in town zone
  const attacker = await prisma.player.findUnique({
    where: { id: attackerId },
    select: {
      characterLevel: true,
      attributes: true,
      role: true,
      currentZone: { select: { id: true, zoneType: true } },
    },
  });
  if (!attacker) throw new AppError(404, 'Player not found', 'NOT_FOUND');
  if (attacker.currentZone?.zoneType !== 'town') {
    throw new AppError(400, 'Must be in a town to challenge', 'NOT_IN_TOWN');
  }

  // Validation: character level
  if (attacker.characterLevel < PVP_CONSTANTS.MIN_CHARACTER_LEVEL) {
    throw new AppError(400, `Must be character level ${PVP_CONSTANTS.MIN_CHARACTER_LEVEL}+`, 'INSUFFICIENT_LEVEL');
  }

  // Validation: cooldown (admins bypass for testing)
  if (attacker.role !== 'admin') {
    const cooldown = await prisma.pvpCooldown.findUnique({
      where: { attackerId_defenderId: { attackerId, defenderId: targetId } },
    });
    if (cooldown && cooldown.expiresAt > new Date()) {
      throw new AppError(400, 'Opponent is on cooldown', 'ON_COOLDOWN');
    }
  }

  // Validation: target level
  const target = await prisma.player.findUnique({
    where: { id: targetId },
    select: {
      characterLevel: true,
      attributes: true,
      username: true,
      isBot: true,
      role: true,
    },
  });
  if (!target) throw new AppError(404, 'Target not found', 'NOT_FOUND');
  if (target.characterLevel < PVP_CONSTANTS.MIN_CHARACTER_LEVEL) {
    throw new AppError(400, 'Target below minimum level', 'TARGET_INSUFFICIENT_LEVEL');
  }

  // Check bracket range
  const attackerRating = await getOrCreateRating(attackerId);
  const defenderRating = await getOrCreateRating(targetId);
  const { lower: lowerBound, upper: upperBound } = computeBracketBounds(attackerRating.rating);
  if (defenderRating.rating < lowerBound || defenderRating.rating > upperBound) {
    throw new AppError(400, 'Target is outside your rating bracket', 'OUT_OF_BRACKET');
  }

  // Check revenge: most recent match where target attacked this player, within window
  const revengeWindow = new Date(Date.now() - REVENGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const revengeMatch = await prisma.pvpMatch.findFirst({
    where: {
      attackerId: targetId,
      defenderId: attackerId,
      createdAt: { gte: revengeWindow },
    },
    orderBy: { createdAt: 'desc' },
  });
  const isRevenge = !!revengeMatch;
  const turnCost = isRevenge ? PVP_CONSTANTS.REVENGE_TURN_COST : PVP_CONSTANTS.CHALLENGE_TURN_COST;

  // Build combatants: attacker uses current resources, defender uses max (ghost)
  const [attackerCombatant, defenderCombatant, attackStyle, defenderStyle] = await Promise.all([
    buildPvpCombatant(attackerId, attackerUsername, true),
    buildPvpCombatant(targetId, target.username, false),
    getAttackStyle(attackerId),
    getAttackStyle(targetId),
  ]);

  // Capture attacker start resources for post-combat processing and response
  const attackerMaxHp = attackerCombatant.stats.maxHp;
  const attackerAttributes = normalizePlayerAttributes(attacker.attributes);

  const combatResult = runTemplateCombat(attackerCombatant, defenderCombatant, { combatMode: 'pvp' });

  const isDraw = combatResult.outcome === 'draw';
  const attackerWon = combatResult.outcome === 'victory';
  const winnerId = isDraw ? null : attackerWon ? attackerId : targetId;

  // Calculate Elo changes — scoreA: 1 = win, 0.5 = draw, 0 = loss (from attacker perspective)
  const score = isDraw ? 0.5 : attackerWon ? 1 : 0;
  const elo = calculateEloChange(attackerRating.rating, defenderRating.rating, PVP_CONSTANTS.K_FACTOR, score);
  let attackerRatingChange = elo.deltaA;
  let defenderRatingChange = elo.deltaB;

  // Zero ELO changes when an admin is involved (friendly match)
  if (attacker.role === 'admin' || target.role === 'admin') {
    attackerRatingChange = 0;
    defenderRatingChange = 0;
  }
  const now = new Date();

  // Execute everything in a transaction
  const match = await prisma.$transaction(async (tx) => {
    // Spend turns
    await spendPlayerTurnsTx(tx, attackerId, turnCost, now);

    // Re-check bracket inside transaction for safety
    const freshAttackerRating = await tx.pvpRating.findUnique({ where: { playerId: attackerId } });
    const freshDefenderRating = await tx.pvpRating.findUnique({ where: { playerId: targetId } });
    if (freshAttackerRating && freshDefenderRating) {
      const { lower: freshLower, upper: freshUpper } = computeBracketBounds(freshAttackerRating.rating);
      if (freshDefenderRating.rating < freshLower || freshDefenderRating.rating > freshUpper) {
        throw new AppError(409, 'Target moved outside your rating bracket', 'OUT_OF_BRACKET');
      }
    }

    // Update attacker rating (draws: no win/loss, preserve streak)
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

    // Update defender rating (draws: no win/loss, preserve streak)
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

    // Create match record
    const matchRecord = await tx.pvpMatch.create({
      data: {
        attackerId,
        defenderId: targetId,
        attackerRating: attackerRating.rating,
        defenderRating: defenderRating.rating,
        attackerRatingChange,
        defenderRatingChange,
        winnerId,
        combatLog: JSON.parse(JSON.stringify({ ...combatResult, log: mapTemplateCombatLog(combatResult.log) })) as Prisma.InputJsonValue,
        attackerStyle: attackStyle,
        defenderStyle,
        turnsSpent: turnCost,
        isRevenge,
        attackerRead: true,
        defenderRead: false,
      },
    });

    // Upsert cooldown (admins bypass for testing)
    if (attacker.role !== 'admin') {
      const expiresAt = new Date(now.getTime() + PVP_CONSTANTS.COOLDOWN_HOURS * 60 * 60 * 1000);
      await tx.pvpCooldown.upsert({
        where: { attackerId_defenderId: { attackerId, defenderId: targetId } },
        create: { attackerId, defenderId: targetId, expiresAt },
        update: { expiresAt },
      });
    }

    return matchRecord;
  });

  // Apply durability loss (skip for bot defenders to preserve their gear)
  // TODO: skip potion consumption for bots when auto-potions are implemented
  const [attackerDurability, defenderDurability] = await Promise.all([
    degradeEquippedDurability(attackerId, combatResult.log, 'combatantA'),
    target.isBot ? [] : degradeEquippedDurability(targetId, combatResult.log, 'combatantB'),
  ]);

  // Persist attacker resources after combat
  const attackerKnockedOut = false;
  let fleeOutcome: string | null = null;
  if (combatResult.combatantAHpRemaining <= 0) {
    // PvP loss: guaranteed escape, no knockout, no gold loss
    const fleeChance = calculateFleeChance(attackerAttributes.evasion, target.characterLevel);
    const roll = Math.random();
    const normalizedRoll = roll / Math.max(fleeChance, 0.01);

    let remainingHp: number;
    if (normalizedRoll >= FLEE_CONSTANTS.HIGH_SUCCESS_THRESHOLD) {
      fleeOutcome = 'clean_escape';
      remainingHp = Math.max(1, Math.floor(attackerMaxHp * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT));
    } else {
      fleeOutcome = 'wounded_escape';
      remainingHp = FLEE_CONSTANTS.PARTIAL_SUCCESS_HP;
    }

    await setAllResources(
      attackerId,
      remainingHp,
      combatResult.combatantAStaminaRemaining,
      combatResult.combatantAManaRemaining,
    );
    await setHp(attackerId, remainingHp);
  } else {
    await setAllResources(
      attackerId,
      combatResult.combatantAHpRemaining,
      combatResult.combatantAStaminaRemaining,
      combatResult.combatantAManaRemaining,
    );
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

// ---------------------------------------------------------------------------
// getHistory
// ---------------------------------------------------------------------------

export async function getHistory(playerId: string, page: number, pageSize: number) {
  const where = {
    OR: [{ attackerId: playerId }, { defenderId: playerId }],
  };

  const [matches, total] = await Promise.all([
    prisma.pvpMatch.findMany({
      where,
      include: {
        attacker: { select: { username: true } },
        defender: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pvpMatch.count({ where }),
  ]);

  return {
    matches: matches.map((m) => ({
      matchId: m.id,
      attackerId: m.attackerId,
      attackerName: m.attacker.username,
      defenderId: m.defenderId,
      defenderName: m.defender.username,
      winnerId: m.winnerId,
      attackerRating: m.attackerRating,
      defenderRating: m.defenderRating,
      attackerRatingChange: m.attackerRatingChange,
      defenderRatingChange: m.defenderRatingChange,
      attackerStyle: m.attackerStyle,
      defenderStyle: m.defenderStyle,
      isRevenge: m.isRevenge,
      turnsSpent: m.turnsSpent,
      createdAt: m.createdAt.toISOString(),
    })),
    pagination: buildPagination(page, pageSize, total),
  };
}

// ---------------------------------------------------------------------------
// getMatchDetail
// ---------------------------------------------------------------------------

export async function getMatchDetail(playerId: string, matchId: string) {
  const match = await prisma.pvpMatch.findUnique({
    where: { id: matchId },
    include: {
      attacker: { select: { username: true } },
      defender: { select: { username: true } },
    },
  });

  if (!match) {
    throw new AppError(404, 'Match not found', 'NOT_FOUND');
  }
  if (match.attackerId !== playerId && match.defenderId !== playerId) {
    throw new AppError(403, 'Not authorized to view this match', 'FORBIDDEN');
  }

  return {
    matchId: match.id,
    attackerId: match.attackerId,
    attackerName: match.attacker.username,
    defenderId: match.defenderId,
    defenderName: match.defender.username,
    winnerId: match.winnerId,
    attackerRating: match.attackerRating,
    defenderRating: match.defenderRating,
    attackerRatingChange: match.attackerRatingChange,
    defenderRatingChange: match.defenderRatingChange,
    attackerStyle: match.attackerStyle,
    defenderStyle: match.defenderStyle,
    isRevenge: match.isRevenge,
    turnsSpent: match.turnsSpent,
    createdAt: match.createdAt.toISOString(),
    combatLog: match.combatLog,
  };
}

// ---------------------------------------------------------------------------
// getNotificationCount (read-only, no side effects)
// ---------------------------------------------------------------------------

export async function getNotificationCount(playerId: string) {
  return prisma.pvpMatch.count({
    where: { defenderId: playerId, defenderRead: false },
  });
}

// ---------------------------------------------------------------------------
// getNotifications (read-only)
// ---------------------------------------------------------------------------

export async function getNotifications(playerId: string) {
  return prisma.pvpMatch.findMany({
    where: { defenderId: playerId, defenderRead: false },
    include: {
      attacker: { select: { username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// markNotificationsRead
// ---------------------------------------------------------------------------

export async function markNotificationsRead(playerId: string, matchIds?: string[]) {
  const where = matchIds
    ? { id: { in: matchIds }, defenderId: playerId }
    : { defenderId: playerId, defenderRead: false };

  await prisma.pvpMatch.updateMany({
    where,
    data: { defenderRead: true },
  });
}

// ---------------------------------------------------------------------------
// Scout Notifications
// ---------------------------------------------------------------------------

export async function getScoutNotificationCount(playerId: string): Promise<number> {
  return prisma.pvpScoutLog.count({
    where: { targetId: playerId, isRead: false },
  });
}

export async function getScoutNotifications(playerId: string) {
  const logs = await prisma.pvpScoutLog.findMany({
    where: { targetId: playerId, isRead: false },
    include: { scouter: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return logs.map(l => ({
    id: l.id,
    scouterName: l.scouter.username,
    createdAt: l.createdAt.toISOString(),
  }));
}

export async function markScoutNotificationsRead(playerId: string, ids?: string[]): Promise<void> {
  if (ids && ids.length > 0) {
    await prisma.pvpScoutLog.updateMany({
      where: { id: { in: ids }, targetId: playerId },
      data: { isRead: true },
    });
  } else {
    await prisma.pvpScoutLog.updateMany({
      where: { targetId: playerId, isRead: false },
      data: { isRead: true },
    });
  }
}
