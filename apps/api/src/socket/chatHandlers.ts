import type { Server, Socket } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { CHAT_CONSTANTS, resolveAchievementTitleDisplay } from '@pocketrealm/shared';
import type { ChatChannelType, ChatMessageEvent, ChatPresenceEvent, ChatPinnedMessageEvent } from '@pocketrealm/shared';
import { checkRateLimit, saveMessage } from '../services/chatService';
import { sanitizeUserText } from '../utils/sanitize';

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

interface ScopedChatMembership {
  currentZoneId: string | null;
  guildId: string | null;
}

interface ChatRoomSocket {
  data: {
    playerId?: unknown;
  };
  leave(room: string): void | Promise<void>;
}

function parseScopedChannelId(channelType: 'zone' | 'guild', channelId: string): string | null {
  const prefix = `${channelType}:`;
  if (!channelId.startsWith(prefix)) {
    return null;
  }

  const id = channelId.slice(prefix.length);
  return id.length > 0 ? id : null;
}

function getMemberSocketPlayerId(socket: ChatRoomSocket): string | null {
  return typeof socket.data.playerId === 'string' ? socket.data.playerId : null;
}

function reconcileRoomSet(socket: Socket, prefix: string, currentId: string | null): void {
  const expectedRoom = currentId ? `${prefix}${currentId}` : null;

  for (const room of socket.rooms) {
    if (room.startsWith(prefix) && room !== expectedRoom) {
      socket.leave(room);
    }
  }

  if (expectedRoom && !socket.rooms.has(expectedRoom)) {
    socket.join(expectedRoom);
  }
}

async function reconcileSocketScopedRooms(socket: Socket, playerId: string): Promise<ScopedChatMembership> {
  const [player, membership] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: { currentZoneId: true },
    }),
    prisma.guildMember.findUnique({
      where: { playerId },
      select: { guildId: true },
    }),
  ]);

  const scopedMembership = {
    currentZoneId: player?.currentZoneId ?? null,
    guildId: membership?.guildId ?? null,
  };

  reconcileRoomSet(socket, 'chat:zone:', scopedMembership.currentZoneId);
  reconcileRoomSet(socket, 'chat:guild:', scopedMembership.guildId);

  return scopedMembership;
}

function canSendToChannel(
  channelType: ChatChannelType,
  channelId: string,
  room: string,
  membership: ScopedChatMembership,
  socket: Socket,
): boolean {
  if (channelType === 'world') {
    return channelId === 'world';
  }

  if (channelType === 'casino') {
    return channelId === 'casino' && socket.rooms.has(room);
  }

  if (channelType === 'zone') {
    const zoneId = parseScopedChannelId('zone', channelId);
    return zoneId !== null && membership.currentZoneId === zoneId;
  }

  const guildId = parseScopedChannelId('guild', channelId);
  return guildId !== null && membership.guildId === guildId;
}

async function pruneUnauthorizedRoomMembers(
  io: Server,
  room: string,
  channelType: ChatChannelType,
  channelId: string,
): Promise<void> {
  if (channelType !== 'zone' && channelType !== 'guild') {
    return;
  }

  const scopedId = parseScopedChannelId(channelType, channelId);
  if (!scopedId) {
    return;
  }

  const sockets = await io.in(room).fetchSockets() as ChatRoomSocket[];
  const playerIds = sockets
    .map(getMemberSocketPlayerId)
    .filter((id): id is string => id !== null);
  if (playerIds.length === 0) {
    return;
  }

  const authorizedRows = channelType === 'zone'
    ? await prisma.player.findMany({
        where: {
          id: { in: playerIds },
          currentZoneId: scopedId,
        },
        select: { id: true },
      })
    : await prisma.guildMember.findMany({
        where: {
          playerId: { in: playerIds },
          guildId: scopedId,
        },
        select: { playerId: true },
      });

  const authorizedIds = new Set(
    authorizedRows.map((row) => ('id' in row ? row.id : row.playerId)),
  );

  await Promise.all(sockets.map(async (memberSocket) => {
    const memberPlayerId = getMemberSocketPlayerId(memberSocket);
    if (!memberPlayerId || !authorizedIds.has(memberPlayerId)) {
      await memberSocket.leave(room);
    }
  }));
}

