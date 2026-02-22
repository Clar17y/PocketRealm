# HP Visibility & Low-HP Warnings — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show player HP on Exploration and Combat screens, and warn before starting actions at low HP.

**Architecture:** Add `LOW_HP_WARNING_THRESHOLD` constant to shared package. Add `lowHpWarning` boolean preference to Player model (Prisma + API). Pass `hpState` to both screens, render inline `StatBar`, and intercept action buttons with a confirmation dialog when HP < 25%. Toggle in Settings.

**Tech Stack:** Prisma (migration), Express/Zod (API validation), React (StatBar component, inline modal pattern), TypeScript.

---

### Task 1: Add LOW_HP_WARNING_THRESHOLD constant

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:299-323` (HP_CONSTANTS block)

**Step 1: Add the threshold constant**

In `packages/shared/src/constants/gameConstants.ts`, add `LOW_HP_WARNING_THRESHOLD` inside `HP_CONSTANTS`. Find:

```typescript
  RECOVERY_EXIT_HP_PERCENT: 0.25,
} as const;
```

Replace with:

```typescript
  RECOVERY_EXIT_HP_PERCENT: 0.25,
  LOW_HP_WARNING_THRESHOLD: 0.25,
} as const;
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add LOW_HP_WARNING_THRESHOLD constant to HP_CONSTANTS"
```

---

### Task 2: Add lowHpWarning column to Prisma schema + migrate

**Files:**
- Modify: `packages/database/prisma/schema.prisma:48` (Player model, after `defaultRefiningMax`)

**Step 1: Add the column**

In `packages/database/prisma/schema.prisma`, find the Player model's preferences section. After:

```prisma
  defaultRefiningMax  Boolean @default(false) @map("default_refining_max")
```

Add:

```prisma
  lowHpWarning        Boolean @default(true)  @map("low_hp_warning")
```

**Step 2: Generate Prisma client + create migration**

Run: `npm run db:generate && npx prisma migrate dev --name add-low-hp-warning --schema packages/database/prisma/schema.prisma`
Expected: Migration created and applied successfully.

**Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add low_hp_warning column to Player model"
```

---

### Task 3: Extend API settings endpoint

**Files:**
- Modify: `apps/api/src/routes/player.ts:42-49` (GET /player select)
- Modify: `apps/api/src/routes/player.ts:125-128` (SETTINGS_FIELDS)
- Modify: `apps/api/src/routes/player.ts:130-138` (settingsSchema)

**Step 1: Add lowHpWarning to GET /player select**

In `apps/api/src/routes/player.ts`, find the `select` object in the GET /player route. After:

```typescript
      defaultRefiningMax: true,
```

Add:

```typescript
      lowHpWarning: true,
```

**Step 2: Add to SETTINGS_FIELDS**

Find `SETTINGS_FIELDS` constant. Change:

```typescript
const SETTINGS_FIELDS = [
  'autoPotionThreshold', 'combatLogSpeedMs', 'explorationSpeedMs',
  'autoSkipKnownCombat', 'defaultExploreTurns', 'quickRestHealPercent', 'defaultRefiningMax',
] as const;
```

To:

```typescript
const SETTINGS_FIELDS = [
  'autoPotionThreshold', 'combatLogSpeedMs', 'explorationSpeedMs',
  'autoSkipKnownCombat', 'defaultExploreTurns', 'quickRestHealPercent', 'defaultRefiningMax',
  'lowHpWarning',
] as const;
```

**Step 3: Add to settingsSchema**

Find `settingsSchema`. After:

```typescript
  defaultRefiningMax: z.boolean().optional(),
```

Add:

```typescript
  lowHpWarning: z.boolean().optional(),
```

**Step 4: Build API to verify**

Run: `npm run build:api`
Expected: Clean build, no errors.

**Step 5: Commit**

```bash
git add apps/api/src/routes/player.ts
git commit -m "feat: extend settings endpoint with lowHpWarning"
```

---

### Task 4: Extend frontend API types + useGameController state

**Files:**
- Modify: `apps/web/src/lib/api/player.ts:34-42` (PlayerSettings interface)
- Modify: `apps/web/src/app/game/useGameController.ts:425-432` (preference state)
- Modify: `apps/web/src/app/game/useGameController.ts:524-531` (loadAll player data)
- Modify: `apps/web/src/app/game/useGameController.ts:1640-1659` (handlers)
- Modify: `apps/web/src/app/game/useGameController.ts:1697+` (return object)

**Step 1: Add to PlayerSettings interface**

In `apps/web/src/lib/api/player.ts`, find `PlayerSettings` interface. After:

```typescript
  defaultRefiningMax?: boolean;
```

Add:

```typescript
  lowHpWarning?: boolean;
```

