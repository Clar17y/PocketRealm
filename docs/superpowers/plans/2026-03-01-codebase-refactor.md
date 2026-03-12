# Codebase-Wide Refactoring Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce code duplication, enforce single responsibility, and improve maintainability across the entire codebase without changing any user-facing behavior.

**Architecture:** Bottom-up refactoring — shared utilities first, then UI components, then the god-hook decomposition, then backend service extraction. Each task is independently committable and testable. No new features, no behavior changes.

**Tech Stack:** TypeScript, React hooks, Next.js, Express, Prisma, Vitest

**Testing strategy:** After every task, run `npm run typecheck` to verify no type errors were introduced. Run `npm run test` after each phase. No new tests required for pure refactoring (move-only changes), but extracted utilities with new interfaces should get basic tests.

**Important:** This is a pure refactoring job. If a test fails after a change, it means you broke something — revert and fix before continuing. Never skip a failing test.

---

## Phase 1: Zero-Risk Cleanup (no behavior change, just deleting dead code and moving code)

### Task 1: Delete dead mock data from page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx:91-176`

**Step 1: Delete the commented-out mock data block**

Delete lines 91-176 (the entire `/* Mock data for demo ... */` block including `mockPlayerData`, `mockSkills`, `mockDetailedSkills`, `mockInventory`, `mockEquipmentSlots`, `mockEquipmentStats`, `mockZones`, `mockMonsters`, `mockCraftingRecipes`, `mockGatheringNodes`). This is 85 lines of dead commented-out code.

**Step 2: Verify**

Run: `npm run typecheck`

**Step 3: Commit**

```
refactor: delete dead mock data from page.tsx
```

---

### Task 2: Extract types and pure functions from useGameController.ts

The hook file defines 9 types and 5 pure functions that have no dependency on React hooks. Move them to dedicated files.

**Files:**
- Create: `apps/web/src/app/game/gameController.types.ts`
- Create: `apps/web/src/app/game/combatHelpers.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create `gameController.types.ts`**

Move these type definitions from `useGameController.ts` into the new file:
- `Screen` (line 70-89)
- `PendingEncounter` (line 91-124)
- `LastCombatLogEntry` (line 126-128)
- `CombatPlaybackItem` (line 129-139)
- `LastCombat` (line 175-235) — the interface, not the helper functions
- `BestiarySkipEntry` (line 237-241)
- `ActivityLogEntry` (line 254-258)
- `CharacterProgression` (line 260-288)
- `HpState` (line 290-296)
- `DEFAULT_CHARACTER_PROGRESSION` constant (line 298-300)

Export all of them. Add necessary imports (types from `@/lib/api`, `@/lib/tutorial`).

**Step 2: Create `combatHelpers.ts`**

Move these pure functions from `useGameController.ts`:
- `buildFightsList()` (line 141-173)
- `buildLastCombat()` (line 175-235, the function, not the type)
- `isMobKnown()` (line 243-252)
- `nowStamp()` (line 949, a pure date formatting function)

Export all of them. Add necessary imports from `gameController.types.ts`.

**Step 3: Update `useGameController.ts`**

Replace the moved code with imports:
```typescript
import type { Screen, PendingEncounter, LastCombat, ... } from './gameController.types';
import { DEFAULT_CHARACTER_PROGRESSION } from './gameController.types';
import { buildFightsList, buildLastCombat, isMobKnown, nowStamp } from './combatHelpers';
```

Remove the moved code blocks. Keep all hook logic in place.

**Step 4: Update imports in `page.tsx` and any other consumers**

Search for imports of `Screen`, `PendingEncounter`, `LastCombat`, `ActivityLogEntry`, `HpState`, etc. from `useGameController` and redirect them to `gameController.types`.

Run: `grep -rn "from.*useGameController" apps/web/src/ --include="*.ts" --include="*.tsx"` to find all consumers.

**Step 5: Verify**

Run: `npm run typecheck`

**Step 6: Commit**

```
refactor: extract types and pure functions from useGameController
```

---

### Task 3: Extract clamp() and randomUnit() to game-engine utils

**Files:**
- Create: `packages/game-engine/src/utils/math.ts`
- Modify: `packages/game-engine/src/combat/damageCalculator.ts` — remove local `clamp` (line 3), import from utils
- Modify: `packages/game-engine/src/items/itemRarity.ts` — remove local `clamp` (line 27) and `randomUnit` (line 31), import from utils
- Modify: `packages/game-engine/src/crafting/craftingCrit.ts` — remove local `clamp` (line 38) and `randomUnit` (line 42), import from utils
- Modify: `packages/game-engine/src/index.ts` — re-export from utils

**Step 1: Create `packages/game-engine/src/utils/math.ts`**

```typescript
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function randomUnit(roll?: number): number {
  if (roll !== undefined) return clamp(roll, 0, 1);
  return Math.random();
}
```

**Step 2: Replace local definitions**

In each of the three files, delete the local `clamp`/`randomUnit` function and add:
```typescript
import { clamp, randomUnit } from '../utils/math';
```

Adjust relative import paths per file location.

**Step 3: Export from barrel**

Add to `packages/game-engine/src/index.ts`:
```typescript
export { clamp, randomUnit } from './utils/math';
```

**Step 4: Verify**

Run: `npm run typecheck && npm run test:engine`

**Step 5: Commit**

```
refactor: extract shared math utils in game-engine
```

---

### Task 4: Remove duplicate EncounterSiteSize type

**Files:**
- Modify: `packages/game-engine/src/exploration/encounterChest.ts` — remove local `EncounterSiteSize` type (line 3), import from `@adventure/shared`
- Modify: `packages/game-engine/src/exploration/roomGenerator.ts` — remove local `EncounterSiteSize` type (line 3), import from `@adventure/shared`

**Step 1: Update imports**

In both files, replace the local type definition:
```typescript
type EncounterSiteSize = 'small' | 'medium' | 'large';
```
with:
```typescript
import type { EncounterSiteSize } from '@adventure/shared';
```

Verify that `@adventure/shared` exports `EncounterSiteSize` from `packages/shared/src/types/encounter.types.ts` and that the barrel `packages/shared/src/index.ts` re-exports it.

**Step 2: Verify**

Run: `npm run typecheck && npm run test:engine`

**Step 3: Commit**

```
refactor: import EncounterSiteSize from shared instead of redefining
```

---

### Task 5: Remove duplicate GuildSpecializationPath type and dead xpCalculator alias

**Files:**
- Modify: `packages/shared/src/types/guild.types.ts` — remove `GuildSpecializationPath` (identical to `GuildSpecialization`), replace all usages
- Modify: `packages/game-engine/src/skills/xpCalculator.ts` — remove `shouldResetDailyCap` alias
- Modify: `apps/api/src/services/xpService.ts` — update import to use `shouldResetWindowCap`

**Step 1: Find and replace GuildSpecializationPath usages**

Run: `grep -rn "GuildSpecializationPath" packages/ apps/` to find all usages. Replace each with `GuildSpecialization`. Then delete the `GuildSpecializationPath` type alias from `guild.types.ts`.

**Step 2: Remove xpCalculator alias**

In `packages/game-engine/src/skills/xpCalculator.ts`, find and remove the line:
```typescript
export { shouldResetWindowCap as shouldResetDailyCap };
```

In `apps/api/src/services/xpService.ts`, change the import from `shouldResetDailyCap` to `shouldResetWindowCap`.

Also check the barrel export in `packages/game-engine/src/index.ts` and remove any re-export of `shouldResetDailyCap`.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: remove duplicate type alias and dead export
```

