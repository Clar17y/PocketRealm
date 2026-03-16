import { prisma, Prisma, type GuildMember, type Guild } from '@pocketrealm/database';
import {
  GUILD_CONSTANTS, GuildData, GuildMemberData, GuildLogEntry, GuildSearchResult,
  type GuildRecruitmentMode, type GuildRole, type GuildSpecialization,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurnsTx } from './turnBankService';
import { checkAchievements, emitAchievementNotifications } from './achievementService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function calculateMaxMembers(level: number): number {
  return GUILD_CONSTANTS.BASE_MAX_MEMBERS + Math.floor(level / 2) * GUILD_CONSTANTS.MEMBERS_PER_TWO_LEVELS;
}

export function calculateTreasuryCap(level: number): number {
  return GUILD_CONSTANTS.TREASURY_BASE_CAP + level * GUILD_CONSTANTS.TREASURY_CAP_PER_LEVEL;
}

export function calculateXpForLevel(level: number): number {
  return Math.floor(GUILD_CONSTANTS.XP_PER_LEVEL_BASE * level ** GUILD_CONSTANTS.XP_PER_LEVEL_EXPONENT);
}

export function isActiveWithinWindow(lastActiveAt: Date): boolean {
  const cutoff = Date.now() - GUILD_CONSTANTS.BOOST_ELIGIBILITY_WINDOW_HOURS * 60 * 60 * 1000;
  return lastActiveAt.getTime() > cutoff;
}

interface GuildRow {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leaderId: string;
  leaderUsername?: string;
  level: number;
  xp: bigint;
  memberCount?: number;
  recruitmentMode: string;
  minLevelRequirement: number;
  taxRate: number;
  specialization: string | null;
  renown: number;
  seasonalRenown: number;
  treasuryTurns: number;
  createdAt: Date | string;
  _count?: { members: number };
}

interface MemberRow {
  playerId: string;
  role: string;
  joinedAt: Date | string;
  totalTurnsContributed: number;
  weeklyTurnsContributed: number;
  lastActiveAt: Date | string;
  player?: { username: string; characterLevel: number };
}

function toGuildData(guild: GuildRow): GuildData {
  return {
    id: guild.id,
    name: guild.name,
    tag: guild.tag,
    description: guild.description,
    leaderId: guild.leaderId,
    leaderUsername: guild.leaderUsername,
    level: guild.level,
    xp: guild.xp.toString(),
    memberCount: guild._count?.members ?? guild.memberCount ?? 0,
    maxMembers: calculateMaxMembers(guild.level),
    recruitmentMode: guild.recruitmentMode as GuildRecruitmentMode,
    minLevelRequirement: guild.minLevelRequirement,
    taxRate: guild.taxRate,
    specialization: guild.specialization as GuildSpecialization | null,
    renown: guild.renown,
    seasonalRenown: guild.seasonalRenown,
    treasuryTurns: guild.treasuryTurns,
    treasuryCap: calculateTreasuryCap(guild.level),
    createdAt: guild.createdAt instanceof Date ? guild.createdAt.toISOString() : guild.createdAt,
  };
}

function toMemberData(m: MemberRow): GuildMemberData {
  return {
    playerId: m.playerId,
    username: m.player?.username ?? '',
    characterLevel: m.player?.characterLevel ?? 0,
    role: m.role as GuildRole,
    joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : m.joinedAt,
    totalTurnsContributed: m.totalTurnsContributed,
    weeklyTurnsContributed: m.weeklyTurnsContributed,
    lastActiveAt: m.lastActiveAt instanceof Date ? m.lastActiveAt.toISOString() : m.lastActiveAt,
    isActive: isActiveWithinWindow(m.lastActiveAt instanceof Date ? m.lastActiveAt : new Date(m.lastActiveAt)),
  };
}

// ---------------------------------------------------------------------------
// Guild Log (internal helper)
// ---------------------------------------------------------------------------

