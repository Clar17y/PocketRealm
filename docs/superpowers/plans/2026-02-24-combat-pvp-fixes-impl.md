# Combat & PvP Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three bugs: auto-skip not applying to exploration ambushes, PvP/boss knockouts not triggering death achievements, and PvP rating panel spoiling outcome during replay.

**Architecture:** All three fixes are surgical — threading props through components, adding a missing function call, and reordering an async call. No new files, no schema changes.

**Tech Stack:** TypeScript, React (frontend), Express (backend)

---

### Task 1: Thread auto-skip props through TurnPlayback

**Files:**
- Modify: `apps/web/src/components/playback/TurnPlayback.tsx`

The `TurnPlayback` component needs two new optional props so it can decide whether to auto-skip ambush combat. It will compute the bestiary check and pass `autoSkip` to `CombatPlayback`.

**Step 1: Add props and compute auto-skip**

Add `autoSkipKnownCombat` and `bestiaryMobs` to the props interface, then use them when rendering `CombatPlayback`:

```typescript
// In TurnPlaybackProps interface, add after explorationSpeedMs:
  autoSkipKnownCombat?: boolean;
  bestiaryMobs?: Array<{ id: string; isDiscovered: boolean; prefixesEncountered: string[] }>;
```

```typescript
// In function signature destructuring, add after explorationSpeedMs:
  autoSkipKnownCombat,
  bestiaryMobs,
```

```typescript
// In the CombatPlayback render (the combatEvent block), add autoSkip prop.
// Before the <CombatPlayback> at line 91, compute:
const shouldAutoSkip = autoSkipKnownCombat && (() => {
  const mobTemplateId = combatEvent.details?.mobTemplateId as string | undefined;
  if (!mobTemplateId || !bestiaryMobs) return false;
  const mob = bestiaryMobs.find(m => m.id === mobTemplateId);
  if (!mob?.isDiscovered) return false;
  const prefix = combatEvent.details?.mobPrefix as string | undefined;
  if (prefix) return mob.prefixesEncountered.includes(prefix);
  return true;
})();

// Then pass to CombatPlayback:
autoSkip={!!shouldAutoSkip}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20`
Expected: No new errors (existing errors are pre-existing)

**Step 3: Commit**

```bash
git add apps/web/src/components/playback/TurnPlayback.tsx
git commit -m "fix: add auto-skip support to TurnPlayback for ambush combat"
```

---

### Task 2: Pass auto-skip props from Exploration screen

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add props to Exploration and forward to TurnPlayback**

In `ExplorationProps` interface, add after `explorationSpeedMs`:

```typescript
  autoSkipKnownCombat?: boolean;
  bestiaryMobs?: Array<{ id: string; isDiscovered: boolean; prefixesEncountered: string[] }>;
```

In the function signature destructuring, add `autoSkipKnownCombat` and `bestiaryMobs`.

In the `<TurnPlayback>` render (line 142), add:

```typescript
  autoSkipKnownCombat={autoSkipKnownCombat}
  bestiaryMobs={bestiaryMobs}
```

**Step 2: Pass props from page.tsx to Exploration**

In `page.tsx` where `<Exploration>` is rendered (~line 405), add after `explorationSpeedMs={explorationSpeedMs}`:

```typescript
  autoSkipKnownCombat={autoSkipKnownCombat}
  bestiaryMobs={bestiaryMobs.map(m => ({ id: m.id, isDiscovered: m.isDiscovered, prefixesEncountered: m.prefixesEncountered }))}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20`

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/page.tsx
git commit -m "fix: thread auto-skip props to Exploration playback"
```

---

### Task 3: Pass auto-skip props from ZoneMap screen

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

`TurnPlayback` is also used in `ZoneMap` for travel ambushes. Same pattern as Task 2.

**Step 1: Add props to ZoneMap and forward to TurnPlayback**

In `ZoneMapProps` interface, add after `explorationSpeedMs`:

```typescript
  autoSkipKnownCombat?: boolean;
  bestiaryMobs?: Array<{ id: string; isDiscovered: boolean; prefixesEncountered: string[] }>;
