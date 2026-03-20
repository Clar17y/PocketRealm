import type { Server } from 'socket.io';
import { Prisma, prisma } from '@pocketrealm/database';
import {
  EXPEDITION_CONSTANTS,
  EXPEDITION_THEMES,
  EXPEDITION_THEMES_BY_ID,
  ALWAYS_AVAILABLE_ACTION_IDS,
  BASE_ACTION_DEFINITIONS,
  type ActionDefinition,
  type ExpeditionAttemptLog,
  type ExpeditionData,
  type ExpeditionMemberData,
  type ExpeditionStatus,
  type ExpeditionRoomDefinition,
  type ExpeditionRoundLog,
  type RaidRoundInput,
  type RaidParticipant,
  type RaidThreatEntry,
  type ExpeditionCooldownInfo,
  type ExpeditionMobState,
  type PotionConsumed,
} from '@pocketrealm/shared';
import {
  generateExpeditionRooms,
  resolveRaidRound,
  buildPlayerCombatStats,
  calculateMaxHp,
  calculateMaxStamina,
  calculateMaxMana,
  calculateStaminaRegenPerRound,
  calculateManaRegenPerRound,
  initThreatTable,
} from '@pocketrealm/game-engine';
import { awardRoomTokens, awardCompletionBonus, distributeRoomLoot } from './expeditionLootService';
import type { ExpeditionContributor } from './expeditionLootService';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';
import { addGuildLog } from './guildService';
import { getHpState } from './hpService';
import { getEquipmentStats } from './equipmentService';
import { getSkillLevel, getMainHandAttackSkill } from './combatStatsService';
import { getPlayerProgressionState } from './attributesService';
import { getActiveTemplate } from './combatTemplateService';
import { preparePlayerForCombat, applyGuildCombatModifiers } from './combatOrchestrationService';
import { buildPotionPool, templateHasPotionActions, deductConsumedPotions } from './potionService';
import { parseJsonArray } from '../utils/jsonColumnSchemas';
import { validateEnum } from '../utils/validateEnum';
import { sendPush } from './pushNotificationService';
import { snapshotCombatData, getCombatSnapshot, clearRoomSnapshots, type ExpeditionCombatSnapshot } from './expeditionCombatCache';

// ---------------------------------------------------------------------------
// Bot Cleanup — delete bot players created by admin /expedition/fill
// ---------------------------------------------------------------------------

async function cleanupExpeditionBots(expeditionId: string): Promise<void> {
  const botMembers = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId, player: { isBot: true } },
    select: { playerId: true },
  });
  if (botMembers.length === 0) return;
  // Cascade deletes clean up GuildMember, TurnBank, Skills, Items, etc.
  await prisma.player.deleteMany({
    where: { id: { in: botMembers.map((m) => m.playerId) } },
  });
}

const VALID_EXPEDITION_STATUSES = new Set<ExpeditionStatus>(['recruiting', 'in_progress', 'completed', 'failed']);

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
  roundSummaries?: unknown;
  nextRoundAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  launchedBy: string;
  wipeCount?: number;
  expeditionAttemptLogs?: unknown;
  themeId?: string | null;
  _count?: { members: number };
}

function toExpeditionData(exp: GuildExpeditionRow): ExpeditionData {
  const rooms = parseJsonArray<ExpeditionRoomDefinition>(exp.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[exp.currentRoom];
  const aliveMobs = currentRoomDef
    ? currentRoomDef.mobs.filter((m) => m.hp > 0)
    : [];

  const roundLogs = parseJsonArray<ExpeditionRoundLog>(exp.roundSummaries, 'roundSummaries');

  return {
    id: exp.id,
    guildId: exp.guildId,
    tier: exp.tier,
    status: validateEnum(exp.status, VALID_EXPEDITION_STATUSES, 'failed'),
    currentRoom: exp.currentRoom,
    totalRooms: exp.totalRooms,
    currentRoomType: currentRoomDef?.roomType ?? null,
    roundNumber: exp.roundNumber,
    nextRoundAt: exp.nextRoundAt?.toISOString() ?? null,
    startedAt: exp.startedAt.toISOString(),
    completedAt: exp.completedAt?.toISOString() ?? null,
    launchedBy: exp.launchedBy,
    wipeCount: exp.wipeCount ?? 0,
    attemptNumber: (exp.wipeCount ?? 0) + 1,
    participantCount: exp._count?.members ?? 0,
    mobsRemaining: aliveMobs.length,
    currentRoomMobs: aliveMobs.map(m => ({
      id: m.id,
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      activeEffects: m.activeEffects ?? [],
    })),
    roundLogs,
    attemptLogs: parseJsonArray<ExpeditionAttemptLog>(exp.expeditionAttemptLogs, 'expeditionAttemptLogs'),
    themeId: exp.themeId ?? null,
    themeName: EXPEDITION_THEMES_BY_ID.get(exp.themeId ?? '')?.name ?? null,
  };
}

interface GuildExpeditionMemberRow {
  playerId: string;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  maxHp: number;
  maxStamina: number;
  maxMana: number;
  isKnockedOut: boolean;
  totalDamage: bigint;
  totalHealing: bigint;
  roomDamage: bigint;
  roomHealing: bigint;
  targetMobId: string | null;
  healTargetPlayerId?: string | null;
  activeEffects?: unknown;
  threatValue: number;
  tokensEarned: number;
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
    maxHp: m.maxHp,
    maxStamina: m.maxStamina,
    maxMana: m.maxMana,
    isKnockedOut: m.isKnockedOut,
    totalDamage: Number(m.totalDamage),
    totalHealing: Number(m.totalHealing),
    roomDamage: Number(m.roomDamage),
    roomHealing: Number(m.roomHealing),
    targetMobId: m.targetMobId,
    activeEffects: parseJsonArray<ExpeditionMemberData['activeEffects'][number]>(m.activeEffects, 'member.activeEffects'),
    healTargetPlayerId: m.healTargetPlayerId ?? null,
    threatValue: m.threatValue,
    tokensEarned: m.tokensEarned,
    signedUpAt: m.signedUpAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

export async function getExpeditionCooldowns(guildId: string): Promise<ExpeditionCooldownInfo> {
  const weeklyAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
  const betweenAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);

  const [activeExp, recentCompleted, recentAny] = await Promise.all([
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['recruiting', 'in_progress'] } },
    }),
    prisma.guildExpedition.findMany({
      where: { guildId, status: 'completed', completedAt: { gt: weeklyAgo } },
      select: { tier: true, completedAt: true },
    }),
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['completed', 'failed'] }, completedAt: { gt: betweenAgo } },
      select: { completedAt: true },
      orderBy: { completedAt: 'desc' },
    }),
  ]);

  const weeklyCooldowns: Record<number, string | null> = { 1: null, 2: null, 3: null };
  for (const exp of recentCompleted) {
    if (exp.completedAt) {
      const expiry = new Date(exp.completedAt.getTime() + EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
      if (!weeklyCooldowns[exp.tier] || expiry > new Date(weeklyCooldowns[exp.tier]!)) {
        weeklyCooldowns[exp.tier] = expiry.toISOString();
      }
    }
  }

  const betweenCooldown = recentAny?.completedAt
    ? new Date(recentAny.completedAt.getTime() + EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS).toISOString()
    : null;

  return { weeklyCooldowns, betweenCooldown, hasActiveExpedition: !!activeExp };
}