export async function addGuildLog(
  guildId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.guildLog.create({
    data: { guildId, eventType, message, metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined },
  });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createGuild(
  playerId: string,
  name: string,
  tag: string,
  description: string | null,
): Promise<GuildData> {
  // Validate name/tag length
  if (name.length < GUILD_CONSTANTS.MIN_NAME_LENGTH || name.length > GUILD_CONSTANTS.MAX_NAME_LENGTH) {
    throw new AppError(400, `Guild name must be ${GUILD_CONSTANTS.MIN_NAME_LENGTH}-${GUILD_CONSTANTS.MAX_NAME_LENGTH} characters`, 'INVALID_NAME');
  }
  if (tag.length < GUILD_CONSTANTS.MIN_TAG_LENGTH || tag.length > GUILD_CONSTANTS.MAX_TAG_LENGTH) {
    throw new AppError(400, `Guild tag must be ${GUILD_CONSTANTS.MIN_TAG_LENGTH}-${GUILD_CONSTANTS.MAX_TAG_LENGTH} characters`, 'INVALID_TAG');
  }
  if (description && description.length > GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
    throw new AppError(400, `Description too long (max ${GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH})`, 'INVALID_DESCRIPTION');
  }

  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, characterLevel: true, username: true } });
  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');
  if (player.characterLevel < GUILD_CONSTANTS.CREATION_MIN_LEVEL) {
    throw new AppError(400, `Character level ${GUILD_CONSTANTS.CREATION_MIN_LEVEL} required to create a guild`, 'LEVEL_TOO_LOW');
  }

  // All race-sensitive checks and turn spend inside a single transaction
  const guild = await prisma.$transaction(async (tx) => {
    const existing = await tx.guildMember.findUnique({ where: { playerId } });
    if (existing) throw new AppError(400, 'Already in a guild', 'ALREADY_IN_GUILD');

    const nameTaken = await tx.guild.findFirst({
      where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { tag: { equals: tag, mode: 'insensitive' } }] },
    });
    if (nameTaken) throw new AppError(400, 'Guild name or tag already taken', 'NAME_TAKEN');

    await spendPlayerTurnsTx(tx, playerId, GUILD_CONSTANTS.CREATION_TURN_COST);

    const created = await tx.guild.create({
      data: {
        name,
        tag: tag.toUpperCase(),
        description,
        leaderId: playerId,
        members: { create: { playerId, role: 'leader' } },
      },
      include: { _count: { select: { members: true } } },
    });

    await addGuildLog(created.id, 'guild_created', `${player.username} created the guild`, undefined, tx);

    return created;
  });

  return toGuildData(guild);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getGuild(guildId: string): Promise<GuildData> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { _count: { select: { members: true } } },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');
  return toGuildData(guild);
}

export async function getPlayerGuild(
  playerId: string,
): Promise<{ guild: GuildData; role: string; members: GuildMemberData[] } | null> {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: {
      guild: {
        include: {
          _count: { select: { members: true } },
          members: {
            include: { player: { select: { username: true, characterLevel: true } } },
            orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
          },
        },
      },
    },
  });

  if (!membership) return null;

  // Look up leader username
  const leaderMember = membership.guild.members.find((m) => m.role === 'leader');
  const guildWithLeader = { ...membership.guild, leaderUsername: leaderMember?.player?.username };

  return {
    guild: toGuildData(guildWithLeader),
    role: membership.role,
    members: membership.guild.members.map(toMemberData),
  };
}

export async function getPlayerGuildId(playerId: string): Promise<string | null> {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true },
  });
  return membership?.guildId ?? null;
}