function inferScopedChannelType(channelId: string): ChatChannelType | null {
  if (channelId.startsWith('zone:')) return 'zone';
  if (channelId.startsWith('guild:')) return 'guild';
  if (channelId === 'world') return 'world';
  if (channelId === 'casino') return 'casino';
  return null;
}

async function hasConfirmedAdminRole(accountId: string): Promise<boolean> {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { role: true },
    });

    return account?.role === 'admin';
  } catch {
    return false;
  }
}

async function requireConfirmedAdmin(socket: Socket, accountId: string, action: 'pin' | 'unpin'): Promise<boolean> {
  if (await hasConfirmedAdminRole(accountId)) {
    return true;
  }

  socket.emit('chat:error', { code: 'FORBIDDEN', message: `Only admins can ${action} messages.` });
  return false;
}

export function registerChatHandlers(io: Server, socket: Socket): void {
  const { accountId, playerId, username, role } = socket.data;

  // Join world room + emit current world pin if any
  socket.join('chat:world');
  const worldPin = pinnedMessages.get('world');
  if (worldPin) {
    socket.emit('chat:pinned', worldPin);
  }

  reconcileSocketScopedRooms(socket, playerId)
    .then(({ currentZoneId }) => {
      if (currentZoneId) {
        const zonePin = pinnedMessages.get(`zone:${currentZoneId}`);
        if (zonePin) {
          socket.emit('chat:pinned', zonePin);
        }
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

    const scopedMembership = await reconcileSocketScopedRooms(socket, playerId);

    // Derive the expected room and verify the socket belongs to it now.
    const room = `chat:${channelId}`;
    if (!canSendToChannel(channelType as ChatChannelType, channelId, room, scopedMembership, socket)) {
      socket.emit('chat:error', { code: 'NOT_IN_CHANNEL', message: 'You are not in that channel.' });
      return;
    }

    const trimmed = sanitizeUserText(message.trim());
    if (!trimmed || trimmed.length > CHAT_CONSTANTS.MAX_MESSAGE_LENGTH) return;

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

    const event: ChatMessageEvent = {
      id: saved.id,
      channelType: channelType as ChatChannelType,
      channelId,
      playerId,
      username,
      ...resolveAchievementTitleDisplay(player?.activeTitle),
      message: trimmed,
      createdAt: saved.createdAt.toISOString(),
      role: role as ChatMessageEvent['role'],
    };

    await pruneUnauthorizedRoomMembers(io, room, channelType as ChatChannelType, channelId);
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
  socket.on('chat:pin', async (payload: unknown) => {
    if (!(await requireConfirmedAdmin(socket, accountId, 'pin'))) {
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
    const channelType = inferScopedChannelType(channelId);
    if (channelType) {
      await pruneUnauthorizedRoomMembers(io, `chat:${channelId}`, channelType, channelId);
    }
    io.to(`chat:${channelId}`).emit('chat:pinned', pinEvent);
  });

  // Unpin a message (admin only)
  socket.on('chat:unpin', async (payload: unknown) => {
    if (!(await requireConfirmedAdmin(socket, accountId, 'unpin'))) {
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
    const channelType = inferScopedChannelType(channelId);
    if (channelType) {
      await pruneUnauthorizedRoomMembers(io, `chat:${channelId}`, channelType, channelId);
    }
    io.to(`chat:${channelId}`).emit('chat:pinned', unpinEvent);
  });

  socket.on('disconnect', () => {
    schedulePresenceBroadcast(io);
  });
}