---

## Phase 2: Extract Shared UI Components

### Task 6: Enhance ModalOverlay and replace inline modals

**Files:**
- Modify: `apps/web/src/components/common/ModalOverlay.tsx` — add opacity 80 and 90 support, add optional `onClose` prop
- Modify: `apps/web/src/components/screens/Equipment.tsx` — replace inline modal overlays
- Modify: `apps/web/src/components/screens/Inventory.tsx` — replace inline modal overlays
- Modify: `apps/web/src/components/screens/Bestiary.tsx` — replace inline modal overlay
- Modify: `apps/web/src/components/screens/CombatLog.tsx` — replace inline modal overlays
- Modify: `apps/web/src/components/common/LootPicker.tsx` — replace inline modal overlay

**Step 1: Update ModalOverlay**

```typescript
import type { ReactNode } from 'react';

interface ModalOverlayProps {
  children: ReactNode;
  opacity?: 60 | 70 | 80 | 90;
  onClose?: () => void;
}

const opacityClass = {
  60: 'bg-black/60',
  70: 'bg-black/70',
  80: 'bg-black/80',
  90: 'bg-black/90',
} as const;

export function ModalOverlay({ children, opacity = 70, onClose }: ModalOverlayProps) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${opacityClass[opacity]}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
```

**Step 2: Replace inline modals one file at a time**

In each file, find the pattern:
```tsx
<div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={...}>
```

Replace with:
```tsx
<ModalOverlay opacity={80} onClose={handleClose}>
```

Remove the corresponding `stopPropagation` calls on inner content divs where `ModalOverlay` now handles it.