export async function searchGuilds(
  query?: string,
  page: number = 1,
): Promise<{ guilds: GuildSearchResult[]; total: number; page: number }> {
  const where = query
    ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { tag: { contains: query, mode: 'insensitive' as const } }] }
    : {};
  const pageSize = GUILD_CONSTANTS.LOG_PAGE_SIZE;

  const [guilds, total] = await Promise.all([
    prisma.guild.findMany({
      where,
      include: { _count: { select: { members: true } } },
      orderBy: { level: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.guild.count({ where }),
  ]);

  return {
    guilds: guilds.map((g) => ({
      id: g.id,
      name: g.name,
      tag: g.tag,
      description: g.description,
      level: g.level,
      memberCount: g._count.members,
      maxMembers: calculateMaxMembers(g.level),
      recruitmentMode: g.recruitmentMode as GuildRecruitmentMode,
      minLevelRequirement: g.minLevelRequirement,
      taxRate: g.taxRate,
      specialization: g.specialization as GuildSpecialization | null,
    })),
    total,
    page,
  };
}

// ---------------------------------------------------------------------------
// Role check (shared with guildMembershipService)
// ---------------------------------------------------------------------------

export async function requireRole(playerId: string, minRole: 'leader' | 'officer'): Promise<GuildMember & { guild: Guild }> {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: { guild: true },
  });
  if (!membership) throw new AppError(400, 'Not in a guild', 'NOT_IN_GUILD');

  if (minRole === 'leader' && membership.role !== 'leader') {
    throw new AppError(403, 'Only the leader can do this', 'NOT_LEADER');
  }
  if (minRole === 'officer' && membership.role !== 'leader' && membership.role !== 'officer') {
    throw new AppError(403, 'Only officers and leaders can do this', 'INSUFFICIENT_ROLE');
  }

  return membership;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateSettings(
  requesterId: string,
  guildId: string,
  settings: {
    recruitmentMode?: string;
    minLevelRequirement?: number;
    taxRate?: number;
    description?: string | null;
  },
): Promise<GuildData> {
  const requester = await requireRole(requesterId, 'officer');
  if (requester.guildId !== guildId) throw new AppError(403, 'Not your guild', 'WRONG_GUILD');

  if (settings.taxRate !== undefined && (settings.taxRate < 0 || settings.taxRate > GUILD_CONSTANTS.MAX_TAX_RATE)) {
    throw new AppError(400, `Tax rate must be 0-${GUILD_CONSTANTS.MAX_TAX_RATE}%`, 'INVALID_TAX_RATE');
  }
  if (settings.description !== undefined && settings.description !== null && settings.description.length > GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
    throw new AppError(400, `Description too long (max ${GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH})`, 'INVALID_DESCRIPTION');
  }

  const data: Record<string, unknown> = {};
  const changes: string[] = [];
  if (settings.recruitmentMode !== undefined) {
    data.recruitmentMode = settings.recruitmentMode;
    changes.push(`recruitment → ${settings.recruitmentMode}`);
  }
  if (settings.minLevelRequirement !== undefined) {
    data.minLevelRequirement = settings.minLevelRequirement;
    changes.push(`min level → ${settings.minLevelRequirement}`);
  }
  if (settings.taxRate !== undefined) {
    data.taxRate = settings.taxRate;
    changes.push(`tax rate → ${settings.taxRate}%`);
  }
  if (settings.description !== undefined) {
    data.description = settings.description;
    changes.push('description updated');
  }

  if (Object.keys(data).length === 0) {
    return getGuild(guildId);
  }

  const updated = await prisma.guild.update({
    where: { id: guildId },
    data,
    include: { _count: { select: { members: true } } },
  });

  await addGuildLog(guildId, 'settings_changed', `Settings updated: ${changes.join(', ')}`);

  return toGuildData(updated);
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

export async function getGuildLog(
  guildId: string,
  page: number = 1,
): Promise<{ entries: GuildLogEntry[]; total: number; page: number }> {
  const pageSize = GUILD_CONSTANTS.LOG_PAGE_SIZE;

  const [logs, total] = await Promise.all([
    prisma.guildLog.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.guildLog.count({ where: { guildId } }),
  ]);

  return {
    entries: logs.map((l) => ({
      id: l.id,
      eventType: l.eventType,
      message: l.message,
      metadata: l.metadata as Record<string, unknown> | null,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    })),
    total,
    page,
  };
}

// ---------------------------------------------------------------------------
// Guild XP
// ---------------------------------------------------------------------------

export async function addGuildXp(
  guildId: string,
  amount: number,
  tx?: Prisma.TransactionClient,
): Promise<{ level: number; xp: bigint; leveledUp: boolean }> {
  const client = tx ?? prisma;
  const guild = await client.guild.findUnique({ where: { id: guildId }, select: { level: true, xp: true } });
  if (!guild) return { level: 1, xp: 0n, leveledUp: false };

  let currentXp = guild.xp + BigInt(amount);
  let currentLevel = guild.level;
  let leveledUp = false;

  // Check for level-ups
  let xpNeeded = calculateXpForLevel(currentLevel);
  while (currentXp >= BigInt(xpNeeded)) {
    currentXp -= BigInt(xpNeeded);
    currentLevel++;
    leveledUp = true;
    xpNeeded = calculateXpForLevel(currentLevel);
  }

  await client.guild.update({
    where: { id: guildId },
    data: { xp: currentXp, level: currentLevel },
  });

  if (leveledUp) {
    await addGuildLog(guildId, 'guild_level_up', `Guild reached level ${currentLevel}`, undefined, tx);
    // Fire-and-forget: check guild achievements for all members
    void checkGuildAchievementsForAllMembers(guildId, ['guildLevel', 'guildTurnsContributed']);
  }

  return { level: currentLevel, xp: currentXp, leveledUp };
}

/** Check guild-related achievements for all members of a guild. Fire-and-forget. */
export async function checkGuildAchievementsForAllMembers(guildId: string, statKeys: string[]): Promise<void> {
  try {
    const members = await prisma.guildMember.findMany({
      where: { guildId },
      select: { playerId: true },
    });
    for (const { playerId } of members) {
      const newAchievements = await checkAchievements(playerId, { statKeys });
      await emitAchievementNotifications(playerId, newAchievements);
    }
  } catch (err) {
    console.error('Guild achievement check failed:', err);
  }
}