// ---------------------------------------------------------------------------
// Mob Template ID Mapping
// ---------------------------------------------------------------------------

async function buildTemplateIdMap(theme: import('@pocketrealm/shared').ExpeditionTheme): Promise<Map<string, string>> {
  const expeditionMobTemplates = await prisma.mobTemplate.findMany({
    where: { isExpeditionMob: true },
    select: { id: true, name: true },
  });
  const templateIdMap = new Map<string, string>();
  const allThemeMobs = [
    ...theme.trash, ...theme.elites, theme.miniBoss,
    ...theme.miniBossAdds, theme.casterAdd, theme.finalBoss.mob,
    theme.regularAdd,
  ];
  for (const themeMob of allThemeMobs) {
    const match = expeditionMobTemplates.find(t => t.name === themeMob.name);
    if (match) templateIdMap.set(themeMob.key, match.id);
  }
  return templateIdMap;
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

  // Check cooldowns in parallel (all independent queries)
  const weeklyAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
  const dayAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);

  const [activeExpedition, recentTierExpedition, recentAnyExpedition] = await Promise.all([
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['recruiting', 'in_progress'] } },
    }),
    prisma.guildExpedition.findFirst({
      where: { guildId, tier, status: 'completed', completedAt: { gt: weeklyAgo } },
    }),
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['completed', 'failed'] }, completedAt: { gt: dayAgo } },
    }),
  ]);

  if (activeExpedition) {
    throw new AppError(400, 'Guild already has an active expedition', 'ACTIVE_EXPEDITION_EXISTS');
  }
  if (recentTierExpedition) {
    throw new AppError(400, 'Weekly cooldown for this tier has not expired', 'WEEKLY_COOLDOWN');
  }
  if (recentAnyExpedition) {
    throw new AppError(400, 'Cooldown between expeditions has not expired', 'BETWEEN_COOLDOWN');
  }

  // Check treasury
  const treasuryCost = EXPEDITION_CONSTANTS.TREASURY_COST_BY_TIER[tier - 1];
  if (guild.treasuryTurns < treasuryCost) {
    throw new AppError(400, 'Insufficient guild treasury', 'INSUFFICIENT_TREASURY');
  }

  // Select a random theme for this tier
  const tierThemes = EXPEDITION_THEMES.filter(t => t.tier === tier);
  if (tierThemes.length === 0) {
    throw new AppError(500, 'No themes available for this tier', 'NO_THEMES');
  }
  const theme = tierThemes[Math.floor(Math.random() * tierThemes.length)];

  const templateIdMap = await buildTemplateIdMap(theme);
  const rooms = generateExpeditionRooms(tier - 1, theme, Math.random, templateIdMap);

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

  // Notify all guild members about the new expedition
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
  // Fetch all validation data in parallel (all independent queries)
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

  // Transition to in_progress (same pattern as checkAndResolveExpeditionRounds)
  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const snapshot = {
    mobs: rooms[0]?.mobs ?? [],
    members: await getMembers(expeditionId),
  };

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      status: 'in_progress',
      roomStartSnapshot: JSON.parse(JSON.stringify(snapshot)),
      nextRoundAt: new Date(Date.now() + getRoundInterval(rooms, 0)),
    },
  });

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
// Round Interval Helper
// ---------------------------------------------------------------------------

function getRoundInterval(rooms: ExpeditionRoomDefinition[], currentRoom: number): number {
  const roomType = rooms[currentRoom]?.roomType ?? 'trash';
  return EXPEDITION_CONSTANTS.ROUND_INTERVAL_BY_ROOM_TYPE[roomType]
    ?? EXPEDITION_CONSTANTS.ROUND_INTERVAL_BY_ROOM_TYPE.trash;
}

// ---------------------------------------------------------------------------
// Shared Helpers: Summon Pool & Room Mob State
// ---------------------------------------------------------------------------