Do this file by file, running `npm run typecheck` after each file to catch issues early.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: standardize modal overlays to use ModalOverlay component
```

---

### Task 7: Extract shared statEntries() utility

**Files:**
- Modify: `apps/web/src/lib/statFormat.ts` — add `statEntries()` function
- Modify: `apps/web/src/components/screens/Crafting.tsx` — remove local `statEntries`, import from statFormat
- Modify: `apps/web/src/components/screens/Forge.tsx` — remove local `statEntries`, import from statFormat

**Step 1: Add to statFormat.ts**

```typescript
export function statEntries(stats: Record<string, unknown>): [string, number][] {
  return Object.entries(stats)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0)
    .sort((a, b) => {
      const ai = STAT_ORDER.indexOf(a[0]);
      const bi = STAT_ORDER.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
}
```

**Step 2: Replace local definitions**

In both `Crafting.tsx` and `Forge.tsx`, delete the local `statEntries` function and add:
```typescript
import { statEntries } from '@/lib/statFormat';
```

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract statEntries to shared statFormat utility
```

---

### Task 8: Extract SubNav component

**Files:**
- Create: `apps/web/src/components/common/SubNav.tsx`
- Modify: `apps/web/src/app/game/page.tsx` — replace 4 inline sub-navigation blocks (lines ~1275-1386)

**Step 1: Create SubNav component**

```typescript
interface SubNavTab {
  id: string;
  label: string;
  badge?: number;
}

interface SubNavProps {
  tabs: SubNavTab[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function SubNav({ tabs, activeId, onSelect }: SubNavProps) {
  return (
    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`relative px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
            activeId === tab.id
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          {tab.label}
          {(tab.badge ?? 0) > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-[var(--rpg-red)] text-white font-bold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Replace all 4 inline tab bars in page.tsx**

Replace the `{getActiveTab() === 'home' && (...)}` block (including the admin button logic) with:
```tsx
{getActiveTab() === 'home' && (
  <SubNav
    tabs={[
      { id: 'home', label: 'Dashboard' },
      { id: 'zones', label: 'Map' },
      { id: 'worldEvents', label: 'Events' },
      { id: 'achievements', label: 'Achievements', badge: achievementUnclaimedCount },
      { id: 'leaderboard', label: 'Rankings' },
      { id: 'bestiary', label: 'Bestiary' },
      { id: 'skills', label: 'Skills' },
      ...(player?.role === 'admin' ? [{ id: 'admin', label: 'Admin' }] : []),
    ]}
    activeId={activeScreen}
    onSelect={(id) => setActiveScreen(id as Screen)}
  />
)}
```

Do the same for explore, inventory, and combat tabs.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract SubNav component, deduplicate tab navigation
```

---

### Task 9: Extract LoadingCard and ErrorBanner components

**Files:**
- Create: `apps/web/src/components/common/LoadingCard.tsx`
- Create: `apps/web/src/components/common/ErrorBanner.tsx`
- Modify: Guild screen files and other consumers to use them

**Step 1: Create LoadingCard**

```typescript
import { PixelCard } from './PixelCard';

export function LoadingCard({ message = 'Loading...' }: { message?: string }) {
  return (
    <PixelCard>
      <p className="text-sm opacity-60">{message}</p>
    </PixelCard>
  );
}
```

**Step 2: Create ErrorBanner**

```typescript
interface ErrorBannerProps {
  message: string;
  className?: string;
}

export function ErrorBanner({ message, className = '' }: ErrorBannerProps) {
  return (
    <div className={`p-3 rounded bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm ${className}`}>
      {message}
    </div>
  );
}
```

**Step 3: Replace usages**

Search for `<PixelCard><p className="text-sm opacity-60">Loading` and replace with `<LoadingCard />`.
Search for the error banner patterns and replace with `<ErrorBanner message={error} />`.

Do this file by file. Focus on `GuildScreen.tsx`, `GuildProjectsTab.tsx`, `GuildSpecializationTab.tsx` first as they have the most duplication.

**Step 4: Verify**

Run: `npm run typecheck`

**Step 5: Commit**

```
refactor: extract LoadingCard and ErrorBanner shared components
```

---

### Task 10: Extract ItemIcon and RarityIconBox components

**Files:**
- Create: `apps/web/src/components/common/ItemIcon.tsx`
- Modify: Components that render item icons inline (Equipment, Inventory, Crafting, Forge, Gathering)

**Step 1: Create ItemIcon**

```typescript
import Image from 'next/image';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';

interface ItemIconProps {
  src?: string | null;
  fallback?: string | null;
  alt?: string;
  size?: number;       // pixel size (default 32)
  rarity?: Rarity;     // if set, renders a rarity-colored border box
  className?: string;
}

export function ItemIcon({ src, fallback, alt = '', size = 32, rarity, className = '' }: ItemIconProps) {
  const content = src ? (
    <img
      src={src}
      alt={alt}
      className="object-contain"
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  ) : (
    <span className="text-lg">{fallback ?? '?'}</span>
  );

  if (rarity) {
    return (
      <div
        className={`rounded border-2 flex items-center justify-center shrink-0 ${className}`}
        style={{ width: size + 8, height: size + 8, borderColor: RARITY_COLORS[rarity] }}
      >
        {content}
      </div>
    );
  }

  return <span className={className}>{content}</span>;
}
```

**Step 2: Replace inline patterns**

Find the `{item.imageSrc ? (<img ...>) : (<span>{item.icon}</span>)}` pattern across screen components and replace with `<ItemIcon>`. Also find the `<div className="w-10 h-10 rounded border-2 ..." style={{ borderColor: RARITY_COLORS[...] }}>` pattern and replace with `<ItemIcon rarity={...}>`.

Do this one file at a time, starting with the files that have the most duplication: Equipment.tsx (5 instances), Crafting.tsx (3), Forge.tsx (1), Gathering.tsx (2).

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract ItemIcon component, deduplicate icon rendering
```

---

### Task 11: Replace manual turn presets in Exploration with TurnPresets component

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx` — lines ~276-301

**Step 1: Check TurnPresets component API**

Read `apps/web/src/components/common/TurnPresets.tsx` to understand its props interface.

**Step 2: Replace manual buttons**

Replace the four manual preset buttons (100, 500, 1K, 5K) with the `<TurnPresets>` component, matching its usage in `Gathering.tsx` and `Rest.tsx`.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: use TurnPresets component in Exploration screen
```

---

## Phase 3: Extract Settings Screen

### Task 12: Extract Settings screen component from page.tsx

**Files:**
- Create: `apps/web/src/components/screens/Settings.tsx`
- Modify: `apps/web/src/app/game/page.tsx` — replace inline settings UI (~170 lines) with component

**Step 1: Create Settings.tsx**

Move the entire `case 'settings':` block content (lines ~999-1171 of page.tsx) into a new `Settings` component. Define a props interface for all the settings values and handlers it needs:

```typescript
interface SettingsProps {
  username?: string;
  combatLogSpeedMs: number;
  explorationSpeedMs: number;
  autoSkipKnownCombat: boolean;
  autoPotionThreshold: number;
  lowHpWarning: boolean;
  defaultExploreTurns: number;
  quickRestHealPercent: number;
  defaultRefiningMax: boolean;
  confirmRarity: string;
  onSetCombatLogSpeed: (v: number) => void;
  onSetExplorationSpeed: (v: number) => void;
  onSetAutoSkipKnownCombat: (v: boolean) => void;
  onSetAutoPotionThreshold: (v: number) => void;
  onSetLowHpWarning: (v: boolean) => void;
  onSetDefaultExploreTurns: (v: number) => void;
  onSetQuickRestHealPercent: (v: number) => void;
  onSetDefaultRefiningMax: (v: boolean) => void;
  onSetConfirmRarity: (v: string) => void;
  onLogout: () => void;
}
```

Note: The settings screen also uses `setCombatLogSpeedMs`, `setExplorationSpeedMs`, `setAutoPotionThreshold`, `setDefaultExploreTurns` for optimistic local updates during slider drag (before commit). The component needs both the immediate setter and the commit handler. Either:
- Pass both (setter for `onValueChange`, handler for `onValueCommit`), or
- Let the component manage local state internally for slider dragging and only call the handler on commit

Prefer option B (local state) to reduce prop count and encapsulate the optimistic update pattern.

**Step 2: Update page.tsx**

Replace the `case 'settings':` block with:
```tsx
case 'settings':
  return (
    <Settings
      username={player?.username}
      combatLogSpeedMs={combatLogSpeedMs}
      // ... etc
      onLogout={() => { logout(); router.push('/'); }}
    />
  );
```

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract Settings screen to dedicated component
```

---

## Phase 4: Decompose useGameController (the big one)

This is the highest-impact refactoring. Each sub-hook is extracted one at a time. After each extraction, the full app must still typecheck and work identically.

**Strategy:** Extract leaf concerns first (no dependencies on other extracted hooks), then work inward.

### Task 13: Extract useActivityLog hook

This is used by nearly every action handler, so extract it first as a dependency.

**Files:**
- Create: `apps/web/src/app/game/hooks/useActivityLog.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

```typescript
import { useState, useCallback } from 'react';
import type { ActivityLogEntry } from '../gameController.types';

function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function useActivityLog() {
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

  const pushLog = useCallback((entry: Omit<ActivityLogEntry, 'timestamp'>) => {
    setActivityLog(prev => [{ ...entry, timestamp: nowStamp() }, ...prev].slice(0, 100));
  }, []);

  return { activityLog, setActivityLog, pushLog } as const;
}
```

Check the actual `pushLog` implementation in `useGameController.ts` and match it exactly. The above is a template — adjust field names and logic to match.

**Step 2: Update useGameController**

Import and use the hook:
```typescript
const { activityLog, setActivityLog, pushLog } = useActivityLog();
```

Remove the local `activityLog` state, `pushLog` callback, and `nowStamp` function (already moved to `combatHelpers.ts` in Task 2 — delete from there too if it's now encapsulated in the hook).

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract useActivityLog hook from useGameController
```

---

### Task 14: Extract usePlayerSettings hook

**Files:**
- Create: `apps/web/src/app/game/hooks/usePlayerSettings.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate all 10 settings state variables and their handlers. The hook should:
- Hold state for: `autoPotionThreshold`, `combatLogSpeedMs`, `explorationSpeedMs`, `autoSkipKnownCombat`, `defaultExploreTurns`, `quickRestHealPercent`, `defaultRefiningMax`, `lowHpWarning`, `confirmRarity`, `guildTaxRate`
- Expose `initFromServer(playerSettings)` to hydrate settings from the player API response
- Expose individual handlers that call `updatePlayerSettings` API and update local state
- Expose a generic `handleSetSetting` for the pattern used in page.tsx

Look at how `loadAll()` initializes these settings (from the player response) and replicate that initialization path.

**Step 2: Update useGameController**

Import the hook and remove all 10 `useState` calls and ~20 handler functions for settings. Wire `initFromServer` into `loadAll()`.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract usePlayerSettings hook from useGameController
```

---

### Task 15: Extract useBestiary hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useBestiary.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate:
- `bestiaryMobs`, `bestiaryLoading`, `bestiaryError`, `bestiaryPrefixSummary` state
- `loadBestiary()` callback
- The load-on-screen-change effect for bestiary

The hook should accept `activeScreen` as a parameter (to trigger loading when screen changes to 'bestiary').

**Step 2: Update useGameController**

Import and use the hook. Remove the 4 state variables and `loadBestiary` callback.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract useBestiary hook from useGameController
```

---

### Task 16: Extract usePaginatedResource utility hook

Before extracting gathering and encounter sites, create a shared pagination hook since both follow the same pattern.

**Files:**
- Create: `apps/web/src/hooks/usePaginatedResource.ts`

**Step 1: Create the hook**

```typescript
import { useState, useCallback, useRef } from 'react';

interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface UsePaginatedResourceOptions<T, F extends Record<string, string>> {
  fetchFn: (params: { page: number; filters: F }) => Promise<{
    data?: { items: T[]; pagination: PaginationState; filters?: F } | null;
    error?: { message: string } | null;
  }>;
  initialFilters: F;
  pageSize?: number;
}

export function usePaginatedResource<T, F extends Record<string, string>>({
  fetchFn,
  initialFilters,
}: UsePaginatedResourceOptions<T, F>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<F>(initialFilters);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1, pageSize: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false,
  });
  const latestRequestRef = useRef(0);

  const load = useCallback(async (p = page, f = filters) => {
    const requestId = ++latestRequestRef.current;
    setLoading(true);
    setError(null);
    const res = await fetchFn({ page: p, filters: f });
    if (requestId !== latestRequestRef.current) return; // stale
    if (res.data) {
      setItems(res.data.items);
      setPagination(res.data.pagination);
      if (res.data.filters) setFilters(res.data.filters);
    } else {
      setError(res.error?.message ?? 'Failed to load');
    }
    setLoading(false);
  }, [page, filters, fetchFn]);

  const setPageAndLoad = useCallback((p: number) => {
    setPage(p);
    load(p, filters);
  }, [load, filters]);

  const setFilterAndLoad = useCallback((key: keyof F, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    setPage(1);
    load(1, newFilters);
  }, [load, filters]);

  return {
    items, loading, error, page, filters, pagination,
    load, setPageAndLoad, setFilterAndLoad,
    setItems, // for external updates
  };
}
```

Adjust the generic types and interface to match the actual usage patterns in gathering and encounter sites. Read both `refreshPendingEncounters` and `loadGatheringNodes` carefully to ensure the abstraction covers both.

**Step 2: Verify**

Run: `npm run typecheck`

**Step 3: Commit**

```
refactor: add usePaginatedResource utility hook
```

---

### Task 17: Extract useGathering hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useGathering.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Using `usePaginatedResource` from Task 16, encapsulate:
- All gathering state (~10 variables: nodes, loading, error, page, filters, pagination, activeGatheringSkill)
- `loadGatheringNodes()` callback
- Filter/page change handlers
- The load-on-screen-change effect

The hook should accept `activeScreen` and `activeZoneId` as parameters.

**Step 2: Update useGameController**

Import and use the hook. Remove all gathering state and callbacks.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract useGathering hook from useGameController
```

---

### Task 18: Extract useEncounterSites hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useEncounterSites.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Using `usePaginatedResource`, encapsulate:
- All pending encounter state (~10 variables)
- `refreshPendingEncounters()` callback
- Filter/page/sort change handlers
- The polling effect (interval-based refresh)
- `pendingClockMs` state

**Step 2: Update useGameController**

Import and use. Remove the encounter site state and callbacks from useGameController.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract useEncounterSites hook from useGameController
```

---

### Task 19: Extract useAchievements hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useAchievements.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate:
- `achievementData`, `achievementUnclaimedCount`, `activeTitle` state
- `loadAchievements()`, `loadAchievementUnclaimedCount()` callbacks
- `handleClaimAchievement()`, `handleSetActiveTitle()` handlers
- Socket listener for `achievement_unlocked` event

**Step 2: Update useGameController**

Import and use. Remove achievement state and handlers.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract useAchievements hook from useGameController
```

---

### Task 20: Extract useCombatPlayback hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useCombatPlayback.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate:
- `combatPlaybackQueue`, `combatPlaybackIndex`, `roomTransition`, `combatPlaybackData` state
- `pendingCombatRewardsRef`, `siteJustClearedRef` refs
- The lazy-load combat log effect (lines ~541-563 that fetch full logs for queue entries)
- `handleCombatPlaybackComplete()` — this is complex because it orchestrates rewards, loot, and site clearing. It needs callbacks for `loadAll`, `pushLog`, `setLastCombat`, `refreshPendingEncounters`, etc. passed in as dependencies.

The hook should expose:
- `startPlayback(queue)` — to initiate a combat playback sequence
- `combatPlaybackData` — the current fight to display
- `handleCombatPlaybackComplete` — to advance or finish the queue
- `isPlaying` — whether playback is active

**Step 2: Update useGameController**

Import and use. Pass the needed callbacks (loadAll, pushLog, etc.) as parameters. Remove combat playback state from useGameController.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract useCombatPlayback hook from useGameController
```

---

### Task 21: Slim down useGameController return object

After Tasks 13-20, the controller should be significantly smaller. Now clean up the return object.

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx` (update destructuring)

**Step 1: Stop exposing raw state setters**

Remove these from the return object (consumers should use handlers instead):
- `setTurns` — provide a `updateTurns(n: number)` handler instead
- `setHpState` — provide a `updateHpState(hp: HpState)` handler instead
- `setActiveZoneId` — this should be set internally by `loadAll`

Find all usages in `page.tsx` and other consumers. Redirect them to use the proper handlers or pass them as props to screen components that need them.

**Step 2: Verify**

Run: `npm run typecheck`

**Step 3: Commit**

```
refactor: stop exposing raw state setters from useGameController
```

---

## Phase 5: Split Large Screen Components

### Task 22: Split GuildScreen sub-components into separate files

**Files:**
- Create: `apps/web/src/components/guild/GuildOverview.tsx`
- Create: `apps/web/src/components/guild/GuildMembers.tsx`
- Create: `apps/web/src/components/guild/GuildActivityLog.tsx`
- Create: `apps/web/src/components/guild/GuildContractsTab.tsx`
- Create: `apps/web/src/components/guild/GuildSettings.tsx`
- Create: `apps/web/src/components/guild/NoGuildView.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx` — keep as orchestrator, import sub-components

**Step 1: Identify sub-component boundaries**

Read `GuildScreen.tsx` and identify each sub-component function defined within the file. Extract each to its own file with its own props interface.

**Step 2: Extract one at a time**

Start with `NoGuildView` (simplest), then `GuildOverview`, `GuildMembers`, `GuildActivityLog`, `GuildContractsTab`, `GuildSettings`.

For each:
1. Create the file with the component and its props interface
2. Move any helper functions used only by that component
3. Import it in `GuildScreen.tsx`
4. Run `npm run typecheck`

**Step 3: Extract shared utilities**

Move `formatDuration` and `formatTimeRemaining` from GuildScreen.tsx to `apps/web/src/lib/format.ts` (they're general-purpose formatters).

**Step 4: Verify**

Run: `npm run typecheck`

**Step 5: Commit**

```
refactor: split GuildScreen into separate sub-component files
```

---

### Task 23: Extract useAsyncAction hook for guild components

**Files:**
- Create: `apps/web/src/hooks/useAsyncAction.ts`
- Modify: `apps/web/src/components/guild/GuildProjectsTab.tsx`
- Modify: `apps/web/src/components/guild/GuildSpecializationTab.tsx`
- Modify: Guild sub-components from Task 22 that have the pattern

**Step 1: Create the hook**

```typescript
import { useState, useCallback } from 'react';

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(
    action: () => Promise<{ data?: T | null; error?: { message: string } | null }>,
    onSuccess?: (data: T) => void,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await action();
      if (res.error) {
        setError(res.error.message);
      } else if (res.data !== undefined && res.data !== null && onSuccess) {
        onSuccess(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, run, clearError };
}
```

**Step 2: Replace duplicated try/catch blocks**

In each guild component, replace the repeated pattern with `useAsyncAction()`.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract useAsyncAction hook, deduplicate guild action handlers
```

---

## Phase 6: Backend — Extract Combat Orchestration Service

This is the highest-risk phase. The duplicated combat flow in 4 route files must be consolidated without changing any API behavior.

### Task 24: Extract shared combat orchestration helper

**Files:**
- Create: `apps/api/src/services/combatOrchestrationService.ts`
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/zones.ts`

**Step 1: Study the duplicated pattern**

Read the combat resolution flow in all 4 locations:
1. `combat/start.ts` — encounter site combat (lines ~80-684)
2. `combat/start.ts` — zone combat (lines ~700-1019)
3. `exploration/start.ts` — ambush combat (lines ~241-494)
4. `zones.ts` — travel ambush combat (lines ~350-626)

Identify the common steps:
1. Build player combat stats (get skill levels, equipment stats, progression)
2. Apply guild combat modifiers
3. Build potion pool for auto-potioning
4. Build combatant objects
5. Call `runCombat()`
6. Handle victory: set HP, roll loot, grant XP, record bestiary kill, guild XP, achievements
7. Handle defeat: calculate flee, handle knockout/flee, enter recovery

**Step 2: Create the service**

Create `combatOrchestrationService.ts` with:

```typescript
interface CombatSetupParams {
  playerId: string;
  mobTemplateId: string;
  mobLevel: number;
  mobStats: MobStats;
  zoneId: string;
  zoneName: string;
  source: 'encounter_site' | 'zone' | 'exploration_ambush' | 'travel_ambush';
  eventModifiers?: EventModifier[];
}

interface CombatOutcome {
  result: CombatResult;     // from game-engine
  playerStats: PlayerCombatStats;
  mobStats: MobCombatStats;
  fleeResult?: FleeResult;
  xpGrants: SkillXpGrant[];
  loot: LootItem[];
  durabilityChanges: DurabilityChange[];
  hpAfter: number;
  isRecovering: boolean;
  recoveryCost: number | null;
  bestiaryUpdate: BestiaryUpdate;
}

// Build player combat stats from DB state
export async function buildPlayerCombatSetup(playerId: string, guildId?: string): Promise<PlayerCombatSetup> { ... }

// Apply guild modifiers to player stats
export function applyGuildCombatModifiers(stats: PlayerCombatStats, guildMods: GuildModifiers): void { ... }

// Run combat and process all consequences (HP, XP, loot, bestiary)
export async function executeAndProcessCombat(params: CombatSetupParams): Promise<CombatOutcome> { ... }
```

Extract the common logic from the 4 locations. Each caller then only handles its specific context (encounter site room progression, exploration event list, travel abort).

**Step 3: Refactor combat/start.ts**

Replace the duplicated combat flow with calls to the new service. Keep the encounter-site-specific logic (room progression, site clearing, response building) in the route handler.

**Step 4: Refactor exploration/start.ts**

Replace the ambush combat flow with calls to the service. Keep the exploration-specific logic (event list building, outcome processing).

**Step 5: Refactor zones.ts**

Replace the travel ambush flow with calls to the service. Keep the travel-specific logic (zone transition, breadcrumbs).

**Step 6: Verify**

Run: `npm run typecheck && npm run test:api`

**Step 7: Commit**

```
refactor: extract combat orchestration service, consolidate 4 combat flows
```

---

### Task 25: Extract applyGuildCombatModifiers to game-engine

**Files:**
- Create or modify: `packages/game-engine/src/combat/guildModifiers.ts`
- Modify: `apps/api/src/services/combatOrchestrationService.ts` — import from game-engine

**Step 1: Create pure function**

```typescript
export interface GuildCombatModifiers {
  combatDamage: number;  // e.g. 0.1 for 10% boost
  defenseBoost: number;
}

export function applyGuildCombatModifiers(
  stats: { damageMin: number; damageMax: number; defence: number; magicDefence: number },
  mods: GuildCombatModifiers,
): void {
  if (mods.combatDamage > 0) {
    stats.damageMin = Math.round(stats.damageMin * (1 + mods.combatDamage));
    stats.damageMax = Math.round(stats.damageMax * (1 + mods.combatDamage));
  }
  if (mods.defenseBoost > 0) {
    stats.defence = Math.round(stats.defence * (1 + mods.defenseBoost));
    stats.magicDefence = Math.round(stats.magicDefence * (1 + mods.defenseBoost));
  }
}
```

**Step 2: Write test**

```typescript
import { applyGuildCombatModifiers } from './guildModifiers';

describe('applyGuildCombatModifiers', () => {
  it('boosts damage by percentage', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 15, magicDefence: 10 };
    applyGuildCombatModifiers(stats, { combatDamage: 0.1, defenseBoost: 0 });
    expect(stats.damageMin).toBe(11);
    expect(stats.damageMax).toBe(22);
  });

  it('boosts defense by percentage', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 15, magicDefence: 10 };
    applyGuildCombatModifiers(stats, { combatDamage: 0, defenseBoost: 0.2 });
    expect(stats.defence).toBe(18);
    expect(stats.magicDefence).toBe(12);
  });

  it('no-ops with zero modifiers', () => {
    const stats = { damageMin: 10, damageMax: 20, defence: 15, magicDefence: 10 };
    applyGuildCombatModifiers(stats, { combatDamage: 0, defenseBoost: 0 });
    expect(stats).toEqual({ damageMin: 10, damageMax: 20, defence: 15, magicDefence: 10 });
  });
});
```

**Step 3: Update imports in combatOrchestrationService**

**Step 4: Verify**

Run: `npm run typecheck && npm run test:engine`

**Step 5: Commit**

```
refactor: move guild combat modifier logic to game-engine
```

---

### Task 26: Extract activityLogService

**Files:**
- Create: `apps/api/src/services/activityLogService.ts`
- Modify: Route files that create activity logs inline

**Step 1: Create the service**

```typescript
import { prisma } from '@adventure/database';

