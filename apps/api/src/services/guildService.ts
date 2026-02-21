import { prisma } from '@adventure/database';
import { GUILD_CONSTANTS, GuildData, GuildMemberData, GuildLogEntry, GuildSearchResult } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { spendPlayerTurns } from './turnBankService';

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

function isActiveWithinWindow(lastActiveAt: Date): boolean {
  const cutoff = Date.now() - GUILD_CONSTANTS.BOOST_ELIGIBILITY_WINDOW_HOURS * 60 * 60 * 1000;
  return lastActiveAt.getTime() > cutoff;
}

function toGuildData(guild: any): GuildData {
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
    recruitmentMode: guild.recruitmentMode,
    minLevelRequirement: guild.minLevelRequirement,
    taxRate: guild.taxRate,
    specialization: guild.specialization,
    renown: guild.renown,
    seasonalRenown: guild.seasonalRenown,
    treasuryTurns: guild.treasuryTurns,
    treasuryCap: calculateTreasuryCap(guild.level),
    createdAt: guild.createdAt instanceof Date ? guild.createdAt.toISOString() : guild.createdAt,
  };
}

function toMemberData(m: any): GuildMemberData {
  return {
    playerId: m.playerId,
    username: m.player?.username ?? '',
    characterLevel: m.player?.characterLevel ?? 0,
    role: m.role,
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

async function addGuildLog(
  guildId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>,
  tx?: any,
): Promise<void> {
  const client = tx ?? prisma;
  await client.guildLog.create({
    data: { guildId, eventType, message, metadata: metadata ?? undefined },
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

  const existing = await prisma.guildMember.findUnique({ where: { playerId } });
  if (existing) throw new AppError(400, 'Already in a guild', 'ALREADY_IN_GUILD');

  const nameTaken = await prisma.guild.findFirst({
    where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { tag: { equals: tag, mode: 'insensitive' } }] },
  });
  if (nameTaken) throw new AppError(400, 'Guild name or tag already taken', 'NAME_TAKEN');

  // Spend turns
  await spendPlayerTurns(playerId, GUILD_CONSTANTS.CREATION_TURN_COST);

  const guild = await prisma.$transaction(async (tx: any) => {
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
  const leaderMember = membership.guild.members.find((m: any) => m.role === 'leader');
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
    guilds: guilds.map((g: any) => ({
      id: g.id,
      name: g.name,
      tag: g.tag,
      description: g.description,
      level: g.level,
      memberCount: g._count.members,
      maxMembers: calculateMaxMembers(g.level),
      recruitmentMode: g.recruitmentMode,
      minLevelRequirement: g.minLevelRequirement,
      taxRate: g.taxRate,
      specialization: g.specialization,
    })),
    total,
    page,
  };
}

// ---------------------------------------------------------------------------
// Join / Leave
// ---------------------------------------------------------------------------

export async function joinGuild(playerId: string, guildId: string): Promise<GuildData> {
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, characterLevel: true, username: true } });
  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  const existing = await prisma.guildMember.findUnique({ where: { playerId } });
  if (existing) throw new AppError(400, 'Already in a guild', 'ALREADY_IN_GUILD');

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { _count: { select: { members: true } } },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  if (guild.recruitmentMode === 'closed' || guild.recruitmentMode === 'invite_only') {
    throw new AppError(400, 'Guild is not open for recruitment', 'RECRUITMENT_CLOSED');
  }

  if (player.characterLevel < guild.minLevelRequirement) {
    throw new AppError(400, `Character level ${guild.minLevelRequirement} required`, 'LEVEL_TOO_LOW');
  }

  const maxMembers = calculateMaxMembers(guild.level);
  if (guild._count.members >= maxMembers) {
    throw new AppError(400, 'Guild is full', 'GUILD_FULL');
  }

  if (player.characterLevel < GUILD_CONSTANTS.JOIN_MIN_LEVEL) {
    throw new AppError(400, `Character level ${GUILD_CONSTANTS.JOIN_MIN_LEVEL} required to join a guild`, 'LEVEL_TOO_LOW');
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.guildMember.create({ data: { guildId, playerId, role: 'member' } });
    await addGuildLog(guildId, 'member_joined', `${player.username} joined the guild`, undefined, tx);
  });

  // Add guild XP for new member
  await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MEMBER_JOIN);

  return getGuild(guildId);
}

export async function leaveGuild(playerId: string): Promise<void> {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    include: { guild: { select: { id: true, leaderId: true } }, player: { select: { username: true } } },
  });
  if (!membership) throw new AppError(400, 'Not in a guild', 'NOT_IN_GUILD');
  if (membership.guild.leaderId === playerId) {
    throw new AppError(400, 'Leader must transfer leadership before leaving', 'LEADER_CANNOT_LEAVE');
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.guildMember.delete({ where: { guildId_playerId: { guildId: membership.guildId, playerId } } });
    await addGuildLog(membership.guildId, 'member_left', `${membership.player.username} left the guild`, undefined, tx);
  });
}

// ---------------------------------------------------------------------------
// Member Management
// ---------------------------------------------------------------------------

