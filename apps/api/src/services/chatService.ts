import { prisma } from '@pocketrealm/database';
import { ACHIEVEMENTS_BY_ID, CHAT_CONSTANTS } from '@pocketrealm/shared';
import type { ChatChannelType, ChatMessageEvent, ChatMessageType } from '@pocketrealm/shared';
import { redis } from '../redis';

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
): Promise<ChatMessageEvent[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { channelType, channelId },
    orderBy: { createdAt: 'desc' },
    take: CHAT_CONSTANTS.HISTORY_LIMIT,
  });

  // Batch-lookup player titles for all unique player IDs
  const playerIds = [...new Set(rows.map((r) => r.playerId))];
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { id: true, activeTitle: true },
  });
  const titleMap = new Map<string, { title: string; tier?: number }>();
  for (const p of players) {
    if (p.activeTitle) {
      const def = ACHIEVEMENTS_BY_ID.get(p.activeTitle);
      if (def?.titleReward) titleMap.set(p.id, { title: def.titleReward, tier: def.tier });
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
      title: info?.title,
      titleTier: info?.tier,
      message: r.message,
      messageType: (r.messageType ?? 'player') as ChatMessageType,
      createdAt: r.createdAt.toISOString(),
    };
  });
}
