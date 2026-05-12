'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageEvent, ChatPresenceEvent, ChatPinnedMessageEvent } from '@pocketrealm/shared';
import { CHAT_CONSTANTS } from '@pocketrealm/shared';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import { getChatHistory, getPlayerGuild } from '@/lib/api';

export type ChatChannel = 'world' | 'zone' | 'guild' | 'casino';

interface GuildChatInfo {
  id: string;
  label: string;
}

interface UseChatParams {
  isAuthenticated: boolean;
  currentZoneId: string | null;
}

export interface UseChatReturn {
  worldMessages: ChatMessageEvent[];
  globalActivityMessages: ChatMessageEvent[];
  zoneMessages: ChatMessageEvent[];
  guildMessages: ChatMessageEvent[];
  casinoMessages: ChatMessageEvent[];
  activeChannel: ChatChannel;
  setActiveChannel: (ch: ChatChannel) => void;
  isOpen: boolean;
  toggleChat: () => void;
  presence: ChatPresenceEvent;
  unreadWorld: number;
  unreadZone: number;
  unreadGuild: number;
  unreadCasino: number;
  guildChatLabel: string | null;
  casinoActive: boolean;
  joinCasino: () => void;
  leaveCasino: () => void;
  sendMessage: (text: string) => void;
  rateLimitError: string | null;
  pinnedWorld: ChatPinnedMessageEvent | null;
  pinnedZone: ChatPinnedMessageEvent | null;
  pinnedGuild: ChatPinnedMessageEvent | null;
  pinMessage: (channelId: string, message: string) => void;
  unpinMessage: (channelId: string) => void;
  injectCasinoSystemMessage: (texts: string | string[]) => void;
}

function formatGuildChatLabel(guild: { name: string; tag: string }): string {
  return guild.tag ? `[${guild.tag}] ${guild.name}` : guild.name;
}

function getGuildChannelId(guildId: string): string {
  return `guild:${guildId}`;
}

function getCurrentGuildChannelId(guildChat: GuildChatInfo | null): string | null {
  return guildChat ? getGuildChannelId(guildChat.id) : null;
}

function refreshScopedChatRooms(): void {
  const socket = getSocket();
  if (socket.connected) {
    socket.emit('chat:refresh-rooms');
  }
}

