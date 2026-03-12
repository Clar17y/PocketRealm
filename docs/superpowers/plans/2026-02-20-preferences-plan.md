# User Preferences System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 server-side user preferences (combat speed, exploration speed, auto-skip combat, default explore turns, quick-rest heal %, default refining max) and a Settings screen to configure them.

**Architecture:** Extend the existing `Player` model with 6 new columns, expand `PATCH /player/settings` to accept them, rename the Profile screen to Settings, and wire each preference into its respective UI component.

**Tech Stack:** Prisma (migration), Express + Zod (API validation), React + Next.js (frontend), existing PixelCard/Slider/PixelButton components.

**Design doc:** `docs/superpowers/specs/2026-02-20-preferences-design.md`

---

### Task 1: Database Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:37` (Player model, after `autoPotionThreshold`)

**Step 1: Add preference columns to Player model**

In `packages/database/prisma/schema.prisma`, after line 37 (`autoPotionThreshold`), add:

```prisma
  combatLogSpeedMs    Int     @default(800)  @map("combat_log_speed_ms")
  explorationSpeedMs  Int     @default(800)  @map("exploration_speed_ms")
  autoSkipKnownCombat Boolean @default(false) @map("auto_skip_known_combat")
  defaultExploreTurns Int     @default(100)  @map("default_explore_turns")
  quickRestHealPercent Int    @default(100)  @map("quick_rest_heal_percent")
  defaultRefiningMax  Boolean @default(false) @map("default_refining_max")
```

**Step 2: Run migration**

```bash
npm run db:migrate -- --name add_player_preferences
```

Expected: Migration created successfully, 6 new columns with defaults applied to existing rows.

**Step 3: Generate Prisma client**

```bash
npm run db:generate
```

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add player preference columns to schema"
```

---

### Task 2: Backend API — Extend Settings Endpoint

**Files:**
- Modify: `apps/api/src/routes/player.ts:29-40` (GET select), `apps/api/src/routes/player.ts:130-152` (PATCH settings)

**Step 1: Add preference fields to GET /player select**

In `apps/api/src/routes/player.ts`, add to the `select` object (after `autoPotionThreshold: true` on line 39):

```typescript
        combatLogSpeedMs: true,
        explorationSpeedMs: true,
        autoSkipKnownCombat: true,
        defaultExploreTurns: true,
        quickRestHealPercent: true,
        defaultRefiningMax: true,
