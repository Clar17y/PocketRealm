'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { uiIconSrc } from '@/lib/assets';
import { ZoneBackground } from '@/components/ZoneBackground';

interface AppShellProps {
  children: ReactNode;
  turns?: number;
  username?: string;
  onSettings?: () => void;
  onLogout?: () => void;
  onWhatsNew?: () => void;
  hasUnseenChangelog?: boolean;
  backgroundSrc?: string;
}

export function AppShell({ children, turns = 0, username, onSettings, onLogout, onWhatsNew, hasUnseenChangelog, backgroundSrc }: AppShellProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasMenu = Boolean(onSettings || onLogout || onWhatsNew);

  return (
    <div className="min-h-dvh w-full bg-[var(--rpg-background)]/95 flex flex-col safe-area-top">
      <div className="rpg-noise" />
      <div className="rpg-vignette" />
      <ZoneBackground imageSrc={backgroundSrc} />
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-[var(--rpg-surface)] border-b border-[var(--rpg-border)] z-40 pt-[env(safe-area-inset-top)] rpg-header-border">
        <div className="max-w-lg mx-auto h-14 px-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-[var(--rpg-gold)] font-almendra rpg-gold-text-glow">Adventure</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Image
                src={uiIconSrc('turn')}
                alt="Turns"
                width={24}
                height={24}
                className="image-rendering-pixelated"
              />
              <span className="font-pixel text-[16px] text-[var(--rpg-gold)]">{turns.toLocaleString()}</span>
            </div>
            {username && (
              <div
                className="relative"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropdownOpen(false);
                }}
              >
                {hasMenu ? (
                  <button
                    onClick={() => setDropdownOpen((o) => !o)}
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
                      className="fixed inset-0 z-40"
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
                      {onSettings && (
                        <button
                          role="menuitem"
                          onClick={() => { setDropdownOpen(false); onSettings(); }}
                          className="w-full text-left px-4 py-2 text-sm text-[var(--rpg-text-primary)] hover:bg-[var(--rpg-background)] transition-colors"
                        >
                          Settings
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
