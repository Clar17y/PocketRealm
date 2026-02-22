# Full Clear Atomic Multi-Room Combat — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Full Clear process all remaining rooms in a single API call so the player cannot leave between rooms.

**Architecture:** Backend `handleEncounterSiteRoomCombat` gains an outer room loop when `fullClearActive`. Turn cost covers all rooms upfront. Frontend queue already handles N fights; we add a `room` field and a room-transition interstitial in CombatScreen.

**Tech Stack:** Express route handler, Prisma, Vitest, React (Next.js)

---

## Task 1: Add `room` field to fight results (backend)

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` — `FightResult` type and response mapping

**Step 1:** Add `room` to the `FightResult` type (around line 30-40, find the interface):

```typescript
// Add to FightResult interface:
room: number;
```

**Step 2:** Set `room` when pushing to `fightResults` (line ~217):

```typescript
fightResults.push({
  room: currentRoom,  // ADD THIS
  mobName: template.name as string,
  // ... rest unchanged
});
```

**Step 3:** Include `room` in the response mapping (line ~479):

```typescript
fights: fightResults.map(f => ({
  room: f.room,  // ADD THIS
  mobName: f.mobName,
  // ... rest unchanged
})),
```

**Step 4:** Run tests: `npm run test:api`

**Step 5:** Commit: `git commit -am "feat: add room number to encounter site fight results"`

---

## Task 2: Implement multi-room loop for full clear (backend)

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` — `handleEncounterSiteRoomCombat`

This is the core change. When `fullClearActive`, the function loops through all remaining rooms instead of just the current one.

**Step 1:** Collect ALL remaining alive mobs across all rooms (not just current room) for turn cost calculation when doing a full clear. Replace the current turn cost calculation (line ~111) with:

```typescript
// Collect mobs for this combat session
let allSessionMobs: Array<{ roomNumber: number; mobs: typeof roomMobs }> = [];

if (siteStrategy === 'full_clear' && siteFullClearActive) {
  // Full clear: gather all remaining rooms
  const allRooms = [...new Set(decayed.mobs.map(m => m.room))].sort((a, b) => a - b);
  for (const r of allRooms) {
    if (r < currentRoom) continue;
    const alive = getAllAliveMobsInRoom(decayed.mobs, r);
    if (alive.length > 0) allSessionMobs.push({ roomNumber: r, mobs: alive });
  }
} else {
  // Room-by-room: just current room
  allSessionMobs = [{ roomNumber: currentRoom, mobs: roomMobs }];
}

const totalMobCount = allSessionMobs.reduce((sum, r) => sum + r.mobs.length, 0);
const totalTurnCost = totalMobCount * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST;
```

**Step 2:** Replace the single-room fight loop (lines ~160-240) with a nested loop:

```typescript
// Fight loop — iterate rooms (full clear) or single room (room-by-room)
const fightResults: FightResult[] = [];
let lastCombatResult: ReturnType<typeof runCombat> | null = null;
let lastPrefixedMob: /* same type */ | null = null;
let lastBaseMob: MobTemplate | null = null;
let defeatedInRoom = currentRoom;
let playerDefeated = false;

for (const session of allSessionMobs) {
  currentRoom = session.roomNumber;
  roomMobs = session.mobs;

  // Batch-load any new mob templates for this room
  const newTemplateIds = session.mobs
    .map(m => m.mobTemplateId)
    .filter(id => !mobTemplateById.has(id));
  if (newTemplateIds.length > 0) {
    const newTemplates = await prisma.mobTemplate.findMany({ where: { id: { in: newTemplateIds } } });
    for (const t of newTemplates) mobTemplateById.set(t.id, t);
  }

  for (const roomMob of session.mobs) {
    // ... existing per-mob fight logic (lines 161-239), unchanged
    // The key: currentPlayerHp carries across rooms naturally

    if (combatResult.outcome !== 'victory') {
      defeatedInRoom = session.roomNumber;
      playerDefeated = true;
      break;
    }
  }

  if (playerDefeated) break;
}
```

