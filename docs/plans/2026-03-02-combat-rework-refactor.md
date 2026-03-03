# Codebase Refactoring Plan

> **For Claude:** This plan is designed for **autonomous overnight execution**. Work through every task sequentially. Do NOT stop between tasks. Do NOT ask for user input. If a task fails, debug it, fix it, and continue. If you cannot fix a task after 3 attempts, commit what you have, skip it, and move to the next task. After every task, commit your work.

## Autonomous Execution Instructions

**CRITICAL — READ BEFORE STARTING:**

### Step 0: Create a fresh worktree

Create a new worktree for this refactoring work:

```bash
cd D:/Code/Adventure
./scripts/setup-worktree.sh codebase-refactor --no-seed
```

This creates the worktree at `D:/Code/Adventure/.worktrees/adventure-codebase-refactor` with its own branch, database, env files, and dependencies.

**All subsequent work happens inside that worktree.**

### Execution rules

1. **Working directory:** `D:/Code/Adventure/.worktrees/adventure-codebase-refactor`
2. **Before starting:** Run `npm run typecheck && npm run test` to confirm baseline passes. All tests should pass.
3. **After every task:** Run `npm run typecheck` to verify no type errors. If typecheck fails, fix the errors before committing.
4. **After every phase:** Run `npm run test` to verify no test regressions. If tests fail, fix them before moving on.
5. **Commit after every task** using the provided commit message. Use `git add <specific files>` — never `git add -A`.
6. **Never stop.** If a task is unclear, use your best judgment based on the codebase patterns you see. If something breaks, revert with `git checkout -- <files>` and try again.
7. **Pure refactoring only.** No new features, no behavior changes. The app must work identically before and after.
8. **Do NOT create new test files** unless the task explicitly says to. Move-only changes don't need new tests.
9. **File operations:** Use the Write tool for new files, Edit tool for modifications. NEVER use shell heredocs.
10. **Line numbers are approximate.** Always read the actual file before editing. Use the patterns and function/variable names to locate code, not exact line numbers.

**Goal:** Reduce code duplication, enforce single responsibility, and improve maintainability across the entire codebase without changing any user-facing behavior.

**Architecture:** Bottom-up refactoring — shared utilities first, then UI components, then the god-hook decomposition, then backend cleanup. Each task is independently committable and testable.

---

## Phase 1: Zero-Risk Cleanup (dead code, duplicate types, shared math utils)

### Task 1: Delete dead mock data from page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx` (lines 94-179)

**Step 1:** Delete lines 94-179 — the entire `/* Mock data for demo ... */` comment block containing `mockPlayerData`, `mockSkills`, `mockDetailedSkills`, `mockInventory`, `mockEquipmentSlots`, `mockEquipmentStats`, `mockZones`, `mockMonsters`, `mockCraftingRecipes`, `mockGatheringNodes`. This is ~85 lines of dead commented-out code.

**Step 2:** Run `npm run typecheck`

**Step 3:** Commit
```
refactor: delete dead mock data from page.tsx
```

---

### Task 2: Extract types and pure functions from useGameController.ts

The hook file defines 10+ types and 4 pure functions that have no dependency on React hooks. Move them to dedicated files.