async function buildSummonPool(themeId: string | null): Promise<ExpeditionMobState[]> {
  const theme = EXPEDITION_THEMES_BY_ID.get(themeId ?? '');
  if (!theme) return [];

  const summonNames = [theme.regularAdd.name, theme.casterAdd.name];
  const summonTemplates = await prisma.mobTemplate.findMany({
    where: { isExpeditionMob: true, name: { in: summonNames } },
    select: { id: true, name: true },
  });
  const summonIdByName = new Map(summonTemplates.map(t => [t.name, t.id]));

  return [theme.regularAdd, theme.casterAdd].map((add, i) => ({
    id: `summon-template-${i}`,
    mobTemplateId: summonIdByName.get(add.name) ?? '',
    name: add.name,
    prefix: null,
    hp: add.hp,
    maxHp: add.hp,
    stats: { ...add.stats, hp: add.hp, maxHp: add.hp },
    actionTemplate: [...add.actionTemplate],
    activeEffects: [],
  }));
}

async function recordExpeditionKills(
  themeId: string,
  playerIds: string[],
  mobsBefore: ExpeditionMobState[],
  mobsAfter: ExpeditionMobState[],
): Promise<void> {
  const afterIds = new Set(mobsAfter.filter(m => m.hp > 0).map(m => m.id));
  const killedMobs = mobsBefore.filter(m => m.hp > 0 && !afterIds.has(m.id));
  if (killedMobs.length === 0) return;

  const killCounts = new Map<string, number>();
  for (const mob of killedMobs) {
    killCounts.set(mob.mobTemplateId, (killCounts.get(mob.mobTemplateId) ?? 0) + 1);
  }

  await prisma.$transaction(
    playerIds.flatMap(playerId =>
      [...killCounts].map(([mobTemplateId, count]) =>
        prisma.playerExpeditionBestiary.upsert({
          where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
          create: { playerId, mobTemplateId, theme: themeId, killCount: count },
          update: { killCount: { increment: count } },
        }),
      ),
    ),
  );
}

function buildUpdatedRoomMobs(
  currentRoomDef: ExpeditionRoomDefinition,
  mobsAfter: ExpeditionMobState[],
  rooms: ExpeditionRoomDefinition[],
  currentRoom: number,
): ExpeditionRoomDefinition[] {
  const updatedRooms = [...rooms];
  const existingMobIds = new Set(currentRoomDef.mobs.map(m => m.id));
  const updatedMobs = currentRoomDef.mobs.map(mob => {
    const afterMob = mobsAfter.find(m => m.id === mob.id);
    return afterMob
      ? { ...mob, hp: afterMob.hp, activeEffects: afterMob.activeEffects, actionTemplate: afterMob.actionTemplate }
      : { ...mob, hp: 0 };
  });
  for (const afterMob of mobsAfter) {
    if (!existingMobIds.has(afterMob.id)) updatedMobs.push(afterMob);
  }
  updatedRooms[currentRoom] = { ...currentRoomDef, mobs: updatedMobs };
  return updatedRooms;
}

// ---------------------------------------------------------------------------
// Build Raid Participant (follows bossEncounterService pattern)
// ---------------------------------------------------------------------------

type BuildParticipantInput = {
  playerId: string; currentHp: number; currentStamina: number; currentMana: number;
  templateRound: number; activeEffects: unknown;
  targetMobId?: string | null; healTargetPlayerId?: string | null;
  player?: { username: string };
};

/**
 * Fetch all combat-relevant data for a player and return it as a snapshot.
 * This is called once at room start; the snapshot is then stored in Redis.
 */
async function fetchCombatDataForSnapshot(
  member: BuildParticipantInput,
): Promise<ExpeditionCombatSnapshot> {
  const [equipStats, progression] = await Promise.all([
    getEquipmentStats(member.playerId),
    getPlayerProgressionState(member.playerId),
  ]);
  const maxHp = calculateMaxHp({
    vitalityLevel: progression.attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });

  const prep = await preparePlayerForCombat(member.playerId, {
    maxHp,
    preloaded: { equipmentStats: equipStats, progression },
  });

  return {
    equipmentStats: prep.equipmentStats,
    attackSkill: prep.attackSkill,
    attackLevel: prep.attackLevel,
    progression: { attributes: prep.progression.attributes },
    guildMods: { combatDamage: prep.guildMods.combatDamage, defenseBoost: prep.guildMods.defenseBoost },
    perActionScaling: prep.perActionScaling,
    playerTemplate: prep.playerTemplate,
    unlockedActions: prep.unlockedActions,
    potionPool: prep.potionPool,
    maxHp,
    maxStamina: prep.resources.maxStamina,
    staminaRegenPerRound: prep.resources.staminaRegenPerRound,
    maxMana: prep.resources.maxMana,
    manaRegenPerRound: prep.resources.manaRegenPerRound,
  };
}

/**
 * Build a RaidParticipant from a pre-fetched snapshot (no DB queries).
 */
