'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessageEvent, ChatPresenceEvent, ChatPinnedMessageEvent } from '@adventure/shared';
import { CHAT_CONSTANTS } from '@adventure/shared';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import { getChatHistory } from '@/lib/api';

export type ChatChannel = 'world' | 'zone' | 'casino';

interface UseChatParams {
  isAuthenticated: boolean;
  currentZoneId: string | null;
}

export interface UseChatReturn {
  worldMessages: ChatMessageEvent[];
  zoneMessages: ChatMessageEvent[];
  casinoMessages: ChatMessageEvent[];
  activeChannel: ChatChannel;
  setActiveChannel: (ch: ChatChannel) => void;
  isOpen: boolean;
  toggleChat: () => void;
  presence: ChatPresenceEvent;
  unreadWorld: number;
  unreadZone: number;
  unreadCasino: number;
  casinoActive: boolean;
  joinCasino: () => void;
  leaveCasino: () => void;
  sendMessage: (text: string) => void;
  rateLimitError: string | null;
  pinnedWorld: ChatPinnedMessageEvent | null;
  pinnedZone: ChatPinnedMessageEvent | null;
  pinMessage: (channelId: string, message: string) => void;
  unpinMessage: (channelId: string) => void;
  injectCasinoSystemMessage: (texts: string | string[]) => void;
}

export function useChat({ isAuthenticated, currentZoneId }: UseChatParams): UseChatReturn {
  const [worldMessages, setWorldMessages] = useState<ChatMessageEvent[]>([]);
  const [zoneMessages, setZoneMessages] = useState<ChatMessageEvent[]>([]);
  const [activeChannel, setActiveChannelRaw] = useState<ChatChannel>('world');
  const [isOpen, setIsOpen] = useState(false);
  const [presence, setPresence] = useState<ChatPresenceEvent>({ worldOnline: 0, zoneOnline: {} });
  const [unreadWorld, setUnreadWorld] = useState(0);
  const [unreadZone, setUnreadZone] = useState(0);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [pinnedWorld, setPinnedWorld] = useState<ChatPinnedMessageEvent | null>(null);
  const [pinnedZone, setPinnedZone] = useState<ChatPinnedMessageEvent | null>(null);
  const [casinoMessages, setCasinoMessages] = useState<ChatMessageEvent[]>([]);
  const [unreadCasino, setUnreadCasino] = useState(0);
  const [casinoActive, setCasinoActive] = useState(false);

  const currentZoneIdRef = useRef(currentZoneId);
  const isOpenRef = useRef(isOpen);
  const activeChannelRef = useRef(activeChannel);
  const casinoActiveRef = useRef(casinoActive);

  currentZoneIdRef.current = currentZoneId;
  isOpenRef.current = isOpen;
  activeChannelRef.current = activeChannel;
  casinoActiveRef.current = casinoActive;

  const appendMessage = useCallback((msg: ChatMessageEvent) => {
    if (msg.channelType === 'world') {
      setWorldMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'world') {
        setUnreadWorld((n) => n + 1);
      }
    } else if (msg.channelType === 'zone') {
      setZoneMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'zone') {
        setUnreadZone((n) => n + 1);
      }
    } else if (msg.channelType === 'casino') {
      setCasinoMessages((prev) => [...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)), msg]);
      if (!isOpenRef.current || activeChannelRef.current !== 'casino') {
        setUnreadCasino((n) => n + 1);
      }
    }
  }, []);

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
      } else if (pin.channelId !== 'casino') {
        setPinnedZone(pin.id ? pin : null);
      }
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:presence', onPresence);
    socket.on('chat:error', onError);
    socket.on('chat:pinned', onPinned);

    // Load world history on connect
    const onConnect = () => {
      getChatHistory('world', 'world').then((res) => {
        if (res.data) {
          setWorldMessages(res.data.messages as ChatMessageEvent[]);
        }
      });

      // Load zone history if we have a zone
      if (currentZoneIdRef.current) {
        getChatHistory('zone', `zone:${currentZoneIdRef.current}`).then((res) => {
          if (res.data) {
            setZoneMessages(res.data.messages as ChatMessageEvent[]);
          }
        });
      }

      // Re-join casino room and reload history on reconnect
      if (casinoActiveRef.current) {
        socket.emit('chat:join-casino');
        getChatHistory('casino', 'casino').then((res) => {
          if (res.data) {
            setCasinoMessages(res.data.messages as ChatMessageEvent[]);
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
  }, [isAuthenticated, appendMessage]);

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

    setZoneMessages([]);
    setPinnedZone(null);
    getChatHistory('zone', `zone:${currentZoneId}`).then((res) => {
      if (res.data) {
        setZoneMessages(res.data.messages as ChatMessageEvent[]);
      }
    });
  }, [currentZoneId, isAuthenticated]);

  const toggleChat = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const setActiveChannel = useCallback((ch: ChatChannel) => {
    setActiveChannelRaw(ch);
    if (ch === 'world') setUnreadWorld(0);
    else if (ch === 'zone') setUnreadZone(0);
    else if (ch === 'casino') setUnreadCasino(0);
  }, []);

  // Clear unread when opening chat on active channel
  useEffect(() => {
    if (isOpen) {
      if (activeChannel === 'world') setUnreadWorld(0);
      else if (activeChannel === 'zone') setUnreadZone(0);
      else if (activeChannel === 'casino') setUnreadCasino(0);
    }
  }, [isOpen, activeChannel]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const socket = getSocket();
    if (!socket.connected) return;

    const channelType = activeChannelRef.current;
    const channelId = channelType === 'world' ? 'world'
      : channelType === 'casino' ? 'casino'
      : `zone:${currentZoneIdRef.current}`;

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
        setCasinoMessages(res.data.messages as ChatMessageEvent[]);
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
    zoneMessages,
    casinoMessages,
    activeChannel,
    setActiveChannel,
    isOpen,
    toggleChat,
    presence,
    unreadWorld,
    unreadZone,
    unreadCasino,
    casinoActive,
    joinCasino,
    leaveCasino,
    sendMessage,
    rateLimitError,
    pinnedWorld,
    pinnedZone,
    pinMessage,
    unpinMessage,
    injectCasinoSystemMessage,
  };
}