**Step 2: Add state variable in useGameController**

In `apps/web/src/app/game/useGameController.ts`, find the preference state block. After:

```typescript
const [defaultRefiningMax, setDefaultRefiningMax] = useState(false);
```

Add:

```typescript
const [lowHpWarning, setLowHpWarning] = useState(true);
```

**Step 3: Load from player data**

In the `loadAll` function, find where preferences are loaded from `playerRes.data`. After:

```typescript
setDefaultRefiningMax(playerRes.data.player.defaultRefiningMax ?? false);
```

Add:

```typescript
setLowHpWarning(playerRes.data.player.lowHpWarning ?? true);
```

**Step 4: Add handler**

Find the preference handler section (near `handleSetDefaultRefiningMax`). After the last handler, add:

```typescript
const handleSetLowHpWarning = (value: boolean) =>
  handleSetSetting('lowHpWarning', value, setLowHpWarning, lowHpWarning);
```

**Step 5: Add to return object**

Find the return object of useGameController. Add alongside the other preference exports:

```typescript
lowHpWarning,
handleSetLowHpWarning,
```

**Step 6: Build to verify**

Run: `npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine`
Expected: Clean build.

**Step 7: Commit**

```bash
git add apps/web/src/lib/api/player.ts apps/web/src/app/game/useGameController.ts
git commit -m "feat: add lowHpWarning state to frontend API types and game controller"
```

---

### Task 5: Add HP bar to Exploration screen

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx:15-48` (props interface)
- Modify: `apps/web/src/components/screens/Exploration.tsx:69-74` (after knockout banner)
- Modify: `apps/web/src/app/game/page.tsx:416-417` (pass HP props to Exploration)

**Step 1: Extend ExplorationProps**

In `apps/web/src/components/screens/Exploration.tsx`, find the props interface. Add these new props alongside the existing `isRecovering` and `recoveryCost`:

```typescript
  currentHp?: number;
  maxHp?: number;
  regenPerSecond?: number;
```

**Step 2: Destructure the new props**

Find where props are destructured in the component function. Add `currentHp`, `maxHp`, `regenPerSecond` to the destructuring.

**Step 3: Add StatBar import**

Add at top of file:

```typescript
import { StatBar } from '../StatBar';
```

**Step 4: Render HP bar**

After the knockout banner block (after `{isRecovering && !playbackData && (<KnockoutBanner ... />)}`) and before the zone header card, add:

```tsx
{/* HP Status */}
{!playbackData && typeof currentHp === 'number' && typeof maxHp === 'number' && !isRecovering && (
  <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3">
    <div className="flex items-center justify-between mb-1">
      <span className={`text-sm font-bold font-mono ${
        (currentHp / maxHp) < 0.25 ? 'text-[var(--rpg-red)]'
        : (currentHp / maxHp) < 0.5 ? 'text-yellow-400'
        : 'text-[var(--rpg-green-light)]'
      }`}>
        {Math.floor(currentHp)} / {maxHp} HP
      </span>
      {typeof regenPerSecond === 'number' && (
        <span className="text-xs text-[var(--rpg-text-secondary)]">+{regenPerSecond}/s</span>
      )}
    </div>
    <StatBar current={currentHp} max={maxHp} color="health" size="sm" showNumbers={false} />
  </div>
)}
```

**Step 5: Wire HP props in page.tsx**

In `apps/web/src/app/game/page.tsx`, find where `<Exploration` is rendered. After the existing `recoveryCost` prop, add:

```tsx
currentHp={hpState.currentHp}
maxHp={hpState.maxHp}
regenPerSecond={hpState.regenPerSecond}
```

**Step 6: Visual verification**

Run: `npm run dev:web`
Navigate to Exploration screen. Verify HP bar appears between knockout banner area and zone header. Check color changes by comparing current HP percentage.

**Step 7: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: add inline HP bar to Exploration screen"
```

---

