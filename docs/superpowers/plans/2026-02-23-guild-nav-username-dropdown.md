# Guild Nav + Username Dropdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Settings in the bottom nav with Guild, and move Settings/Logout into a username dropdown in the header.

**Architecture:** Three file changes — `BottomNav` gets a `lucideIcon` field option per nav item, `AppShell` converts the static username span into a dropdown button, and `game/page.tsx` wires up the new props and updates tab routing.

**Tech Stack:** React, TypeScript, Lucide React, Tailwind CSS (RPG theme vars)

---

### Task 1: Update BottomNav — swap Settings for Guild with Lucide icon support

**Files:**
- Modify: `apps/web/src/components/BottomNav.tsx`

The `navItems` array currently uses `UiIconName` pixel art icons for all items. We need to support an optional Lucide icon component as an alternative renderer.

**Step 1: Replace navItems and add Lucide icon support**

Full replacement of `BottomNav.tsx`:

```tsx
'use client';

import Image from 'next/image';
import { Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uiIconSrc, type UiIconName } from '@/lib/assets';

interface BottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  badgeTabs?: Set<string>;
  pulseTabs?: Set<string>;
}

interface NavItem {
  id: string;
  label: string;
  icon?: UiIconName;
  lucideIcon?: LucideIcon;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'scroll' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'combat', label: 'Combat', icon: 'attack' },
  { id: 'guild', label: 'Guild', lucideIcon: Users },
];

export function BottomNav({ activeTab, onNavigate, badgeTabs = new Set(), pulseTabs = new Set() }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[var(--rpg-surface)] border-t border-[var(--rpg-border)] z-40 safe-area-bottom">
      <div className="max-w-lg mx-auto flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const LucideIcon = item.lucideIcon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'relative flex flex-col items-center justify-center w-full h-full transition-colors',
                isActive ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)]'
              )}
            >
              {LucideIcon ? (
                <LucideIcon
                  size={28}
                  className={cn('transition-opacity', isActive ? 'opacity-100' : 'opacity-60')}
                />
              ) : item.icon ? (
                <Image
                  src={uiIconSrc(item.icon)}
                  alt={item.label}
                  width={40}
                  height={40}
                  className={cn('image-rendering-pixelated', isActive ? '' : 'opacity-60')}
                />
              ) : null}
              {badgeTabs.has(item.id) && (
                <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-[var(--rpg-red)]" />
              )}
              {pulseTabs.has(item.id) && !isActive && (
                <span className="absolute inset-0 m-auto w-10 h-10 tutorial-pulse" />
              )}
              <span className="text-xs mt-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
```

**Step 2: Typecheck**

Run from the worktree root:
```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/BottomNav.tsx
git commit -m "feat: replace settings nav tab with guild (Lucide Users icon)"
```

---

### Task 2: Update AppShell — username dropdown with Settings & Logout

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`

The username is currently a static `<span>`. We convert it to a button that toggles a dropdown. The dropdown closes on outside click via a backdrop div.

`AppShell` needs two new optional props: `onSettings` and `onLogout`. When both are absent the username renders as plain text (safe fallback).

**Step 1: Replace AppShell.tsx**

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { uiIconSrc } from '@/lib/assets';

interface AppShellProps {
  children: React.ReactNode;
  turns?: number;
  username?: string;
  onSettings?: () => void;
  onLogout?: () => void;
}

export function AppShell({ children, turns = 0, username, onSettings, onLogout }: AppShellProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasMenu = Boolean(onSettings || onLogout);

  return (
    <div className="min-h-dvh w-full bg-[var(--rpg-background)] flex flex-col safe-area-top">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-[var(--rpg-surface)] border-b border-[var(--rpg-border)] z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-lg mx-auto h-14 px-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-[var(--rpg-gold)]">Adventure</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Image
                src={uiIconSrc('turn')}
                alt="Turns"
                width={24}
                height={24}
                className="image-rendering-pixelated"
              />
              <span className="font-mono text-[var(--rpg-gold)]">{turns.toLocaleString()}</span>
            </div>
            {username && (
              <div className="relative">
                {hasMenu ? (
                  <button
                    onClick={() => setDropdownOpen((o) => !o)}
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
                    <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg shadow-lg overflow-hidden">
                      {onSettings && (
                        <button
                          onClick={() => { setDropdownOpen(false); onSettings(); }}
                          className="w-full text-left px-4 py-2 text-sm text-[var(--rpg-text-primary)] hover:bg-[var(--rpg-background)] transition-colors"
                        >
                          Settings
                        </button>
                      )}
                      {onLogout && (
                        <button
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
      <div className="h-14 shrink-0 mt-[env(safe-area-inset-top)]" />

      {/* Main Content */}
      <main className="w-full max-w-lg mx-auto px-4 py-4 pb-24 flex-1">
        {children}
      </main>
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```
Expected: no errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/AppShell.tsx
git commit -m "feat: username dropdown in header with Settings and Logout actions"
```

---

### Task 3: Wire up game/page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

Two changes needed:
1. Pass `onSettings` and `onLogout` to `<AppShell>`
2. Update `getActiveTab()` to return `'guild'` when on the guild screen

**Step 1: Find the AppShell usage**

Search for `<AppShell` in `apps/web/src/app/game/page.tsx` — it's around line 1061.

**Step 2: Add props to AppShell**

Change:
```tsx
<AppShell turns={turns} username={player?.username}>
```
To:
```tsx
<AppShell
  turns={turns}
  username={player?.username}
  onSettings={() => handleNavigate('settings')}
  onLogout={() => { logout(); router.push('/'); }}
>
```

**Step 3: Update getActiveTab**

Find `getActiveTab` (it maps active screen names to nav tab ids). Add a `guild` case — the guild screen name should already be `'guild'`. Verify the exact screen name used when navigating to guild, then ensure `getActiveTab` returns `'guild'` for it.

Look for the function and add:
```ts
if (activeScreen === 'guild') return 'guild';
```
(or however the existing cases are structured)

**Step 4: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```
Expected: no errors.

**Step 5: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: wire guild nav tab and header dropdown into game page"
```

---

### Task 4: Smoke test

1. Start the dev server: `npm run dev` from the worktree root
2. Open `http://localhost:3002` and log in
3. Verify bottom nav shows: Home | Explore | Inventory | Combat | Guild
4. Tap Guild → should navigate to the guild screen (no-guild view since DB is empty)
5. Click username in header → dropdown appears with Settings and Logout
6. Click Settings → navigates to settings screen, dropdown closes
7. Click username → Logout → logs out and redirects to `/`
8. Click outside dropdown → it closes
