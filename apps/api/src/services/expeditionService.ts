import { prisma } from '@pocketrealm/database';
import {
  EXPEDITION_CONSTANTS,
  type ExpeditionData,
  type ExpeditionMemberData,
  type ExpeditionStatus,
  type ExpeditionRoomDefinition,
} from '@pocketrealm/shared';
import { generateExpeditionRooms, type MobPoolEntry, calculateMaxHp, calculateMaxStamina, calculateMaxMana } from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';
import { addGuildLog } from './guildService';
import { getHpState } from './hpService';
import { getEquipmentStats } from './equipmentService';
import { getSkillLevel } from './combatStatsService';
import { getPlayerProgressionState } from './attributesService';

// ---------------------------------------------------------------------------
// Data Transformation
// ---------------------------------------------------------------------------

interface GuildExpeditionRow {
  id: string;
  guildId: string;
  tier: number;
  status: string;
  currentRoom: number;
  totalRooms: number;
  roomDefinitions: unknown;
  roundNumber: number;
  nextRoundAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  launchedBy: string;
  _count?: { members: number };
}

function toExpeditionData(exp: GuildExpeditionRow): ExpeditionData {
  const rooms = exp.roomDefinitions as ExpeditionRoomDefinition[];
  const currentRoomDef = rooms[exp.currentRoom];
  const mobsRemaining = currentRoomDef
    ? currentRoomDef.mobs.filter((m) => m.hp > 0).length
    : 0;

  return {
    id: exp.id,
    guildId: exp.guildId,
    tier: exp.tier,
    status: exp.status as ExpeditionStatus,
    currentRoom: exp.currentRoom,
    totalRooms: exp.totalRooms,
    currentRoomType: currentRoomDef?.roomType ?? null,
    roundNumber: exp.roundNumber,
    nextRoundAt: exp.nextRoundAt?.toISOString() ?? null,
    startedAt: exp.startedAt.toISOString(),
    completedAt: exp.completedAt?.toISOString() ?? null,
    launchedBy: exp.launchedBy,
    participantCount: exp._count?.members ?? 0,
    mobsRemaining,
  };
}

interface GuildExpeditionMemberRow {
  playerId: string;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  isKnockedOut: boolean;
  totalDamage: bigint;
  totalHealing: bigint;
  roomDamage: bigint;
  roomHealing: bigint;
  signedUpAt: Date;
  player?: { username: string };
}

