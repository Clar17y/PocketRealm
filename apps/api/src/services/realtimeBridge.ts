import type { Server as SocketServer } from 'socket.io';
import type { ChatMessageEvent } from '@pocketrealm/shared';
import { redis } from '../redis';
import { logger } from '../logger';

const CHAT_MESSAGE_CHANNEL = 'pocketrealm:realtime:chat-message';

export async function publishChatMessageFromWorker(event: ChatMessageEvent): Promise<void> {
  await redis.publish(CHAT_MESSAGE_CHANNEL, JSON.stringify(event));
}

export function startRealtimeBridge(io: SocketServer): () => Promise<void> {
  const sub = redis.duplicate({ lazyConnect: true });

  sub.on('message', (channel: string, payload: string) => {
    if (channel !== CHAT_MESSAGE_CHANNEL) return;

    try {
      const event = JSON.parse(payload) as ChatMessageEvent;
      io.local.to(`chat:${event.channelId}`).emit('chat:message', event);
    } catch (err) {
      logger.error({ err }, 'Failed to handle realtime bridge message');
    }
  });

  void sub.subscribe(CHAT_MESSAGE_CHANNEL).catch((err) => {
    logger.error({ err }, 'Realtime bridge subscribe failed');
  });

  return async () => {
    await sub.quit();
  };
}
