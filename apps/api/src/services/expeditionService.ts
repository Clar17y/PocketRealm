import { prisma } from '@pocketrealm/database';
import {
  EXPEDITION_CONSTANTS,
  ALWAYS_AVAILABLE_ACTION_IDS,
  BASE_ACTION_DEFINITIONS,
  type ActionDefinition,
  type ExpeditionData,
  type ExpeditionMemberData,
  type ExpeditionStatus,
  type ExpeditionRoomDefinition,
  type ExpeditionRoundLog,
  type RaidRoundInput,
  type RaidParticipant,
  type RaidThreatEntry,
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
  type MobPoolEntry,
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
  _count?: { members: number };
}

function toExpeditionData(exp: GuildExpeditionRow): ExpeditionData {
  const rooms = exp.roomDefinitions as unknown as ExpeditionRoomDefinition[];
  const currentRoomDef = rooms[exp.currentRoom];
  const aliveMobs = currentRoomDef
    ? currentRoomDef.mobs.filter((m) => m.hp > 0)
    : [];

  const roundLogs = (Array.isArray(exp.roundSummaries)
    ? exp.roundSummaries
    : []) as unknown as ExpeditionRoundLog[];

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
    activeEffects: (Array.isArray(m.activeEffects) ? m.activeEffects : []) as ExpeditionMemberData['activeEffects'],
    healTargetPlayerId: m.healTargetPlayerId ?? null,
    tokensEarned: m.tokensEarned,
    signedUpAt: m.signedUpAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

export async function getExpeditionCooldowns(guildId: string): Promise<{
  weeklyCooldowns: Record<number, string | null>;
  betweenCooldown: string | null;
  hasActiveExpedition: boolean;
}> {
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
// Mob Pool Helper
// ---------------------------------------------------------------------------

async function fetchMobPool(tier: number): Promise<MobPoolEntry[]> {
  const tierLevelMin = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER[tier - 1];
  const tierLevelMax = tierLevelMin + 10;
  const mobTemplates = await prisma.mobTemplate.findMany({
    where: { level: { gte: tierLevelMin, lte: tierLevelMax } },
  });
  if (mobTemplates.length === 0) {
    throw new AppError(500, 'No mobs available for this tier', 'NO_MOBS');
  }
  return mobTemplates.map((m: {
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
    throw new AppError(400, '24-hour cooldown between expeditions has not expired', 'BETWEEN_COOLDOWN');
  }

  // Check treasury
  const treasuryCost = EXPEDITION_CONSTANTS.TREASURY_COST_BY_TIER[tier - 1];
  if (guild.treasuryTurns < treasuryCost) {
    throw new AppError(400, 'Insufficient guild treasury', 'INSUFFICIENT_TREASURY');
  }

  // Fetch mob pool and generate rooms
  const mobPool = await fetchMobPool(tier);
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
  const rooms = expedition.roomDefinitions as unknown as ExpeditionRoomDefinition[];
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
// Build Raid Participant (follows bossEncounterService pattern)
// ---------------------------------------------------------------------------

async function buildRaidParticipant(
  member: { playerId: string; currentHp: number; currentStamina: number; currentMana: number; templateRound: number; activeEffects: unknown; targetMobId?: string | null; healTargetPlayerId?: string | null; player?: { username: string } },
): Promise<RaidParticipant> {
  // Fetch equipment + progression first to compute maxHp (needed by preparePlayerForCombat)
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

  const stats = buildPlayerCombatStats(
    maxHp, maxHp,
    { attackStyle: prep.attackSkill, skillLevel: prep.attackLevel, attributes: prep.progression.attributes },
    prep.equipmentStats,
  );
  applyGuildCombatModifiers(stats, prep.guildMods);

  // Filter actions to only those the player has unlocked
  const unlockedSet = new Set(prep.unlockedActions);
  const filteredActions: Record<string, ActionDefinition> = {};
  for (const [id, def] of Object.entries(BASE_ACTION_DEFINITIONS)) {
    if (ALWAYS_AVAILABLE_ACTION_IDS.has(id) || unlockedSet.has(id)) {
      filteredActions[id] = def;
    }
  }

  const effects = Array.isArray(member.activeEffects) ? member.activeEffects : [];

  // Build potion pool if template uses potion actions
  const potionPool = templateHasPotionActions(prep.playerTemplate)
    ? await buildPotionPool(member.playerId, maxHp)
    : [];

  return {
    playerId: member.playerId,
    username: member.player?.username,
    targetMobId: member.targetMobId ?? null,
    healTargetPlayerId: member.healTargetPlayerId ?? null,
    stats,
    template: prep.playerTemplate.map(s => ({
      actionId: s.actionId,
      condition: s.condition,
      thenActionId: s.thenActionId ?? undefined,
      sortOrder: s.sortOrder,
    })),
    actionDefinitions: filteredActions,
    hp: member.currentHp,
    maxHp,
    stamina: member.currentStamina,
    maxStamina: prep.resources.maxStamina,
    staminaRegenPerRound: prep.resources.staminaRegenPerRound,
    mana: member.currentMana,
    maxMana: prep.resources.maxMana,
    manaRegenPerRound: prep.resources.manaRegenPerRound,
    templateRound: member.templateRound,
    activeEffects: effects as RaidParticipant['activeEffects'],
    availablePotions: potionPool,
  };
}

// ---------------------------------------------------------------------------
// Check & Resolve Expedition Rounds (background timer entry point)
// ---------------------------------------------------------------------------

export async function checkAndResolveExpeditionRounds(io: unknown): Promise<void> {
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
        const rooms = exp.roomDefinitions as unknown as ExpeditionRoomDefinition[];
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

export async function resolveExpeditionRound(expeditionId: string, io: unknown): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: {
      members: { include: { player: { select: { username: true } } } },
    },
  });
  if (!expedition || expedition.status !== 'in_progress') return;

  const rooms = expedition.roomDefinitions as unknown as ExpeditionRoomDefinition[];
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

  // Build participants
  const participants: RaidParticipant[] = await Promise.all(
    aliveMembers.map(m => buildRaidParticipant(m)),
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

  const input: RaidRoundInput = {
    mobs: survivingMobs,
    participants,
    threatTable,
    roundNumber: nextRound,
    environmentalDotPercent: currentRoomDef.environmentalDotPercent,
  };

  const result = resolveRaidRound(input);

  // Optimistic locking: only update if roundNumber hasn't changed
  const updated = await prisma.guildExpedition.updateMany({
    where: { id: expeditionId, roundNumber: expedition.roundNumber },
    data: {
      roundNumber: nextRound,
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

  // Update room mob state in roomDefinitions JSON
  const updatedRooms = [...rooms];
  updatedRooms[expedition.currentRoom] = {
    ...currentRoomDef,
    mobs: currentRoomDef.mobs.map(mob => {
      const afterMob = result.mobsAfter.find(m => m.id === mob.id);
      if (afterMob) {
        return { ...mob, hp: afterMob.hp, activeEffects: afterMob.activeEffects, actionTemplate: afterMob.actionTemplate };
      }
      // Mob was killed
      return { ...mob, hp: 0 };
    }),
  };

  // Build round log from engine result
  const roundLog: ExpeditionRoundLog = {
    ...result.roundLog,
    roomIndex: expedition.currentRoom,
  };
  const existingLogs = (Array.isArray(expedition.roundSummaries)
    ? expedition.roundSummaries
    : []) as unknown as ExpeditionRoundLog[];
  const newSummaries = [...existingLogs, roundLog];

  if (result.roomCleared) {
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
        roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
        nextRoundAt: null,
      },
    });
    await handleRoomCleared(expeditionId);
  } else if (result.allPlayersDead) {
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
        roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
        nextRoundAt: null,
      },
    });
    await handleWipe(expeditionId);
  } else {
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
        roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
        nextRoundAt: new Date(Date.now() + getRoundInterval(rooms, expedition.currentRoom)),
      },
    });
  }
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

  const rooms = expedition.roomDefinitions as unknown as ExpeditionRoomDefinition[];
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
    data: { roomDamage: 0, roomHealing: 0, isKnockedOut: false, threatValue: 0, targetMobId: null },
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
// Handle Wipe
// ---------------------------------------------------------------------------

