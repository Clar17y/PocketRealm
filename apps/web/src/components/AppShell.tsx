'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { uiIconSrc } from '@/lib/assets';
import type { CharacterSummary } from '@/lib/api';
import { ZoneBackground } from '@/components/ZoneBackground';

interface AppShellProps {
  children: ReactNode;
  turns?: number;
  username?: string;
  mailUnreadCount?: number;
  onMailClick?: () => void;
  onSettings?: () => void;
  onLogout?: () => void;
  onWhatsNew?: () => void;
  hasUnseenChangelog?: boolean;
  backgroundSrc?: string;
  realmLabel?: string;
  realmEndsAt?: string | Date | null;
  activePlayerId?: string | null;
  characters?: CharacterSummary[];
  switchingPlayerId?: string | null;
  onSwitchPlayer?: (playerId: string) => void;
}

export function AppShell({
  children,
  turns = 0,
  username,
  mailUnreadCount = 0,
  onMailClick,
  onSettings,
  onLogout,
  onWhatsNew,
  hasUnseenChangelog,
  backgroundSrc,
}: AppShellProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasMenu = Boolean(onLogout || onWhatsNew);

  return (
    <div className="min-h-dvh w-full bg-[var(--rpg-background)]/95 flex flex-col safe-area-top">
      <div className="rpg-noise" />
      <div className="rpg-vignette" />
      <ZoneBackground imageSrc={backgroundSrc} />
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-[var(--rpg-surface)] border-b border-[var(--rpg-border)] z-40 pt-[env(safe-area-inset-top)] rpg-header-border">
        <div className="max-w-lg mx-auto h-14 px-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-[var(--rpg-gold)] font-almendra rpg-gold-text-glow">PocketRealm</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Image
                src={uiIconSrc('turn')}
                alt="Turns"
                width={24}
                height={24}
                className="image-rendering-pixelated"
              />
              <span className="font-pixel text-[12px] text-[var(--rpg-gold)]">{turns.toLocaleString()}</span>
            </div>
            {onMailClick && (
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onMailClick();
                }}
                className="relative text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-gold)] transition-colors"
                aria-label={`Mail${mailUnreadCount > 0 ? ` (${mailUnreadCount} unread)` : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                {mailUnreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-[var(--rpg-red)] text-white">
                    {mailUnreadCount > 99 ? '99+' : mailUnreadCount}
                  </span>
                )}
              </button>
            )}
            {onSettings && (
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onSettings();
                }}
                className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-gold)] transition-colors"
                aria-label="Open settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            )}
            {username && (
              <div
                className="relative"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropdownOpen(false);
                }}
              >
                {hasMenu ? (
                  <button
                    onClick={() => {
                      setDropdownOpen((open) => !open);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setDropdownOpen(false); }}
                    aria-expanded={dropdownOpen}
                    aria-haspopup="menu"
                    className="flex items-center gap-1 text-sm text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
                  >
                    {username}
                    <span className="text-xs opacity-60">▾</span>
                  </button>
                ) : (
                  <span className="text-sm text-[var(--rpg-text-secondary)]">{username}</span>
                )}

                {dropdownOpen && (
                  <>
                    {/* Backdrop — closes dropdown on outside click */}
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div role="menu" className="absolute right-0 top-full mt-1 z-50 min-w-[120px] bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg shadow-lg overflow-hidden">
                      {onWhatsNew && (
                        <button
                          role="menuitem"
                          onClick={() => { setDropdownOpen(false); onWhatsNew(); }}
                          className="w-full text-left px-4 py-2 text-sm text-[var(--rpg-text-primary)] hover:bg-[var(--rpg-background)] transition-colors flex items-center justify-between"
                        >
                          What&apos;s New
                          {hasUnseenChangelog && (
                            <span className="w-2 h-2 rounded-full bg-[var(--rpg-gold)]" />
                          )}
                        </button>
                      )}
                      {onLogout && (
                        <button
                          role="menuitem"
                          onClick={() => { setDropdownOpen(false); onLogout(); }}
                          className="w-full text-left px-4 py-2 text-sm text-[var(--rpg-red)] hover:bg-[var(--rpg-background)] transition-colors"
                        >
                          Logout
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Spacer to push content below fixed header */}
      <div className="h-4 shrink-0 mt-[env(safe-area-inset-top)]" />

      {/* Main Content */}
      <main className="w-full max-w-lg mx-auto px-4 pt-2 pb-24 flex-1">
        {children}
      </main>
    </div>
  );
}