```

In the function signature destructuring, add `autoSkipKnownCombat` and `bestiaryMobs`.

In the `<TurnPlayback>` render (~line 527), add:

```typescript
  autoSkipKnownCombat={autoSkipKnownCombat}
  bestiaryMobs={bestiaryMobs}
```

**Step 2: Pass props from page.tsx to ZoneMap**

In `page.tsx` where `<ZoneMap>` is rendered (~line 592), add after `explorationSpeedMs={explorationSpeedMs}`:

```typescript
  autoSkipKnownCombat={autoSkipKnownCombat}
  bestiaryMobs={bestiaryMobs.map(m => ({ id: m.id, isDiscovered: m.isDiscovered, prefixesEncountered: m.prefixesEncountered }))}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20`

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/ZoneMap.tsx apps/web/src/app/game/page.tsx
git commit -m "fix: thread auto-skip props to ZoneMap travel playback"
```

---

### Task 4: Track deaths on PvP knockout

**Files:**
- Modify: `apps/api/src/services/pvpService.ts`

**Step 1: Add trackAchievements import**

Change line 5 from:

```typescript
import { buildPagination } from '../utils/routeHelpers.js';
```

to:

```typescript
import { buildPagination, trackAchievements } from '../utils/routeHelpers.js';
```

**Step 2: Add trackAchievements call after PvP knockout**

After `enterRecoveringState(attackerId, attackerMaxHp)` and `attackerKnockedOut = true` (~line 461), add:

```typescript
      await trackAchievements(attackerId, { totalDeaths: 1 });
```

The block should become:

```typescript
    if (fleeResult.outcome === 'knockout') {
      await enterRecoveringState(attackerId, attackerMaxHp);
      attackerKnockedOut = true;
      await trackAchievements(attackerId, { totalDeaths: 1 });
    } else {
```

**Step 3: Verify build**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/services/pvpService.ts
git commit -m "fix: track totalDeaths achievement on PvP knockout"
```

---

### Task 5: Track deaths on boss knockout

**Files:**
- Modify: `apps/api/src/services/bossEncounterService.ts`

**Step 1: Add trackAchievements import**

Add to imports (after the `hpService` import on line 27):

```typescript
import { trackAchievements } from '../utils/routeHelpers.js';
```

**Step 2: Add trackAchievements call after boss knockout**

In the `Promise.all` block that processes flee results (~line 477), after `enterRecoveringState(pd.signup.playerId, pd.hpState.maxHp)`, add:

```typescript
          await trackAchievements(pd.signup.playerId, { totalDeaths: 1 });
```

The block should become:

```typescript
        if (fleeResult.outcome === 'knockout') {
          await enterRecoveringState(pd.signup.playerId, pd.hpState.maxHp);
          await trackAchievements(pd.signup.playerId, { totalDeaths: 1 });
        } else {
```

**Step 3: Verify build**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/services/bossEncounterService.ts
git commit -m "fix: track totalDeaths achievement on boss knockout"
```

---

### Task 6: Defer rating panel refresh until replay ends

**Files:**
- Modify: `apps/web/src/app/game/screens/ArenaScreen.tsx`

**Step 1: Remove loadArenaData from handleChallenge**

In `handleChallenge` (~line 142), remove:

```typescript
        await loadArenaData();
```

The success block should become just:

```typescript
      if (result.data) {
        setLastResult(result.data);
        setPvpPlaybackActive(true);
      } else if (result.error) {
```

**Step 2: Add loadArenaData to playback-complete callbacks**

In the `resultPanel` where `CombatPlayback` is rendered (~lines 261-273), update `onComplete` and `onSkip`:

```typescript
        onComplete={() => { setPvpPlaybackActive(false); void loadArenaData(); }}
        onSkip={() => { setPvpPlaybackActive(false); void loadArenaData(); }}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -20`
Expected: No new errors

**Step 4: Commit**

```bash
git add apps/web/src/app/game/screens/ArenaScreen.tsx
git commit -m "fix: defer arena rating refresh until PvP replay finishes"
```

---

### Task 7: Final verification

**Step 1: Run full typecheck**

```bash
npm run typecheck
```

**Step 2: Run tests**

```bash
npm run test
```

**Step 3: Verify no regressions, commit any fixes if needed**