**Files:**
- Create: `apps/web/src/app/game/gameController.types.ts`
- Create: `apps/web/src/app/game/combatHelpers.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: All files that import types from `useGameController`

**Step 1: Create `gameController.types.ts`**

Move these type/constant definitions from `useGameController.ts`:
- `Screen` type (line ~90, the union of 21 screen names)
- `PendingEncounter` interface (line ~103)
- `LastCombatLogEntry` re-export (line ~126, imported from `@/lib/api/combat`)
- `CombatPlaybackItem` type (line ~129)
- `LastCombat` interface (line ~183, the interface definition, NOT the builder function)
- `BestiarySkipEntry` type (line ~243)
- `ActivityLogEntry` type (line ~260)
- `CharacterProgression` interface (line ~264)
- `HpState` interface (line ~301)
- `DEFAULT_CHARACTER_PROGRESSION` constant (line ~306)

Export all of them. Add necessary imports (types from `@/lib/api`, `@adventure/shared`).

**Step 2: Create `combatHelpers.ts`**

Move these pure functions from `useGameController.ts`:
- `buildFightsList()` (line ~141)
- `buildLastCombat()` (line ~168)
- `isMobKnown()` (line ~252)

Export all. Import types from `./gameController.types`.

**Step 3: Update `useGameController.ts`**

Replace moved code with imports:
```typescript
import type { Screen, PendingEncounter, LastCombat, CombatPlaybackItem, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { DEFAULT_CHARACTER_PROGRESSION } from './gameController.types';
export type { Screen, PendingEncounter, LastCombat, LastCombatLogEntry, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { buildFightsList, buildLastCombat } from './combatHelpers';
export { isMobKnown } from './combatHelpers';
```

Remove the moved code blocks. Keep all hook logic in place.

**Step 4: Update imports in consumers**

Run `grep -rn "from.*useGameController" apps/web/src/ --include="*.ts" --include="*.tsx"` to find all consumers. These files import types from useGameController and need updating:

| File | Imports |
|------|---------|
| `page.tsx` | `Screen`, `isMobKnown` |
| `screens/CombatScreen.tsx` | `HpState`, `LastCombat`, `LastCombatLogEntry`, `PendingEncounter` |
| `components/ActivityLog.tsx` | `ActivityLogEntry` |
| `components/combat/CombatLogEntry.tsx` | `LastCombatLogEntry` |
| `components/combat/CombatPlayback.tsx` | `LastCombatLogEntry`, `LastCombat` |
| `components/combat/CombatRewardsSummary.tsx` | `LastCombat` |
| `components/playback/TurnPlayback.tsx` | `isMobKnown`, `BestiarySkipEntry` |
| `components/screens/Crafting.tsx` | `ActivityLogEntry` |
| `components/screens/Dashboard.tsx` | `ActivityLogEntry` |
| `components/screens/Exploration.tsx` | `ActivityLogEntry`, `BestiarySkipEntry` |
| `components/screens/Forge.tsx` | `ActivityLogEntry` |
| `components/screens/Gathering.tsx` | `ActivityLogEntry` |
| `components/screens/TalentTree.tsx` | `Screen` |
| `components/screens/Templates.tsx` | `Screen` |
| `components/screens/ZoneMap.tsx` | `ActivityLogEntry`, `BestiarySkipEntry` |

For each, update the import path: change `from '@/app/game/useGameController'` or `from '../useGameController'` to import types from `'@/app/game/gameController.types'` and functions from `'@/app/game/combatHelpers'`.

**IMPORTANT:** Keep re-exports in `useGameController.ts` so that any file not yet updated still works. The re-exports act as a compatibility bridge. You can verify all consumers are updated by removing the re-exports at the end and running typecheck.

**Step 5:** Run `npm run typecheck`

**Step 6:** Commit
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
  if (typeof roll === 'number' && Number.isFinite(roll)) {
    return clamp(roll, 0, 0.999999999);
  }
  return Math.random();
}
```

Note: Match the exact implementation from `itemRarity.ts` and `craftingCrit.ts` — they clamp to `0.999999999`, not `1`.

**Step 2: Replace local definitions**

In each of the three files, delete the local `clamp`/`randomUnit` functions and add:
```typescript
import { clamp, randomUnit } from '../utils/math';
```

Adjust relative import paths per file location. `damageCalculator.ts` only uses `clamp`, not `randomUnit`.

**Step 3: Export from barrel**

Add to `packages/game-engine/src/index.ts`:
```typescript
export { clamp, randomUnit } from './utils/math';
```

**Step 4:** Build game-engine first: `npm run build --workspace=packages/game-engine`

**Step 5:** Run `npm run typecheck && npm run test:engine`

**Step 6:** Commit
```
refactor: extract shared math utils in game-engine
```

---

### Task 4: Remove duplicate EncounterSiteSize type

**Files:**
- Modify: `packages/game-engine/src/exploration/encounterChest.ts` — remove local `EncounterSiteSize` type (line 3), import from `@adventure/shared`
- Modify: `packages/game-engine/src/exploration/roomGenerator.ts` — remove local `EncounterSiteSize` type (line 3), import from `@adventure/shared`

**Step 1:** Verify `@adventure/shared` exports `EncounterSiteSize`:
- It's defined at `packages/shared/src/types/encounter.types.ts:1`
- Confirm it's re-exported from `packages/shared/src/index.ts`

**Step 2:** In `encounterChest.ts`, replace:
```typescript
export type EncounterSiteSize = 'small' | 'medium' | 'large';
```
with:
```typescript
import type { EncounterSiteSize } from '@adventure/shared';
export type { EncounterSiteSize };
```

Keep the re-export since other files import `EncounterSiteSize` from `encounterChest.ts`. Check with `grep -rn "from.*encounterChest" packages/game-engine/`.

**Step 3:** In `roomGenerator.ts`, replace:
```typescript
type EncounterSiteSize = 'small' | 'medium' | 'large';
```
with:
```typescript
import type { EncounterSiteSize } from '@adventure/shared';
```

**Step 4:** Run `npm run typecheck && npm run test:engine`

**Step 5:** Commit
```
refactor: import EncounterSiteSize from shared instead of redefining
```

---

### Task 5: Remove duplicate GuildSpecializationPath type and dead xpCalculator alias

**Files:**
- Modify: `packages/shared/src/types/guild.types.ts` — replace `GuildSpecializationPath` with `GuildSpecialization`
- Modify: `packages/game-engine/src/skills/xpCalculator.ts` — remove `shouldResetDailyCap` alias
- Modify: `apps/api/src/services/xpService.ts` — update import to use `shouldResetWindowCap`

**Step 1: Evaluate GuildSpecializationPath**

`GuildSpecialization` (line 3) = `'warfare' | 'industry' | 'discovery'`
`GuildSpecializationPath` (line 147) = `'warfare' | 'industry' | 'discovery'`

They are identical. However, `GuildSpecializationPath` is used in `GuildSpecializationTreeDef` and in `guildSpecializationService.ts`. Check all usages:

```bash
grep -rn "GuildSpecializationPath" packages/ apps/ --include="*.ts" --include="*.tsx"
```

Replace every usage of `GuildSpecializationPath` with `GuildSpecialization`. Then delete the `GuildSpecializationPath` type alias from `guild.types.ts`.

**Step 2: Remove xpCalculator alias**

In `packages/game-engine/src/skills/xpCalculator.ts` (line 151), delete:
```typescript
export const shouldResetDailyCap = shouldResetWindowCap;
```

In `apps/api/src/services/xpService.ts` (line 4), change import from `shouldResetDailyCap` to `shouldResetWindowCap`. Also update usage at line 60.

Check the barrel export in `packages/game-engine/src/index.ts` — remove any re-export of `shouldResetDailyCap`.

**Step 3:** Build shared: `npm run build --workspace=packages/shared`
Then build game-engine: `npm run build --workspace=packages/game-engine`

**Step 4:** Run `npm run typecheck && npm run test`

**Step 5:** Commit
```
refactor: remove duplicate type alias and dead export
```

---

## Phase 2: Extract Shared UI Components

### Task 6: Enhance ModalOverlay and replace inline modals

**Files:**
- Modify: `apps/web/src/components/common/ModalOverlay.tsx`
- Modify: `apps/web/src/components/screens/Equipment.tsx` — 2 inline modals
- Modify: `apps/web/src/components/screens/Inventory.tsx` — 2 inline modals
- Modify: `apps/web/src/components/screens/Bestiary.tsx` — 1 inline modal
- Modify: `apps/web/src/components/screens/CombatLog.tsx` — 2 inline modals
- Modify: `apps/web/src/components/common/LootPicker.tsx` — 1 inline modal

**Step 1: Read current ModalOverlay**

Read `apps/web/src/components/common/ModalOverlay.tsx` to understand current implementation. Then update it to support opacity variants and an optional `onClose` prop:

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
or similar variants. Replace with:
```tsx
<ModalOverlay opacity={80} onClose={handleClose}>
```

Remove `stopPropagation` calls on inner content divs where `ModalOverlay` now handles the click-outside behavior.

Do this file by file, running `npm run typecheck` after each file.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: standardize modal overlays to use ModalOverlay component
```

---

### Task 7: Extract shared statEntries() utility

**Files:**
- Modify: `apps/web/src/lib/statFormat.ts` — add `statEntries()` function
- Modify: `apps/web/src/components/screens/Crafting.tsx` — remove local `statEntries` (line ~59), import from statFormat
- Modify: `apps/web/src/components/screens/Forge.tsx` — remove local `statEntries` (line ~119), import from statFormat

**Step 1: Read both local implementations**

Crafting.tsx (full version with STAT_ORDER sorting):
```typescript
function statEntries(stats: Record<string, unknown> | undefined): Array<[string, number]> {
  return Object.entries(stats ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] !== 0)
    .sort((a, b) => {
      const aOrder = STAT_ORDER.indexOf(a[0]);
      const bOrder = STAT_ORDER.indexOf(b[0]);
      if (aOrder === -1 && bOrder === -1) return a[0].localeCompare(b[0]);
      if (aOrder === -1) return 1;
      if (bOrder === -1) return -1;
      return aOrder - bOrder;
    });
}
```

Forge.tsx (simpler, no sorting):
```typescript
function statEntries(stats: Record<string, unknown> | null | undefined): Array<[string, number]> {
  return Object.entries(stats ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] !== 0);
}
```

**Step 2: Add to `statFormat.ts`**

Use the full version (with STAT_ORDER sorting) since `STAT_ORDER` is already defined in that file. The Forge version that lacks sorting will now get sorted output, which is a visual improvement, not a behavior change.

Accept both `undefined` and `null`:
```typescript
export function statEntries(stats: Record<string, unknown> | null | undefined): Array<[string, number]> {
  return Object.entries(stats ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] !== 0)
    .sort((a, b) => {
      const aOrder = STAT_ORDER.indexOf(a[0]);
      const bOrder = STAT_ORDER.indexOf(b[0]);
      if (aOrder === -1 && bOrder === -1) return a[0].localeCompare(b[0]);
      if (aOrder === -1) return 1;
      if (bOrder === -1) return -1;
      return aOrder - bOrder;
    });
}
```

**Step 3: Replace local definitions**

In both files, delete the local `statEntries` function and any local `STAT_ORDER` import that's now redundant (check — `Crafting.tsx` may import `STAT_ORDER` separately for other uses). Add:
```typescript
import { statEntries } from '@/lib/statFormat';
```

**Step 4:** Run `npm run typecheck`

**Step 5:** Commit
```
refactor: extract statEntries to shared statFormat utility
```

---

### Task 8: Extract SubNav component

**Files:**
- Create: `apps/web/src/components/common/SubNav.tsx`
- Modify: `apps/web/src/app/game/page.tsx` — replace 4 inline sub-navigation blocks (lines ~1311-1430)

**Step 1: Create SubNav component**

Read the existing inline tab bar pattern in `page.tsx` at lines ~1311-1350 to understand the exact styling. Then create:

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

Match the exact className strings from the existing inline implementation in page.tsx. Read the file carefully before writing.

**Step 2: Replace all 4 inline tab bars**

There are 4 tab bars at lines ~1311, ~1354, ~1377, ~1398 (for `home`, `explore`, `inventory`, `combat` tabs). Replace each with `<SubNav>`. The home tab has an admin conditional and achievement badge — include those in the tabs array.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract SubNav component, deduplicate tab navigation
```