function buildParticipantFromSnapshot(
  member: BuildParticipantInput,
  snapshot: ExpeditionCombatSnapshot,
): RaidParticipant {
  const stats = buildPlayerCombatStats(
    snapshot.maxHp, snapshot.maxHp,
    { attackStyle: snapshot.attackSkill, skillLevel: snapshot.attackLevel, attributes: snapshot.progression.attributes },
    snapshot.equipmentStats,
  );
  applyGuildCombatModifiers(stats, snapshot.guildMods);

  const unlockedSet = new Set(snapshot.unlockedActions);
  const filteredActions: Record<string, ActionDefinition> = {};
  for (const [id, def] of Object.entries(BASE_ACTION_DEFINITIONS)) {
    if (ALWAYS_AVAILABLE_ACTION_IDS.has(id) || unlockedSet.has(id)) {
      filteredActions[id] = def;
    }
  }
  for (const slot of snapshot.playerTemplate) {
    for (const actionId of [slot.actionId, slot.thenActionId]) {
      if (actionId && !filteredActions[actionId] && BASE_ACTION_DEFINITIONS[actionId]) {
        filteredActions[actionId] = BASE_ACTION_DEFINITIONS[actionId];
      }
    }
  }

  const effects = Array.isArray(member.activeEffects) ? member.activeEffects : [];

  return {
    playerId: member.playerId,
    username: member.player?.username,
    targetMobId: member.targetMobId ?? null,
    healTargetPlayerId: member.healTargetPlayerId ?? null,
    stats,
    template: snapshot.playerTemplate.map(s => ({
      actionId: s.actionId,
      condition: s.condition,
      thenActionId: s.thenActionId ?? undefined,
      sortOrder: s.sortOrder,
    })),
    actionDefinitions: filteredActions,
    hp: member.currentHp,
    maxHp: snapshot.maxHp,
    stamina: member.currentStamina,
    maxStamina: snapshot.maxStamina,
    staminaRegenPerRound: snapshot.staminaRegenPerRound,
    mana: member.currentMana,
    maxMana: snapshot.maxMana,
    manaRegenPerRound: snapshot.manaRegenPerRound,
    templateRound: member.templateRound,
    activeEffects: effects as RaidParticipant['activeEffects'],
    availablePotions: snapshot.potionPool,
  };
}

/**
 * Build a raid participant. Checks Redis snapshot first (set at room start),
 * falls back to full DB fetch on cache miss.
 */
async function buildRaidParticipant(
  member: BuildParticipantInput,
  expeditionId?: string,
  roomIndex?: number,
): Promise<RaidParticipant> {
  // Try cached snapshot first (set at room start)
  if (expeditionId !== undefined && roomIndex !== undefined) {
    const snapshot = await getCombatSnapshot(expeditionId, roomIndex, member.playerId);
    if (snapshot) return buildParticipantFromSnapshot(member, snapshot);
  }

  // Fallback: fetch from DB (first round of room, or cache miss)
  const snapshot = await fetchCombatDataForSnapshot(member);
  return buildParticipantFromSnapshot(member, snapshot);
}

// ---------------------------------------------------------------------------
// Check & Resolve Expedition Rounds (background timer entry point)
// ---------------------------------------------------------------------------

export async function checkAndResolveExpeditionRounds(io: Server | null): Promise<void> {
  const now = new Date();
  const dueExpeditions = await prisma.guildExpedition.findMany({
    where: {
      status: { in: ['recruiting', 'in_progress'] },
      nextRoundAt: { lte: now },
    },
    include: { _count: { select: { members: true } } },
  });

  for (const exp of dueExpeditions) {
    if (exp.status === 'recruiting') {
      const minParticipants = EXPEDITION_CONSTANTS.MIN_PARTICIPANTS_BY_TIER[exp.tier - 1];
      const memberCount = exp._count.members;

      if (memberCount >= minParticipants) {
        // Transition to in_progress: take room start snapshot, schedule first round
        const rooms = parseJsonArray<ExpeditionRoomDefinition>(exp.roomDefinitions, 'roomDefinitions');
        const snapshot = {
          mobs: rooms[0]?.mobs ?? [],
          members: await getMembers(exp.id),
        };

        await prisma.guildExpedition.update({
          where: { id: exp.id },
          data: {
            status: 'in_progress',
            roomStartSnapshot: JSON.parse(JSON.stringify(snapshot)),
            nextRoundAt: new Date(Date.now() + getRoundInterval(rooms, 0)),
          },
        });

        await addGuildLog(
          exp.guildId,
          'expedition_started',
          `Tier ${exp.tier} expedition started with ${memberCount} members`,
          { expeditionId: exp.id },
        );

      } else {
        // Not enough players, fail the expedition
        await prisma.guildExpedition.update({
          where: { id: exp.id },
          data: {
            status: 'failed',
            completedAt: now,
            nextRoundAt: null,
          },
        });

        await addGuildLog(
          exp.guildId,
          'expedition_failed',
          `Tier ${exp.tier} expedition failed - not enough participants (${memberCount}/${minParticipants})`,
          { expeditionId: exp.id },
        );

        await cleanupExpeditionBots(exp.id);
      }
    } else if (exp.status === 'in_progress') {
      await resolveExpeditionRound(exp.id, io);
    }
  }
}

// Helper to get member snapshot data
async function getMembers(expeditionId: string) {
  const members = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
  });
  return members.map(m => ({
    playerId: m.playerId,
    currentHp: m.currentHp,
    currentStamina: m.currentStamina,
    currentMana: m.currentMana,
  }));
}

// ---------------------------------------------------------------------------
// Resolve Expedition Round
// ---------------------------------------------------------------------------