### Task 6: Add HP bar to Combat screen

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx:206-209` (after knockout banner)

**Step 1: Add StatBar import**

In `apps/web/src/app/game/screens/CombatScreen.tsx`, add:

```typescript
import { StatBar } from '../../../components/StatBar';
```

Check the existing imports to verify the correct relative path. The file is at `apps/web/src/app/game/screens/CombatScreen.tsx` and StatBar is at `apps/web/src/components/StatBar.tsx`.

**Step 2: Render HP bar**

After the knockout banner block (`{hpState.isRecovering && (<KnockoutBanner ... />)}`) and before the tab buttons / encounter list, add:

```tsx
{/* HP Status */}
{!combatPlaybackData && !hpState.isRecovering && (
  <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3">
    <div className="flex items-center justify-between mb-1">
      <span className={`text-sm font-bold font-mono ${
        (hpState.currentHp / hpState.maxHp) < 0.25 ? 'text-[var(--rpg-red)]'
        : (hpState.currentHp / hpState.maxHp) < 0.5 ? 'text-yellow-400'
        : 'text-[var(--rpg-green-light)]'
      }`}>
        {Math.floor(hpState.currentHp)} / {hpState.maxHp} HP
      </span>
      <span className="text-xs text-[var(--rpg-text-secondary)]">+{hpState.regenPerSecond}/s</span>
    </div>
    <StatBar current={hpState.currentHp} max={hpState.maxHp} color="health" size="sm" showNumbers={false} />
  </div>
)}
```

Note: Use `combatPlaybackData` (or whatever the variable name is for active combat playback) to hide the HP bar during combat animation — check the component's existing variables.

**Step 3: Visual verification**

Run: `npm run dev:web`
Navigate to Combat screen with encounter sites. Verify HP bar appears above encounter list.

**Step 4: Commit**

```bash
git add apps/web/src/app/game/screens/CombatScreen.tsx
git commit -m "feat: add inline HP bar to Combat screen"
```

---

### Task 7: Add low-HP confirmation dialog to Exploration screen

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx` (props + dialog + handler)
- Modify: `apps/web/src/app/game/page.tsx` (pass lowHpWarning prop)

**Step 1: Add lowHpWarning prop**

In `Exploration.tsx`, add to the props interface:

```typescript
  lowHpWarning?: boolean;
```

Destructure it in the component function.

**Step 2: Add dialog state**

Inside the component function, add:

```typescript
const [showLowHpWarning, setShowLowHpWarning] = useState(false);
```

Add `useState` to the React import if not already present.

**Step 3: Import the threshold constant**

```typescript
import { HP_CONSTANTS } from '@adventure/shared';
```

Check the existing imports — `@adventure/shared` may already be imported. If so, add `HP_CONSTANTS` to the existing import.

**Step 4: Modify the Start Exploration button**

Change the button's `onClick` from directly calling `onStartExploration` to checking HP first:

```tsx
onClick={() => {
  if (
    lowHpWarning &&
    typeof currentHp === 'number' && typeof maxHp === 'number' &&
    maxHp > 0 && (currentHp / maxHp) < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD
  ) {
    setShowLowHpWarning(true);
  } else {
    onStartExploration(turnInvestment[0]);
  }
}}
```

**Step 5: Add the confirmation dialog**

At the top of the component's return JSX (inside the outer `<div>`), add the modal overlay:

```tsx
{/* Low HP Warning Dialog */}
{showLowHpWarning && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
    <div className="bg-[var(--rpg-bg-dark,#1a1a2e)] border border-[var(--rpg-gold,#c8a84e)] rounded-lg p-6 max-w-sm w-full mx-4">
      <h3 className="text-[var(--rpg-gold,#c8a84e)] font-bold text-lg mb-1">Low HP Warning</h3>
      <p className="text-[var(--rpg-light-dim,#a0a0b0)] text-sm mb-4">
        Your health is low ({Math.floor(currentHp!)} / {maxHp} HP). Exploring or fighting in this state is risky.
      </p>
      <div className="flex gap-3">
        <button
          className="flex-1 bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold py-2 transition-all"
          onClick={() => {
            setShowLowHpWarning(false);
            onStartExploration(turnInvestment[0]);
          }}
        >
          Proceed Anyway
        </button>
        <button
          className="flex-1 bg-[var(--rpg-surface)] hover:bg-[var(--rpg-border)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] rounded-lg font-semibold py-2 transition-all"
          onClick={() => setShowLowHpWarning(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 6: Wire lowHpWarning prop in page.tsx**

In `apps/web/src/app/game/page.tsx`, find the `<Exploration` render. Add:

```tsx
lowHpWarning={lowHpWarning}
```

Also destructure `lowHpWarning` from the `useGameController` return in page.tsx (find where other preferences like `autoSkipKnownCombat` are destructured).

**Step 7: Visual verification**

Run: `npm run dev:web`
Test: Lower HP below 25% (via combat), then try to start exploration. Confirm dialog should appear. Clicking "Proceed Anyway" should start exploration. Clicking "Cancel" should dismiss.

**Step 8: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: add low-HP confirmation dialog to Exploration screen"
```

---

### Task 8: Add low-HP confirmation dialog to Combat screen

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx` (props + dialog + handler)
- Modify: `apps/web/src/app/game/page.tsx` (pass lowHpWarning prop)

**Step 1: Add lowHpWarning prop**

In `CombatScreen.tsx`, add to the props interface:

```typescript
  lowHpWarning?: boolean;
