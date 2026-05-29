import type { Server as SocketServer } from 'socket.io';
import type { ChatChannelType, ChatMessageEvent, ChatMessageType } from '@pocketrealm/shared';
import { saveMessage } from './chatService';
import { publishChatMessageFromWorker } from './realtimeBridge';

const SYSTEM_PLAYER_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_USERNAME = 'System';

export async function emitSystemMessage(
  io: SocketServer | null,
  channelType: ChatChannelType,
  channelId: string,
  message: string,
  messageType: Extract<ChatMessageType, 'system' | 'activity'> = 'system',
): Promise<{ id: string; createdAt: Date }> {
  const row = await saveMessage({
    channelType,
    channelId,
    playerId: SYSTEM_PLAYER_ID,
    username: SYSTEM_USERNAME,
    message,
    messageType,
  });

  const event: ChatMessageEvent = {
    id: row.id,
    channelType,
    channelId,
    playerId: SYSTEM_PLAYER_ID,
    username: SYSTEM_USERNAME,
    message,
    messageType,
    createdAt: row.createdAt.toISOString(),
  };

  if (!io) {
    await publishChatMessageFromWorker(event);
    return row;
  }

  const room = `chat:${channelId}`;
  io.to(room).emit('chat:message', event);
  return row;
}