export async function resolveExpeditionRound(expeditionId: string, io: Server | null): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: {
      members: { include: { player: { select: { username: true } } } },
    },
  });
  if (!expedition || expedition.status !== 'in_progress') return;

  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[expedition.currentRoom];
  if (!currentRoomDef) return;

  // Get alive members (not KO'd and HP > 0)
  const aliveMembers = expedition.members.filter(m => !m.isKnockedOut && m.currentHp > 0);
  if (aliveMembers.length === 0) {
    await handleWipe(expeditionId);
    return;
  }

  // Get surviving mobs
  const survivingMobs = currentRoomDef.mobs.filter(m => m.hp > 0);
  if (survivingMobs.length === 0) {
    await handleRoomCleared(expeditionId);
    return;
  }

  // First round of room — fetch and snapshot combat data for all members
  if (expedition.roundNumber === 0) {
    const snapshots = await Promise.all(
      aliveMembers.map(async m => ({
        playerId: m.playerId,
        snapshot: await fetchCombatDataForSnapshot(m),
      })),
    );
    await Promise.all(
      snapshots.map(s => snapshotCombatData(expeditionId, expedition.currentRoom, s.playerId, s.snapshot)),
    );
  }

  // Build participants (reads from snapshot for all rounds including round 0)
  const participants: RaidParticipant[] = await Promise.all(
    aliveMembers.map(m => buildRaidParticipant(m, expeditionId, expedition.currentRoom)),
  );

  // Build threat table from member records (init fresh if round 1 of room)
  const nextRound = expedition.roundNumber + 1;
  let threatTable: RaidThreatEntry[];
  if (expedition.roundNumber === 0) {
    threatTable = initThreatTable(aliveMembers.map(m => m.playerId));
  } else {
    threatTable = initThreatTable(aliveMembers.map(m => m.playerId));
    for (const member of aliveMembers) {
      const entry = threatTable.find(e => e.playerId === member.playerId);
      if (entry) entry.threat = member.threatValue;
    }
  }

  const summonPool = await buildSummonPool(expedition.themeId);

  const input: RaidRoundInput = {
    mobs: survivingMobs,
    participants,
    threatTable,
    roundNumber: nextRound,
    environmentalDotPercent: currentRoomDef.environmentalDotPercent,
    summonPool,
  };

  const result = resolveRaidRound(input);

  // --- Prepare all expedition-level data BEFORE the atomic write ---

  const updatedRooms = buildUpdatedRoomMobs(currentRoomDef, result.mobsAfter, rooms, expedition.currentRoom);

  // Build round log from engine result
  const roundLog: ExpeditionRoundLog = {
    ...result.roundLog,
    roomIndex: expedition.currentRoom,
  };
  const existingLogs = parseJsonArray<ExpeditionRoundLog>(expedition.roundSummaries, 'roundSummaries');
  const newSummaries = [...existingLogs, roundLog];

  // Compute nextRoundAt for the normal (non-cleared, non-wipe) case
  const nextRoundAt = result.roomCleared || result.allPlayersDead
    ? null
    : new Date(Date.now() + getRoundInterval(rooms, expedition.currentRoom));

  // --- Atomic optimistic-locked write: roundNumber + roundSummaries + roomDefinitions ---
  // This prevents the race where a fast subsequent round overwrites this round's log.
  const updated = await prisma.guildExpedition.updateMany({
    where: { id: expeditionId, roundNumber: expedition.roundNumber },
    data: {
      roundNumber: nextRound,
      roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
      roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
      nextRoundAt,
    },
  });
  if (updated.count === 0) return; // Another process resolved this round

  // Update member records from results
  await Promise.all(
    result.participantResults.map(pr => {
      const threatEntry = result.threatTableAfter.find(t => t.playerId === pr.playerId);
      return prisma.guildExpeditionMember.updateMany({
        where: { expeditionId, playerId: pr.playerId },
        data: {
          currentHp: pr.hpAfter,
          currentStamina: pr.staminaAfter,
          currentMana: pr.manaAfter,
          totalDamage: { increment: pr.damageDealt },
          totalHealing: { increment: pr.healingDone },
          roomDamage: { increment: pr.damageDealt },
          roomHealing: { increment: pr.healingDone },
          isKnockedOut: pr.isDead,
          ...(pr.isDead ? { targetMobId: null } : {}),
          templateRound: pr.templateRoundAfter,
          activeEffects: JSON.parse(JSON.stringify(pr.activeEffectsAfter)),
          threatValue: threatEntry?.threat ?? 0,
        },
      });
    }),
  );

  // Deduct consumed potions from player inventories
  for (const pr of result.participantResults) {
    if (pr.potionsConsumed.length > 0) {
      await deductConsumedPotions(pr.playerId, pr.potionsConsumed);
    }
  }

  // Record expedition bestiary kills for all alive participants
  if (expedition.themeId) {
    const participantIds = aliveMembers.map(m => m.playerId);
    await recordExpeditionKills(expedition.themeId, participantIds, survivingMobs, result.mobsAfter);
  }

  // Handle post-round transitions (room clear / wipe)
  if (result.roomCleared) {
    await handleRoomCleared(expeditionId);
  } else if (result.allPlayersDead) {
    await handleWipe(expeditionId);
  }
}

// ---------------------------------------------------------------------------
// Auto-Resolve Room (loops resolveRaidRound in-memory, persists once)
// ---------------------------------------------------------------------------

export interface AutoResolveResult {
  outcome: 'cleared' | 'wiped';
  roundsResolved: number;
  roundLogs: ExpeditionRoundLog[];
  tokensAwarded: number;
}

