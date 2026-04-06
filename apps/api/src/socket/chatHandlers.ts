import type { Server, Socket } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { ACHIEVEMENTS_BY_ID, CHAT_CONSTANTS } from '@pocketrealm/shared';
import type { ChatChannelType, ChatMessageEvent, ChatPresenceEvent, ChatPinnedMessageEvent } from '@pocketrealm/shared';
import { checkRateLimit, saveMessage } from '../services/chatService';
import { sanitizeUserText } from '../utils/sanitize';
import { getPlayerGuildId } from '../services/guildService';
import { getPlayerZoneId } from '../services/zoneService';

// In-memory pinned messages keyed by channelId (ephemeral, lost on server restart)
const pinnedMessages = new Map<string, ChatPinnedMessageEvent>();

// Throttle presence broadcasts to avoid spam on rapid connect/disconnect
let presenceTimeout: ReturnType<typeof setTimeout> | null = null;
const PRESENCE_THROTTLE_MS = 1000;

function schedulePresenceBroadcast(io: Server): void {
  if (presenceTimeout) return;
  presenceTimeout = setTimeout(() => {
    presenceTimeout = null;
    broadcastPresence(io);
  }, PRESENCE_THROTTLE_MS);
}

function broadcastPresence(io: Server): void {
  const worldRoom = io.sockets.adapter.rooms.get('chat:world');
  const worldOnline = worldRoom?.size ?? 0;

  const zoneOnline: Record<string, number> = {};
  for (const [roomName, room] of io.sockets.adapter.rooms) {
    if (roomName.startsWith('chat:zone:')) {
      const zoneId = roomName.slice('chat:zone:'.length);
      zoneOnline[zoneId] = room.size;
    }
  }

  const event: ChatPresenceEvent = { worldOnline, zoneOnline };
  io.to('chat:world').emit('chat:presence', event);
}

const VALID_CHANNEL_TYPES = new Set<ChatChannelType>(['world', 'zone', 'guild', 'casino']);

export function registerChatHandlers(io: Server, socket: Socket): void {
  const { playerId, username, role } = socket.data;

  // Join world room + emit current world pin if any
  socket.join('chat:world');
  const worldPin = pinnedMessages.get('world');
  if (worldPin) {
    socket.emit('chat:pinned', worldPin);
  }

  // Look up player's current zone and guild via Redis cache (avoids DB queries on every connect)
  Promise.all([
    getPlayerZoneId(playerId),
    getPlayerGuildId(playerId),
  ])
    .then(([currentZoneId, guildId]) => {
      if (currentZoneId) {
        socket.join(`chat:zone:${currentZoneId}`);
        const zonePin = pinnedMessages.get(`zone:${currentZoneId}`);
        if (zonePin) {
          socket.emit('chat:pinned', zonePin);
        }
      }
      if (guildId) {
        socket.join(`chat:guild:${guildId}`);
      }
      schedulePresenceBroadcast(io);
    })
    .catch(() => {
      // Best-effort — presence will update on next event
    });

  // Handle chat:send
  socket.on('chat:send', async (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const { channelType, channelId, message } = payload as Record<string, unknown>;

    if (typeof channelType !== 'string' || typeof channelId !== 'string' || typeof message !== 'string') return;
    if (!VALID_CHANNEL_TYPES.has(channelType as ChatChannelType)) return;

    // Derive the expected room and verify the socket is a member
    const room = `chat:${channelId}`;
    if (!socket.rooms.has(room)) {
      socket.emit('chat:error', { code: 'NOT_IN_CHANNEL', message: 'You are not in that channel.' });
      return;
    }

    const trimmed = sanitizeUserText(message.trim());
    if (!trimmed || trimmed.length > CHAT_CONSTANTS.MAX_MESSAGE_LENGTH) return;

    // Guild chat: verify membership
    if (channelType === 'guild') {
      const membership = await prisma.guildMember.findUnique({ where: { playerId }, select: { guildId: true } });
      if (!membership || `guild:${membership.guildId}` !== channelId) {
        socket.emit('chat:error', { code: 'NOT_IN_GUILD', message: 'You are not in this guild.' });
        return;
      }
    }

    if (!(await checkRateLimit(playerId, channelType as ChatChannelType))) {
      socket.emit('chat:error', { code: 'RATE_LIMITED', message: 'Sending too fast, slow down.' });
      return;
    }

    const [saved, player] = await Promise.all([
      saveMessage({
        channelType: channelType as ChatChannelType,
        channelId,
        playerId,
        username,
        message: trimmed,
      }),
      prisma.player.findUnique({ where: { id: playerId }, select: { activeTitle: true } }),
    ]);

    const titleDef = player?.activeTitle ? ACHIEVEMENTS_BY_ID.get(player.activeTitle) : null;

    const event: ChatMessageEvent = {
      id: saved.id,
      channelType: channelType as ChatChannelType,
      channelId,
      playerId,
      username,
      title: titleDef?.titleReward,
      titleTier: titleDef?.tier,
      message: trimmed,
      createdAt: saved.createdAt.toISOString(),
      role: role as ChatMessageEvent['role'],
    };

    io.to(room).emit('chat:message', event);
  });

  // Handle zone switching (when player travels)
  socket.on('chat:switch-zone', async (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const { zoneId } = payload as Record<string, unknown>;
    if (typeof zoneId !== 'string') return;

    // Validate the player is actually in the requested zone
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { currentZoneId: true },
    });
    if (player?.currentZoneId !== zoneId) return;

    // Leave all current zone rooms
    for (const room of socket.rooms) {
      if (room.startsWith('chat:zone:')) {
        socket.leave(room);
      }
    }

    socket.join(`chat:zone:${zoneId}`);
    const zonePin = pinnedMessages.get(`zone:${zoneId}`);
    if (zonePin) {
      socket.emit('chat:pinned', zonePin);
    }
    schedulePresenceBroadcast(io);
  });

  // Casino room join/leave
  socket.on('chat:join-casino', () => {
    socket.join('chat:casino');
  });

  socket.on('chat:leave-casino', () => {
    socket.leave('chat:casino');
  });

  // Pin a message (admin only)
  socket.on('chat:pin', (payload: unknown) => {
    if (role !== 'admin') {
      socket.emit('chat:error', { code: 'FORBIDDEN', message: 'Only admins can pin messages.' });
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    const { channelId, message } = payload as Record<string, unknown>;
    if (typeof channelId !== 'string' || typeof message !== 'string') return;

    const pinEvent: ChatPinnedMessageEvent = {
      id: crypto.randomUUID(),
      message,
      pinnedBy: username,
      channelId,
    };
    pinnedMessages.set(channelId, pinEvent);
    io.to(`chat:${channelId}`).emit('chat:pinned', pinEvent);
  });

  // Unpin a message (admin only)
  socket.on('chat:unpin', (payload: unknown) => {
    if (role !== 'admin') {
      socket.emit('chat:error', { code: 'FORBIDDEN', message: 'Only admins can unpin messages.' });
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    const { channelId } = payload as Record<string, unknown>;
    if (typeof channelId !== 'string') return;

    pinnedMessages.delete(channelId);
    const unpinEvent: ChatPinnedMessageEvent = {
      id: null,
      message: null,
      pinnedBy: username,
      channelId,
    };
    io.to(`chat:${channelId}`).emit('chat:pinned', unpinEvent);
  });

  socket.on('disconnect', () => {
    schedulePresenceBroadcast(io);
  });
}