interface CombatActivityLogParams {
  playerId: string;
  zoneId: string;
  zoneName: string;
  mobTemplateId: string;
  mobName: string;
  mobPrefix: string | null;
  mobDisplayName: string;
  source: string;
  attackSkill: string;
  outcome: 'victory' | 'defeat' | 'fled';
  playerMaxHp: number;
  mobMaxHp: number;
  log: unknown;
  rewards?: unknown;
  eventModifiers?: unknown;
}

export async function createCombatActivityLog(params: CombatActivityLogParams) {
  return prisma.activityLog.create({
    data: {
      playerId: params.playerId,
      type: 'combat',
      result: params as unknown as Record<string, unknown>,
    },
  });
}
```

Match the actual schema and field names by reading the existing inline `prisma.activityLog.create()` calls.

**Step 2: Replace inline activity log creation**

In `combat/start.ts`, `exploration/start.ts`, and `zones.ts`, replace the inline `prisma.activityLog.create()` calls with `createCombatActivityLog()`.

**Step 3: Verify**

Run: `npm run typecheck && npm run test:api`

**Step 4: Commit**

```
refactor: extract activityLogService for combat log creation
```

---

## Phase 7: Backend Cleanup

### Task 27: Split guildService.ts

**Files:**
- Create: `apps/api/src/services/guildMembershipService.ts`
- Modify: `apps/api/src/services/guildService.ts`
- Modify: `apps/api/src/routes/guild.ts` — update imports

**Step 1: Extract membership functions**

Move these functions to `guildMembershipService.ts`:
- `joinGuild`
- `leaveGuild`
- `requestJoinGuild`
- `listJoinRequests`
- `acceptJoinRequest`
- `rejectJoinRequest`
- `kickMember`
- `promoteMember`
- `demoteMember`
- `transferLeadership`
- `disbandGuild`

Also export `requireRole` from `guildService.ts` so both files and other guild services can import it.

**Step 2: Update route imports**

In `apps/api/src/routes/guild.ts`, update imports to pull membership functions from the new service file.

**Step 3: Verify**

Run: `npm run typecheck && npm run test:api`

**Step 4: Commit**

```
refactor: split guildService into core + membership services
```

---

### Task 28: Export and reuse requireRole across guild services

**Files:**
- Modify: `apps/api/src/services/guildService.ts` — export `requireRole`
- Modify: `apps/api/src/services/guildProjectService.ts` — import and use `requireRole`
- Modify: `apps/api/src/services/guildUpgradeService.ts` — import and use `requireRole`
- Modify: `apps/api/src/services/guildSpecializationService.ts` — import and use `requireRole`

**Step 1: Export requireRole**

In `guildService.ts`, make `requireRole` a named export.

**Step 2: Replace inline role checks**

In each guild service file, replace the inline membership-fetch-and-role-check pattern with a call to `requireRole(playerId, guildId, ['leader', 'officer'])`.

**Step 3: Verify**

Run: `npm run typecheck && npm run test:api`

**Step 4: Commit**

```
refactor: deduplicate guild role validation across services
```

---

### Task 29: Deduplicate lootService functions

**Files:**
- Modify: `apps/api/src/services/lootService.ts`

**Step 1: Refactor rollAndGrantLoot to use rollAndGrantLootWithCapacity**

Make `rollAndGrantLoot()` call `rollAndGrantLootWithCapacity()` with `Infinity` capacity (or a very large number). Delete the duplicated drop-rolling logic from `rollAndGrantLoot`.

Alternatively, extract the shared drop-rolling logic into a private `rollDrops()` helper that both functions call.

**Step 2: Verify**

Run: `npm run typecheck && npm run test:api`

**Step 3: Commit**

```
refactor: deduplicate loot rolling logic in lootService
```

---

### Task 30: Fix inconsistent error types in bossEncounterService

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts`