```

Destructure it.

**Step 2: Add dialog state**

```typescript
const [lowHpPendingSite, setLowHpPendingSite] = useState<PendingEncounter | null>(null);
```

This stores the site the player tried to fight, so we can proceed after confirmation.

**Step 3: Import the threshold constant**

```typescript
import { HP_CONSTANTS } from '@adventure/shared';
```

Check existing imports — may already be imported.

**Step 4: Modify handleFightClick**

Change `handleFightClick` to check HP first:

```typescript
const handleFightClick = (site: PendingEncounter) => {
  if (
    lowHpWarning &&
    hpState.maxHp > 0 &&
    (hpState.currentHp / hpState.maxHp) < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD
  ) {
    setLowHpPendingSite(site);
    return;
  }
  if (!site.clearStrategy) {
    setStrategyModalSite(site);
  } else {
    void onStartCombat(site.encounterSiteId);
  }
};
```

**Step 5: Add helper for proceeding after confirmation**

```typescript
const proceedWithFight = (site: PendingEncounter) => {
  setLowHpPendingSite(null);
  if (!site.clearStrategy) {
    setStrategyModalSite(site);
  } else {
    void onStartCombat(site.encounterSiteId);
  }
};
```

**Step 6: Add the confirmation dialog**

After the strategy modal block and before the knockout banner, add:

```tsx
{/* Low HP Warning Dialog */}
{lowHpPendingSite && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
    <div className="bg-[var(--rpg-bg-dark,#1a1a2e)] border border-[var(--rpg-gold,#c8a84e)] rounded-lg p-6 max-w-sm w-full mx-4">
      <h3 className="text-[var(--rpg-gold,#c8a84e)] font-bold text-lg mb-1">Low HP Warning</h3>
      <p className="text-[var(--rpg-light-dim,#a0a0b0)] text-sm mb-4">
        Your health is low ({Math.floor(hpState.currentHp)} / {hpState.maxHp} HP). Exploring or fighting in this state is risky.
      </p>
      <div className="flex gap-3">
        <button
          className="flex-1 bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold py-2 transition-all"
          onClick={() => proceedWithFight(lowHpPendingSite)}
        >
          Proceed Anyway
        </button>
        <button
          className="flex-1 bg-[var(--rpg-surface)] hover:bg-[var(--rpg-border)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] rounded-lg font-semibold py-2 transition-all"
          onClick={() => setLowHpPendingSite(null)}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

**Step 7: Wire lowHpWarning prop in page.tsx**

In `apps/web/src/app/game/page.tsx`, find where `<CombatScreen` is rendered. Add:

```tsx
lowHpWarning={lowHpWarning}
```

**Step 8: Visual verification**

Run: `npm run dev:web`
Test: With HP below 25%, click Fight on an encounter site. Dialog should appear. "Proceed Anyway" should continue to strategy selection (or direct fight if strategy already set). "Cancel" should dismiss.

**Step 9: Commit**

```bash
git add apps/web/src/app/game/screens/CombatScreen.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: add low-HP confirmation dialog to Combat screen"
```

---

### Task 9: Add settings toggle for low-HP warning

**Files:**
- Modify: `apps/web/src/app/game/page.tsx:892-909` (settings Combat section)

**Step 1: Add toggle to Combat section**

In `apps/web/src/app/game/page.tsx`, find the Settings screen's Combat section. After the Auto-Potion Threshold block (the closing `</div>` of that block), add:

```tsx
<div>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-xs text-[var(--rpg-text-secondary)]">Low HP Warning</p>
      <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60">Show confirmation when starting actions below 25% HP</p>
    </div>
    <ToggleSwitch checked={lowHpWarning} onChange={handleSetLowHpWarning} />
  </div>
</div>
```

**Step 2: Destructure handleSetLowHpWarning**

Ensure `handleSetLowHpWarning` is destructured from `useGameController` return alongside the other preference handlers. Find where `handleSetDefaultRefiningMax` is destructured and add `handleSetLowHpWarning` there.

**Step 3: Visual verification**

Run: `npm run dev:web`
Navigate to Settings. Verify "Low HP Warning" toggle appears in Combat section after Auto-Potion Threshold. Toggle it off, then try fighting/exploring with low HP — dialog should not appear. Toggle it on — dialog should reappear.

**Step 4: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: add low-HP warning toggle to Settings screen"
```

---

### Task 10: Final build verification + typecheck

**Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: No new errors (pre-existing error in `page.tsx:333` is known and acceptable).

**Step 2: Run tests**

Run: `npm run test`
Expected: All existing tests pass.

**Step 3: Full build**

Run: `npm run build`
Expected: Clean build.

**Step 4: Final commit (if any fixes needed)**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: resolve typecheck/build issues from HP visibility feature"
```
