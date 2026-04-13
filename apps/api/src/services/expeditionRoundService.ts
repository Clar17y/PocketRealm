import type { Server } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import {
  EXPEDITION_CONSTANTS,
  EXPEDITION_THEMES_BY_ID,
  type ExpeditionRoomDefinition,
  type ExpeditionRoundLog,
  type RaidRoundInput,
  type RaidParticipant,
  type RaidThreatEntry,
  type ExpeditionMobState,
  type PotionConsumed,
} from '@pocketrealm/shared';
import {
  resolveRaidRound,
  buildPlayerCombatStats,
  initThreatTable,
} from '@pocketrealm/game-engine';
import { AppError } from '../middleware/errorHandler';
import { addGuildLog } from './guildService';
import { preparePlayerForCombat, applyGuildCombatModifiers, fetchFreshTemplateData } from './combatOrchestrationService';
import { deductConsumedPotions } from './potionService';
import { parseJsonArray } from '../utils/jsonColumnSchemas';
import { getIo } from '../socket';
import { snapshotCombatData, getCombatSnapshot, type ExpeditionCombatSnapshot } from './expeditionCombatCache';
import { getCachedExpeditionMobTemplates } from './staticDataCacheService';
import { getEquipmentStats } from './equipmentService';
import { getPlayerProgressionState } from './attributesService';
import { calculateMaxHp } from '@pocketrealm/game-engine';
import { getRoundInterval, getMembers, cleanupExpeditionBots } from './expeditionHelpers';
import { handleRoomCleared, handleWipe } from './expeditionTransitionService';
import { roundTimerRegistry } from './roundTimerRegistry';

type DueExpeditionRef = {
  id: string;
  status: string;
  nextRoundAt: Date | null;
};

type RecruitingExpeditionForResolution = DueExpeditionRef & {
  guildId: string;
  tier: number;
  roomDefinitions: unknown;
  _count: { members: number };
};

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
// Build Raid Participant
// ---------------------------------------------------------------------------

type BuildParticipantInput = {
  playerId: string; currentHp: number; currentStamina: number; currentMana: number;
  templateRound: number; activeEffects: unknown;
  targetMobId?: string | null; healTargetPlayerId?: string | null;
  player?: { username: string };
};

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
  // Fire-and-forget Redis writes
  void Promise.all(
    snapshots.map(s => snapshotCombatData(expeditionId, roomIndex, s.playerId, s.snapshot)),
  );
  return snapshots;
}

async function buildRaidParticipant(
  member: BuildParticipantInput,
  expeditionId: string,
  roomIndex: number,
): Promise<RaidParticipant> {
  const snapshot = await getCombatSnapshot(expeditionId, roomIndex, member.playerId);
  if (snapshot) return buildParticipantFromSnapshot(member, snapshot);

  const freshSnapshot = await fetchCombatDataForSnapshot(member);
  return buildParticipantFromSnapshot(member, freshSnapshot);
}

function isExpeditionStepDue(expedition: DueExpeditionRef | null): expedition is DueExpeditionRef {
  return Boolean(
    expedition
    && (expedition.status === 'recruiting' || expedition.status === 'in_progress')
    && expedition.nextRoundAt
    && expedition.nextRoundAt.getTime() <= Date.now(),
  );
}

async function resolveRecruitingWindowForExpedition(
  expeditionId: string,
  preloaded?: RecruitingExpeditionForResolution,
): Promise<void> {
  const now = new Date();
  const exp = preloaded ?? await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { _count: { select: { members: true } } },
  });
  if (!isExpeditionStepDue(exp) || exp.status !== 'recruiting') return;

  const minParticipants = EXPEDITION_CONSTANTS.MIN_PARTICIPANTS_BY_TIER[exp.tier - 1];
  const memberCount = exp._count.members;

  if (memberCount >= minParticipants) {
    const rooms = parseJsonArray<ExpeditionRoomDefinition>(exp.roomDefinitions, 'roomDefinitions');
    const snapshot = {
      mobs: rooms[0]?.mobs ?? [],
      members: await getMembers(exp.id),
    };
    const nextRoundAt = new Date(Date.now() + getRoundInterval(rooms, 0));

    await prisma.guildExpedition.update({
      where: { id: exp.id },
      data: {
        status: 'in_progress',
        roomStartSnapshot: JSON.parse(JSON.stringify(snapshot)),
        nextRoundAt,
      },
    });
    roundTimerRegistry.schedule('guildExpedition', exp.id, nextRoundAt, getIo);

    await addGuildLog(
      exp.guildId,
      'expedition_started',
      `Tier ${exp.tier} expedition started with ${memberCount} members`,
      { expeditionId: exp.id },
    );

    return;
  }

  await prisma.guildExpedition.update({
    where: { id: exp.id },
    data: {
      status: 'failed',
      completedAt: now,
      nextRoundAt: null,
    },
  });
  roundTimerRegistry.cancel('guildExpedition', exp.id);

  await addGuildLog(
    exp.guildId,
    'expedition_failed',
    `Tier ${exp.tier} expedition failed - not enough participants (${memberCount}/${minParticipants})`,
    { expeditionId: exp.id },
  );

  await cleanupExpeditionBots(exp.id);
}

