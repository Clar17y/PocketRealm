import { prisma } from '@pocketrealm/database';
import {
  EXPEDITION_CONSTANTS,
  EXPEDITION_THEMES,
  type ExpeditionData,
  type ExpeditionMemberData,
  type ExpeditionCooldownInfo,
  type ExpeditionRoomDefinition,
} from '@pocketrealm/shared';
import {
  generateExpeditionRooms,
  calculateMaxHp,
  calculateMaxStamina,
  calculateMaxMana,
} from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';
import { addGuildLog } from './guildService';
import { getHpState } from './hpService';
import { getEquipmentStats } from './equipmentService';
import { getSkillLevel } from './combatStatsService';
import { getPlayerProgressionState } from './attributesService';
import { sendPush } from './pushNotificationService';
import { clearRoomSnapshots } from './expeditionCombatCache';
import { parseJsonArray } from '../utils/jsonColumnSchemas';
import { getIo } from '../socket';
import {
  toExpeditionData,
  toExpeditionMemberData,
  getRoundInterval,
  getMembers,
  cleanupExpeditionBots,
  buildTemplateIdMap,
  buildUpdatedAttemptLogs,
  setExpeditionCooldowns,
} from './expeditionHelpers';
import { roundTimerRegistry } from './roundTimerRegistry';

// Re-export from sub-services so existing importers don't break
export { checkAndResolveExpeditionRounds, resolveDueExpeditionStep, resolveExpeditionRound, autoResolveRoom } from './expeditionRoundService';
export type { AutoResolveResult } from './expeditionRoundService';
export { handleRoomCleared, handleWipe, completeExpedition } from './expeditionTransitionService';

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

export async function getExpeditionCooldowns(guildId: string, playerId: string): Promise<ExpeditionCooldownInfo> {
  const now = new Date();
  const betweenAgo = new Date(now.getTime() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);

  const [activeExp, playerCooldowns, recentAny] = await Promise.all([
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['recruiting', 'in_progress'] } },
    }),
    prisma.expeditionCooldown.findMany({
      where: { playerId, expiresAt: { gt: now } },
    }),
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['completed', 'failed'] }, completedAt: { gt: betweenAgo } },
      select: { completedAt: true },
      orderBy: { completedAt: 'desc' },
    }),
  ]);

  const weeklyCooldowns: Record<number, string | null> = { 1: null, 2: null, 3: null };
  for (const cd of playerCooldowns) {
    weeklyCooldowns[cd.tier] = cd.expiresAt.toISOString();
  }

  const betweenCooldown = recentAny?.completedAt
    ? new Date(recentAny.completedAt.getTime() + EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS).toISOString()
    : null;

  return { weeklyCooldowns, betweenCooldown, hasActiveExpedition: !!activeExp };
}


// ---------------------------------------------------------------------------
// Launch Expedition
// ---------------------------------------------------------------------------

