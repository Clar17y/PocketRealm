import { prisma } from '@pocketrealm/database';
import {
  EXPEDITION_CONSTANTS,
  BASE_ACTION_DEFINITIONS,
  type ExpeditionData,
  type ExpeditionMemberData,
  type ExpeditionStatus,
  type ExpeditionRoomDefinition,
  type ExpeditionRoundSummary,
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
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';
import { addGuildLog } from './guildService';
import { getHpState } from './hpService';
import { getEquipmentStats } from './equipmentService';
import { getSkillLevel, getMainHandAttackSkill } from './combatStatsService';
import { getPlayerProgressionState } from './attributesService';
import { getActiveTemplate } from './combatTemplateService';

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

// ---------------------------------------------------------------------------
// Build Raid Participant (follows bossEncounterService pattern)
// ---------------------------------------------------------------------------

async function buildRaidParticipant(
  member: { playerId: string; currentHp: number; currentStamina: number; currentMana: number; templateRound: number; activeEffects: unknown },
): Promise<RaidParticipant> {
  const [equipStats, template, progression] = await Promise.all([
    getEquipmentStats(member.playerId),
    getActiveTemplate(member.playerId),
    getPlayerProgressionState(member.playerId),
  ]);

  const mainHandSkill = await getMainHandAttackSkill(member.playerId);
  const attackSkill = mainHandSkill ?? 'melee';
  const [attackSkillLevel, meleeLevel, rangedLevel, magicLevel] = await Promise.all([
    getSkillLevel(member.playerId, attackSkill),
    getSkillLevel(member.playerId, 'melee'),
    getSkillLevel(member.playerId, 'ranged'),
    getSkillLevel(member.playerId, 'magic'),
  ]);

  const evasionLevel = progression.attributes.evasion;
  const maxHp = calculateMaxHp({
    vitalityLevel: progression.attributes.vitality,
    equipmentHealthBonus: equipStats.health,
  });
  const maxStamina = calculateMaxStamina({
    meleeLevel,
    rangedLevel,
    evasionLevel,
    equipmentStaminaBonus: 0,
  });
  const maxMana = calculateMaxMana({
    magicLevel,
    equipmentManaBonus: 0,
  });

  const stats = buildPlayerCombatStats(
    maxHp, maxHp,
    { attackStyle: attackSkill, skillLevel: attackSkillLevel, attributes: progression.attributes },
    equipStats,
  );

  const effects = Array.isArray(member.activeEffects) ? member.activeEffects : [];

  return {
    playerId: member.playerId,
    stats,
    template: template.map(s => ({
      actionId: s.actionId,
      condition: s.condition,
      thenActionId: s.thenActionId ?? undefined,
      sortOrder: s.sortOrder,
    })),
    actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
    hp: member.currentHp,
    maxHp,
    stamina: member.currentStamina,
    maxStamina,
    staminaRegenPerRound: calculateStaminaRegenPerRound(meleeLevel, rangedLevel, evasionLevel),
    mana: member.currentMana,
    maxMana,
    manaRegenPerRound: calculateManaRegenPerRound(magicLevel),
    templateRound: member.templateRound,
    activeEffects: effects as RaidParticipant['activeEffects'],
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
        const rooms = exp.roomDefinitions as ExpeditionRoomDefinition[];
        const snapshot = {
          mobs: rooms[0]?.mobs ?? [],
          members: await getMembers(exp.id),
        };

        await prisma.guildExpedition.update({
          where: { id: exp.id },
          data: {
            status: 'in_progress',
            roomStartSnapshot: JSON.parse(JSON.stringify(snapshot)),
            nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.ROUND_INTERVAL_MS),
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
      members: true,
    },
  });
  if (!expedition || expedition.status !== 'in_progress') return;

  const rooms = expedition.roomDefinitions as ExpeditionRoomDefinition[];
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
          templateRound: pr.templateRoundAfter,
          activeEffects: JSON.parse(JSON.stringify(pr.activeEffectsAfter)),
          threatValue: threatEntry?.threat ?? 0,
        },
      });
    }),
  );

  // Update room mob state in roomDefinitions JSON
  const updatedRooms = [...rooms];
  updatedRooms[expedition.currentRoom] = {
    ...currentRoomDef,
    mobs: currentRoomDef.mobs.map(mob => {
      const afterMob = result.mobsAfter.find(m => m.id === mob.id);
      if (afterMob) {
        return { ...mob, hp: afterMob.hp, activeEffects: afterMob.activeEffects };
      }
      // Mob was killed
      return { ...mob, hp: 0 };
    }),
  };

  // Build round summary
  const roundSummary: ExpeditionRoundSummary = {
    roundNumber: nextRound,
    roomIndex: expedition.currentRoom,
    participantResults: result.participantResults,
    mobActionResults: result.mobActionResults,
    roomCleared: result.roomCleared,
    allPlayersDead: result.allPlayersDead,
  };
  const existingSummaries = (Array.isArray(expedition.roundSummaries)
    ? expedition.roundSummaries
    : []) as unknown as ExpeditionRoundSummary[];
  const newSummaries = [...existingSummaries, roundSummary];

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
        nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.ROUND_INTERVAL_MS),
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

  const rooms = expedition.roomDefinitions as ExpeditionRoomDefinition[];
  const currentRoomDef = rooms[expedition.currentRoom];
  const roomType = currentRoomDef?.roomType ?? 'trash';

  // Award per-room tokens to all members (flat, not contribution-weighted)
  const baseTokens = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[roomType];
  const tierMultiplier = EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[expedition.tier - 1];
  const tokens = baseTokens * tierMultiplier;

  await Promise.all(
    expedition.members.map(m =>
      prisma.player.update({
        where: { id: m.playerId },
        data: { expeditionTokens: { increment: tokens } },
      }),
    ),
  );

  // Award guild XP
  await prisma.guild.update({
    where: { id: expedition.guildId },
    data: { xp: { increment: EXPEDITION_CONSTANTS.GUILD_XP_PER_ROOM } },
  });

  // Reset room-level tracking
  await prisma.guildExpeditionMember.updateMany({
    where: { expeditionId },
    data: { roomDamage: 0, roomHealing: 0 },
  });

  // Check if last room
  if (expedition.currentRoom >= expedition.totalRooms - 1) {
    await completeExpedition(expeditionId);
    return;
  }

  // Enter rest phase: advance room, reset for next room
  const nextRoom = expedition.currentRoom + 1;
  const nextRoomDef = rooms[nextRoom];

  // Reset KO flags and threat values
  await prisma.guildExpeditionMember.updateMany({
    where: { expeditionId },
    data: {
      isKnockedOut: false,
      threatValue: 0,
    },
  });

  // Apply rest regen to all members
  const members = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
  });

  await Promise.all(
    members.map(async m => {
      const [equipStats, progression, meleeLevel, rangedLevel, magicLevel] = await Promise.all([
        getEquipmentStats(m.playerId),
        getPlayerProgressionState(m.playerId),
        getSkillLevel(m.playerId, 'melee'),
        getSkillLevel(m.playerId, 'ranged'),
        getSkillLevel(m.playerId, 'magic'),
      ]);
      const maxHp = calculateMaxHp({
        vitalityLevel: progression.attributes.vitality,
        equipmentHealthBonus: equipStats.health,
      });
      const maxStamina = calculateMaxStamina({
        meleeLevel, rangedLevel, evasionLevel: progression.attributes.evasion, equipmentStaminaBonus: 0,
      });
      const maxMana = calculateMaxMana({ magicLevel, equipmentManaBonus: 0 });

      const regenHp = Math.min(maxHp, m.currentHp + Math.floor(maxHp * EXPEDITION_CONSTANTS.REST_HP_REGEN));
      const regenStamina = Math.min(maxStamina, m.currentStamina + Math.floor(maxStamina * EXPEDITION_CONSTANTS.REST_STAMINA_REGEN));
      const regenMana = Math.min(maxMana, m.currentMana + Math.floor(maxMana * EXPEDITION_CONSTANTS.REST_MANA_REGEN));

      return prisma.guildExpeditionMember.updateMany({
        where: { expeditionId, playerId: m.playerId },
        data: {
          currentHp: regenHp,
          currentStamina: regenStamina,
          currentMana: regenMana,
        },
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
  });
  if (!expedition) return;

  const rooms = expedition.roomDefinitions as ExpeditionRoomDefinition[];
  const snapshot = expedition.roomStartSnapshot as {
    mobs: ExpeditionRoomDefinition['mobs'];
    members: { playerId: string; currentHp: number; currentStamina: number; currentMana: number }[];
  } | null;

  // Restore mob HP from snapshot
  if (snapshot?.mobs) {
    const updatedRooms = [...rooms];
    updatedRooms[expedition.currentRoom] = {
      ...rooms[expedition.currentRoom],
      mobs: snapshot.mobs,
    };
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
        roundNumber: 0,
        nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.REST_DURATION_MS),
      },
    });
  } else {
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        roundNumber: 0,
        nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.REST_DURATION_MS),
      },
    });
  }

  // Restore player HP/resources from snapshot and reset KO/room tracking
  if (snapshot?.members) {
    await Promise.all(
      snapshot.members.map(m =>
        prisma.guildExpeditionMember.updateMany({
          where: { expeditionId, playerId: m.playerId },
          data: {
            currentHp: m.currentHp,
            currentStamina: m.currentStamina,
            currentMana: m.currentMana,
            isKnockedOut: false,
            roomDamage: 0,
            roomHealing: 0,
            threatValue: 0,
          },
        }),
      ),
    );
  } else {
    // No snapshot, just reset KO flags
    await prisma.guildExpeditionMember.updateMany({
      where: { expeditionId },
      data: {
        isKnockedOut: false,
        roomDamage: 0,
        roomHealing: 0,
        threatValue: 0,
      },
    });
  }

  await addGuildLog(
    expedition.guildId,
    'expedition_wipe',
    `Expedition wipe in room ${expedition.currentRoom + 1}`,
    { expeditionId, roomIndex: expedition.currentRoom },
  );
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
  // Calculate total room tokens earned across all rooms, multiply by bonus multiplier
  const rooms = expedition.roomDefinitions as ExpeditionRoomDefinition[];
  let totalRoomTokens = 0;
  for (const room of rooms) {
    const baseTokens = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[room.roomType];
    const tierMultiplier = EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[expedition.tier - 1];
    totalRoomTokens += baseTokens * tierMultiplier;
  }
  const bonusTokens = Math.floor(totalRoomTokens * EXPEDITION_CONSTANTS.COMPLETION_BONUS_MULTIPLIER);

  await Promise.all(
    expedition.members.map(m =>
      prisma.player.update({
        where: { id: m.playerId },
        data: { expeditionTokens: { increment: bonusTokens } },
      }),
    ),
  );

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