export async function handleWipe(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: { select: { playerId: true, totalDamage: true, totalHealing: true } } },
  });
  if (!expedition) return;

  const newWipeCount = (expedition.wipeCount ?? 0) + 1;

  // Archive current attempt logs (round logs, room reached, participant stats)
  const roundLogs = (Array.isArray(expedition.roundSummaries)
    ? expedition.roundSummaries
    : []) as unknown as ExpeditionRoundLog[];
  const attemptLog = {
    attempt: newWipeCount,
    roomReached: expedition.currentRoom,
    roundLogs,
    participants: expedition.members.map(m => ({
      playerId: m.playerId,
      totalDamage: Number(m.totalDamage),
      totalHealing: Number(m.totalHealing),
    })),
  };
  const existingAttemptLogs = Array.isArray(expedition.expeditionAttemptLogs)
    ? expedition.expeditionAttemptLogs
    : [];
  const newAttemptLogs = [...existingAttemptLogs, attemptLog];

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
    return;
  }

  // Reset to recruiting: delete all members, regenerate rooms, clear round summaries
  const mobPool = await fetchMobPool(expedition.tier);
  const rooms = generateExpeditionRooms(expedition.tier - 1, mobPool);

  await prisma.guildExpeditionMember.deleteMany({ where: { expeditionId } });

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      wipeCount: newWipeCount,
      expeditionAttemptLogs: JSON.parse(JSON.stringify(newAttemptLogs)),
      status: 'recruiting',
      currentRoom: 0,
      totalRooms: rooms.length,
      roomDefinitions: JSON.parse(JSON.stringify(rooms)),
      roomStartSnapshot: null,
      roundNumber: 0,
      roundSummaries: null,
      nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.SIGNUP_WINDOW_MS),
    },
  });

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
  const roundLogs = (Array.isArray(expedition.roundSummaries)
    ? expedition.roundSummaries
    : []) as unknown as ExpeditionRoundLog[];
  const attemptLog = {
    attempt: (expedition.wipeCount ?? 0) + 1,
    roomReached: expedition.currentRoom,
    roundLogs,
    participants: expedition.members.map(m => ({
      playerId: m.playerId,
      totalDamage: Number(m.totalDamage),
      totalHealing: Number(m.totalHealing),
    })),
    abandoned: true,
  };
  const existingAttemptLogs = Array.isArray(expedition.expeditionAttemptLogs)
    ? expedition.expeditionAttemptLogs
    : [];
  const newAttemptLogs = [...existingAttemptLogs, attemptLog];

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
    include: { members: true },
  });
  if (!expedition) return;

  // Set status completed
  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      nextRoundAt: null,
    },
  });

  // Award completion bonus tokens
  const rooms = expedition.roomDefinitions as unknown as ExpeditionRoomDefinition[];
  const roomTypes = rooms.map(r => r.roomType);
  await awardCompletionBonus(expedition.members, expedition.tier, rooms.length, roomTypes, expeditionId);

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
}