async function requireRole(playerId: string, minRole: 'leader' | 'officer'): Promise<any> {
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

export async function kickMember(requesterId: string, targetId: string): Promise<void> {
  if (requesterId === targetId) throw new AppError(400, 'Cannot kick yourself', 'SELF_KICK');

  const requester = await requireRole(requesterId, 'officer');
  const target = await prisma.guildMember.findUnique({
    where: { playerId: targetId },
    include: { player: { select: { username: true } } },
  });
  if (!target || target.guildId !== requester.guildId) {
    throw new AppError(404, 'Target is not in your guild', 'NOT_IN_GUILD');
  }
  if (target.role === 'leader') {
    throw new AppError(403, 'Cannot kick the leader', 'CANNOT_KICK_LEADER');
  }
  // Officers can only kick members, not other officers
  if (requester.role === 'officer' && target.role === 'officer') {
    throw new AppError(403, 'Officers cannot kick other officers', 'INSUFFICIENT_ROLE');
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.guildMember.delete({ where: { guildId_playerId: { guildId: requester.guildId, playerId: targetId } } });
    await addGuildLog(requester.guildId, 'member_kicked', `${target.player.username} was kicked`, undefined, tx);
  });
}

export async function promoteMember(leaderId: string, targetId: string): Promise<void> {
  const leader = await requireRole(leaderId, 'leader');
  const target = await prisma.guildMember.findUnique({
    where: { playerId: targetId },
    include: { player: { select: { username: true } } },
  });
  if (!target || target.guildId !== leader.guildId) {
    throw new AppError(404, 'Target is not in your guild', 'NOT_IN_GUILD');
  }
  if (target.role !== 'member') {
    throw new AppError(400, 'Can only promote members to officer', 'ALREADY_OFFICER');
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.guildMember.update({
      where: { guildId_playerId: { guildId: leader.guildId, playerId: targetId } },
      data: { role: 'officer' },
    });
    await addGuildLog(leader.guildId, 'member_promoted', `${target.player.username} promoted to officer`, undefined, tx);
  });
}

export async function demoteMember(leaderId: string, targetId: string): Promise<void> {
  const leader = await requireRole(leaderId, 'leader');
  const target = await prisma.guildMember.findUnique({
    where: { playerId: targetId },
    include: { player: { select: { username: true } } },
  });
  if (!target || target.guildId !== leader.guildId) {
    throw new AppError(404, 'Target is not in your guild', 'NOT_IN_GUILD');
  }
  if (target.role !== 'officer') {
    throw new AppError(400, 'Can only demote officers to member', 'NOT_OFFICER');
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.guildMember.update({
      where: { guildId_playerId: { guildId: leader.guildId, playerId: targetId } },
      data: { role: 'member' },
    });
    await addGuildLog(leader.guildId, 'member_demoted', `${target.player.username} demoted to member`, undefined, tx);
  });
}

export async function transferLeadership(leaderId: string, targetId: string): Promise<void> {
  const leader = await requireRole(leaderId, 'leader');
  const target = await prisma.guildMember.findUnique({
    where: { playerId: targetId },
    include: { player: { select: { username: true } } },
  });
  if (!target || target.guildId !== leader.guildId) {
    throw new AppError(404, 'Target is not in your guild', 'NOT_IN_GUILD');
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.guildMember.update({
      where: { guildId_playerId: { guildId: leader.guildId, playerId: targetId } },
      data: { role: 'leader' },
    });
    await tx.guildMember.update({
      where: { guildId_playerId: { guildId: leader.guildId, playerId: leaderId } },
      data: { role: 'officer' },
    });
    await tx.guild.update({
      where: { id: leader.guildId },
      data: { leaderId: targetId },
    });
    await addGuildLog(leader.guildId, 'leadership_transferred', `Leadership transferred to ${target.player.username}`, undefined, tx);
  });
}

// ---------------------------------------------------------------------------
// Disband
// ---------------------------------------------------------------------------

export async function disbandGuild(leaderId: string): Promise<void> {
  const leader = await requireRole(leaderId, 'leader');

  await prisma.guild.delete({ where: { id: leader.guildId } });
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

  if (settings.taxRate !== undefined && settings.taxRate > GUILD_CONSTANTS.MAX_TAX_RATE) {
    throw new AppError(400, `Tax rate cannot exceed ${GUILD_CONSTANTS.MAX_TAX_RATE}%`, 'INVALID_TAX_RATE');
  }
  if (settings.description !== undefined && settings.description !== null && settings.description.length > GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH) {
    throw new AppError(400, `Description too long (max ${GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH})`, 'INVALID_DESCRIPTION');
  }

  const data: any = {};
  if (settings.recruitmentMode !== undefined) data.recruitmentMode = settings.recruitmentMode;
  if (settings.minLevelRequirement !== undefined) data.minLevelRequirement = settings.minLevelRequirement;
  if (settings.taxRate !== undefined) data.taxRate = settings.taxRate;
  if (settings.description !== undefined) data.description = settings.description;

  const updated = await prisma.guild.update({
    where: { id: guildId },
    data,
    include: { _count: { select: { members: true } } },
  });

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
    entries: logs.map((l: any) => ({
      id: l.id,
      eventType: l.eventType,
      message: l.message,
      metadata: l.metadata,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
    })),
    total,
    page,
  };
}

// ---------------------------------------------------------------------------
// Guild XP
// ---------------------------------------------------------------------------

export async function addGuildXp(guildId: string, amount: number): Promise<{ level: number; xp: bigint; leveledUp: boolean }> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { level: true, xp: true } });
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

  await prisma.guild.update({
    where: { id: guildId },
    data: { xp: currentXp, level: currentLevel },
  });

  if (leveledUp) {
    await addGuildLog(guildId, 'guild_level_up', `Guild reached level ${currentLevel}`);
  }

  return { level: currentLevel, xp: currentXp, leveledUp };
}