**Step 1: Replace plain Error with AppError**

Find all `throw new Error(...)` in bossEncounterService.ts and replace with `throw new AppError(statusCode, message, errorCode)`:
- `throw new Error('Boss encounter not found')` → `throw new AppError(404, 'Boss encounter not found', 'NOT_FOUND')`
- `throw new Error('Boss encounter is already over')` → `throw new AppError(400, 'Boss encounter is already over', 'ENCOUNTER_OVER')`
- Any other plain Error throws

Import `AppError` from the middleware/error module.

**Step 2: Verify**

Run: `npm run typecheck && npm run test:api`

**Step 3: Commit**

```
refactor: use AppError consistently in bossEncounterService
```

---

## Phase 8: Type Consolidation

### Task 31: Replace inline Rarity literal unions with imports

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/lib/api/items.ts`
- Modify: `apps/web/src/lib/api/player.ts`
- Modify: `apps/web/src/app/game/useGameController.ts` (if any remain after Phase 4)

**Step 1: Find all inline rarity unions**

Run: `grep -rn "'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'" apps/web/src/` to find all occurrences.

**Step 2: Replace with import**

At the top of each file, add:
```typescript
import type { Rarity } from '@/lib/rarity';
```

Replace each inline `'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'` with `Rarity`.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: use shared Rarity type instead of inline literal unions
```