```

**Step 2: Update the Zod schema and PATCH handler**

Replace the `settingsSchema` (line 130-132) with:

```typescript
const settingsSchema = z.object({
  autoPotionThreshold: z.number().int().min(0).max(100).optional(),
  combatLogSpeedMs: z.number().int().min(100).max(1000).optional(),
  explorationSpeedMs: z.number().int().min(100).max(1000).optional(),
  autoSkipKnownCombat: z.boolean().optional(),
  defaultExploreTurns: z.number().int().min(10).max(10000).optional(),
  quickRestHealPercent: z.number().int().min(25).max(100).optional(),
  defaultRefiningMax: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one setting required' });
```

Replace the PATCH handler body (lines 138-152) with:

```typescript
playerRouter.patch('/settings', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = settingsSchema.parse(req.body);

    const updated = await prismaAny.player.update({
      where: { id: playerId },
      data: body,
      select: {
        autoPotionThreshold: true,
        combatLogSpeedMs: true,
        explorationSpeedMs: true,
        autoSkipKnownCombat: true,
        defaultExploreTurns: true,
        quickRestHealPercent: true,
        defaultRefiningMax: true,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
```

**Step 3: Verify API compiles**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/player.ts
git commit -m "feat: extend settings endpoint with all preference fields"
```

---

### Task 3: Frontend API Types

**Files:**
- Modify: `apps/web/src/lib/api.ts:198-226` (getPlayer type + updatePlayerSettings)

**Step 1: Add preference fields to getPlayer return type**

In `apps/web/src/lib/api.ts`, inside the `getPlayer` return type (after `autoPotionThreshold: number;` on line 208), add:

```typescript
      combatLogSpeedMs: number;
      explorationSpeedMs: number;
      autoSkipKnownCombat: boolean;
      defaultExploreTurns: number;
      quickRestHealPercent: number;
      defaultRefiningMax: boolean;
```

**Step 2: Update updatePlayerSettings types**

Replace the `updatePlayerSettings` function (lines 221-226) with:

```typescript
export interface PlayerSettings {
  autoPotionThreshold?: number;
  combatLogSpeedMs?: number;
  explorationSpeedMs?: number;
  autoSkipKnownCombat?: boolean;
  defaultExploreTurns?: number;
  quickRestHealPercent?: number;
  defaultRefiningMax?: boolean;
}

export async function updatePlayerSettings(settings: PlayerSettings) {
  return fetchApi<PlayerSettings>('/api/v1/player/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat: add preference types to frontend API client"
```

---

### Task 4: Rename Profile Screen to Settings

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:46,733` (Screen type + getActiveTab)
- Modify: `apps/web/src/components/BottomNav.tsx:18` (nav label)
- Modify: `apps/web/src/app/game/page.tsx:774` (case label)
- Search-and-replace `'profile'` → `'settings'` in any other references

**Step 1: Update Screen type union**

In `useGameController.ts` line 46, change `| 'profile'` to `| 'settings'`.

**Step 2: Update getActiveTab mapping**

In `useGameController.ts` line 733, change `return 'profile';` to `return 'settings';`.

**Step 3: Update BottomNav**

In `BottomNav.tsx` line 18, change:
```typescript
{ id: 'profile', label: 'Profile', icon: 'settings' as UiIconName },
```
to:
```typescript
{ id: 'settings', label: 'Settings', icon: 'settings' as UiIconName },
```

**Step 4: Update page.tsx case**

In `page.tsx` line 774, change `case 'profile':` to `case 'settings':`.
Also change the heading text on line 777 from `Profile` to `Settings`.

**Step 5: Search for any remaining 'profile' screen references**

```bash
grep -rn "'profile'" apps/web/src/ --include="*.ts" --include="*.tsx"
```

Update any remaining references.

**Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "refactor: rename profile screen to settings"
```

---

### Task 5: useGameController — Preference State & Handlers

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Add preference state variables**

After `autoPotionThreshold` state (line 396), add:

```typescript
  const [combatLogSpeedMs, setCombatLogSpeedMs] = useState(800);
  const [explorationSpeedMs, setExplorationSpeedMs] = useState(800);
  const [autoSkipKnownCombat, setAutoSkipKnownCombat] = useState(false);
  const [defaultExploreTurns, setDefaultExploreTurns] = useState(100);
  const [quickRestHealPercent, setQuickRestHealPercent] = useState(100);
  const [defaultRefiningMax, setDefaultRefiningMax] = useState(false);
```

**Step 2: Load preferences from player data**

After line 478 (`setAutoPotionThreshold(...)`), add:

```typescript
      setCombatLogSpeedMs(playerRes.data.player.combatLogSpeedMs ?? 800);
      setExplorationSpeedMs(playerRes.data.player.explorationSpeedMs ?? 800);
      setAutoSkipKnownCombat(playerRes.data.player.autoSkipKnownCombat ?? false);
      setDefaultExploreTurns(playerRes.data.player.defaultExploreTurns ?? 100);
      setQuickRestHealPercent(playerRes.data.player.quickRestHealPercent ?? 100);
      setDefaultRefiningMax(playerRes.data.player.defaultRefiningMax ?? false);
```

**Step 3: Create generic settings update handler**

Replace `handleSetAutoPotionThreshold` (lines 1432-1437) with a generic handler:

```typescript
  const handleUpdateSetting = async <K extends keyof PlayerSettings>(
    key: K,
    value: NonNullable<PlayerSettings[K]>,
    setter: (v: NonNullable<PlayerSettings[K]>) => void,
    prevValue: NonNullable<PlayerSettings[K]>,
  ) => {
    setter(value);
    const res = await updatePlayerSettings({ [key]: value });
    if (!res.data) setter(prevValue);
  };

  const handleSetAutoPotionThreshold = (value: number) =>
    handleUpdateSetting('autoPotionThreshold', value, setAutoPotionThreshold, autoPotionThreshold);
  const handleSetCombatLogSpeed = (value: number) =>
    handleUpdateSetting('combatLogSpeedMs', value, setCombatLogSpeedMs, combatLogSpeedMs);
  const handleSetExplorationSpeed = (value: number) =>
    handleUpdateSetting('explorationSpeedMs', value, setExplorationSpeedMs, explorationSpeedMs);
  const handleSetAutoSkipKnownCombat = (value: boolean) =>
    handleUpdateSetting('autoSkipKnownCombat', value, setAutoSkipKnownCombat, autoSkipKnownCombat);
  const handleSetDefaultExploreTurns = (value: number) =>
    handleUpdateSetting('defaultExploreTurns', value, setDefaultExploreTurns, defaultExploreTurns);
  const handleSetQuickRestHealPercent = (value: number) =>
    handleUpdateSetting('quickRestHealPercent', value, setQuickRestHealPercent, quickRestHealPercent);
  const handleSetDefaultRefiningMax = (value: boolean) =>
    handleUpdateSetting('defaultRefiningMax', value, setDefaultRefiningMax, defaultRefiningMax);
```

Import `PlayerSettings` from `@/lib/api` at the top of the file.

**Step 4: Export all preference state and handlers**

Add to the return object (after existing autoPotionThreshold exports):

```typescript
    combatLogSpeedMs,
    explorationSpeedMs,
    autoSkipKnownCombat,
    defaultExploreTurns,
    quickRestHealPercent,
    defaultRefiningMax,
    setCombatLogSpeedMs,
    setExplorationSpeedMs,
    setAutoSkipKnownCombat,
    setDefaultExploreTurns,
    setQuickRestHealPercent,
    setDefaultRefiningMax,
    handleSetCombatLogSpeed,
    handleSetExplorationSpeed,
    handleSetAutoSkipKnownCombat,
    handleSetDefaultExploreTurns,
    handleSetQuickRestHealPercent,
    handleSetDefaultRefiningMax,
```

**Step 5: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: add preference state and handlers to game controller"
```

---

### Task 6: Settings Screen UI

**Files:**
- Modify: `apps/web/src/app/game/page.tsx:774-807` (settings case)

**Step 1: Destructure new preferences from useGameController**

Add to the destructuring (near line 250):

```typescript
    combatLogSpeedMs,
    setCombatLogSpeedMs,
    handleSetCombatLogSpeed,
    explorationSpeedMs,
    setExplorationSpeedMs,
    handleSetExplorationSpeed,
    autoSkipKnownCombat,
    handleSetAutoSkipKnownCombat,
    defaultExploreTurns,
    setDefaultExploreTurns,
    handleSetDefaultExploreTurns,
    quickRestHealPercent,
    handleSetQuickRestHealPercent,
    defaultRefiningMax,
    handleSetDefaultRefiningMax,
```

**Step 2: Replace the settings case**

Replace the `case 'settings':` block (formerly `case 'profile':`) with the full Settings UI. The screen should have PixelCard sections for:

1. **Profile** — Username display (keep existing)
2. **Combat** section:
   - Combat Log Speed slider (100–1000, step 100) with descriptive label
   - Auto-Skip Known Combat toggle (checkbox or switch)
   - Auto-Potion Threshold slider (0–100, step 5) — moved from standalone
3. **Exploration** section:
   - Exploration Playback Speed slider (100–1000, step 100)
   - Default Explore Turns slider (10–10000, step 10)
4. **Recovery** section:
   - Quick-Rest Heal Target (25/50/75/100% buttons, like the TurnPresets pattern)
5. **Crafting** section:
   - Default Refining to Max toggle
6. **Account** section:
   - Logout button (keep existing)

For speed sliders, show a label like: "Very Fast" (100ms), "Fast" (300ms), "Normal" (500ms), "Slow" (800ms), "Very Slow" (1000ms). Use the existing `Slider` + `onValueChange`/`onValueCommit` pattern.

For toggles, use a simple styled button/checkbox that calls the handler on click.

**Step 3: Verify it renders**

```bash
npm run dev:web
```

Navigate to Settings screen, verify all controls appear and function.

**Step 4: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: build settings screen with all preference controls"
```

---

### Task 7: Combat Playback Speed Integration

**Files:**
- Modify: `apps/web/src/components/combat/CombatPlayback.tsx:11-23,53` (props + timeout)
- Modify: `apps/web/src/app/game/page.tsx` (pass prop where CombatPlayback is used)

**Step 1: Add speed prop to CombatPlayback**

In `CombatPlayback.tsx`, add to props interface (line 11-23):

```typescript
  speedMs?: number;
```

In the component destructuring (line 25-37), add with default:

```typescript
  speedMs = 800,
```

**Step 2: Use the prop instead of hardcoded 800**

On line 53, change `}, 800);` to `}, speedMs);`.

**Step 3: Pass the prop from page.tsx**

Find where `<CombatPlayback` is rendered in `page.tsx` and add `speedMs={combatLogSpeedMs}`.

**Step 4: Commit**

```bash
git add apps/web/src/components/combat/CombatPlayback.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: wire combat playback speed to user preference"
```

---

### Task 8: Exploration Playback Speed Integration

**Files:**
- Modify: `apps/web/src/components/exploration/ExplorationPlayback.tsx:12-23,100-129` (props + timings)
- Modify: parent that renders ExplorationPlayback (likely `Exploration.tsx` or `page.tsx`)

**Step 1: Add speed prop to ExplorationPlayback**

Add to props interface:

```typescript
  speedMs?: number;
```

Add to destructuring with default:

```typescript
  speedMs = 800,
```

**Step 2: Scale all timings proportionally**

The baseline ratio is: 800ms advance : 2500ms event pause : 2000ms final fill.

Replace the hardcoded values:
- Line 119: `}, 800)` → `}, speedMs)`
- Line 118: `}, 2500)` → `}, Math.round(speedMs * 2500 / 800))`
- Line 129: `}, 2000)` → `}, Math.round(speedMs * 2000 / 800))`

**Step 3: Pass the prop from the parent component**

Find where `<ExplorationPlayback` is rendered and add `speedMs={explorationSpeedMs}`.

**Step 4: Commit**

```bash
git add apps/web/src/components/exploration/ExplorationPlayback.tsx
git commit -m "feat: wire exploration playback speed to user preference"
```

---

### Task 9: Auto-Skip Known Combat

**Files:**
- Modify: `apps/web/src/components/combat/CombatPlayback.tsx` (auto-skip logic)
- Modify: parent that renders CombatPlayback (pass bestiary + pref)

**Step 1: Add auto-skip props to CombatPlayback**

Add to props interface:

```typescript
  autoSkip?: boolean;
```

**Step 2: Implement auto-skip logic**

In the component body, add an effect that fires on mount. If `autoSkip` is true, immediately set `revealedCount` to `log.length` and transition to the finished phase (same as the existing skip button behavior).

```typescript
  useEffect(() => {
    if (autoSkip) {
      setRevealedCount(log.length);
      setPhase(outcome === 'victory' ? 'finished-auto' : 'finished-manual');
    }
  }, []);  // only on mount
```

**Step 3: Determine autoSkip in the parent**

In the parent component (likely `page.tsx` or `CombatScreen`), compute `autoSkip` before rendering CombatPlayback:

```typescript
const shouldAutoSkip = autoSkipKnownCombat && (() => {
  if (!combatPlaybackData || !bestiaryMobs) return false;
  const mob = bestiaryMobs.find(m => m.name === combatPlaybackData.mobName /* or match by ID */);
  if (!mob || !mob.isDiscovered) return false;
  // Check prefix: if combat has a prefix, verify it's in prefixesEncountered
  if (combatPlaybackData.mobPrefix) {
    return mob.prefixesEncountered.includes(combatPlaybackData.mobPrefix);
  }
  return true; // unprefixed mob, already killed
})();
```

Pass `autoSkip={shouldAutoSkip}` to `<CombatPlayback>`.

**Note:** The exact field names for mob name/prefix on combatPlaybackData need to be verified at implementation time. Check the `LastCombat` type and how `combatPlaybackData` is structured in `useGameController`.

**Step 4: Commit**

```bash
git add apps/web/src/components/combat/CombatPlayback.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: auto-skip combat playback for known mob+prefix combos"
```

---

### Task 10: Default Explore Turns

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx:46-47` (props + default)

**Step 1: Add prop to Exploration**

Add to `ExplorationProps` interface (line 15):

```typescript
  defaultTurns?: number;
```

**Step 2: Use the prop**

Change line 47 from:
```typescript
  const [turnInvestment, setTurnInvestment] = useState([Math.min(100, availableTurns)]);
```
to:
```typescript
  const [turnInvestment, setTurnInvestment] = useState([Math.min(defaultTurns ?? 100, availableTurns)]);
```

**Step 3: Pass from parent**

In `page.tsx`, find where `<Exploration` is rendered and add `defaultTurns={defaultExploreTurns}`.

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: use default explore turns preference"
```

---

### Task 11: Quick Rest Button on Dashboard

**Files:**
- Modify: `apps/web/src/components/screens/Dashboard.tsx:123-172` (HP card area)
- Modify: `apps/web/src/app/game/page.tsx` (pass props)
- Modify: `apps/web/src/app/game/useGameController.ts` (add quick-rest handler)

**Step 1: Add quick-rest handler to useGameController**

Add a `handleQuickRest` function:

```typescript
  const handleQuickRest = async () => {
    if (!hpState || hpState.currentHp >= hpState.maxHp || hpState.isRecovering) return;

    // Fetch estimate to get healPerTurn
    const estimate = await api.restEstimate(10);
    if (!estimate.data?.healPerTurn) return;

    const missingHp = hpState.maxHp - hpState.currentHp;
    const targetHeal = missingHp * (quickRestHealPercent / 100);
    const rawTurns = Math.ceil(targetHeal / estimate.data.healPerTurn);
    const turns = Math.max(10, Math.ceil(rawTurns / 10) * 10);

    const result = await api.rest(Math.min(turns, currentTurns));
    if (result.data) {
      setTurns(result.data.turns.currentTurns);
      setHpState(prev => prev ? { ...prev, currentHp: result.data!.currentHp, maxHp: result.data!.maxHp } : prev);
    }
  };
```

Export it from the return object.

**Step 2: Add quick-rest prop to Dashboard**

Add to Dashboard props:

```typescript
  onQuickRest?: () => void;
  quickRestEnabled?: boolean;
```

**Step 3: Add Quick Rest button to Dashboard HP card**

Inside the HP PixelCard (after the HP bar, before the closing `</PixelCard>`), add a small button:

```tsx
{quickRestEnabled && !playerData.isRecovering && playerData.currentHp < playerData.maxHp && (
  <PixelButton
    variant="secondary"
    className="mt-2 w-full text-xs"
    onClick={onQuickRest}
  >
    Quick Rest ({quickRestHealPercent}%)
  </PixelButton>
)}
```

**Step 4: Pass props from page.tsx**

```tsx
<Dashboard
  ...
  onQuickRest={handleQuickRest}
  quickRestEnabled={quickRestHealPercent > 0}
/>
```

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Dashboard.tsx apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx
git commit -m "feat: add quick rest button to dashboard"
```

---

### Task 12: Default Refining to Max

**Files:**
- Modify: `apps/web/src/components/screens/Crafting.tsx:84,163` (default quantity)
- Modify: `apps/web/src/app/game/page.tsx` (pass prop)

**Step 1: Add prop to Crafting**

Add to `CraftingProps` interface:

```typescript
  defaultMaxQuantity?: boolean;
```

**Step 2: Use the prop when selecting a recipe**

Change the recipe click handler on line 163 from:
```typescript
onClick={() => { setSelectedRecipeId(recipe.id); setQuantity(1); }}
```
to:
```typescript
onClick={() => {
  setSelectedRecipeId(recipe.id);
  setQuantity(defaultMaxQuantity ? (/* compute max for this recipe */) : 1);
}}
```

The max quantity is already computed as `selectedMax` (check the existing code for how it's calculated). Since `selectedMax` depends on `selectedRecipeId` which is being set in the same click, use a `useEffect` instead:

Add an effect after the existing quantity-clamping effect (line 118-120):

```typescript
  useEffect(() => {
    if (defaultMaxQuantity && selectedMax) {
      setQuantity(selectedMax);
    }
  }, [selectedRecipeId, selectedMax, defaultMaxQuantity]);
```

This will auto-set quantity to max whenever the recipe changes and the pref is enabled.

**Step 3: Pass from page.tsx**

Only pass `defaultMaxQuantity={defaultRefiningMax}` when the active crafting skill tab is `'refining'`. In `page.tsx`, find where `<Crafting` is rendered:

```tsx
<Crafting
  ...
  defaultMaxQuantity={activeCraftingSkill === 'refining' && defaultRefiningMax}
/>
```

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Crafting.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: default refining quantity to max when preference enabled"
```

---

### Task 13: Final Verification & Cleanup

**Step 1: Type check entire project**

```bash
npm run typecheck
```

Fix any errors.

**Step 2: Run all tests**

```bash
npm run test
```

Fix any failures.

**Step 3: Manual testing checklist**

- [ ] Settings screen renders with all sections
- [ ] Each slider/toggle saves and persists across page refresh
- [ ] Combat playback respects speed setting (try 100ms and 1000ms)
- [ ] Exploration playback respects speed setting
- [ ] Auto-skip works for previously killed mob+prefix, doesn't skip for new ones
- [ ] Default explore turns applies when opening Exploration screen
- [ ] Quick Rest button appears on Dashboard when HP < max
- [ ] Quick Rest button heals correct amount and disappears when full HP
- [ ] Refining defaults to max quantity, other crafting skills default to 1
- [ ] Settings persist after logout/login

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup for preferences system"
```