export function useChat({ isAuthenticated, currentZoneId }: UseChatParams): UseChatReturn {
  const [worldMessages, setWorldMessages] = useState<ChatMessageEvent[]>([]);
  const [globalActivityMessages, setGlobalActivityMessages] = useState<ChatMessageEvent[]>([]);
  const [zoneMessages, setZoneMessages] = useState<ChatMessageEvent[]>([]);
  const [guildMessages, setGuildMessages] = useState<ChatMessageEvent[]>([]);
  const [activeChannel, setActiveChannelRaw] = useState<ChatChannel>('world');
  const [isOpen, setIsOpen] = useState(false);
  const [presence, setPresence] = useState<ChatPresenceEvent>({ worldOnline: 0, zoneOnline: {} });
  const [unreadWorld, setUnreadWorld] = useState(0);
  const [unreadZone, setUnreadZone] = useState(0);
  const [unreadGuild, setUnreadGuild] = useState(0);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [pinnedWorld, setPinnedWorld] = useState<ChatPinnedMessageEvent | null>(null);
  const [pinnedZone, setPinnedZone] = useState<ChatPinnedMessageEvent | null>(null);
  const [pinnedGuild, setPinnedGuild] = useState<ChatPinnedMessageEvent | null>(null);
  const [guildChat, setGuildChat] = useState<GuildChatInfo | null>(null);
  const [casinoMessages, setCasinoMessages] = useState<ChatMessageEvent[]>([]);
  const [unreadCasino, setUnreadCasino] = useState(0);
  const [casinoActive, setCasinoActive] = useState(false);

  const currentZoneIdRef = useRef(currentZoneId);
  const isOpenRef = useRef(isOpen);
  const activeChannelRef = useRef(activeChannel);
  const guildChatRef = useRef(guildChat);
  const casinoActiveRef = useRef(casinoActive);

  currentZoneIdRef.current = currentZoneId;
  isOpenRef.current = isOpen;
  activeChannelRef.current = activeChannel;
  guildChatRef.current = guildChat;
  casinoActiveRef.current = casinoActive;

  const appendMessage = useCallback((msg: ChatMessageEvent) => {
    if (msg.channelType === 'world') {
      if (msg.messageType === 'activity') {
        setGlobalActivityMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
        return;
      }

      setWorldMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'world') {
        setUnreadWorld((n) => n + 1);
      }
    } else if (msg.channelType === 'zone') {
      setZoneMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'zone') {
        setUnreadZone((n) => n + 1);
      }
    } else if (msg.channelType === 'guild') {
      const expectedChannelId = getCurrentGuildChannelId(guildChatRef.current);
      if (msg.channelId !== expectedChannelId) return;

      setGuildMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'guild') {
        setUnreadGuild((n) => n + 1);
      }
    } else if (msg.channelType === 'casino') {
      setCasinoMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'casino') {
        setUnreadCasino((n) => n + 1);
      }
    }
  }, []);

  const clearGuildChat = useCallback(() => {
    guildChatRef.current = null;
    setGuildChat(null);
    setGuildMessages([]);
    setUnreadGuild(0);
    setPinnedGuild(null);
    if (activeChannelRef.current === 'guild') {
      activeChannelRef.current = 'world';
      setActiveChannelRaw('world');
    }
  }, []);

  const loadGuildChat = useCallback(async () => {
    if (!isAuthenticated) {
      clearGuildChat();
      return;
    }

    try {
      const res = await getPlayerGuild();
      if (res.error || !res.data?.guild) {
        clearGuildChat();
        refreshScopedChatRooms();
        return;
      }

      const previousGuildId = guildChatRef.current?.id ?? null;
      const nextGuildChat = {
        id: res.data.guild.id,
        label: formatGuildChatLabel(res.data.guild),
      };
      if (previousGuildId !== nextGuildChat.id) {
        setGuildMessages([]);
        setUnreadGuild(0);
        setPinnedGuild(null);
      }
      guildChatRef.current = nextGuildChat;
      setGuildChat(nextGuildChat);

      refreshScopedChatRooms();

      const history = await getChatHistory('guild', getGuildChannelId(nextGuildChat.id));
      if (history.data) {
        setGuildMessages(history.data.messages);
      }
    } catch {
      clearGuildChat();
    }
  }, [clearGuildChat, isAuthenticated]);

  // Connect/disconnect based on auth
  useEffect(() => {
    if (!isAuthenticated) return;

    connectSocket();
    const socket = getSocket();

    const onMessage = (msg: ChatMessageEvent) => appendMessage(msg);
    const onPresence = (p: ChatPresenceEvent) => setPresence(p);
    const onError = (err: { code: string; message: string }) => {
      if (err.code === 'RATE_LIMITED') {
        setRateLimitError(err.message);
        setTimeout(() => setRateLimitError(null), 3000);
      }
    };
    const onPinned = (pin: ChatPinnedMessageEvent) => {
      if (pin.channelId === 'world') {
        setPinnedWorld(pin.id ? pin : null);
      } else if (pin.channelId.startsWith('zone:')) {
        setPinnedZone(pin.id ? pin : null);
      } else if (pin.channelId.startsWith('guild:')) {
        const expectedChannelId = getCurrentGuildChannelId(guildChatRef.current);
        if (pin.channelId !== expectedChannelId) return;

        setPinnedGuild(pin.id ? pin : null);
      }
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:presence', onPresence);
    socket.on('chat:error', onError);
    socket.on('chat:pinned', onPinned);

    // Load world history on connect
    const onConnect = () => {
      Promise.all([
        getChatHistory('world', 'world', { messageType: 'non_activity' }),
        getChatHistory('world', 'world', { messageType: 'activity' }),
      ]).then(([worldRes, activityRes]) => {
        if (worldRes.data) {
          setWorldMessages(worldRes.data.messages);
        }
        if (activityRes.data) {
          setGlobalActivityMessages(activityRes.data.messages);
        }
      });

      // Load zone history if we have a zone
      if (currentZoneIdRef.current) {
        getChatHistory('zone', `zone:${currentZoneIdRef.current}`).then((res) => {
          if (res.data) {
            setZoneMessages(res.data.messages);
          }
        });
      }

      void loadGuildChat();

      // Re-join casino room and reload history on reconnect
      if (casinoActiveRef.current) {
        socket.emit('chat:join-casino');
        getChatHistory('casino', 'casino').then((res) => {
          if (res.data) {
            setCasinoMessages(res.data.messages);
          }
        });
      }
    };

    socket.on('connect', onConnect);
    if (socket.connected) onConnect();

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:presence', onPresence);
      socket.off('chat:error', onError);
      socket.off('chat:pinned', onPinned);
      socket.off('connect', onConnect);
      disconnectSocket();
    };
  }, [isAuthenticated, appendMessage, loadGuildChat]);

  // Zone change: switch rooms + reload history
  const prevZoneIdRef = useRef(currentZoneId);
  useEffect(() => {
    if (currentZoneId === prevZoneIdRef.current) return;
    prevZoneIdRef.current = currentZoneId;

    if (!currentZoneId || !isAuthenticated) return;

    const socket = getSocket();
    if (socket.connected) {
      socket.emit('chat:switch-zone', { zoneId: currentZoneId });
    }

    let cancelled = false;
    setZoneMessages([]);
    setPinnedZone(null);
    getChatHistory('zone', `zone:${currentZoneId}`).then((res) => {
      if (cancelled) return;
      if (res.data) {
        setZoneMessages(res.data.messages);
      }
    });
    return () => { cancelled = true; };
  }, [currentZoneId, isAuthenticated]);

  const toggleChat = useCallback(() => {
    if (!isOpenRef.current) {
      void loadGuildChat();
    }
    setIsOpen((prev) => !prev);
  }, [loadGuildChat]);

  const setActiveChannel = useCallback((ch: ChatChannel) => {
    activeChannelRef.current = ch;
    setActiveChannelRaw(ch);
    if (ch === 'world') setUnreadWorld(0);
    else if (ch === 'zone') setUnreadZone(0);
    else if (ch === 'guild') setUnreadGuild(0);
    else if (ch === 'casino') setUnreadCasino(0);
  }, []);

  // Clear unread when opening chat on active channel
  useEffect(() => {
    if (isOpen) {
      if (activeChannel === 'world') setUnreadWorld(0);
      else if (activeChannel === 'zone') setUnreadZone(0);
      else if (activeChannel === 'guild') setUnreadGuild(0);
      else if (activeChannel === 'casino') setUnreadCasino(0);
    }
  }, [isOpen, activeChannel]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const socket = getSocket();
    if (!socket.connected) return;

    const channelType = activeChannelRef.current;
    let channelId: string | null = null;
    if (channelType === 'world') {
      channelId = 'world';
    } else if (channelType === 'casino') {
      channelId = 'casino';
    } else if (channelType === 'guild') {
      channelId = getCurrentGuildChannelId(guildChatRef.current);
    } else {
      channelId = currentZoneIdRef.current ? `zone:${currentZoneIdRef.current}` : null;
    }
    if (!channelId) return;

    socket.emit('chat:send', { channelType, channelId, message: trimmed });
  }, []);

  const pinMessage = useCallback((channelId: string, message: string) => {
    const socket = getSocket();
    if (!socket.connected) return;
    socket.emit('chat:pin', { channelId, message });
  }, []);

  const unpinMessage = useCallback((channelId: string) => {
    const socket = getSocket();
    if (!socket.connected) return;
    socket.emit('chat:unpin', { channelId });
  }, []);

  const joinCasino = useCallback(() => {
    setCasinoActive(true);
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('chat:join-casino');
    }
    getChatHistory('casino', 'casino').then((res) => {
      if (res.data) {
        setCasinoMessages(res.data.messages);
      }
    });
  }, []);

  const injectCasinoSystemMessage = useCallback((texts: string | string[]) => {
    const arr = Array.isArray(texts) ? texts : [texts];
    setCasinoMessages((prev) => {
      const msgs: ChatMessageEvent[] = arr.map((text) => ({
        id: Math.random().toString(36).slice(2),
        channelType: 'casino' as const,
        channelId: 'casino',
        playerId: 'dealer',
        username: 'Dealer',
        message: text,
        createdAt: new Date().toISOString(),
        messageType: 'system' as const,
      }));
      return [...prev, ...msgs].slice(-CHAT_CONSTANTS.HISTORY_LIMIT);
    });
  }, []);

  const leaveCasino = useCallback(() => {
    setCasinoActive(false);
    if (activeChannelRef.current === 'casino') {
      setActiveChannelRaw('world');
    }
    const socket = getSocket();
    if (socket.connected) {
      socket.emit('chat:leave-casino');
    }
    setCasinoMessages([]);
    setUnreadCasino(0);
  }, []);

  return {
    worldMessages,
    globalActivityMessages,
    zoneMessages,
    guildMessages,
    casinoMessages,
    activeChannel,
    setActiveChannel,
    isOpen,
    toggleChat,
    presence,
    unreadWorld,
    unreadZone,
    unreadGuild,
    unreadCasino,
    guildChatLabel: guildChat?.label ?? null,
    casinoActive,
    joinCasino,
    leaveCasino,
    sendMessage,
    rateLimitError,
    pinnedWorld,
    pinnedZone,
    pinnedGuild,
    pinMessage,
    unpinMessage,
    injectCasinoSystemMessage,
  };
}