export async function launchExpedition(
  playerId: string,
  tier: number,
): Promise<ExpeditionData> {
  // Validate tier
  if (tier < 1 || tier > 3) {
    throw new AppError(400, 'Tier must be 1, 2, or 3', 'INVALID_TIER');
  }

  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: { guild: { include: { _count: { select: { members: true } } } } },
  });
  if (!membership) {
    throw new AppError(400, 'Not in a guild', 'NOT_IN_GUILD');
  }
  if (membership.role !== 'officer' && membership.role !== 'leader') {
    throw new AppError(403, 'Only officers and leaders can launch expeditions', 'INSUFFICIENT_ROLE');
  }

  const guild = membership.guild;
  const guildId = guild.id;

  // Check cooldowns in parallel (all independent queries)
  const now = new Date();
  const betweenAgo = new Date(now.getTime() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);

  const [activeExpedition, playerCooldown, recentAnyExpedition] = await Promise.all([
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['recruiting', 'in_progress'] } },
    }),
    prisma.expeditionCooldown.findUnique({
      where: { playerId_tier: { playerId, tier } },
    }),
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['completed', 'failed'] }, completedAt: { gt: betweenAgo } },
    }),
  ]);

  if (activeExpedition) {
    throw new AppError(400, 'Guild already has an active expedition', 'ACTIVE_EXPEDITION_EXISTS');
  }
  if (playerCooldown && playerCooldown.expiresAt > now) {
    throw new AppError(400, 'Weekly cooldown for this tier has not expired', 'WEEKLY_COOLDOWN');
  }
  if (recentAnyExpedition) {
    throw new AppError(400, 'Cooldown between expeditions has not expired', 'BETWEEN_COOLDOWN');
  }

  const treasuryCost = EXPEDITION_CONSTANTS.TREASURY_COST_BY_TIER[tier - 1];
  if (guild.treasuryTurns < treasuryCost) {
    throw new AppError(400, 'Insufficient guild treasury', 'INSUFFICIENT_TREASURY');
  }

  const tierThemes = EXPEDITION_THEMES.filter(t => t.tier === tier);
  if (tierThemes.length === 0) {
    throw new AppError(500, 'No themes available for this tier', 'NO_THEMES');
  }
  const theme = tierThemes[Math.floor(Math.random() * tierThemes.length)];

  const templateIdMap = await buildTemplateIdMap(theme);
  const rooms = generateExpeditionRooms(tier - 1, theme, Math.random, templateIdMap);

  const expedition = await prisma.$transaction(async (tx) => {
    await tx.guild.update({
      where: { id: guildId },
      data: { treasuryTurns: { decrement: treasuryCost } },
    });

    const created = await tx.guildExpedition.create({
      data: {
        guildId,
        tier,
        themeId: theme.id,
        status: 'recruiting',
        currentRoom: 0,
        totalRooms: rooms.length,
        roomDefinitions: JSON.parse(JSON.stringify(rooms)),
        roundNumber: 0,
        nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.SIGNUP_WINDOW_MS),
        launchedBy: playerId,
      },
      include: { _count: { select: { members: true } } },
    });

    await addGuildLog(
      guildId,
      'expedition_launched',
      `Tier ${tier} expedition launched`,
      { expeditionId: created.id, tier },
      tx,
    );

    return created;
  });

  if (expedition.nextRoundAt) {
    roundTimerRegistry.schedule('guildExpedition', expedition.id, expedition.nextRoundAt, getIo);
  }

  const guildMembers = await prisma.guildMember.findMany({
    where: { guildId },
    select: { playerId: true },
  });
  for (const { playerId: memberId } of guildMembers) {
    void sendPush(memberId, 'expeditionStarted', {
      title: 'Expedition Launched!',
      body: `A Tier ${tier} guild expedition is recruiting — sign up now!`,
      tag: 'expedition-recruiting',
      data: { type: 'expedition', expeditionId: expedition.id },
    });
  }

  return toExpeditionData(expedition);
}

// ---------------------------------------------------------------------------
// Sign Up For Expedition
// ---------------------------------------------------------------------------

export async function signUpForExpedition(
  expeditionId: string,
  playerId: string,
): Promise<ExpeditionMemberData> {
  const [expedition, membership, player, existing] = await Promise.all([
    prisma.guildExpedition.findUnique({ where: { id: expeditionId } }),
    prisma.guildMember.findUnique({ where: { playerId } }),
    prisma.player.findUnique({ where: { id: playerId }, select: { characterLevel: true, username: true } }),
    prisma.guildExpeditionMember.findUnique({
      where: { expeditionId_playerId: { expeditionId, playerId } },
    }),
  ]);

  if (!expedition) {
    throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  }
  if (expedition.status !== 'recruiting') {
    throw new AppError(400, 'Expedition is not recruiting', 'NOT_RECRUITING');
  }
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(400, 'You are not in this guild', 'WRONG_GUILD');
  }
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  const requiredLevel = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER[expedition.tier - 1];
  if (player.characterLevel < requiredLevel) {
    throw new AppError(400, `Character level ${requiredLevel} required for tier ${expedition.tier}`, 'LEVEL_TOO_LOW');
  }
  if (existing) {
    throw new AppError(400, 'Already signed up for this expedition', 'ALREADY_SIGNED_UP');
  }

  const hpState = await getHpState(playerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot sign up while recovering', 'IS_RECOVERING');
  }

  const [equipStats, progression, meleeLevel, rangedLevel, magicLevel] = await Promise.all([
    getEquipmentStats(playerId),
    getPlayerProgressionState(playerId),
    getSkillLevel(playerId, 'melee'),
    getSkillLevel(playerId, 'ranged'),
    getSkillLevel(playerId, 'magic'),
  ]);

  const maxHp = calculateMaxHp({
    vitalityLevel: progression.attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });
  const maxStamina = calculateMaxStamina({
    meleeLevel,
    rangedLevel,
    evasionLevel: progression.attributes.evasion,
    equipmentStaminaBonus: 0,
  });
  const maxMana = calculateMaxMana({
    magicLevel,
    equipmentManaBonus: 0,
  });

  const member = await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, playerId, EXPEDITION_CONSTANTS.SIGNUP_TURN_COST);

    return tx.guildExpeditionMember.create({
      data: {
        expeditionId,
        playerId,
        currentHp: maxHp,
        currentStamina: maxStamina,
        currentMana: maxMana,
        maxHp,
        maxStamina,
        maxMana,
      },
    });
  });

  return toExpeditionMemberData({
    ...member,
    totalDamage: member.totalDamage ?? 0n,
    totalHealing: member.totalHealing ?? 0n,
    roomDamage: member.roomDamage ?? 0n,
    roomHealing: member.roomHealing ?? 0n,
    player: { username: player.username },
  });
}