---

### Task 9: Extract LoadingCard and ErrorBanner components

**Files:**
- Create: `apps/web/src/components/common/LoadingCard.tsx`
- Create: `apps/web/src/components/common/ErrorBanner.tsx`
- Modify: Guild and other screen files that use the pattern

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

Search for the loading pattern:
```bash
grep -rn "PixelCard.*Loading\|opacity-60.*Loading" apps/web/src/ --include="*.tsx"
```
Replace in: `GuildScreen.tsx`, `GuildProjectsTab.tsx`, `GuildSpecializationTab.tsx`, `BossEncounterPanel.tsx`.

Search for the error banner pattern:
```bash
grep -rn "rpg-red.*border.*rpg-red.*text-sm" apps/web/src/ --include="*.tsx"
```
Replace in `GuildScreen.tsx` and any other files found.

Do this file by file, running `npm run typecheck` after each.

**Step 4:** Commit
```
refactor: extract LoadingCard and ErrorBanner shared components
```

---

## Phase 3: Extract Settings Screen

### Task 10: Extract Settings screen component from page.tsx

**Files:**
- Create: `apps/web/src/components/screens/Settings.tsx`
- Modify: `apps/web/src/app/game/page.tsx` — replace inline settings UI (~170 lines at line 1014)

**Step 1: Read the settings block**