function toExpeditionMemberData(m: GuildExpeditionMemberRow): ExpeditionMemberData {
  return {
    playerId: m.playerId,
    username: m.player?.username,
    currentHp: m.currentHp,
    currentStamina: m.currentStamina,
    currentMana: m.currentMana,
    isKnockedOut: m.isKnockedOut,
    totalDamage: Number(m.totalDamage),
    totalHealing: Number(m.totalHealing),
    roomDamage: Number(m.roomDamage),
    roomHealing: Number(m.roomHealing),
    signedUpAt: m.signedUpAt.toISOString(),
  };
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

  // Check player is in a guild with officer+ role
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

  // Check no active expedition
  const activeExpedition = await prisma.guildExpedition.findFirst({
    where: {
      guildId,
      status: { in: ['recruiting', 'in_progress'] },
    },
  });
  if (activeExpedition) {
    throw new AppError(400, 'Guild already has an active expedition', 'ACTIVE_EXPEDITION_EXISTS');
  }

  // Check weekly cooldown per tier
  const weeklyAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
  const recentTierExpedition = await prisma.guildExpedition.findFirst({
    where: {
      guildId,
      tier,
      status: { in: ['completed', 'failed'] },
      completedAt: { gt: weeklyAgo },
    },
  });
  if (recentTierExpedition) {
    throw new AppError(400, 'Weekly cooldown for this tier has not expired', 'WEEKLY_COOLDOWN');
  }

  // Check 24h between-expedition cooldown
  const dayAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);
  const recentAnyExpedition = await prisma.guildExpedition.findFirst({
    where: {
      guildId,
      status: { in: ['completed', 'failed'] },
      completedAt: { gt: dayAgo },
    },
  });
  if (recentAnyExpedition) {
    throw new AppError(400, '24-hour cooldown between expeditions has not expired', 'BETWEEN_COOLDOWN');
  }

  // Check treasury
  const treasuryCost = EXPEDITION_CONSTANTS.TREASURY_COST_BY_TIER[tier - 1];
  if (guild.treasuryTurns < treasuryCost) {
    throw new AppError(400, 'Insufficient guild treasury', 'INSUFFICIENT_TREASURY');
  }

  // Fetch mob pool for room generation
  const tierLevelMin = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER[tier - 1];
  const tierLevelMax = tierLevelMin + 10;
  const mobTemplates = await prisma.mobTemplate.findMany({
    where: {
      level: { gte: tierLevelMin, lte: tierLevelMax },
    },
  });
  if (mobTemplates.length === 0) {
    throw new AppError(500, 'No mobs available for this tier', 'NO_MOBS');
  }

  const mobPool: MobPoolEntry[] = mobTemplates.map((m: {
    id: string;
    name: string;
    level: number | null;
    hp: number;
    accuracy: number;
    defence: number;
    magicDefence: number;
    evasion: number;
    damageMin: number;
    damageMax: number;
    damageType: string | null;
  }) => ({
    mobTemplateId: m.id,
    name: m.name,
    level: m.level ?? 1,
    hp: m.hp,
    stats: {
      hp: m.hp,
      maxHp: m.hp,
      attack: m.accuracy,
      accuracy: m.accuracy,
      defence: m.defence,
      magicDefence: m.magicDefence,
      dodge: m.evasion,
      evasion: 0,
      damageMin: m.damageMin,
      damageMax: m.damageMax,
      speed: 0,
      damageType: (m.damageType as 'physical' | 'magic') ?? 'physical',
    },
  }));

  // Generate rooms
  const rooms = generateExpeditionRooms(tier - 1, mobPool);

  // Transaction: deduct treasury + create expedition + log
  const expedition = await prisma.$transaction(async (tx) => {
    await tx.guild.update({
      where: { id: guildId },
      data: { treasuryTurns: { decrement: treasuryCost } },
    });

    const created = await tx.guildExpedition.create({
      data: {
        guildId,
        tier,
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

  return toExpeditionData(expedition);
}

// ---------------------------------------------------------------------------
// Sign Up For Expedition
// ---------------------------------------------------------------------------

export async function signUpForExpedition(
  expeditionId: string,
  playerId: string,
): Promise<ExpeditionMemberData> {
  // Fetch expedition
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
  });
  if (!expedition) {
    throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  }
  if (expedition.status !== 'recruiting') {
    throw new AppError(400, 'Expedition is not recruiting', 'NOT_RECRUITING');
  }

  // Validate player is in same guild
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
  });
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(400, 'You are not in this guild', 'WRONG_GUILD');
  }

  // Validate player level meets tier requirement
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { characterLevel: true, username: true },
  });
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  const requiredLevel = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER[expedition.tier - 1];
  if (player.characterLevel < requiredLevel) {
    throw new AppError(400, `Character level ${requiredLevel} required for tier ${expedition.tier}`, 'LEVEL_TOO_LOW');
  }

  // Check not already signed up
  const existing = await prisma.guildExpeditionMember.findUnique({
    where: {
      expeditionId_playerId: { expeditionId, playerId },
    },
  });
  if (existing) {
    throw new AppError(400, 'Already signed up for this expedition', 'ALREADY_SIGNED_UP');
  }

  // Check player is not recovering
  const hpState = await getHpState(playerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot sign up while recovering', 'IS_RECOVERING');
  }

  // Get player max HP, stamina, mana
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

  // Spend turns and create member record in transaction
  const member = await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, playerId, EXPEDITION_CONSTANTS.SIGNUP_TURN_COST);

    return tx.guildExpeditionMember.create({
      data: {
        expeditionId,
        playerId,
        currentHp: maxHp,
        currentStamina: maxStamina,
        currentMana: maxMana,
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
