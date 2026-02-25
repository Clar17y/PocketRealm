# Exploration & Combat Payload Optimization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce exploration and encounter site API response payloads by lazy-loading combat logs, add HTTP compression, and fix button double-press.

**Architecture:** Strip `CombatLogEntry[]` arrays from exploration/combat responses, return `combatLogId` references instead. Frontend pre-fetches logs on-demand during playback via existing `GET /combat/logs/:id`. Add Express compression middleware. Disable action buttons immediately on click via `busyAction`.

**Tech Stack:** Express compression middleware, React refs for cache, existing `getCombatLog` client function.

---

### Task 1: HTTP Compression

**Files:**
- Modify: `apps/api/package.json` (add dependency)
- Modify: `apps/api/src/index.ts:68-79` (add middleware)

**Step 1: Install compression**

```bash
npm install compression --workspace=@adventure/api
npm install @types/compression --workspace=@adventure/api --save-dev
```

**Step 2: Add middleware**

In `apps/api/src/index.ts`, add import at top:
```typescript
import compression from 'compression';
```

Add `app.use(compression());` after `app.use(helmet());` (line 69), before `app.use(cors(...))`:
```typescript
app.use(helmet());
app.use(compression());
app.use(cors({
```

**Step 3: Verify**

```bash
npm run build:api
```

**Step 4: Commit**

```bash
git add apps/api/package.json apps/api/src/index.ts package-lock.json
git commit -m "feat: add HTTP compression middleware to API"
```

---

### Task 2: Button Disable on Click

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx:289` (button disabled prop)

**Step 1: Add busyAction to exploration button disabled condition**

In `apps/web/src/components/screens/Exploration.tsx`, change the Start Exploration button (line 289):

```typescript
// Before:
disabled={isRecovering || turnInvestment[0] > availableTurns}

// After:
disabled={isRecovering || turnInvestment[0] > availableTurns || !!busyAction}
```

Also update the button label (lines 291-293) to show loading state:
```tsx
<div className="flex items-center justify-center gap-2">
  {busyAction === 'exploration' ? (
    <>
      <Loader2 size={20} className="animate-spin" />
      Exploring...
    </>
  ) : (
    <>
      <Play size={20} />
      {isRecovering ? 'Recover First' : 'Start Exploration'}
    </>
  )}
</div>
```

Add `Loader2` to the lucide-react import at the top of the file.

**Step 2: Disable the low-HP warning confirm button when busy**

Find the low-HP warning dialog's confirm button in the same file and add `|| !!busyAction` to its disabled condition.

**Step 3: Apply same pattern to encounter site combat buttons**

Search for encounter site "Fight" / "Full Clear" / "Clear Room" buttons in the combat/encounter UI components. Add `busyAction` disable check to each.

**Step 4: Verify**

```bash
npm run build:web
```

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx
# + any other modified component files
git commit -m "fix: disable action buttons immediately on click to prevent double-press"
```

---

### Task 3: API — Strip Combat Logs from Exploration Response

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts:700-708` (capture combat log IDs from transaction)
- Modify: `apps/api/src/routes/exploration/start.ts:306-324,378-400` (strip `log` from events, add `combatLogId`)

**Step 1: Capture combat log IDs in the transaction**

In the exploration transaction (line 700-708), change the combat log creation loop to capture IDs:

```typescript
// Before:
for (const combatLog of pendingCombatLogs) {
  await tx.activityLog.create({
    data: {
      playerId,
      activityType: 'combat',
      turnsSpent: combatLog.turnsSpent,
      result: combatLog.result as Prisma.InputJsonValue,
    },
  });
}