Read `page.tsx` lines 1014-1185 to understand the full settings UI. It includes:
- Combat playback speed slider
- Auto-skip known combat toggle
- Auto-potion threshold slider
- Low HP warning toggle
- Exploration playback speed slider
- Default explore turns slider
- Quick-rest heal target selector
- Default refining max toggle
- Confirm rarity selector
- Logout button

**Step 2: Create Settings.tsx**

Create the component with a props interface for all settings values and handlers. Let the component manage local state for slider dragging (optimistic updates) and call the handler only on commit.

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

Move the entire JSX from the `case 'settings':` block into this component. Import `PixelCard` and any other components used by the settings UI.

**Step 3: Update page.tsx**

Replace the `case 'settings':` content with:
```tsx
case 'settings':
  return (
    <Settings
      username={player?.username}
      combatLogSpeedMs={combatLogSpeedMs}
      explorationSpeedMs={explorationSpeedMs}
      // ... all other props
      onLogout={() => { logout(); router.push('/'); }}
    />
  );
```

**Step 4:** Run `npm run typecheck`

**Step 5:** Commit
```
refactor: extract Settings screen to dedicated component
```

---

## Phase 4: Decompose useGameController (the big one)

This is the highest-impact refactoring. `useGameController.ts` is 2,346 lines with 70+ state variables and 50+ handlers. Extract leaf concerns first (no dependencies on other extracted hooks), then work inward.

