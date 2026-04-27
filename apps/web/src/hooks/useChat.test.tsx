import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ChatErrorEvent,
  ChatMessageEvent,
  ChatPinnedMessageEvent,
  ChatPresenceEvent,
} from '@pocketrealm/shared';

type SocketEventMap = {
  'chat:message': ChatMessageEvent;
  'chat:presence': ChatPresenceEvent;
  'chat:error': ChatErrorEvent;
  'chat:pinned': ChatPinnedMessageEvent;
  connect: void;
};

type SocketEvent = keyof SocketEventMap;
type SocketHandler<TEvent extends SocketEvent> = SocketEventMap[TEvent] extends void
  ? () => void
  : (payload: SocketEventMap[TEvent]) => void;

interface MockSocket {
  connected: boolean;
  auth?: { token: string };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: <TEvent extends SocketEvent>(event: TEvent, handler: SocketHandler<TEvent>) => void;
  off: <TEvent extends SocketEvent>(event: TEvent, handler: SocketHandler<TEvent>) => void;
}

const testState = vi.hoisted(() => {
  const handlers = new Map<SocketEvent, Set<SocketHandler<SocketEvent>>>();
  const socket: MockSocket = {
    connected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn(),
    on: vi.fn(<TEvent extends SocketEvent>(event: TEvent, handler: SocketHandler<TEvent>) => {
      const existing = handlers.get(event) ?? new Set<SocketHandler<SocketEvent>>();
      existing.add(handler as SocketHandler<SocketEvent>);
      handlers.set(event, existing);
    }),
    off: vi.fn(<TEvent extends SocketEvent>(event: TEvent, handler: SocketHandler<TEvent>) => {
      handlers.get(event)?.delete(handler as SocketHandler<SocketEvent>);
    }),
  };

  return {
    handlers,
    socket,
    getChatHistory: vi.fn(),
    connectSocket: vi.fn(() => {
      socket.connected = true;
    }),
    disconnectSocket: vi.fn(() => {
      socket.connected = false;
    }),
  };
});

vi.mock('@/lib/socket', () => ({
  getSocket: () => testState.socket,
  connectSocket: testState.connectSocket,
  disconnectSocket: testState.disconnectSocket,
}));

vi.mock('@/lib/api', () => ({
  getChatHistory: testState.getChatHistory,
}));

import { getChatHistory } from '@/lib/api';
import { useChat } from './useChat';

const worldPlayerMessage: ChatMessageEvent = {
  id: 'world-player',
  channelType: 'world',
  channelId: 'world',
  playerId: 'p1',
  username: 'Player',
  message: 'hello world',
  createdAt: '2026-04-18T12:00:00.000Z',
};

const worldSystemMessage: ChatMessageEvent = {
  id: 'world-system',
  channelType: 'world',
  channelId: 'world',
  playerId: 'system',
  username: 'System',
  message: 'A boss has appeared in Iron Hollow: The Ashen Herald!',
  messageType: 'system',
  createdAt: '2026-04-18T12:01:00.000Z',
};

const worldActivityMessage: ChatMessageEvent = {
  id: 'world-activity',
  channelType: 'world',
  channelId: 'world',
  playerId: 'system',
  username: 'System',
  message: 'The Ashen Herald has been defeated.',
  messageType: 'activity',
  createdAt: '2026-04-18T12:02:00.000Z',
};

function emitSocketEvent<TEvent extends SocketEvent>(event: TEvent, payload: SocketEventMap[TEvent]) {
  for (const handler of testState.handlers.get(event) ?? []) {
    if (payload === undefined) {
      (handler as () => void)();
    } else {
      (handler as (value: SocketEventMap[TEvent]) => void)(payload);
    }
  }
}

describe('useChat', () => {
  beforeEach(() => {
    testState.handlers.clear();
    testState.socket.connected = true;
    testState.socket.auth = undefined;
    vi.clearAllMocks();
    vi.mocked(getChatHistory).mockResolvedValue({ data: { messages: [] }, error: null });
  });

  it('splits mixed world history into chat stream and global activity', async () => {
    vi.mocked(getChatHistory)
      .mockResolvedValueOnce({ data: { messages: [worldPlayerMessage, worldSystemMessage] }, error: null })
      .mockResolvedValueOnce({ data: { messages: [worldActivityMessage] }, error: null });

    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => {
      expect(result.current.worldMessages).toEqual([worldPlayerMessage, worldSystemMessage]);
      expect(result.current.globalActivityMessages).toEqual([worldActivityMessage]);
    });
    expect(getChatHistory).toHaveBeenCalledWith('world', 'world', { messageType: 'non_activity' });
    expect(getChatHistory).toHaveBeenCalledWith('world', 'world', { messageType: 'activity' });
  });

  it('routes socket world activity messages to global activity without unread world count', async () => {
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(getChatHistory).toHaveBeenCalledWith('world', 'world', { messageType: 'activity' }));

    act(() => {
      emitSocketEvent('chat:message', worldActivityMessage);
    });

    expect(result.current.worldMessages).toEqual([]);
    expect(result.current.globalActivityMessages).toEqual([worldActivityMessage]);
    expect(result.current.unreadWorld).toBe(0);
  });

  it('keeps socket world system messages inline and counts them as unread', async () => {
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(getChatHistory).toHaveBeenCalledWith('world', 'world', { messageType: 'non_activity' }));

    act(() => {
      emitSocketEvent('chat:message', worldSystemMessage);
    });

    expect(result.current.worldMessages).toEqual([worldSystemMessage]);
    expect(result.current.globalActivityMessages).toEqual([]);
    expect(result.current.unreadWorld).toBe(1);
  });

  it('keeps socket zone system messages inline in zone messages', async () => {
    const zoneSystemMessage: ChatMessageEvent = {
      id: 'zone-system',
      channelType: 'zone',
      channelId: 'zone:forest',
      playerId: 'system',
      username: 'System',
      message: 'A rare creature stirs nearby.',
      messageType: 'system',
      createdAt: '2026-04-18T12:02:00.000Z',
    };
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: 'forest' }));

    await waitFor(() => expect(getChatHistory).toHaveBeenCalledWith('zone', 'zone:forest'));

    act(() => {
      emitSocketEvent('chat:message', zoneSystemMessage);
    });

    expect(result.current.zoneMessages).toEqual([zoneSystemMessage]);
    expect(result.current.globalActivityMessages).toEqual([]);
  });
});