// After:
const createdCombatLogIds: string[] = [];
for (const combatLog of pendingCombatLogs) {
  const created = await tx.activityLog.create({
    data: {
      playerId,
      activityType: 'combat',
      turnsSpent: combatLog.turnsSpent,
      result: combatLog.result as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  createdCombatLogIds.push(created.id);
}
```

Return `createdCombatLogIds` from the transaction alongside `logId`, `resourceDiscoveries`, `encounterSites`.

**Step 2: Assign combatLogIds to ambush events and strip logs**

After the transaction, iterate through `events` and replace `log` with `combatLogId`:

```typescript
let combatLogIdx = 0;
for (const event of events) {
  if ((event.type === 'ambush_victory' || event.type === 'ambush_defeat') && event.details) {
    event.details.combatLogId = persisted.combatLogIds[combatLogIdx++];
    delete event.details.log;
  }
}
```

This works because `pendingCombatLogs` and ambush events are pushed in the same order.

**Step 3: Verify**

```bash
npm run build:api
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts
git commit -m "feat: strip combat logs from exploration response, return combatLogId references"
```

---

### Task 4: API — Strip Combat Logs from Encounter Site Response

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts:265-283` (fightResults — add combatLogId)
- Modify: `apps/api/src/routes/combat/start.ts:468-503` (persist per-fight logs)
- Modify: `apps/api/src/routes/combat/start.ts:540-559` (strip `log` from fights[] response)

**Step 1: Persist each fight as its own ActivityLog record**

After the main transaction (around line 468), create individual per-fight combat logs:

```typescript
const fightLogIds: string[] = [];
for (const fight of fightResults) {
  const fightLog = await prisma.activityLog.create({
    data: {
      playerId,
      activityType: 'combat',
      turnsSpent: 0,
      result: {
        zoneId,
        zoneName: zone.name,
        mobTemplateId: fight.mobTemplateId,
        mobName: fight.mobName,
        mobPrefix: fight.mobPrefix,
        mobDisplayName: fight.mobDisplayName,
        source: 'encounter_site_fight',
        encounterSiteId,
        attackSkill,
        outcome: fight.outcome,
        playerMaxHp: fight.playerMaxHp,
        mobMaxHp: fight.mobMaxHp,
        log: fight.log,
        rewards: {
          xp: fight.xp,
          baseXp: fight.xp,
          loot: fight.loot,
          durabilityLost: fight.durabilityLost,
          skillXp: fight.skillXp ? serializeXpGrant(fight.skillXp) : null,
        },
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  fightLogIds.push(fightLog.id);
}
```

**Step 2: Strip `log` from fights[] response, add `combatLogId`**

In the response (lines 540-559), replace `log: f.log` with `combatLogId: fightLogIds[i]`:

```typescript
fights: fightResults.map((f, i) => ({
  room: f.room,
  mobName: f.mobName,
  mobDisplayName: f.mobDisplayName,
  mobTemplateId: f.mobTemplateId,
  mobPrefix: f.mobPrefix,
  outcome: f.outcome,
  playerMaxHp: f.playerMaxHp,
  playerStartHp: f.playerStartHp,
  mobMaxHp: f.mobMaxHp,
  combatLogId: fightLogIds[i],  // <-- replaces log
  playerHpRemaining: f.playerHpRemaining,
  potionsConsumed: f.potionsConsumed,
  xp: f.xp,
  loot: f.loot,
  durabilityLost: f.durabilityLost,
  skillXp: f.skillXp ? serializeXpGrant(f.skillXp) : null,
})),
```

Also strip `log` from the top-level `combat` object (line 521) and replace with `combatLogId: fightLogIds[fightLogIds.length - 1]`.

**Step 3: Verify**

```bash
npm run build:api
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "feat: strip combat logs from encounter site response, persist per-fight logs"
```

---

### Task 5: Frontend — Combat Log Prefetch Hook

**Files:**
- Create: `apps/web/src/hooks/useCombatLogPrefetch.ts`

**Step 1: Create the hook**

```typescript
import { useRef, useCallback } from 'react';
import { getCombatLog } from '@/lib/api/combat';

type CombatLogEntry = {
  round: number;
  actor: 'combatantA' | 'combatantB';
  actorName?: string;
  action: string;
  message: string;
  roll?: number;
  damage?: number;
  evaded?: boolean;
  attackModifier?: number;
  accuracyModifier?: number;
  targetDodge?: number;
  targetEvasion?: number;
  targetDefence?: number;
  targetMagicDefence?: number;
  rawDamage?: number;
  armorReduction?: number;
  magicDefenceReduction?: number;
  isCritical?: boolean;
  critMultiplier?: number;
  combatantAHpAfter?: number;
  combatantBHpAfter?: number;
  spellName?: string;
  healAmount?: number;
  effectsApplied?: Array<{ stat: string; modifier: number; duration: number; target: 'combatantA' | 'combatantB' }>;
  effectsExpired?: Array<{ name: string; target: 'combatantA' | 'combatantB' }>;
};

export function useCombatLogPrefetch() {
  const cacheRef = useRef<Map<string, CombatLogEntry[]>>(new Map());
  const inflightRef = useRef<Map<string, Promise<CombatLogEntry[]>>>(new Map());

  const fetchLog = useCallback(async (combatLogId: string): Promise<CombatLogEntry[]> => {
    // Return from cache if available
    const cached = cacheRef.current.get(combatLogId);
    if (cached) return cached;

    // Return in-flight promise if already fetching
    const inflight = inflightRef.current.get(combatLogId);
    if (inflight) return inflight;

    // Start new fetch
    const promise = getCombatLog(combatLogId).then(res => {
      const log = (res.combat as Record<string, unknown>).log as CombatLogEntry[];
      cacheRef.current.set(combatLogId, log);
      inflightRef.current.delete(combatLogId);
      return log;
    });

    inflightRef.current.set(combatLogId, promise);
    return promise;
  }, []);

  const prefetch = useCallback((combatLogId: string) => {
    void fetchLog(combatLogId);
  }, [fetchLog]);

  const getLog = useCallback((combatLogId: string): CombatLogEntry[] | null => {
    return cacheRef.current.get(combatLogId) ?? null;
  }, []);

  const clear = useCallback(() => {
    cacheRef.current.clear();
    inflightRef.current.clear();
  }, []);

  return { fetchLog, prefetch, getLog, clear };
}
```

**Step 2: Verify**

```bash
npm run build:web
```

**Step 3: Commit**

```bash
git add apps/web/src/hooks/useCombatLogPrefetch.ts
git commit -m "feat: add useCombatLogPrefetch hook for lazy combat log loading"
```

---

### Task 6: Frontend — Wire Lazy Loading into Exploration Playback

**Files:**
- Modify: `apps/web/src/components/playback/TurnPlayback.tsx` (accept prefetch hook, pass logs to CombatPlayback)
- Modify: `apps/web/src/components/exploration/ExplorationPlayback.tsx:110` (check `combatLogId` instead of `log`)
- Modify: `apps/web/src/app/game/useGameController.ts` (create hook instance, pass to TurnPlayback)

**Step 1: Update ExplorationPlayback to check `combatLogId`**

In `ExplorationPlayback.tsx` line 110, change:
```typescript
// Before:
if (isAmbush && nextEvent.details?.log) {

// After:
if (isAmbush && (nextEvent.details?.log || nextEvent.details?.combatLogId)) {
```

This keeps backwards compatibility with any in-flight old responses.

**Step 2: Update TurnPlayback to accept and use the prefetch hook**

Add props to `TurnPlaybackProps`:
```typescript
fetchCombatLog?: (id: string) => Promise<CombatLogEntry[]>;
prefetchCombatLog?: (id: string) => void;
getCachedCombatLog?: (id: string) => CombatLogEntry[] | null;
```

On mount, pre-fetch the first ambush's combat log. When combat playback starts, pre-fetch the next one.

When passing `log` to `CombatPlayback` (line 104-130):
- If `combatEvent.details?.log` exists (old format), use it directly
- If `combatEvent.details?.combatLogId` exists (new format), use `getCachedCombatLog(id)` or await `fetchCombatLog(id)`
- Show a brief loading state if the log isn't cached yet

**Step 3: Update TurnPlayback's onEventRevealed to check combatLogId**

In `TurnPlayback.tsx` line 61, change:
```typescript
// Before:
const isAmbushWithCombat = (event.type === 'ambush_defeat' || event.type === 'ambush_victory') && event.details?.log;

// After:
const isAmbushWithCombat = (event.type === 'ambush_defeat' || event.type === 'ambush_victory')
  && (event.details?.log || event.details?.combatLogId);
```

**Step 4: Wire hook in useGameController**

In `useGameController.ts`, instantiate `useCombatLogPrefetch()` and pass its methods through to `TurnPlayback` via the exploration playback data flow.

**Step 5: Verify**

```bash
npm run build:web
```

**Step 6: Commit**

```bash
git add apps/web/src/components/playback/TurnPlayback.tsx \
       apps/web/src/components/exploration/ExplorationPlayback.tsx \
       apps/web/src/app/game/useGameController.ts
git commit -m "feat: wire lazy combat log loading into exploration playback"
```

---

### Task 7: Frontend — Wire Lazy Loading into Encounter Site Playback

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts:1036-1088` (use `combatLogId` instead of `log` in combat queue)
- Modify: combat playback component(s) that render the fight queue

**Step 1: Update combat queue building in useGameController**

In `useGameController.ts` lines 1036-1088, when building the combat playback queue from `data.combat.fights`:

```typescript
const queue = data.combat.fights.map((fight) => ({
  room: fight.room,
  mobName: fight.mobName ?? data.combat.mobName,
  mobDisplayName: fight.mobDisplayName,
  mobTemplateId: fight.mobTemplateId,
  mobPrefix: fight.mobPrefix,
  outcome: fight.outcome,
  combatantAMaxHp: fight.playerMaxHp,
  playerStartHp: fight.playerStartHp,
  combatantBMaxHp: fight.mobMaxHp,
  combatLogId: fight.combatLogId,     // <-- new field
  log: null as LastCombatLogEntry[] | null,  // <-- no longer inline
  rewards: { ... },
}));

// Pre-fetch first fight's log immediately
if (queue[0]?.combatLogId) prefetchCombatLog(queue[0].combatLogId);
// Pre-fetch second fight's log
if (queue[1]?.combatLogId) prefetchCombatLog(queue[1].combatLogId);
```

**Step 2: Fetch log when combat playback reaches a fight**

When `combatPlaybackIndex` advances, fetch the current fight's log if not cached, and pre-fetch the next:

```typescript
// When starting playback for fight at index:
const fight = combatPlaybackQueue[combatPlaybackIndex];
if (fight.combatLogId && !fight.log) {
  const log = await fetchCombatLog(fight.combatLogId);
  fight.log = log;
}
// Pre-fetch next
const next = combatPlaybackQueue[combatPlaybackIndex + 1];
if (next?.combatLogId) prefetchCombatLog(next.combatLogId);
```

**Step 3: Handle the single-mob zone combat path (no fights array)**

The `else` branch (line 1073-1088) for single-mob zone combat still returns `log` inline (not from an encounter site). Keep this path as-is — single mob combat payloads are small. If the API later strips these too, add `combatLogId` support here.

**Step 4: Verify**

```bash
npm run build:web
```

**Step 5: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
# + any combat playback component modifications
git commit -m "feat: wire lazy combat log loading into encounter site playback"
```

---

## Task Dependencies

```
Task 1 (compression) ──────────────────────────── independent
Task 2 (button disable) ───────────────────────── independent
Task 3 (API: exploration logs) ─────┐
Task 4 (API: encounter site logs) ──┤
Task 5 (prefetch hook) ────────────┤── all needed before Task 6 & 7
                                    │
Task 6 (FE: exploration playback) ──┤── depends on 3, 5
Task 7 (FE: encounter site playback) ── depends on 4, 5
```

Tasks 1, 2, 3, 4, 5 can all be done in parallel. Tasks 6 and 7 depend on their respective API + hook tasks.