### Task 11: Extract useActivityLog hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useActivityLog.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hooks directory**

```bash
mkdir -p apps/web/src/app/game/hooks
```

**Step 2: Create the hook**

Read the `pushLog` implementation in `useGameController.ts` (line ~1005) carefully and replicate exactly:

```typescript
import { useState } from 'react';
import type { ActivityLogEntry } from '../gameController.types';

function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function useActivityLog() {
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

  const pushLog = (...entries: ActivityLogEntry[]) => {
    setActivityLog(prev => [...entries.map(e => ({ ...e, timestamp: e.timestamp || nowStamp() })), ...prev].slice(0, 100));
  };

  return { activityLog, setActivityLog, pushLog } as const;
}
```

**IMPORTANT:** Read the actual `pushLog` implementation and match it exactly. The above is a template.

**Step 3: Update useGameController**

```typescript
import { useActivityLog } from './hooks/useActivityLog';
// ...
const { activityLog, setActivityLog, pushLog } = useActivityLog();
```

Remove the local `activityLog` state, `pushLog` function, and `nowStamp` function.

**Step 4:** Run `npm run typecheck`

**Step 5:** Commit
```
refactor: extract useActivityLog hook from useGameController
```

---

### Task 12: Extract usePlayerSettings hook

**Files:**
- Create: `apps/web/src/app/game/hooks/usePlayerSettings.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate these 11 settings state variables (lines ~521-531):
- `autoPotionThreshold`, `combatLogSpeedMs`, `explorationSpeedMs`, `autoSkipKnownCombat`
- `defaultExploreTurns`, `quickRestHealPercent`, `defaultRefiningMax`
- `lowHpWarning`, `confirmRarity`, `guildTaxRate`

And their handlers (lines ~2099-2130):
- `handleSetAutoPotionThreshold`, `handleSetCombatLogSpeed`, `handleSetExplorationSpeed`
- `handleSetAutoSkipKnownCombat`, `handleSetDefaultExploreTurns`, `handleSetQuickRestHealPercent`
- `handleSetDefaultRefiningMax`, `handleSetLowHpWarning`, `handleSetConfirmRarity`
- The generic `handleSetSetting` function (line ~2099)

The hook should expose:
- All setting values (for reading)
- All handler functions (for updating)
- `initFromServer(settings)` — to hydrate from the player API response during `loadAll()`
- Raw setters for the settings that need optimistic updates during slider drag (e.g., `setCombatLogSpeedMs`)

Read how `loadAll()` initializes these settings from the player response and replicate that.

**Step 2: Update useGameController**

Import and use the hook. Remove the 11 `useState` calls and ~10 handler functions. Wire `initFromServer` into `loadAll()`.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract usePlayerSettings hook from useGameController
```

---

### Task 13: Extract useBestiary hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useBestiary.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate (lines ~476-513):
- `bestiaryMobs`, `bestiaryLoading`, `bestiaryError`, `bestiaryPrefixSummary` state
- `loadBestiary()` callback (line ~902)

The hook should accept a `loadBestiary` trigger (or accept an `activeScreen` parameter and load when screen changes to 'bestiary').