// ---------------------------------------------------------------------------
// Force Start Expedition
// ---------------------------------------------------------------------------

export async function forceStartExpedition(
  expeditionId: string,
  playerId: string,
): Promise<{ success: boolean; message: string }> {
  const [expedition, membership] = await Promise.all([
    prisma.guildExpedition.findUnique({
      where: { id: expeditionId },
      include: { _count: { select: { members: true } } },
    }),
    prisma.guildMember.findUnique({
      where: { playerId },
      select: { guildId: true, role: true },
    }),
  ]);

  if (!expedition || expedition.status !== 'recruiting') {
    throw new AppError(400, 'Expedition is not in recruiting phase', 'NOT_RECRUITING');
  }
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role === 'member') {
    throw new AppError(403, 'Officer or leader role required', 'INSUFFICIENT_ROLE');
  }
  if (expedition._count.members === 0) {
    throw new AppError(400, 'No participants signed up', 'NO_PARTICIPANTS');
  }

  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const snapshot = {
    mobs: rooms[0]?.mobs ?? [],
    members: await getMembers(expeditionId),
  };
  const nextRoundAt = new Date(Date.now() + getRoundInterval(rooms, 0));

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      status: 'in_progress',
      roomStartSnapshot: JSON.parse(JSON.stringify(snapshot)),
      nextRoundAt,
    },
  });

  roundTimerRegistry.schedule('guildExpedition', expeditionId, nextRoundAt, getIo);

  await addGuildLog(
    expedition.guildId,
    'expedition_started',
    `Tier ${expedition.tier} expedition force-started with ${expedition._count.members} members`,
    { expeditionId },
  );

  return { success: true, message: 'Expedition started' };
}

// ---------------------------------------------------------------------------
// Get Active Expedition
// ---------------------------------------------------------------------------

export async function getActiveExpedition(
  guildId: string,
): Promise<ExpeditionData | null> {
  const expedition = await prisma.guildExpedition.findFirst({
    where: {
      guildId,
      status: { in: ['recruiting', 'in_progress'] },
    },
    include: { _count: { select: { members: true } } },
  });
  if (!expedition) return null;
  return toExpeditionData(expedition);
}

// ---------------------------------------------------------------------------
// Get Expedition Status
// ---------------------------------------------------------------------------

export async function getExpeditionStatus(
  expeditionId: string,
): Promise<{ expedition: ExpeditionData; members: ExpeditionMemberData[] } | null> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { _count: { select: { members: true } } },
  });
  if (!expedition) return null;

  const members = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
    include: { player: { select: { username: true } } },
    orderBy: { signedUpAt: 'asc' },
  });

  return {
    expedition: toExpeditionData(expedition),
    members: members.map(toExpeditionMemberData),
  };
}

// ---------------------------------------------------------------------------
// Abandon Expedition
// ---------------------------------------------------------------------------

export async function abandonExpedition(expeditionId: string, playerId: string): Promise<void> {
  const [expedition, membership] = await Promise.all([
    prisma.guildExpedition.findUnique({
      where: { id: expeditionId },
      include: { members: { select: { playerId: true, totalDamage: true, totalHealing: true } } },
    }),
    prisma.guildMember.findUnique({
      where: { playerId },
      select: { guildId: true, role: true },
    }),
  ]);

  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role === 'member') {
    throw new AppError(403, 'Officer or leader role required', 'INSUFFICIENT_ROLE');
  }
  if (expedition.status !== 'recruiting' && expedition.status !== 'in_progress') {
    throw new AppError(400, 'Expedition is not active', 'NOT_ACTIVE');
  }

  if (expedition.status === 'in_progress') {
    await clearRoomSnapshots(expeditionId, expedition.currentRoom);
  }

  const newAttemptLogs = buildUpdatedAttemptLogs(expedition, { abandoned: true });

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      expeditionAttemptLogs: JSON.parse(JSON.stringify(newAttemptLogs)),
      status: 'failed',
      completedAt: new Date(),
      nextRoundAt: null,
    },
  });
  roundTimerRegistry.cancel('guildExpedition', expeditionId);

  await addGuildLog(
    expedition.guildId,
    'expedition_failed',
    'Expedition abandoned by officer',
    { expeditionId },
  );

  await setExpeditionCooldowns(expeditionId, expedition.tier);

  await cleanupExpeditionBots(expeditionId);
}