**Step 3:** Update the transaction's defeated-slots calculation to handle multi-room. The current code (line ~243) uses `roomMobs[i]` which only works for single-room. Change to map from `fightResults` directly:

```typescript
const defeatedSlots = fightResults
  .filter(f => f.outcome === 'victory')
  .map(f => {
    // Find the mob slot from allSessionMobs
    for (const s of allSessionMobs) {
      if (s.roomNumber === f.room) {
        const mob = s.mobs.find(m => m.mobTemplateId === f.mobTemplateId && m.slot !== undefined);
        if (mob) return mob.slot;
      }
    }
    return -1;
  })
  .filter(slot => slot >= 0);
```

Wait — the current code indexes into `roomMobs[i]` by fight index, which assumes fight order matches mob order. With multi-room, we need to track which slot each fight corresponds to. A simpler approach: store the slot in `FightResult`.

**Step 3 (revised):** Add `slot: number` to `FightResult`. Set it from `roomMob.slot` in the push. Then:

```typescript
const defeatedSlots = fightResults
  .filter(f => f.outcome === 'victory')
  .map(f => f.slot);
```

**Step 4:** Update the transaction room-clearing logic. For full clear, if the player won all fights, the site should be cleared (all rooms done). The existing room-clear detection (lines 267-288) checks `roomState.alive <= 0` for the current room only. With multi-room full clear, if `playerDefeated === false`, all rooms are cleared. Adjust:

```typescript
// After marking defeated mobs in the transaction:
if (!playerDefeated) {
  // All fights won
  roomCleared = true;
  const overallCounts = countEncounterSiteState(mobs);
  if (overallCounts.alive <= 0) {
    siteCleared = true;
  } else {
    // Some mobs survived (shouldn't happen in full clear if all fights won, but defensive)
    const nextRoom = getNextUnfinishedRoom(mobs, currentRoom + 1);
    if (nextRoom) newCurrentRoom = nextRoom;
    else siteCleared = true;
  }
} else {
  // Player was defeated mid-clear
  const roomState = getRoomState(mobs, defeatedInRoom);
  if (roomState.alive <= 0) {
    roomCleared = true;
    // Room was cleared but player lost in a later room
    const nextRoom = getNextUnfinishedRoom(mobs, defeatedInRoom + 1);
    if (nextRoom) newCurrentRoom = nextRoom;
    else siteCleared = true;
  }
  newRoomCarryHp = null;
}
```

**Step 5:** Update defeat handling (lines ~332-350). For full clear defeat, use `defeatedInRoom` instead of `currentRoom` when resetting mobs:

```typescript
// In the defeat handling section, when resetting mobs for room_by_room:
const resetMobs = siteMobs.map(m =>
  m.room === defeatedInRoom && m.status === 'defeated' ? { ...m, status: 'alive' as const } : m
);
```

**Step 6:** Run tests: `npm run test:api`

**Step 7:** Commit: `git commit -am "feat: full clear processes all rooms in single API call"`

---

## Task 3: Add `room` field to frontend playback queue

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts` — queue type and mapping

**Step 1:** Add `room` to the `combatPlaybackQueue` state type (line ~437):

```typescript
const [combatPlaybackQueue, setCombatPlaybackQueue] = useState<Array<{
  room?: number;  // ADD THIS
  mobName: string;
  // ... rest unchanged
}> | null>(null);
```

**Step 2:** Map `room` from fight results into the queue (line ~1021):

```typescript
const queue = data.combat.fights.map((fight) => ({
  room: fight.room,  // ADD THIS
  mobName: fight.mobName ?? data.combat.mobName,
  // ... rest unchanged
}));
```

**Step 3:** Commit: `git commit -am "feat: pass room number through combat playback queue"`

---

## Task 4: Room transition interstitial in CombatScreen

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`
- Modify: `apps/web/src/app/game/page.tsx` — pass `roomTransition` prop

**Step 1:** Add `roomTransition` to CombatScreen props:

```typescript
interface CombatScreenProps {
  // ... existing props
  roomTransition?: { entering: number } | null;
}
```