Read the actual `loadBestiary` implementation to understand what API it calls and how it processes the response.

**Step 2: Update useGameController**

Import and use. Remove the 4 state variables and `loadBestiary` callback.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract useBestiary hook from useGameController
```

---

### Task 14: Extract useGathering hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useGathering.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate all gathering state (lines ~392-429):
- `gatheringNodes`, `gatheringLoading`, `gatheringError`
- `gatheringPage`, `gatheringZoneFilter`, `gatheringResourceTypeFilter`
- `activeGatheringSkill`, `gatheringPagination`, `gatheringFilters`

And callbacks (lines ~923-975):
- `loadGatheringNodes()`
- `handleGatheringPageChange()`, `handleGatheringZoneFilterChange()`, `handleGatheringResourceTypeFilterChange()`

The hook should accept `activeZoneId` as a parameter.

**Step 2: Update useGameController**

Import and use. Remove all gathering state and callbacks.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract useGathering hook from useGameController
```

---

### Task 15: Extract useEncounterSites hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useEncounterSites.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate all pending encounter state (lines ~449-472):
- `pendingEncounters`, `pendingEncountersLoading`, `pendingEncountersError`
- `pendingEncounterPage`, `pendingEncounterZoneFilter`, `pendingEncounterMobFilter`, `pendingEncounterSort`
- `pendingEncounterPagination`, `pendingEncounterFilters`
- `pendingClockMs`

And callbacks (lines ~808-994):
- `refreshPendingEncounters()`
- `handlePendingEncounterPageChange()`, zone/mob/sort filter change handlers

Also encapsulate the pending encounter polling effect if one exists.

**Step 2: Update useGameController**

Import and use. Pass needed dependencies. Remove encounter site state and callbacks.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract useEncounterSites hook from useGameController
```

---

### Task 16: Extract useAchievements hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useAchievements.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

Encapsulate (lines ~532-534):
- `achievementData`, `achievementUnclaimedCount`, `activeTitle` state

And handlers:
- `loadAchievements()` (line ~626)
- `loadAchievementUnclaimedCount()` (line ~634)
- `handleClaimAchievement()` — find it in useGameController
- `handleSetActiveTitle()` — find it in useGameController

Look for the socket listener for `achievement_unlocked` event and include it if present.

**Step 2: Update useGameController**

Import and use. Remove achievement state and handlers.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract useAchievements hook from useGameController
```

---

### Task 17: Extract useCombatPlayback hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useCombatPlayback.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Create the hook**

This is the most complex extraction. Encapsulate (lines ~536-605):
- `combatPlaybackQueue`, `combatPlaybackIndex`, `roomTransition`, `combatPlaybackData` (derived from queue + index)
- `pendingCombatRewardsRef`, `siteJustClearedRef` refs
- `combatLogPrefetch` ref and the lazy-load combat log effect

And the handler:
- `handleCombatPlaybackComplete()` (line ~1367) — this orchestrates rewards, loot, and site clearing

The hook needs callbacks passed in for: `loadAll`, `pushLog`, `setLastCombat`, `refreshPendingEncounters`, etc. These are dependencies from other parts of the controller.

**Step 2: Update useGameController**

Import and use. Pass needed callbacks as parameters.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract useCombatPlayback hook from useGameController
```

---

### Task 18: Slim down useGameController return object

After Tasks 11-17, review the return object (starting at line ~2167).

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx` (update destructuring)

**Step 1: Remove raw state setters from return**

Identify setters that should not be exposed:
- `setTurns` — provide `updateTurns(n: number)` handler
- `setHpState` — provide `updateHpState(hp: HpState)` handler
- `setActiveZoneId` — should be set internally by `loadAll`

Search `page.tsx` for usage of these setters. If they're used, create thin wrapper handlers.

**Step 2:** Run `npm run typecheck`

**Step 3:** Commit
```
refactor: stop exposing raw state setters from useGameController
```

---

## Phase 5: Split Large Screen Components

### Task 19: Split GuildScreen sub-components into files

GuildScreen.tsx is 1,044 lines — too large.

**Files:**
- Create: `apps/web/src/components/guild/GuildOverview.tsx`
- Create: `apps/web/src/components/guild/GuildMembers.tsx`
- Create: `apps/web/src/components/guild/GuildActivityLog.tsx`
- Create: `apps/web/src/components/guild/GuildSettings.tsx`
- Create: `apps/web/src/components/guild/NoGuildView.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx` — keep as orchestrator