---

### Task 32: Extract shared PaginationResponse type

**Files:**
- Create: `apps/web/src/lib/api/types.ts`
- Modify: API files that define inline pagination shapes

**Step 1: Create the shared type**

```typescript
export interface PaginationResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
```

**Step 2: Replace inline pagination types**

In `combat.ts`, `items.ts`, `social.ts`, and any other API files that define inline pagination shapes, replace with `PaginationResponse`.

**Step 3: Verify**

Run: `npm run typecheck`

**Step 4: Commit**

```
refactor: extract shared PaginationResponse type for API layer
```

---

### Task 33: Split gameConstants.ts — extract guild constants

**Files:**
- Create: `packages/shared/src/constants/guildConstants.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/index.ts` — re-export from new file
- Move type definitions to `packages/shared/src/types/guild.types.ts`

**Step 1: Extract guild constant blocks**

Move these from `gameConstants.ts` to `guildConstants.ts`:
- `GUILD_UPGRADE_DEFINITIONS` and its types (`GuildUpgradeEffectType`, `GuildUpgradeTier`, `GuildUpgradeDefinition`)
- `GUILD_CONTRACT_DEFINITIONS` and its types (`GuildContractType`, `GuildContractCategory`, `GuildContractDefinition`)
- `GUILD_PROJECT_DEFINITIONS`
- `GUILD_SPECIALIZATION_DEFINITIONS`
- Any guild-related utility functions (`getCategoryForTemplate`, `levelToGemTier` if guild-specific)

