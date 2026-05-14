import { resolveAchievementTitleDisplay } from '@pocketrealm/shared/utils/titleDisplay';
import { prisma, type Prisma } from '@pocketrealm/database';
import { CHAT_CONSTANTS } from '@pocketrealm/shared';
import type { ChatChannelType, ChatMessageEvent, ChatMessageType } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { redis } from '../redis';

export type ChatHistoryMessageTypeFilter = ChatMessageType | 'non_activity';

export async function checkRateLimit(playerId: string, channelType: ChatChannelType): Promise<boolean> {
  const key = `chat:rl:${playerId}:${channelType}`;
  const limitMs = channelType === 'world'
    ? CHAT_CONSTANTS.WORLD_RATE_LIMIT_MS
    : CHAT_CONSTANTS.ZONE_RATE_LIMIT_MS;

  const result = await redis.set(key, '1', 'PX', limitMs, 'NX');
  return result === 'OK';
}

export async function saveMessage(params: {
  channelType: ChatChannelType;
  channelId: string;
  playerId: string;
  username: string;
  message: string;
  messageType?: ChatMessageType;
}): Promise<{ id: string; createdAt: Date }> {
  const truncated = params.message.slice(0, CHAT_CONSTANTS.MAX_MESSAGE_LENGTH);

  const row = await prisma.chatMessage.create({
    data: {
      channelType: params.channelType,
      channelId: params.channelId,
      playerId: params.playerId,
      username: params.username,
      message: truncated,
      messageType: params.messageType ?? 'player',
    },
    select: { id: true, createdAt: true },
  });

  return row;
}

export async function getChannelHistory(
  channelType: ChatChannelType,
  channelId: string,
  options: { messageType?: ChatHistoryMessageTypeFilter } = {},
): Promise<ChatMessageEvent[]> {
  const where: Prisma.ChatMessageWhereInput = { channelType, channelId };
  if (options.messageType === 'non_activity') {
    where.NOT = { messageType: 'activity' };
  } else if (options.messageType) {
    where.messageType = options.messageType;
  }

  const rows = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: CHAT_CONSTANTS.HISTORY_LIMIT,
  });
  if (rows.length === 0) {
    return [];
  }

  // Batch-lookup player titles for all unique player IDs
  const playerIds = [...new Set(rows.map((r) => r.playerId))];
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, activeTitle: true },
  });
  const titleMap = new Map<string, ReturnType<typeof resolveAchievementTitleDisplay>>();
  for (const p of players) {
    if (p.activeTitle) {
      titleMap.set(p.id, resolveAchievementTitleDisplay(p.activeTitle));
    }
  }

  // Reverse so oldest first for display
  return rows.reverse().map((r) => {
    const info = titleMap.get(r.playerId);
    return {
      id: r.id,
      channelType: r.channelType as ChatChannelType,
      channelId: r.channelId,
      playerId: r.playerId,
      username: r.username,
      ...info,
      message: r.message,
      messageType: (r.messageType ?? 'player') as ChatMessageType,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

function parseScopedChannelId(channelType: 'zone' | 'guild', channelId: string): string | null {
  const prefix = `${channelType}:`;
  if (!channelId.startsWith(prefix)) {
    return null;
  }

  const id = channelId.slice(prefix.length);
  return id.length > 0 ? id : null;
}

async function assertCanReadChannelHistory(
  playerId: string,
  channelType: ChatChannelType,
  channelId: string,
): Promise<void> {
  if (channelType === 'world') {
    if (channelId === 'world') return;
    throw new AppError(403, 'You cannot read that chat channel.', 'FORBIDDEN');
  }

  if (channelType === 'casino') {
    if (channelId === 'casino') return;
    throw new AppError(403, 'You cannot read that chat channel.', 'FORBIDDEN');
  }

  if (channelType === 'zone') {
    const zoneId = parseScopedChannelId('zone', channelId);
    if (!zoneId) {
      throw new AppError(403, 'You cannot read that chat channel.', 'FORBIDDEN');
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { currentZoneId: true },
    });
    if (player?.currentZoneId === zoneId) {
      return;
    }

    throw new AppError(403, 'You cannot read that chat channel.', 'FORBIDDEN');
  }

  const guildId = parseScopedChannelId('guild', channelId);
  if (!guildId) {
    throw new AppError(403, 'You cannot read that chat channel.', 'FORBIDDEN');
  }

  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true },
  });
  if (membership?.guildId === guildId) {
    return;
  }

  throw new AppError(403, 'You cannot read that chat channel.', 'FORBIDDEN');
}

export async function getAuthorizedChannelHistory(
  playerId: string,
  channelType: ChatChannelType,
  channelId: string,
  options: { messageType?: ChatHistoryMessageTypeFilter } = {},
): Promise<ChatMessageEvent[]> {
  await assertCanReadChannelHistory(playerId, channelType, channelId);
  return getChannelHistory(channelType, channelId, options);
}