**Step 2:** In CombatScreen, render a room transition banner when `roomTransition` is set, instead of the CombatPlayback. Insert before the existing playback section (line ~385):

```typescript
{/* Room transition interstitial */}
{roomTransition && (
  <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)]/30 rounded-lg p-6 text-center">
    <div className="text-lg font-bold text-[var(--rpg-gold)] mb-1">
      Entering Room {roomTransition.entering}
    </div>
    <div className="text-sm text-[var(--rpg-text-secondary)]">
      Prepare for the next fight...
    </div>
  </div>
)}
```

**Step 3:** Update the fight progress label to show room context (line ~388):

```typescript
{fightProgress && fightProgress.total > 1 && combatPlaybackData && (
  <div className="text-sm text-[var(--rpg-gold)] font-semibold mb-2">
    {combatPlaybackData.room
      ? `Room ${combatPlaybackData.room} — Fight ${fightProgress.current}/${fightProgress.total}`
      : `Fight ${fightProgress.current}/${fightProgress.total}`
    }
  </div>
)}
```

Wait — `fightProgress` is `{ current, total }` across ALL fights. With multi-room, we need to show per-room fight progress. This can be computed from the queue: count fights with the same `room` as the current fight.

**Step 3 (revised):** Compute room-aware progress in page.tsx and pass it. In `page.tsx` (around line 818), update the `fightProgress` computation:

```typescript
fightProgress={combatPlaybackQueue && combatPlaybackQueue.length > 1
  ? {
      current: combatPlaybackIndex + 1,
      total: combatPlaybackQueue.length,
      room: combatPlaybackQueue[combatPlaybackIndex]?.room,
    }
  : null}
```

Then update the label in CombatScreen:

```typescript
{fightProgress && fightProgress.total > 1 && (
  <div className="text-sm text-[var(--rpg-gold)] font-semibold mb-2">
    {fightProgress.room
      ? `Room ${fightProgress.room} — Fight ${fightProgress.current}/${fightProgress.total}`
      : `Fight ${fightProgress.current}/${fightProgress.total}`
    }
  </div>
)}
```

**Step 4:** In `page.tsx`, compute and pass `roomTransition`. In `handleCombatPlaybackComplete` (in useGameController), we need to detect room transitions. When advancing to the next fight, if the room changes, insert a brief delay. The simplest approach: add a `roomTransition` state.

In `useGameController.ts`, add state:

```typescript
const [roomTransition, setRoomTransition] = useState<{ entering: number } | null>(null);
```

In `handleCombatPlaybackComplete`:

```typescript
const handleCombatPlaybackComplete = () => {
  if (combatPlaybackQueue && combatPlaybackIndex < combatPlaybackQueue.length - 1) {
    const currentFight = combatPlaybackQueue[combatPlaybackIndex];
    const nextFight = combatPlaybackQueue[combatPlaybackIndex + 1];

    // Room transition: show interstitial briefly before advancing
    if (currentFight?.room && nextFight?.room && currentFight.room !== nextFight.room) {
      setRoomTransition({ entering: nextFight.room });
      setTimeout(() => {
        setRoomTransition(null);
        setCombatPlaybackIndex(combatPlaybackIndex + 1);
      }, 1500);
      return;
    }

    setCombatPlaybackIndex(combatPlaybackIndex + 1);
    return;
  }

  // ... rest unchanged (all fights done)
};
```

Pass `roomTransition` from useGameController, through page.tsx, to CombatScreen.

**Step 5:** In CombatScreen, hide the CombatPlayback when `roomTransition` is active:

```typescript
{/* Combat Playback (animated) */}
{combatPlaybackData && !roomTransition && (
  // ... existing CombatPlayback
)}
```

**Step 6:** Commit: `git commit -am "feat: room transition interstitial during full clear playback"`

---

## Task 5: Test and verify

**Step 1:** Run all tests: `npm run test`

**Step 2:** Run typecheck: `npm run typecheck`

**Step 3:** Fix any issues.

**Step 4:** Commit if fixes needed: `git commit -am "fix: resolve issues from full clear implementation"`

**Step 5:** Push: `git push`
