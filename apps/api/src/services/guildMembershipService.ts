import { prisma } from '@pocketrealm/database';
import { GUILD_CONSTANTS, type GuildData } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../logger';
import {
  requireRole, addGuildLog, calculateMaxMembers,
  addGuildXp, checkGuildAchievementsForAllMembers, getGuild, invalidateGuildIdCache,
} from './guildService';
import { invalidateGuildModifiersForGuild } from './guildUpgradeService';

// ---------------------------------------------------------------------------
// Join / Leave
// ---------------------------------------------------------------------------

export async function joinGuild(playerId: string, guildId: string): Promise<GuildData> {
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, characterLevel: true, username: true } });
  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  const existing = await prisma.guildMember.findUnique({ where: { playerId }, select: { guildId: true } });
  if (existing) throw new AppError(400, 'Already in a guild', 'ALREADY_IN_GUILD');

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { _count: { select: { members: true } } },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  if (player.characterLevel < GUILD_CONSTANTS.JOIN_MIN_LEVEL) {
    throw new AppError(400, `Character level ${GUILD_CONSTANTS.JOIN_MIN_LEVEL} required to join a guild`, 'LEVEL_TOO_LOW');
  }

  if (guild.recruitmentMode === 'closed' || guild.recruitmentMode === 'request_to_join') {
    throw new AppError(400, 'Guild is not open for recruitment', 'RECRUITMENT_CLOSED');
  }

  if (player.characterLevel < guild.minLevelRequirement) {
    throw new AppError(400, `Character level ${guild.minLevelRequirement} required`, 'LEVEL_TOO_LOW');
  }

  const maxMembers = calculateMaxMembers(guild.level);
  if (guild._count.members >= maxMembers) {
    throw new AppError(400, 'Guild is full', 'GUILD_FULL');
  }

  await prisma.$transaction(async (tx) => {
    await tx.guildMember.create({ data: { guildId, playerId, role: 'member' } });
    await addGuildLog(guildId, 'member_joined', `${player.username} joined the guild`, undefined, tx);
  });

  await Promise.all([invalidateGuildIdCache(playerId), invalidateGuildModifiersForGuild(guildId)]);

  // Add guild XP for new member
  await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MEMBER_JOIN);

  // Fire-and-forget: check member count achievements for all members
  void checkGuildAchievementsForAllMembers(guildId, ['guildMemberCount']);

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

  await prisma.$transaction(async (tx) => {
    await tx.guildMember.delete({ where: { guildId_playerId: { guildId: membership.guildId, playerId } } });
    await addGuildLog(membership.guildId, 'member_left', `${membership.player.username} left the guild`, undefined, tx);
  });

  await Promise.all([invalidateGuildIdCache(playerId), invalidateGuildModifiersForGuild(membership.guildId)]);
}

// ---------------------------------------------------------------------------
// Join Requests
// ---------------------------------------------------------------------------

interface JoinRequestData {
  id: string;
  playerId: string;
  username: string;
  characterLevel: number;
  createdAt: string;
}

export async function requestJoinGuild(playerId: string, guildId: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, username: true, characterLevel: true },
  });
  if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');

  const existingMembership = await prisma.guildMember.findUnique({ where: { playerId }, select: { guildId: true } });
  if (existingMembership) throw new AppError(400, 'Already in a guild', 'ALREADY_IN_GUILD');

  if (player.characterLevel < GUILD_CONSTANTS.JOIN_MIN_LEVEL) {
    throw new AppError(400, `Character level ${GUILD_CONSTANTS.JOIN_MIN_LEVEL} required to join a guild`, 'LEVEL_TOO_LOW');
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    include: { _count: { select: { members: true } } },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  if (guild.recruitmentMode !== 'request_to_join') {
    throw new AppError(400, 'Guild does not accept join requests', 'NOT_INVITE_ONLY');
  }

  const maxMembers = calculateMaxMembers(guild.level);
  if (guild._count.members >= maxMembers) throw new AppError(400, 'Guild is full', 'GUILD_FULL');

  if (guild.minLevelRequirement > 0 && player.characterLevel < guild.minLevelRequirement) {
    throw new AppError(400, `Character level ${guild.minLevelRequirement} required`, 'LEVEL_TOO_LOW');
  }

  const existing = await prisma.guildJoinRequest.findUnique({
    where: { guildId_playerId: { guildId, playerId } },
    select: { status: true },
  });
  if (existing?.status === 'pending') throw new AppError(400, 'Join request already pending', 'REQUEST_ALREADY_SENT');

  // Upsert so a previously rejected player can re-request without hitting the unique constraint
  await prisma.guildJoinRequest.upsert({
    where: { guildId_playerId: { guildId, playerId } },
    create: { guildId, playerId, status: 'pending' },
    update: { status: 'pending' },
  });
  await addGuildLog(guildId, 'join_request_sent', `${player.username} requested to join`);
}