async function resolveCombatRoundForExpedition(
  expeditionId: string,
  io: Server | null,
): Promise<void> {
  await resolveExpeditionRound(expeditionId, io, { requireDue: true });
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
      await resolveRecruitingWindowForExpedition(exp.id, exp);
    } else if (exp.status === 'in_progress') {
      await resolveCombatRoundForExpedition(exp.id, io);
    }
  }
}

export async function resolveDueExpeditionStep(
  expeditionId: string,
  io: Server | null,
): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    select: { id: true, status: true, nextRoundAt: true },
  });
  if (!isExpeditionStepDue(expedition)) return;

  if (expedition.status === 'recruiting') {
    await resolveRecruitingWindowForExpedition(expedition.id);
    return;
  }

  await resolveCombatRoundForExpedition(expedition.id, io);
}

// ---------------------------------------------------------------------------
// Resolve Expedition Round
// ---------------------------------------------------------------------------

export async function resolveExpeditionRound(
  expeditionId: string,
  io: Server | null,
  options: { requireDue?: boolean } = {},
): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: {
      members: { include: { player: { select: { username: true } } } },
    },
  });
  if (!expedition || expedition.status !== 'in_progress') return;
  if (options.requireDue && !isExpeditionStepDue(expedition)) return;

  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[expedition.currentRoom];
  if (!currentRoomDef) return;

  const aliveMembers = expedition.members.filter(m => !m.isKnockedOut && m.currentHp > 0);
  if (aliveMembers.length === 0) {
    await handleWipe(expeditionId);
    return;
  }

  const survivingMobs = currentRoomDef.mobs.filter(m => m.hp > 0);
  if (survivingMobs.length === 0) {
    await handleRoomCleared(expeditionId);
    return;
  }

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

  const updatedRooms = buildUpdatedRoomMobs(currentRoomDef, result.mobsAfter, rooms, expedition.currentRoom);

  const roundLog: ExpeditionRoundLog = {
    ...result.roundLog,
    roomIndex: expedition.currentRoom,
  };
  const existingLogs = parseJsonArray<ExpeditionRoundLog>(expedition.roundSummaries, 'roundSummaries');
  const newSummaries = [...existingLogs, roundLog];

  const nextRoundAt = result.roomCleared || result.allPlayersDead
    ? null
    : new Date(Date.now() + getRoundInterval(rooms, expedition.currentRoom));

  const updated = await prisma.guildExpedition.updateMany({
    where: { id: expeditionId, roundNumber: expedition.roundNumber },
    data: {
      roundNumber: nextRound,
      roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
      roundSummaries: JSON.parse(JSON.stringify(newSummaries)),
      nextRoundAt,
    },
  });
  if (updated.count === 0) return;

  if (nextRoundAt) {
    roundTimerRegistry.schedule('guildExpedition', expeditionId, nextRoundAt, () => io);
  } else {
    roundTimerRegistry.cancel('guildExpedition', expeditionId);
  }

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

  await Promise.all(
    result.participantResults
      .filter(pr => pr.potionsConsumed.length > 0)
      .map(pr => deductConsumedPotions(pr.playerId, pr.potionsConsumed)),
  );

  if (expedition.themeId) {
    const participantIds = aliveMembers.map(m => m.playerId);
    await recordExpeditionKills(expedition.themeId, participantIds, survivingMobs, result.mobsAfter);
  }

  if (result.roomCleared) {
    await handleRoomCleared(expeditionId);
  } else if (result.allPlayersDead) {
    await handleWipe(expeditionId);
  }
}