Move type definitions to `packages/shared/src/types/guild.types.ts`.

**Step 2: Update imports**

Run: `grep -rn "from.*gameConstants" packages/ apps/` to find all consumers that import guild constants. Update their imports to point to `guildConstants`.

**Step 3: Update barrel exports**

In `packages/shared/src/index.ts`, add re-exports from `guildConstants.ts`.

**Step 4: Build shared package**

Run: `npm run build --workspace=packages/shared`

**Step 5: Verify**

Run: `npm run typecheck`

**Step 6: Commit**

```
refactor: split guild constants out of gameConstants.ts
```

---

## Phase 9: Database Indexes

### Task 34: Add missing database indexes

**Files:**
- Create migration: `packages/database/prisma/migrations/YYYYMMDD_add_missing_indexes/migration.sql`
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add indexes to schema.prisma**

Add `@@index` annotations to:
- `Item` model: `@@index([ownerId])`
- `DropTable` model: `@@index([mobTemplateId])`

**Step 2: Generate migration**

Run: `npx prisma migrate dev --name add_missing_indexes --create-only` (in the database package directory)

Review the generated SQL to ensure it only creates indexes and doesn't alter data.

**Step 3: Apply migration**

Run: `npm run db:migrate`

**Step 4: Verify**

Run: `npm run typecheck && npm run db:generate`

