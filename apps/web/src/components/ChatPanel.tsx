'use client';

import { useRef, useEffect, useState, type FormEvent } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { CHAT_CONSTANTS } from '@adventure/shared';
import { rarityFromTier, RARITY_COLORS } from '@/lib/rarity';
import type { ChatMessageEvent, ChatPresenceEvent, ChatPinnedMessageEvent } from '@adventure/shared';
import type { ChatChannel } from '@/hooks/useChat';

interface ChatPanelProps {
  isOpen: boolean;
  toggleChat: () => void;
  activeChannel: ChatChannel;
  setActiveChannel: (ch: ChatChannel) => void;
  worldMessages: ChatMessageEvent[];
  zoneMessages: ChatMessageEvent[];
  casinoMessages: ChatMessageEvent[];
  presence: ChatPresenceEvent;
  unreadWorld: number;
  unreadZone: number;
  unreadCasino: number;
  casinoActive: boolean;
  sendMessage: (text: string) => void;
  rateLimitError: string | null;
  currentZoneId: string | null;
  currentZoneName: string | null;
  playerId: string | null;
  pinnedMessage: ChatPinnedMessageEvent | null;
}

export function ChatPanel({
  isOpen,
  toggleChat,
  activeChannel,
  setActiveChannel,
  worldMessages,
  zoneMessages,
  casinoMessages,
  presence,
  unreadWorld,
  unreadZone,
  unreadCasino,
  casinoActive,
  sendMessage,
  rateLimitError,
  currentZoneId,
  currentZoneName,
  playerId,
  pinnedMessage,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [pinnedDismissed, setPinnedDismissed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = activeChannel === 'world' ? worldMessages
    : activeChannel === 'casino' ? casinoMessages
    : zoneMessages;
  const pinnedId = pinnedMessage?.id;

  // Reset dismiss when a new pin arrives
  useEffect(() => {
    setPinnedDismissed(false);
  }, [pinnedId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input and scroll to bottom when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        messagesEndRef.current?.scrollIntoView();
      }, 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  const totalUnread = unreadWorld + unreadZone + unreadCasino;
  const worldOnline = presence.worldOnline;
  const zoneOnline = currentZoneId ? (presence.zoneOnline[currentZoneId] ?? 0) : 0;

  // Collapsed: floating button
  if (!isOpen) {
    return (
      <button
        onClick={toggleChat}
        className="fixed bottom-20 right-4 z-30 flex items-center justify-center w-12 h-12 rounded-full bg-[var(--rpg-surface)] border border-[var(--rpg-border)] shadow-lg hover:border-[var(--rpg-gold)] transition-colors"
        aria-label="Open chat"
      >
        <MessageCircle size={20} className="text-[var(--rpg-gold)]" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--rpg-red)] text-[10px] font-bold text-white px-1">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    );
  }

  // Expanded: chat panel
  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 flex justify-center pointer-events-none safe-area-bottom">
      <div className="w-full max-w-lg mx-4 pointer-events-auto flex flex-col bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-t-lg shadow-xl" style={{ maxHeight: '55vh' }}>
        {/* Header with tabs */}
        <div className="flex items-center border-b border-[var(--rpg-border)] px-2 py-1.5 shrink-0">
          <button
            onClick={() => setActiveChannel('world')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeChannel === 'world'
                ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] border border-[var(--rpg-gold)]/40'
                : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            World{worldOnline > 0 ? ` (${worldOnline})` : ''}
            {unreadWorld > 0 && activeChannel !== 'world' && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-[var(--rpg-red)] text-[9px] text-white px-0.5">
                {unreadWorld}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveChannel('zone')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ml-1 ${
              activeChannel === 'zone'
                ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] border border-[var(--rpg-gold)]/40'
                : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            {currentZoneName ?? 'Zone'}{zoneOnline > 0 ? ` (${zoneOnline})` : ''}
            {unreadZone > 0 && activeChannel !== 'zone' && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-[var(--rpg-red)] text-[9px] text-white px-0.5">
                {unreadZone}
              </span>
            )}
          </button>
          {casinoActive && (
            <button
              onClick={() => setActiveChannel('casino')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ml-1 ${
                activeChannel === 'casino'
                  ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] border border-[var(--rpg-gold)]/40'
                  : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
              }`}
            >
              Casino
              {unreadCasino > 0 && activeChannel !== 'casino' && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-[var(--rpg-red)] text-[9px] text-white px-0.5">
                  {unreadCasino}
                </span>
              )}
            </button>
          )}
          <button
            onClick={toggleChat}
            className="ml-auto p-1 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        </div>

        {/* Pinned banner */}
        {pinnedMessage && !pinnedDismissed && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--rpg-gold)]/40 bg-[var(--rpg-gold)]/10 shrink-0">
            <span className="text-[10px]">📌</span>
            <span className="flex-1 text-[11px] text-[var(--rpg-gold)] truncate">{pinnedMessage.message}</span>
            <span className="text-[10px] text-[var(--rpg-text-secondary)] shrink-0">— {pinnedMessage.pinnedBy}</span>
            <button
              onClick={() => setPinnedDismissed(true)}
              className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] text-xs ml-1 shrink-0"
              aria-label="Dismiss pin"
            >
              ×
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
          {messages.length === 0 && (
            <p className="text-[var(--rpg-text-secondary)] text-xs text-center py-4">
              No messages yet. Say hello!
            </p>
          )}
          {messages.map((msg) => {
            const isOwn = msg.playerId === playerId;
            const time = formatTime(msg.createdAt);
            const isSystem = msg.messageType === 'system';
            const isAdmin = msg.role === 'admin';
            const isMod = msg.role === 'moderator';

            if (isSystem) {
              return (
                <div key={msg.id} className="text-xs leading-relaxed italic text-[var(--rpg-gold)]">
                  <span className="text-[var(--rpg-text-secondary)]">[{time}] </span>
                  <span>⚔ {msg.message}</span>
                </div>
              );
            }

            return (
              <div key={msg.id} className="text-xs leading-relaxed">
                <span className="text-[var(--rpg-text-secondary)]">[{time}] </span>
                {isAdmin && <span className="text-[var(--rpg-red)] font-bold">[Admin] </span>}
                {isMod && <span className="text-[var(--rpg-green-light)] font-bold">[Mod] </span>}
                <span className={
                  isAdmin ? 'text-[var(--rpg-red)] font-medium'
                  : isMod ? 'text-[var(--rpg-green-light)] font-medium'
                  : isOwn ? 'text-[var(--rpg-gold)] font-medium'
                  : 'text-[var(--rpg-blue-light)] font-medium'
                }>
                  {msg.username}
                </span>
                {msg.title && (
                  <span
                    className="text-[10px] ml-0.5"
                    style={{ color: RARITY_COLORS[rarityFromTier(msg.titleTier ?? 1)] }}
                  >
                    &lt;{msg.title}&gt;
                  </span>
                )}
                <span className="text-[var(--rpg-text-secondary)]">: </span>
                <span className="text-[var(--rpg-text-primary)]">{msg.message}</span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Rate limit error */}
        {rateLimitError && (
          <div className="px-3 py-1 text-[10px] text-[var(--rpg-red)] text-center shrink-0">
            {rateLimitError}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-2 py-2 border-t border-[var(--rpg-border)] shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={CHAT_CONSTANTS.MAX_MESSAGE_LENGTH}
            placeholder="Type a message..."
            className="flex-1 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-2.5 py-1.5 text-xs text-[var(--rpg-text-primary)] placeholder:text-[var(--rpg-text-secondary)]/50 focus:outline-none focus:border-[var(--rpg-gold)]/50"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-1.5 rounded bg-[var(--rpg-gold)] text-[var(--rpg-background)] disabled:opacity-30 hover:bg-[var(--rpg-gold)]/80 transition-colors"
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