// ---------------------------------------------------------------------------
// Auto-Resolve Room
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

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: { nextRoundAt: null },
  });
  roundTimerRegistry.cancel('guildExpedition', expeditionId);

  const rooms = parseJsonArray<ExpeditionRoomDefinition>(expedition.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[expedition.currentRoom];
  if (!currentRoomDef) {
    throw new AppError(400, 'No room to resolve', 'NO_ROOM');
  }

  const aliveMembers = expedition.members.filter(m => !m.isKnockedOut && m.currentHp > 0);
  if (aliveMembers.length === 0) {
    await handleWipe(expeditionId);
    return { outcome: 'wiped', roundsResolved: 0, roundLogs: [], tokensAwarded: 0 };
  }

  const snapshots = await fetchAndStoreSnapshots(aliveMembers, expeditionId, expedition.currentRoom);
  const participants: RaidParticipant[] = await Promise.all(
    aliveMembers.map((m, i) => buildParticipantFromSnapshot(m, snapshots[i].snapshot)),
  );

  const summonPool = await buildSummonPool(expedition.themeId);

  let mobs = currentRoomDef.mobs.filter(m => m.hp > 0);
  let threatTable = initThreatTable(aliveMembers.map(m => m.playerId));
  const allRoundLogs: ExpeditionRoundLog[] = [];
  const potionsByPlayer = new Map<string, PotionConsumed[]>();
  const damageByPlayer = new Map<string, number>();
  const healingByPlayer = new Map<string, number>();
  const isDeadByPlayer = new Map<string, boolean>();
  let roundNumber = 0;

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

    for (const pr of result.participantResults) {
      const p = participants.find(pp => pp.playerId === pr.playerId);
      if (!p) continue;

      p.hp = pr.hpAfter;
      p.stamina = pr.staminaAfter;
      p.mana = pr.manaAfter;
      p.templateRound = pr.templateRoundAfter;
      p.activeEffects = pr.activeEffectsAfter as typeof p.activeEffects;

      for (const consumed of pr.potionsConsumed) {
        const idx = p.availablePotions.findIndex(pot => pot.templateId === consumed.templateId);
        if (idx >= 0) p.availablePotions.splice(idx, 1);
      }

      if (pr.potionsConsumed.length > 0) {
        const existing = potionsByPlayer.get(pr.playerId) ?? [];
        existing.push(...pr.potionsConsumed);
        potionsByPlayer.set(pr.playerId, existing);
      }

      damageByPlayer.set(pr.playerId, (damageByPlayer.get(pr.playerId) ?? 0) + pr.damageDealt);
      healingByPlayer.set(pr.playerId, (healingByPlayer.get(pr.playerId) ?? 0) + pr.healingDone);
      isDeadByPlayer.set(pr.playerId, pr.isDead);
    }

    mobs = result.mobsAfter;
    threatTable = result.threatTableAfter;

    allRoundLogs.push({ ...result.roundLog, roomIndex: expedition.currentRoom });

    if (result.roomCleared || result.allPlayersDead) break;
  }

  if (expedition.themeId) {
    const initialMobs = currentRoomDef.mobs.filter(m => m.hp > 0);
    const survivorIds = aliveMembers
      .filter(m => !isDeadByPlayer.get(m.playerId))
      .map(m => m.playerId);
    await recordExpeditionKills(expedition.themeId, survivorIds, initialMobs, mobs);
  }

  const outcome = mobs.filter(m => m.hp > 0).length === 0 ? 'cleared' : 'wiped';

  const updatedRooms = buildUpdatedRoomMobs(currentRoomDef, mobs, rooms, expedition.currentRoom);

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
  roundTimerRegistry.cancel('guildExpedition', expeditionId);

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

  await Promise.all(
    [...potionsByPlayer.entries()].map(([playerId, consumed]) =>
      deductConsumedPotions(playerId, consumed),
    ),
  );

  let tokensAwarded = 0;
  if (outcome === 'cleared') {
    await handleRoomCleared(expeditionId);

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