// ---------------------------------------------------------------------------
// Recover From KO
// ---------------------------------------------------------------------------

export async function recoverFromKO(
  expeditionId: string,
  playerId: string,
): Promise<ExpeditionMemberData> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
  });
  if (!expedition) {
    throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  }
  if (expedition.status !== 'in_progress') {
    throw new AppError(400, 'Expedition is not in progress', 'NOT_IN_PROGRESS');
  }
  if (expedition.roundNumber > 0) {
    throw new AppError(400, 'Can only recover between rooms', 'ROOM_IN_PROGRESS');
  }

  const member = await prisma.guildExpeditionMember.findUnique({
    where: { expeditionId_playerId: { expeditionId, playerId } },
    include: { player: { select: { username: true } } },
  });
  if (!member) {
    throw new AppError(400, 'Not a member of this expedition', 'NOT_A_MEMBER');
  }
  if (!member.isKnockedOut) {
    throw new AppError(400, 'Not knocked out', 'NOT_KNOCKED_OUT');
  }

  const [equipStats, progression] = await Promise.all([
    getEquipmentStats(playerId),
    getPlayerProgressionState(playerId),
  ]);
  const maxHp = calculateMaxHp({
    vitalityLevel: progression.attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });
  const restoredHp = Math.floor(maxHp * 0.3);

  const updated = await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, playerId, EXPEDITION_CONSTANTS.KO_RECOVERY_TURN_COST);

    return tx.guildExpeditionMember.update({
      where: { expeditionId_playerId: { expeditionId, playerId } },
      data: {
        isKnockedOut: false,
        currentHp: restoredHp,
      },
      include: { player: { select: { username: true } } },
    });
  });

  return toExpeditionMemberData(updated);
}

// ---------------------------------------------------------------------------
// Shared Validation: Active Expedition Member
// ---------------------------------------------------------------------------

async function assertActiveMember(
  expeditionId: string,
  playerId: string,
): Promise<{ expedition: NonNullable<Awaited<ReturnType<typeof prisma.guildExpedition.findUnique>>>; member: NonNullable<Awaited<ReturnType<typeof prisma.guildExpeditionMember.findUnique>>> }> {
  const [expedition, member] = await Promise.all([
    prisma.guildExpedition.findUnique({ where: { id: expeditionId } }),
    prisma.guildExpeditionMember.findUnique({
      where: { expeditionId_playerId: { expeditionId, playerId } },
    }),
  ]);
  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (expedition.status !== 'in_progress') throw new AppError(400, 'Expedition is not in progress', 'NOT_IN_PROGRESS');
  if (!member) throw new AppError(400, 'Not a member of this expedition', 'NOT_A_MEMBER');
  if (member.isKnockedOut) throw new AppError(400, 'Cannot perform action while knocked out', 'KNOCKED_OUT');
  return { expedition, member };
}

// ---------------------------------------------------------------------------
// Set Target Mob
// ---------------------------------------------------------------------------

export async function setTargetMob(
  expeditionId: string,
  playerId: string,
  targetMobId: string | null,
): Promise<void> {
  const { expedition } = await assertActiveMember(expeditionId, playerId);

  if (targetMobId !== null) {
    const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
    const currentRoomDef = rooms[expedition.currentRoom];
    if (!currentRoomDef) throw new AppError(400, 'No current room', 'NO_ROOM');
    const mob = currentRoomDef.mobs.find(m => m.id === targetMobId && m.hp > 0);
    if (!mob) throw new AppError(400, 'Target mob not found or dead', 'INVALID_TARGET');
  }

  await prisma.guildExpeditionMember.update({
    where: { expeditionId_playerId: { expeditionId, playerId } },
    data: { targetMobId },
  });
}

// ---------------------------------------------------------------------------
// Set Heal Target
// ---------------------------------------------------------------------------

export async function setHealTarget(
  expeditionId: string,
  playerId: string,
  healTargetPlayerId: string | null,
): Promise<void> {
  await assertActiveMember(expeditionId, playerId);

  if (healTargetPlayerId !== null) {
    const target = await prisma.guildExpeditionMember.findUnique({
      where: { expeditionId_playerId: { expeditionId, playerId: healTargetPlayerId } },
    });
    if (!target) throw new AppError(400, 'Target player is not a member of this expedition', 'INVALID_HEAL_TARGET');
    if (target.isKnockedOut || target.currentHp <= 0) {
      throw new AppError(400, 'Cannot target a knocked out player', 'TARGET_KNOCKED_OUT');
    }
  }

  await prisma.guildExpeditionMember.update({
    where: { expeditionId_playerId: { expeditionId, playerId } },
    data: { healTargetPlayerId },
  });
}