export async function autoResolveRoom(expeditionId: string): Promise<AutoResolveResult> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: {
      members: { include: { player: { select: { username: true } } } },
    },
  });
  if (!expedition || expedition.status !== 'in_progress') {
    throw new AppError(400, 'Expedition is not active', 'NOT_ACTIVE');
  }
  if (expedition.roundNumber !== 0) {
    throw new AppError(400, 'Room already has rounds resolved — cannot auto-resolve', 'ROUND_IN_PROGRESS');
  }

  // Prevent background timer from interfering
  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: { nextRoundAt: null },
  });

  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[expedition.currentRoom];
  if (!currentRoomDef) {
    throw new AppError(400, 'No room to resolve', 'NO_ROOM');
  }

  // Build participants once
  const aliveMembers = expedition.members.filter(m => !m.isKnockedOut && m.currentHp > 0);
  if (aliveMembers.length === 0) {
    await handleWipe(expeditionId);
    return { outcome: 'wiped', roundsResolved: 0, roundLogs: [], tokensAwarded: 0 };
  }

  // Snapshot combat data for all alive members (locked for the room)
  const snapshots = await Promise.all(
    aliveMembers.map(async m => ({
      playerId: m.playerId,
      snapshot: await fetchCombatDataForSnapshot(m),
    })),
  );
  await Promise.all(
    snapshots.map(s => snapshotCombatData(expeditionId, expedition.currentRoom, s.playerId, s.snapshot)),
  );

  // Build participants directly from snapshots (no Redis round-trip needed)
  const participants: RaidParticipant[] = aliveMembers.map((m, i) =>
    buildParticipantFromSnapshot(m, snapshots[i].snapshot),
  );

  const summonPool = await buildSummonPool(expedition.themeId);

  // In-memory state for the loop
  let mobs = currentRoomDef.mobs.filter(m => m.hp > 0);
  let threatTable = initThreatTable(aliveMembers.map(m => m.playerId));
  const allRoundLogs: ExpeditionRoundLog[] = [];
  const potionsByPlayer = new Map<string, PotionConsumed[]>();
  const damageByPlayer = new Map<string, number>();
  const healingByPlayer = new Map<string, number>();
  const isDeadByPlayer = new Map<string, boolean>();
  let roundNumber = 0;

  // Run rounds until room clear, wipe, or max rounds
  while (roundNumber < EXPEDITION_CONSTANTS.AUTO_RESOLVE_MAX_ROUNDS) {
    roundNumber++;

    const survivingMobs = mobs.filter(m => m.hp > 0);
    if (survivingMobs.length === 0) break;

    const alivePlayers = participants.filter(p => p.hp > 0);
    if (alivePlayers.length === 0) break;

    const input: RaidRoundInput = {
      mobs: survivingMobs,
      participants: alivePlayers,
      threatTable,
      roundNumber,
      environmentalDotPercent: currentRoomDef.environmentalDotPercent,
      summonPool: summonPool.map(s => ({ ...s, activeEffects: [] })),
    };

    const result = resolveRaidRound(input);

    // Carry forward participant state
    for (const pr of result.participantResults) {
      const p = participants.find(pp => pp.playerId === pr.playerId);
      if (!p) continue;

      p.hp = pr.hpAfter;
      p.stamina = pr.staminaAfter;
      p.mana = pr.manaAfter;
      p.templateRound = pr.templateRoundAfter;
      p.activeEffects = pr.activeEffectsAfter as typeof p.activeEffects;

      // Remove consumed potions from available pool
      for (const consumed of pr.potionsConsumed) {
        const idx = p.availablePotions.findIndex(pot => pot.templateId === consumed.templateId);
        if (idx >= 0) p.availablePotions.splice(idx, 1);
      }

      // Track consumed potions for later DB deduction
      if (pr.potionsConsumed.length > 0) {
        const existing = potionsByPlayer.get(pr.playerId) ?? [];
        existing.push(...pr.potionsConsumed);
        potionsByPlayer.set(pr.playerId, existing);
      }

      // Accumulate damage/healing and track dead state
      damageByPlayer.set(pr.playerId, (damageByPlayer.get(pr.playerId) ?? 0) + pr.damageDealt);
      healingByPlayer.set(pr.playerId, (healingByPlayer.get(pr.playerId) ?? 0) + pr.healingDone);
      isDeadByPlayer.set(pr.playerId, pr.isDead);
    }

    // Carry forward mob state and threat table
    mobs = result.mobsAfter;
    threatTable = result.threatTableAfter;

    // Accumulate round log
    allRoundLogs.push({ ...result.roundLog, roomIndex: expedition.currentRoom });

    if (result.roomCleared || result.allPlayersDead) break;
  }

  // Record expedition bestiary kills (compare initial room mobs to final state)
  // Only credit players who survived the room — dead players miss later kills
  if (expedition.themeId) {
    const initialMobs = currentRoomDef.mobs.filter(m => m.hp > 0);
    const survivorIds = aliveMembers
      .filter(m => !isDeadByPlayer.get(m.playerId))
      .map(m => m.playerId);
    await recordExpeditionKills(expedition.themeId, survivorIds, initialMobs, mobs);
  }

  // Determine outcome
  const outcome = mobs.filter(m => m.hp > 0).length === 0 ? 'cleared' : 'wiped';

  const updatedRooms = buildUpdatedRoomMobs(currentRoomDef, mobs, rooms, expedition.currentRoom);

  // Persist final state (optimistic lock: only if still at round 0)
  const updated = await prisma.guildExpedition.updateMany({
    where: { id: expeditionId, roundNumber: 0 },
    data: {
      roundNumber,
      roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
      roundSummaries: JSON.parse(JSON.stringify(allRoundLogs)),
      nextRoundAt: null,
    },
  });
  if (updated.count === 0) {
    throw new AppError(409, 'Room was modified by another process', 'CONCURRENT_MODIFICATION');
  }

  // Update member records
  await Promise.all(
    participants.map(p => {
      const threatEntry = threatTable.find(t => t.playerId === p.playerId);
      const totalDamage = damageByPlayer.get(p.playerId) ?? 0;
      const totalHealing = healingByPlayer.get(p.playerId) ?? 0;

      return prisma.guildExpeditionMember.updateMany({
        where: { expeditionId, playerId: p.playerId },
        data: {
          currentHp: p.hp,
          currentStamina: p.stamina,
          currentMana: p.mana,
          totalDamage: { increment: totalDamage },
          totalHealing: { increment: totalHealing },
          roomDamage: { increment: totalDamage },
          roomHealing: { increment: totalHealing },
          isKnockedOut: isDeadByPlayer.get(p.playerId) ?? p.hp <= 0,
          ...(isDeadByPlayer.get(p.playerId) ?? p.hp <= 0 ? { targetMobId: null } : {}),
          templateRound: p.templateRound,
          activeEffects: JSON.parse(JSON.stringify(p.activeEffects)),
          threatValue: threatEntry?.threat ?? 0,
        },
      });
    }),
  );

  // Deduct all consumed potions (parallel — each player's items are independent)
  await Promise.all(
    [...potionsByPlayer.entries()].map(([playerId, consumed]) =>
      deductConsumedPotions(playerId, consumed),
    ),
  );

  // Handle outcome
  let tokensAwarded = 0;
  if (outcome === 'cleared') {
    await handleRoomCleared(expeditionId);

    // Award bonus tokens on top of normal award (handleRoomCleared already awards base tokens)
    const roomType = currentRoomDef.roomType;
    const baseTokens = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[roomType];
    const tierMultiplier = EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[expedition.tier - 1] ?? 1;
    const normalTokens = baseTokens * tierMultiplier;
    const bonusTokens = Math.floor(normalTokens * EXPEDITION_CONSTANTS.AUTO_RESOLVE_TOKEN_BONUS_PERCENT);
    tokensAwarded = normalTokens + bonusTokens;

    if (bonusTokens > 0) {
      const playerIds = expedition.members.map(m => m.playerId);
      await prisma.player.updateMany({
        where: { id: { in: playerIds } },
        data: { expeditionTokens: { increment: bonusTokens } },
      });
    }
  } else {
    await handleWipe(expeditionId);
  }

  return { outcome, roundsResolved: roundNumber, roundLogs: allRoundLogs, tokensAwarded };
}