// ---------------------------------------------------------------------------
// Set Target Mob
// ---------------------------------------------------------------------------

export async function setTargetMob(
  expeditionId: string,
  playerId: string,
  targetMobId: string | null,
): Promise<void> {
  const [expedition, member] = await Promise.all([
    prisma.guildExpedition.findUnique({ where: { id: expeditionId } }),
    prisma.guildExpeditionMember.findUnique({
      where: { expeditionId_playerId: { expeditionId, playerId } },
    }),
  ]);

  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (expedition.status !== 'in_progress') throw new AppError(400, 'Expedition is not in progress', 'NOT_IN_PROGRESS');
  if (!member) throw new AppError(400, 'Not a member of this expedition', 'NOT_A_MEMBER');
  if (member.isKnockedOut) throw new AppError(400, 'Cannot set target while knocked out', 'KNOCKED_OUT');

  // Validate targetMobId if set
  if (targetMobId !== null) {
    const rooms = expedition.roomDefinitions as unknown as ExpeditionRoomDefinition[];
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
  const [expedition, member] = await Promise.all([
    prisma.guildExpedition.findUnique({ where: { id: expeditionId } }),
    prisma.guildExpeditionMember.findUnique({
      where: { expeditionId_playerId: { expeditionId, playerId } },
    }),
  ]);

  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (expedition.status !== 'in_progress') throw new AppError(400, 'Expedition is not in progress', 'NOT_IN_PROGRESS');
  if (!member) throw new AppError(400, 'Not a member of this expedition', 'NOT_A_MEMBER');
  if (member.isKnockedOut) throw new AppError(400, 'Cannot set heal target while knocked out', 'KNOCKED_OUT');

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