**Step 1: Read GuildScreen.tsx**

Identify sub-component functions defined within the file. Each becomes its own file with a props interface.

**Step 2: Extract one at a time**

Start with `NoGuildView` (simplest), then `GuildOverview`, `GuildMembers`, `GuildActivityLog`, `GuildSettings`. For each:
1. Create file with component and props interface
2. Move helper functions used only by that component
3. Import in GuildScreen.tsx
4. Run `npm run typecheck`

**Step 3: Extract shared formatters**

If `GuildScreen.tsx` contains `formatDuration`, `formatTimeRemaining`, or similar general-purpose formatters, move them to `apps/web/src/lib/format.ts`.

**Step 4:** Commit
```
refactor: split GuildScreen into separate sub-component files
```

---

### Task 20: Extract useAsyncAction hook

**Files:**
- Create: `apps/web/src/hooks/useAsyncAction.ts`
- Modify: Guild components that have repeated try/catch loading patterns

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

**Step 2: Replace duplicated patterns in guild components**

Search for repeated try/catch/setLoading/setError patterns in `GuildProjectsTab.tsx`, `GuildSpecializationTab.tsx`, and the newly extracted guild components.

**Step 3:** Run `npm run typecheck`

**Step 4:** Commit
```
refactor: extract useAsyncAction hook, deduplicate guild action handlers
```

---

## Phase 6: Backend — Consolidate Combat Orchestration

### Task 21: Extract combat orchestration service

The same combat setup + resolution + consequences pattern is duplicated across 3 route files with `runTemplateCombat`:
1. `apps/api/src/routes/combat/start.ts` — encounter site combat (2 calls, lines ~292, ~900)
2. `apps/api/src/routes/exploration/start.ts` — ambush combat (line ~342)
3. `apps/api/src/routes/zones.ts` — travel ambush combat (line ~403)

**Files:**
- Create: `apps/api/src/services/combatOrchestrationService.ts`
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/zones.ts`

**Step 1: Study the duplicated pattern**

Read all 4 call sites. Identify common steps:
1. Build player combat stats (`buildPlayerCombatStats`)
2. Build player template combatant
3. Build mob template combatant
4. Call `runTemplateCombat()`
5. Handle victory: set HP, roll loot, grant XP, record bestiary, update durability
6. Handle defeat: calculate flee, handle knockout/recovery
7. Create activity log

**Step 2: Create the service**

Design interfaces:
```typescript
interface TemplateCombatParams {
  playerId: string;
  mobTemplateId: string;
  mobLevel: number;
  // ... enough to build both combatants
  zoneId: string;
  zoneName: string;
  source: 'encounter_site' | 'zone_combat' | 'exploration_ambush' | 'travel_ambush';
  eventModifiers?: EventModifier[];
}

