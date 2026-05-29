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
    getPlayerGuild: vi.fn(),
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
  getPlayerGuild: testState.getPlayerGuild,
}));

import { getChatHistory, getPlayerGuild } from '@/lib/api';
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

const guildMessage: ChatMessageEvent = {
  id: 'guild-player',
  channelType: 'guild',
  channelId: 'guild:guild-1',
  playerId: 'p2',
  username: 'Guildmate',
  message: 'hello guild',
  createdAt: '2026-04-18T12:03:00.000Z',
};

const guildResponse = {
  guild: {
    id: 'guild-1',
    name: 'Realm Runners',
    tag: 'RUN',
    description: null,
    leaderId: 'p1',
    level: 3,
    xp: '1200',
    memberCount: 8,
    maxMembers: 20,
    recruitmentMode: 'open',
    minLevelRequirement: 10,
    taxRate: 5,
    specialization: null,
    renown: 12,
    seasonalRenown: 4,
    treasuryTurns: 1000,
    treasuryCap: 5000,
    createdAt: '2026-04-18T12:00:00.000Z',
  },
  role: 'member',
  members: [],
};

const otherGuildResponse = {
  ...guildResponse,
  guild: {
    ...guildResponse.guild,
    id: 'guild-2',
    name: 'Night Watch',
    tag: 'NIT',
  },
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useChat', () => {
  beforeEach(() => {
    testState.handlers.clear();
    testState.socket.connected = true;
    testState.socket.auth = undefined;
    vi.clearAllMocks();
    vi.mocked(getChatHistory).mockResolvedValue({ data: { messages: [] }, error: null });
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: null, error: null });
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

  it('ignores duplicate socket messages with the same id', async () => {
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: 'forest' }));

    await waitFor(() => expect(getChatHistory).toHaveBeenCalledWith('world', 'world', { messageType: 'activity' }));

    act(() => {
      emitSocketEvent('chat:message', worldActivityMessage);
      emitSocketEvent('chat:message', worldActivityMessage);
    });

    expect(result.current.globalActivityMessages).toEqual([worldActivityMessage]);
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

  it('loads guild history when the player is in a guild', async () => {
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: guildResponse, error: null });
    vi.mocked(getChatHistory).mockImplementation(async (channelType, channelId) => ({
      data: { messages: channelType === 'guild' && channelId === 'guild:guild-1' ? [guildMessage] : [] },
      error: null,
    }));

    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => {
      expect(result.current.guildMessages).toEqual([guildMessage]);
    });
    expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners');
    expect(getChatHistory).toHaveBeenCalledWith('guild', 'guild:guild-1');
  });

  it('requests a scoped room refresh when guild chat becomes available', async () => {
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: guildResponse, error: null });

    renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => {
      expect(testState.socket.emit).toHaveBeenCalledWith('chat:refresh-rooms');
    });
  });

  it('refreshes guild chat on demand after membership changes', async () => {
    vi.mocked(getPlayerGuild)
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: guildResponse, error: null });

    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(getPlayerGuild).toHaveBeenCalledTimes(1));
    expect(result.current.guildChatLabel).toBeNull();

    act(() => {
      result.current.refreshGuildChat();
    });

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners'));
    expect(getChatHistory).toHaveBeenCalledWith('guild', 'guild:guild-1');
    expect(testState.socket.emit).toHaveBeenCalledWith('chat:refresh-rooms');
  });

  it('sends messages to the current guild channel', async () => {
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: guildResponse, error: null });
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners'));

    act(() => {
      result.current.setActiveChannel('guild');
      result.current.sendMessage(' hello guild ');
    });

    expect(testState.socket.emit).toHaveBeenCalledWith('chat:send', {
      channelType: 'guild',
      channelId: 'guild:guild-1',
      message: 'hello guild',
    });
  });

  it('tracks unread guild messages until the guild tab is active', async () => {
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: guildResponse, error: null });
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners'));

    act(() => {
      emitSocketEvent('chat:message', guildMessage);
    });

    expect(result.current.guildMessages).toEqual([guildMessage]);
    expect(result.current.unreadGuild).toBe(1);

    act(() => {
      result.current.setActiveChannel('guild');
    });

    expect(result.current.unreadGuild).toBe(0);
  });

  it('ignores guild socket messages from a stale guild channel', async () => {
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: guildResponse, error: null });
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners'));

    act(() => {
      emitSocketEvent('chat:message', { ...guildMessage, id: 'stale-guild', channelId: 'guild:guild-2' });
    });

    expect(result.current.guildMessages).toEqual([]);
    expect(result.current.unreadGuild).toBe(0);
  });

  it('clears previous guild messages if a new guild history load fails', async () => {
    vi.mocked(getPlayerGuild)
      .mockResolvedValueOnce({ data: guildResponse, error: null })
      .mockResolvedValueOnce({ data: otherGuildResponse, error: null });
    vi.mocked(getChatHistory)
      .mockResolvedValueOnce({ data: { messages: [] }, error: null })
      .mockResolvedValueOnce({ data: { messages: [] }, error: null })
      .mockResolvedValueOnce({ data: { messages: [guildMessage] }, error: null })
      .mockResolvedValueOnce({ data: undefined, error: { message: 'No history', code: 'NETWORK_ERROR' } });

    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(result.current.guildMessages).toEqual([guildMessage]));

    act(() => {
      result.current.toggleChat();
    });

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[NIT] Night Watch'));
    expect(result.current.guildMessages).toEqual([]);
  });

  it('ignores stale guild history responses after membership is cleared', async () => {
    const staleHistory = createDeferred<Awaited<ReturnType<typeof getChatHistory>>>();
    vi.mocked(getPlayerGuild)
      .mockResolvedValueOnce({ data: guildResponse, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    vi.mocked(getChatHistory).mockImplementation(async (channelType) => {
      if (channelType === 'guild') {
        return staleHistory.promise;
      }
      return { data: { messages: [] }, error: null };
    });

    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners'));

    act(() => {
      result.current.refreshGuildChat();
    });

    await waitFor(() => expect(result.current.guildChatLabel).toBeNull());

    await act(async () => {
      staleHistory.resolve({ data: { messages: [guildMessage] }, error: null });
      await staleHistory.promise;
    });

    expect(result.current.guildMessages).toEqual([]);
  });

  it('routes guild pins separately from zone pins', async () => {
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: guildResponse, error: null });
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners'));

    const guildPin: ChatPinnedMessageEvent = {
      id: 'pin-guild',
      channelId: 'guild:guild-1',
      message: 'Guild notice',
      pinnedBy: 'Rook',
    };

    act(() => {
      emitSocketEvent('chat:pinned', guildPin);
    });

    expect(result.current.pinnedGuild).toEqual(guildPin);
    expect(result.current.pinnedZone).toBeNull();
  });

  it('ignores guild pins from a stale guild channel', async () => {
    vi.mocked(getPlayerGuild).mockResolvedValue({ data: guildResponse, error: null });
    const { result } = renderHook(() => useChat({ isAuthenticated: true, currentZoneId: null }));

    await waitFor(() => expect(result.current.guildChatLabel).toBe('[RUN] Realm Runners'));

    act(() => {
      emitSocketEvent('chat:pinned', {
        id: 'pin-stale-guild',
        channelId: 'guild:guild-2',
        message: 'Stale notice',
        pinnedBy: 'Rook',
      });
    });

    expect(result.current.pinnedGuild).toBeNull();
  });
});