// ---------------------------------------------------------------------------
// Handle Room Cleared
// ---------------------------------------------------------------------------

export async function handleRoomCleared(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: true },
  });
  if (!expedition) return;

  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[expedition.currentRoom];
  const roomType = currentRoomDef?.roomType ?? 'trash';

  // Award per-room tokens to all members (flat, not contribution-weighted)
  await awardRoomTokens(expedition.members, roomType, expedition.tier, expeditionId);

  // Distribute item loot weighted by contribution
  const contributors: ExpeditionContributor[] = expedition.members.map(m => ({
    playerId: m.playerId,
    roomDamage: Number(m.roomDamage),
    roomHealing: Number(m.roomHealing),
  }));
  const mobTemplateIds = currentRoomDef
    ? currentRoomDef.mobs.map(m => m.mobTemplateId)
    : [];
  await distributeRoomLoot(contributors, roomType, expedition.tier, mobTemplateIds);

  // Award guild XP
  await prisma.guild.update({
    where: { id: expedition.guildId },
    data: { xp: { increment: EXPEDITION_CONSTANTS.GUILD_XP_PER_ROOM } },
  });

  // Check if last room
  if (expedition.currentRoom >= expedition.totalRooms - 1) {
    await completeExpedition(expeditionId);
    return;
  }

  // Enter rest phase: advance room, reset room-level tracking + KO flags + threat
  const nextRoom = expedition.currentRoom + 1;
  const nextRoomDef = rooms[nextRoom];

  await prisma.guildExpeditionMember.updateMany({
    where: { expeditionId },
    data: { roomDamage: 0, roomHealing: 0, isKnockedOut: false, threatValue: 0, targetMobId: null, activeEffects: [] },
  });

  // Apply rest regen to all members using stored max stats (no N+1 queries)
  const members = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
  });

  await Promise.all(
    members.map(m => {
      const regenHp = Math.floor(m.maxHp * EXPEDITION_CONSTANTS.REST_HP_REGEN);
      const regenStamina = Math.floor(m.maxStamina * EXPEDITION_CONSTANTS.REST_STAMINA_REGEN);
      const regenMana = Math.floor(m.maxMana * EXPEDITION_CONSTANTS.REST_MANA_REGEN);

      const newHp = Math.min(m.currentHp + regenHp, m.maxHp);
      const newStamina = Math.min(m.currentStamina + regenStamina, m.maxStamina);
      const newMana = Math.min(m.currentMana + regenMana, m.maxMana);

      return prisma.guildExpeditionMember.update({
        where: { id: m.id },
        data: { currentHp: newHp, currentStamina: newStamina, currentMana: newMana },
      });
    }),
  );

  // Snapshot player state for wipe recovery in the next room
  const updatedMembers = await getMembers(expeditionId);
  const snapshot = {
    mobs: nextRoomDef?.mobs ?? [],
    members: updatedMembers,
  };

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      currentRoom: nextRoom,
      roundNumber: 0,
      roomStartSnapshot: JSON.parse(JSON.stringify(snapshot)),
      nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.REST_DURATION_MS),
    },
  });
}

// ---------------------------------------------------------------------------
// Attempt-Log Archival Helper
// ---------------------------------------------------------------------------

function buildUpdatedAttemptLogs(
  expedition: { roundSummaries: unknown; expeditionAttemptLogs: unknown; currentRoom: number; wipeCount: number; members?: Array<{ playerId: string; player?: { username: string }; totalDamage: bigint; totalHealing: bigint }> },
  extra?: Record<string, unknown>,
): unknown[] {
  const currentLogs = Array.isArray(expedition.roundSummaries) ? expedition.roundSummaries : [];
  const existing = Array.isArray(expedition.expeditionAttemptLogs) ? expedition.expeditionAttemptLogs : [];
  if (currentLogs.length === 0 && !extra) return existing as unknown[];

  const attemptLog: Record<string, unknown> = {
    attempt: (expedition.wipeCount ?? 0) + 1,
    roomReached: expedition.currentRoom,
    roundLogs: currentLogs,
    ...(expedition.members ? {
      participants: expedition.members.map(m => ({
        playerId: m.playerId,
        username: m.player?.username,
        totalDamage: Number(m.totalDamage),
        totalHealing: Number(m.totalHealing),
      })),
    } : {}),
    ...extra,
  };
  return [...(existing as unknown[]), attemptLog];
}