**Step 5: Commit**

```
perf: add missing database indexes on Item.ownerId and DropTable.mobTemplateId
```

---

## Verification Checklist

After completing all tasks, run the full verification suite:

```bash
npm run typecheck      # Must pass with zero errors
npm run test           # All tests must pass
npm run build          # Full build must succeed
npm run lint           # No new lint errors
```

Start the dev server and manually verify:
- Dashboard loads
- Navigation between all screens works
- Combat playback works
- Exploration works
- Settings persist after page reload
- Guild screens load and function

---

## Task Summary

| Phase | Tasks | Risk | Impact |
|-------|-------|------|--------|
| 1: Zero-risk cleanup | 1-5 | None | ~200 lines removed, cleaner imports |
| 2: Shared UI components | 6-11 | Low | ~400 lines deduplicated across screens |
| 3: Settings extraction | 12 | Low | ~170 lines out of page.tsx |
| 4: Hook decomposition | 13-21 | Medium | ~1200 lines out of useGameController |
| 5: Component splitting | 22-23 | Low | ~500 lines restructured in guild |
| 6: Combat orchestration | 24-26 | High | ~800 lines deduplicated across 4 routes |
| 7: Backend cleanup | 27-30 | Medium | ~200 lines deduplicated in services |
| 8: Type consolidation | 31-33 | Low | ~100 inline types replaced |
| 9: DB indexes | 34 | Low | Query performance improvement |

**Total: 34 tasks across 9 phases**
