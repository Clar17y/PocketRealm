import type { Server as SocketServer } from 'socket.io';
import type { ChatChannelType, ChatMessageEvent } from '@pocketrealm/shared';
import { saveMessage } from './chatService';

const SYSTEM_PLAYER_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_USERNAME = 'System';

export async function emitSystemMessage(
  io: SocketServer | null,
  channelType: ChatChannelType,
  channelId: string,
  message: string,
): Promise<void> {
  const row = await saveMessage({
    channelType,
    channelId,
    playerId: SYSTEM_PLAYER_ID,
    username: SYSTEM_USERNAME,
    message,
    messageType: 'system',
  });

  if (!io) return;

  const event: ChatMessageEvent = {
    id: row.id,
    channelType,
    channelId,
    playerId: SYSTEM_PLAYER_ID,
    username: SYSTEM_USERNAME,
    message,
    messageType: 'system',
    createdAt: row.createdAt.toISOString(),
  };

  const room = `chat:${channelId}`;
  io.to(room).emit('chat:message', event);
}
