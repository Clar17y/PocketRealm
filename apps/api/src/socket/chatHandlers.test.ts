import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

vi.mock('../services/chatService', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  saveMessage: vi.fn(),
}));

vi.mock('../services/zoneService', () => ({
  getPlayerZoneId: vi.fn().mockResolvedValue(null),
}));

import { prisma } from '@pocketrealm/database';
import { saveMessage } from '../services/chatService';
import { getPlayerZoneId } from '../services/zoneService';
import { registerChatHandlers } from './chatHandlers';

type SocketHandler = (payload?: unknown) => void | Promise<void>;

function makeIo(fetchSockets: Array<{ data: Record<string, unknown>; leave: ReturnType<typeof vi.fn> }> = []) {
  const emit = vi.fn();
  const fetchSocketsMock = vi.fn().mockResolvedValue(fetchSockets);
  const io = {
    sockets: {
      adapter: {
        rooms: new Map<string, Set<string>>(),
      },
    },
    in: vi.fn(() => ({ fetchSockets: fetchSocketsMock })),
    to: vi.fn(() => ({ emit })),
  } as unknown as Server;

  return { io, emit, fetchSocketsMock };
}

function makeSocket(role = 'admin', rooms: string[] = []) {
  const handlers = new Map<string, SocketHandler>();
  const socket = {
    data: {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Rook',
      role,
    },
    rooms: new Set<string>(rooms),
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    on: vi.fn((event: string, handler: SocketHandler) => {
      handlers.set(event, handler);
      return socket;
    }),
  } as unknown as Socket;

  return { socket, handlers };
}

function mockAccountRole(role: 'admin' | 'player') {
  vi.mocked(prisma.account.findUnique).mockResolvedValue({ role } as never);
}

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('registerChatHandlers admin moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects pinning when the database no longer confirms admin role', async () => {
    mockAccountRole('player');
    const { io } = makeIo();
    const { socket, handlers } = makeSocket('admin');

    registerChatHandlers(io, socket);
    await handlers.get('chat:pin')?.({ channelId: 'world', message: 'Maintenance soon' });

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      select: { role: true },
    });
    expect(socket.emit).toHaveBeenCalledWith('chat:error', {
      code: 'FORBIDDEN',
      message: 'Only admins can pin messages.',
    });
    expect(io.to).not.toHaveBeenCalledWith('chat:world');
  });

  it('allows pinning when the database confirms admin role', async () => {
    mockAccountRole('admin');
    const { io, emit } = makeIo();
    const { socket, handlers } = makeSocket('admin');

    registerChatHandlers(io, socket);
    await handlers.get('chat:pin')?.({ channelId: 'world', message: 'Maintenance soon' });

    expect(io.to).toHaveBeenCalledWith('chat:world');
    expect(emit).toHaveBeenCalledWith('chat:pinned', {
      id: expect.any(String),
      message: 'Maintenance soon',
      pinnedBy: 'Rook',
      channelId: 'world',
    });
    expect(socket.emit).not.toHaveBeenCalledWith('chat:error', expect.any(Object));
  });

  it('rejects unpinning when the database no longer confirms admin role', async () => {
    mockAccountRole('player');
    const { io } = makeIo();
    const { socket, handlers } = makeSocket('admin');

    registerChatHandlers(io, socket);
    await handlers.get('chat:unpin')?.({ channelId: 'world' });

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      select: { role: true },
    });
    expect(socket.emit).toHaveBeenCalledWith('chat:error', {
      code: 'FORBIDDEN',
      message: 'Only admins can unpin messages.',
    });
    expect(io.to).not.toHaveBeenCalledWith('chat:world');
  });
});

describe('registerChatHandlers scoped room authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveMessage).mockResolvedValue({
      id: 'message-1',
      createdAt: new Date('2026-04-24T00:00:00.000Z'),
    });
  });

  it('rejects a stale zone sender before saving a message', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({ currentZoneId: 'zone-current' } as never);
    vi.mocked(prisma.guildMember.findUnique).mockResolvedValue(null);
    const { io } = makeIo();
    const { socket, handlers } = makeSocket('player', ['chat:zone:zone-old']);

    registerChatHandlers(io, socket);
    await handlers.get('chat:send')?.({
      channelType: 'zone',
      channelId: 'zone:zone-old',
      message: 'Still here?',
    });

    expect(socket.leave).toHaveBeenCalledWith('chat:zone:zone-old');
    expect(socket.join).toHaveBeenCalledWith('chat:zone:zone-current');
    expect(socket.emit).toHaveBeenCalledWith('chat:error', {
      code: 'NOT_IN_CHANNEL',
      message: 'You are not in that channel.',
    });
    expect(saveMessage).not.toHaveBeenCalled();
  });

  it('uses current database zone before emitting initial zone pins', async () => {
    mockAccountRole('admin');
    const { io: adminIo } = makeIo();
    const { socket: adminSocket, handlers } = makeSocket('admin');

    registerChatHandlers(adminIo, adminSocket);
    await handlers.get('chat:pin')?.({ channelId: 'zone:zone-old', message: 'Old zone pin' });

    vi.mocked(getPlayerZoneId).mockResolvedValue('zone-old');
    vi.mocked(prisma.player.findUnique).mockResolvedValue({ currentZoneId: 'zone-current' } as never);
    vi.mocked(prisma.guildMember.findUnique).mockResolvedValue(null);
    const { io } = makeIo();
    const { socket } = makeSocket('player');

    registerChatHandlers(io, socket);
    await flushPromises();

    expect(socket.join).toHaveBeenCalledWith('chat:zone:zone-current');
    expect(socket.join).not.toHaveBeenCalledWith('chat:zone:zone-old');
    expect(socket.emit).not.toHaveBeenCalledWith('chat:pinned', expect.objectContaining({
      channelId: 'zone:zone-old',
    }));
  });

  it('removes stale zone receivers before broadcasting a zone message', async () => {
    const staleSocket = { data: { playerId: 'stale-player' }, leave: vi.fn() };
    const currentSocket = { data: { playerId: 'current-player' }, leave: vi.fn() };
    vi.mocked(prisma.player.findUnique).mockResolvedValue({ currentZoneId: 'zone-current', activeTitle: null } as never);
    vi.mocked(prisma.guildMember.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.player.findMany).mockResolvedValue([{ id: 'current-player' }] as never);
    const { io, emit } = makeIo([staleSocket, currentSocket]);
    const { socket, handlers } = makeSocket('player', ['chat:zone:zone-current']);

    registerChatHandlers(io, socket);
    await handlers.get('chat:send')?.({
      channelType: 'zone',
      channelId: 'zone:zone-current',
      message: 'Current zone only',
    });

    expect(prisma.player.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['stale-player', 'current-player'] },
        currentZoneId: 'zone-current',
      },
      select: { id: true },
    });
    expect(staleSocket.leave).toHaveBeenCalledWith('chat:zone:zone-current');
    expect(currentSocket.leave).not.toHaveBeenCalled();
    expect(io.to).toHaveBeenCalledWith('chat:zone:zone-current');
    expect(emit).toHaveBeenCalledWith('chat:message', expect.objectContaining({
      channelType: 'zone',
      channelId: 'zone:zone-current',
      message: 'Current zone only',
    }));
  });
});