export async function getJoinRequests(officerId: string, guildId: string): Promise<JoinRequestData[]> {
  const membership = await requireRole(officerId, 'officer');
  if (membership.guildId !== guildId) throw new AppError(403, 'Not your guild', 'INSUFFICIENT_ROLE');

  const requests = await prisma.guildJoinRequest.findMany({
    where: { guildId: membership.guildId, status: 'pending' },
    include: { player: { select: { username: true, characterLevel: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return requests.map((r) => ({
    id: r.id,
    playerId: r.playerId,
    username: r.player.username,
    characterLevel: r.player.characterLevel,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function respondToJoinRequest(
  officerId: string,
  requestId: string,
  accept: boolean,
): Promise<void> {
  const membership = await requireRole(officerId, 'officer');

  const request = await prisma.guildJoinRequest.findFirst({
    where: { id: requestId, guildId: membership.guildId, status: 'pending' },
    include: { player: { select: { username: true } } },
  });
  if (!request) throw new AppError(404, 'Request not found or already processed', 'NOT_FOUND');

  if (accept) {
    const guild = await prisma.guild.findUnique({
      where: { id: membership.guildId },
      include: { _count: { select: { members: true } } },
    });
    if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

    const maxMembers = calculateMaxMembers(guild.level);
    if (guild._count.members >= maxMembers) throw new AppError(400, 'Guild is full', 'GUILD_FULL');

    // Player may have joined elsewhere between request and acceptance
    const alreadyMember = await prisma.guildMember.findUnique({ where: { playerId: request.playerId } });
    if (alreadyMember) {
      await prisma.guildJoinRequest.update({ where: { id: requestId }, data: { status: 'rejected' } });
      throw new AppError(400, 'Player is already in a guild', 'ALREADY_IN_GUILD');
    }

    await prisma.$transaction(async (tx) => {
      await tx.guildMember.create({ data: { guildId: membership.guildId, playerId: request.playerId, role: 'member' } });
      await tx.guildJoinRequest.update({ where: { id: requestId }, data: { status: 'accepted' } });
      await addGuildLog(membership.guildId, 'join_request_accepted', `${request.player.username} was accepted into the guild`, undefined, tx);
    });

    await Promise.all([invalidateGuildIdCache(request.playerId), invalidateGuildModifiersForGuild(membership.guildId)]);

    await addGuildXp(membership.guildId, GUILD_CONSTANTS.XP_PER_MEMBER_JOIN);
    void checkGuildAchievementsForAllMembers(membership.guildId, ['guildMemberCount']);
  } else {
    await prisma.guildJoinRequest.update({ where: { id: requestId }, data: { status: 'rejected' } });
    await addGuildLog(membership.guildId, 'join_request_rejected', `${request.player.username}'s join request was declined`);
  }
}

// ---------------------------------------------------------------------------
// Member Management
// ---------------------------------------------------------------------------

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

  await prisma.$transaction(async (tx) => {
    await tx.guildMember.delete({ where: { guildId_playerId: { guildId: requester.guildId, playerId: targetId } } });
    await addGuildLog(requester.guildId, 'member_kicked', `${target.player.username} was kicked`, undefined, tx);
  });

  await Promise.all([invalidateGuildIdCache(targetId), invalidateGuildModifiersForGuild(requester.guildId)]);
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

  await prisma.$transaction(async (tx) => {
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

  await prisma.$transaction(async (tx) => {
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

  await prisma.$transaction(async (tx) => {
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

export async function disbandGuild(leaderId: string, guildId: string): Promise<void> {
  const leader = await requireRole(leaderId, 'leader');
  if (leader.guildId !== guildId) throw new AppError(403, 'Not your guild', 'WRONG_GUILD');

  const members = await prisma.guildMember.findMany({
    where: { guildId },
    select: { playerId: true },
  });
  await Promise.all([
    invalidateGuildIdCache(...members.map((m) => m.playerId)),
    invalidateGuildModifiersForGuild(guildId),
  ]);

  await prisma.guild.delete({ where: { id: guildId } });

  logger.info({ guildId, dissolverId: leaderId }, 'Guild dissolved');
}
