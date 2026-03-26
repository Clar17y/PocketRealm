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
import {
  toExpeditionData,
  toExpeditionMemberData,
  getRoundInterval,
  getMembers,
  cleanupExpeditionBots,
  buildTemplateIdMap,
  buildUpdatedAttemptLogs,
} from './expeditionHelpers';

// Re-export from sub-services so existing importers don't break
export { checkAndResolveExpeditionRounds, resolveExpeditionRound, autoResolveRoom } from './expeditionRoundService';
export type { AutoResolveResult } from './expeditionRoundService';
export { handleRoomCleared, handleWipe, completeExpedition } from './expeditionTransitionService';

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

export async function getExpeditionCooldowns(guildId: string, playerId: string): Promise<ExpeditionCooldownInfo> {
  const now = new Date();
  const betweenAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);

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

  const weeklyCooldowns: Record<number, string | null> = { 1: null, 2: null, 3: null, 4: null };
  for (const cd of playerCooldowns) {
    weeklyCooldowns[cd.tier] = cd.expiresAt.toISOString();
  }

  const betweenCooldown = recentAny?.completedAt
    ? new Date(recentAny.completedAt.getTime() + EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS).toISOString()
    : null;

  return { weeklyCooldowns, betweenCooldown, hasActiveExpedition: !!activeExp };
}

async function setExpeditionCooldowns(expeditionId: string, tier: number): Promise<void> {
  const participants = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
    select: { playerId: true },
  });

  const expiresAt = new Date(Date.now() + EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
  await Promise.all(
    participants.map((p) =>
      prisma.expeditionCooldown.upsert({
        where: { playerId_tier: { playerId: p.playerId, tier } },
        create: { playerId: p.playerId, tier, expiresAt },
        update: { expiresAt },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Launch Expedition
// ---------------------------------------------------------------------------

export async function launchExpedition(
  playerId: string,
  tier: number,
): Promise<ExpeditionData> {
  // Validate tier
  if (tier < 1 || tier > 4) {
    throw new AppError(400, 'Tier must be 1, 2, 3, or 4', 'INVALID_TIER');
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
  const betweenAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);

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
  const allExpeditionMobs = await getCachedExpeditionMobTemplates();
  const summonTemplates = allExpeditionMobs.filter(m => summonNames.includes(m.name));
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
    maxHp,
    maxStamina: prep.resources.maxStamina,
    staminaRegenPerRound: prep.resources.staminaRegenPerRound,
    maxMana: prep.resources.maxMana,
    manaRegenPerRound: prep.resources.manaRegenPerRound,
  };
}

/**
 * Build a RaidParticipant from a pre-fetched snapshot.
 * Equipment stats come from the snapshot (locked at room start).
 * Template + potions are fetched fresh so mid-room switches take effect.
 */
async function buildParticipantFromSnapshot(
  member: BuildParticipantInput,
  snapshot: ExpeditionCombatSnapshot,
): Promise<RaidParticipant> {
  const stats = buildPlayerCombatStats(
    snapshot.maxHp, snapshot.maxHp,
    { attackStyle: snapshot.attackSkill, skillLevel: snapshot.attackLevel, attributes: snapshot.progression.attributes },
    snapshot.equipmentStats,
  );
  applyGuildCombatModifiers(stats, snapshot.guildMods);

  // Fetch template + actions + potions fresh each round (not cached)
  const fresh = await fetchFreshTemplateData(member.playerId, snapshot.maxHp);

  const effects = Array.isArray(member.activeEffects) ? member.activeEffects : [];

  return {
    playerId: member.playerId,
    username: member.player?.username,
    targetMobId: member.targetMobId ?? null,
    healTargetPlayerId: member.healTargetPlayerId ?? null,
    stats,
    template: fresh.playerTemplate.map(s => ({
      actionId: s.actionId,
      condition: s.condition,
      thenActionId: s.thenActionId ?? undefined,
      sortOrder: s.sortOrder,
    })),
    actionDefinitions: fresh.actionDefinitions,
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
    availablePotions: fresh.potionPool,
  };
}

/**
 * Fetch combat data for all members and store snapshots in Redis.
 * Returns the in-memory snapshots for direct use (avoids a Redis read round-trip).
 */
async function fetchAndStoreSnapshots(
  aliveMembers: BuildParticipantInput[],
  expeditionId: string,
  roomIndex: number,
): Promise<{ playerId: string; snapshot: ExpeditionCombatSnapshot }[]> {
  const snapshots = await Promise.all(
    aliveMembers.map(async m => ({
      playerId: m.playerId,
      snapshot: await fetchCombatDataForSnapshot(m),
    })),
  );
  // Fire-and-forget Redis writes (best-effort, errors swallowed by snapshotCombatData)
  void Promise.all(
    snapshots.map(s => snapshotCombatData(expeditionId, roomIndex, s.playerId, s.snapshot)),
  );
  return snapshots;
}

/**
 * Build a raid participant. Checks Redis snapshot first (set at room start),
 * falls back to full DB fetch on cache miss.
 */
async function buildRaidParticipant(
  member: BuildParticipantInput,
  expeditionId: string,
  roomIndex: number,
): Promise<RaidParticipant> {
  // Try cached snapshot first (set at room start)
  const snapshot = await getCombatSnapshot(expeditionId, roomIndex, member.playerId);
  if (snapshot) return buildParticipantFromSnapshot(member, snapshot);

  // Fallback: fetch from DB (cache miss)
  const freshSnapshot = await fetchCombatDataForSnapshot(member);
  return buildParticipantFromSnapshot(member, freshSnapshot);
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

  // Build participants — snapshot on first round, read from cache on subsequent rounds
  let participants: RaidParticipant[];
  if (expedition.roundNumber === 0) {
    const snapshots = await fetchAndStoreSnapshots(aliveMembers, expeditionId, expedition.currentRoom);
    participants = await Promise.all(
      aliveMembers.map((m, i) => buildParticipantFromSnapshot(m, snapshots[i].snapshot)),
    );
  } else {
    participants = await Promise.all(
      aliveMembers.map(m => buildRaidParticipant(m, expeditionId, expedition.currentRoom)),
    );
  }

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
  const snapshots = await fetchAndStoreSnapshots(aliveMembers, expeditionId, expedition.currentRoom);
  const participants: RaidParticipant[] = await Promise.all(
    aliveMembers.map((m, i) => buildParticipantFromSnapshot(m, snapshots[i].snapshot)),
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

  // Clear combat snapshots for the completed room
  await clearRoomSnapshots(expeditionId, expedition.currentRoom);

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

  // Clear combat snapshots for the current room
  await clearRoomSnapshots(expeditionId, expedition.currentRoom);

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

    // Set per-player-per-tier cooldowns on failure too
    await setExpeditionCooldowns(expeditionId, expedition.tier);

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

  await addGuildLog(
    expedition.guildId,
    'expedition_failed',
    'Expedition abandoned by officer',
    { expeditionId },
  );

  // Set per-player-per-tier cooldowns on abandonment
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
// Complete Expedition
// ---------------------------------------------------------------------------

export async function completeExpedition(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: { include: { player: { select: { username: true } } } } },
  });
  if (!expedition) return;

  // Note: combat snapshots already cleared by handleRoomCleared (which calls this)

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

  // Set per-player-per-tier cooldowns
  await setExpeditionCooldowns(expeditionId, expedition.tier);

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