interface TemplateCombatOutcome {
  combatResult: ReturnType<typeof runTemplateCombat>;
  hpAfter: number;
  staminaAfter: number;
  manaAfter: number;
  xpGrants: SkillXpGrant[];
  loot: LootItem[];
  durabilityChanges: DurabilityChange[];
  // ... etc
}
```

Extract the common combat setup and processing into `executeTemplateCombat()`. Each calling route then only handles its specific context (encounter site room progression, exploration event list, travel abort).

**Step 3: Refactor each route file one at a time**

Start with `exploration/start.ts` (simplest use case — single ambush), then `zones.ts` (travel ambush), then `combat/start.ts` (most complex — encounter site rooms).

After each file, run `npm run typecheck`.

**Step 4:** Run `npm run typecheck && npm run test:api`

**Step 5:** Commit
```
refactor: extract combat orchestration service, consolidate combat flows
```

---

### Task 22: Extract activityLogService

**Files:**
- Create: `apps/api/src/services/activityLogService.ts`
- Modify: Route files that create activity logs inline

**Step 1: Find all inline activity log creation**

```bash
grep -rn "prisma.activityLog.create" apps/api/src/ --include="*.ts"
```

Known locations: `combat/start.ts`, `exploration/start.ts`, `zones.ts`, `gathering.ts`, `crafting/craft.ts`, `crafting/salvage.ts`, `crafting/forge.ts`, `resources.ts`, `hp.ts`, `achievementService.ts`

**Step 2: Create the service**

Read the actual `prisma.activityLog.create()` calls to understand the schema. Create typed helper functions:
- `createCombatActivityLog(params)`
- `createExplorationActivityLog(params)`
- `createCraftingActivityLog(params)`
- `createGatheringActivityLog(params)`
- Or a single generic `createActivityLog(type, playerId, result)` if the schema is uniform

**Step 3: Replace inline calls one file at a time**

**Step 4:** Run `npm run typecheck && npm run test:api`

**Step 5:** Commit
```
refactor: extract activityLogService for centralized logging
```

---

## Phase 7: Backend Cleanup

### Task 23: Split guildService.ts

`guildService.ts` is 723 lines with membership management functions mixed with core guild operations.

**Files:**
- Create: `apps/api/src/services/guildMembershipService.ts`
- Modify: `apps/api/src/services/guildService.ts`
- Modify: `apps/api/src/routes/guild.ts` — update imports

**Step 1: Extract membership functions**

Move these to `guildMembershipService.ts`:
- `joinGuild`, `leaveGuild`, `requestJoinGuild`, `listJoinRequests`
- `acceptJoinRequest`, `rejectJoinRequest`
- `kickMember`, `promoteMember`, `demoteMember`
- `transferLeadership`, `disbandGuild`

Keep `requireRole` in `guildService.ts` and export it so both files can use it.

**Step 2: Update route imports**

**Step 3:** Run `npm run typecheck && npm run test:api`

**Step 4:** Commit
```
refactor: split guildService into core + membership services
```

---

### Task 24: Export and reuse requireRole across guild services

**Files:**
- Modify: `apps/api/src/services/guildService.ts` — export `requireRole`
- Modify: `apps/api/src/services/guildProjectService.ts` — import and use `requireRole` if duplicated
- Modify: `apps/api/src/services/guildUpgradeService.ts` — import and use `requireRole` if duplicated
- Modify: `apps/api/src/services/guildSpecializationService.ts` — import and use `requireRole` if duplicated

**Step 1: Check for inline role checks**

```bash
grep -rn "role.*===.*officer\|role.*===.*leader\|membership.*role" apps/api/src/services/guild*.ts
```

If other guild services have inline membership-fetch-and-role-check patterns, replace them with `requireRole`.

**Step 2:** Run `npm run typecheck && npm run test:api`

**Step 3:** Commit
```
refactor: deduplicate guild role validation across services
```

---

## Phase 8: Final Verification

### Task 25: Full test suite and cleanup

**Step 1:** Run the complete test suite:
```bash
npm run typecheck && npm run test
```

All tests must pass. If any fail, investigate and fix.

**Step 2:** Run `npm run build` to verify full build succeeds.

**Step 3:** Check for any orphaned imports or unused files:
```bash
grep -rn "from.*combatHelpers\|from.*gameController.types\|from.*useActivityLog\|from.*usePlayerSettings" apps/web/src/ --include="*.ts" --include="*.tsx" | head -20
```

Verify the newly created files are properly imported.

**Step 4:** Commit any remaining cleanup:
```
refactor: final cleanup after codebase refactoring
```

---

## Summary

| Phase | Tasks | Risk | Impact |
|-------|-------|------|--------|
| 1: Zero-Risk Cleanup | 1-5 | Very Low | Remove dead code, extract utils, fix type duplication |
| 2: Shared UI Components | 6-9 | Low | Extract ModalOverlay, statEntries, SubNav, LoadingCard/ErrorBanner |
| 3: Settings Screen | 10 | Low | Extract 170-line inline settings to component |
| 4: useGameController Decomposition | 11-18 | Medium | Split 2,346-line god-hook into 7+ focused hooks |
| 5: Screen Component Splitting | 19-20 | Low | Split 1,044-line GuildScreen, add useAsyncAction |
| 6: Backend Combat Consolidation | 21-22 | Medium-High | Deduplicate combat flow across 3 routes, extract activity logging |
| 7: Backend Cleanup | 23-24 | Low | Split guild services, deduplicate role checks |
| 8: Final Verification | 25 | None | Full test suite validation |

**Total tasks:** 25
**Estimated autonomous execution time:** 4-6 hours
**Baseline:** All 1,220 tests pass, typecheck clean, on the `combat-rework` branch