// ---------------------------------------------------------------------------
// Handle Wipe
// ---------------------------------------------------------------------------

export async function handleWipe(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: { include: { player: { select: { username: true } } } } },
  });
  if (!expedition) return;

  const newWipeCount = (expedition.wipeCount ?? 0) + 1;
  const newAttemptLogs = buildUpdatedAttemptLogs(expedition);

  if (newWipeCount >= EXPEDITION_CONSTANTS.MAX_ATTEMPTS) {
    // Auto-abandon: max attempts reached
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        wipeCount: newWipeCount,
        expeditionAttemptLogs: JSON.parse(JSON.stringify(newAttemptLogs)),
        status: 'failed',
        completedAt: new Date(),
        nextRoundAt: null,
      },
    });
    await addGuildLog(
      expedition.guildId,
      'expedition_failed',
      `Expedition failed after ${newWipeCount} attempts`,
      { expeditionId, wipeCount: newWipeCount },
    );

    // Notify expedition members of failure
    for (const member of expedition.members) {
      void sendPush(member.playerId, 'expeditionFinished', {
        title: 'Expedition Failed',
        body: `Your Tier ${expedition.tier} expedition failed after ${newWipeCount} attempts.`,
        tag: 'expedition-finished',
        data: { type: 'expedition', expeditionId },
      });
    }

    await cleanupExpeditionBots(expeditionId);
    return;
  }

  // Reset to recruiting: delete all members, regenerate rooms using same theme
  const wipeTheme = EXPEDITION_THEMES_BY_ID.get(expedition.themeId ?? '');
  if (!wipeTheme) {
    throw new AppError(500, 'Theme not found for expedition', 'NO_THEMES');
  }
  const wipeTemplateIdMap = await buildTemplateIdMap(wipeTheme);
  const rooms = generateExpeditionRooms(expedition.tier - 1, wipeTheme, Math.random, wipeTemplateIdMap);

  // Collect bot player IDs before the transaction deletes GuildExpeditionMember rows
  const botMembers = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId, player: { isBot: true } },
    select: { playerId: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.guildExpeditionMember.deleteMany({ where: { expeditionId } });

    await tx.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        wipeCount: newWipeCount,
        expeditionAttemptLogs: JSON.parse(JSON.stringify(newAttemptLogs)),
        status: 'recruiting',
        currentRoom: 0,
        totalRooms: rooms.length,
        roomDefinitions: JSON.parse(JSON.stringify(rooms)),
        roomStartSnapshot: Prisma.DbNull,
        roundNumber: 0,
        roundSummaries: Prisma.DbNull,
        nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.SIGNUP_WINDOW_MS),
      },
    });
  });

  // Delete bot Player records after members are removed
  if (botMembers.length > 0) {
    await prisma.player.deleteMany({
      where: { id: { in: botMembers.map((m) => m.playerId) } },
    });
  }

  await addGuildLog(
    expedition.guildId,
    'expedition_wipe',
    `Expedition wipe in room ${expedition.currentRoom + 1} (attempt ${newWipeCount}/${EXPEDITION_CONSTANTS.MAX_ATTEMPTS})`,
    { expeditionId, roomIndex: expedition.currentRoom, attempt: newWipeCount },
  );
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

  // Archive current round logs if any
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

  await addGuildLog(
    expedition.guildId,
    'expedition_failed',
    'Expedition abandoned by officer',
    { expeditionId },
  );

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

  // Calculate maxHp to restore to 30%
  const [equipStats, progression] = await Promise.all([
    getEquipmentStats(playerId),
    getPlayerProgressionState(playerId),
  ]);
  const maxHp = calculateMaxHp({
    vitalityLevel: progression.attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });
  const restoredHp = Math.floor(maxHp * 0.3);

  // Spend turns and update member in a transaction
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
// Complete Expedition
// ---------------------------------------------------------------------------

export async function completeExpedition(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: { include: { player: { select: { username: true } } } } },
  });
  if (!expedition) return;

  // Archive final successful attempt's logs alongside previous wipe attempts
  const finalAttemptLogs = buildUpdatedAttemptLogs(expedition, { outcome: 'completed' });

  // Set status completed
  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      nextRoundAt: null,
      expeditionAttemptLogs: JSON.parse(JSON.stringify(finalAttemptLogs)),
    },
  });

  // Award completion bonus tokens
  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const roomTypes = rooms.map(r => r.roomType);
  await awardCompletionBonus(expedition.members, expedition.tier, roomTypes, expeditionId);

  // Award guild XP completion bonus
  await prisma.guild.update({
    where: { id: expedition.guildId },
    data: { xp: { increment: EXPEDITION_CONSTANTS.GUILD_XP_COMPLETION_BONUS } },
  });

  await addGuildLog(
    expedition.guildId,
    'expedition_completed',
    `Tier ${expedition.tier} expedition completed!`,
    { expeditionId },
  );

  // Notify expedition members
  for (const member of expedition.members) {
    void sendPush(member.playerId, 'expeditionFinished', {
      title: 'Expedition Complete!',
      body: `Your Tier ${expedition.tier} expedition was victorious!`,
      tag: 'expedition-finished',
      data: { type: 'expedition', expeditionId },
    });
  }

  await cleanupExpeditionBots(expeditionId);
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

  // Validate targetMobId if set
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

  // Validate target is a living member of the expedition
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
