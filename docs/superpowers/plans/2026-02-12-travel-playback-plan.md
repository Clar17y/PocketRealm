# Travel Playback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show animated travel playback (progress bar + combat HP bars) on the World Map when travelling between zones, reusing existing playback components with zero code duplication.

**Architecture:** Extract the playback orchestration logic from `Exploration.tsx` into a shared `TurnPlayback` component. Both `Exploration.tsx` and `ZoneMap.tsx` consume it. Controller gets a new `travelPlaybackData` state + handlers. No backend changes.

**Tech Stack:** React, TypeScript, existing `ExplorationPlayback` + `CombatPlayback` components.

---

### Task 1: Extract `TurnPlayback` shared component

**Files:**
- Create: `apps/web/src/components/playback/TurnPlayback.tsx`
- Modify: `apps/web/src/components/screens/Exploration.tsx`

**Context:** `Exploration.tsx` lines 44-218 contain all the playback orchestration: `combatEvent` state, `resumeFromCombat` state, `playerHpForNextCombat` tracking, the `ExplorationPlayback` card (hidden via className during combat), the `CombatPlayback` card with `key={combatEvent.turn}`, deferred ambush log entries, and the resume/complete/skip callbacks. This is all generic — it doesn't depend on exploration-specific logic.

**Step 1: Create `TurnPlayback.tsx`**

Extract into a new component with these props:

```typescript
interface TurnPlaybackProps {
  /** Total turns the bar fills over */
  totalTurns: number;
  /** Header label, e.g. "Exploring Dark Forest" or "Travelling to Iron Peaks" */
  label: string;
  /** Events from API response */
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  /** Whether the journey was aborted (knockout/flee) */
  aborted: boolean;
  /** Turns refunded on abort */
  refundedTurns: number;
  /** Player HP at start of this journey */
  playerHpBefore: number;
  /** Player max HP */
  playerMaxHp: number;
  /** Called when playback finishes naturally */
  onComplete: () => void;
  /** Called when user clicks Skip */
  onSkip: () => void;
  /** Push entries to the unified activity log */
  onPushLog?: (...entries: Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>) => void;
}
```

Move from `Exploration.tsx` into `TurnPlayback`:
- `combatEvent` / `setCombatEvent` state
- `resumeFromCombat` / `setResumeFromCombat` state
- `playerHpForNextCombat` / `setPlayerHpForNextCombat` state + reset effect
- The `ExplorationPlayback` PixelCard (hidden during combat)
- The `CombatPlayback` PixelCard with `key={combatEvent.turn}`
- All the `onEventRevealed`, `onCombatStart`, `onComplete`, `onSkip` wiring
- The deferred ambush log logic (skip logging ambush in onEventRevealed, push after combat completes)

The `ExplorationPlayback` component's `zoneName` prop should receive the `label` prop from `TurnPlayback` (it's used as the header text "Exploring {zoneName}" → pass label directly).

**Step 2: Update `ExplorationPlayback` to accept `label` instead of `zoneName`**

In `ExplorationPlayback.tsx`, rename the `zoneName` prop to `label` (or add `label` as an alternative). The header currently reads `Exploring {zoneName}` — change it to just render `{label}` directly so the parent controls the text. This way travel can pass "Travelling to Iron Peaks" and exploration can pass "Exploring Dark Forest".

**Step 3: Update `Exploration.tsx` to use `TurnPlayback`**

Replace the three playback PixelCards (lines 111-219) and the three state variables (lines 44-46) + the reset effect (lines 48-53) with a single `<TurnPlayback>` component:

```tsx
{playbackData && (
  <TurnPlayback
    totalTurns={playbackData.totalTurns}
    label={`Exploring ${playbackData.zoneName}`}
    events={playbackData.events}
    aborted={playbackData.aborted}
    refundedTurns={playbackData.refundedTurns}
    playerHpBefore={playbackData.playerHpBeforeExploration}
    playerMaxHp={playbackData.playerMaxHp}
    onComplete={onPlaybackComplete!}
    onSkip={onPlaybackSkip!}
    onPushLog={onPushLog}
  />
)}
```

**Step 4: Verify exploration still works**

Run the app, start an exploration, confirm:
- Progress bar fills and pauses on events
- Ambush triggers combat playback with HP bars
- Multiple consecutive ambushes track HP correctly
- Skip works
- Activity log entries appear at the right time

**Step 5: Commit**

```bash
git add apps/web/src/components/playback/TurnPlayback.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/components/exploration/ExplorationPlayback.tsx
git commit -m "refactor: extract TurnPlayback shared component from Exploration"
```

---

### Task 2: Add travel playback state to `useGameController`

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Context:** The controller already has `explorationPlaybackData` (lines 362-370) and `handleExplorationPlaybackComplete` / `handlePlaybackSkip`. Travel needs its own parallel state so travel and exploration playback don't interfere with each other.

**Step 1: Add `travelPlaybackData` state**

After the `explorationPlaybackData` state declaration (~line 370), add:

```typescript
const [travelPlaybackData, setTravelPlaybackData] = useState<{
  totalTurns: number;
  destinationName: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBefore: number;
  playerMaxHp: number;
} | null>(null);
```

**Step 2: Update `handleTravelToZone` to set playback data instead of `combatPlaybackData`**

Replace the current travel event processing (lines 1146-1200) with:

```typescript
// Trigger travel playback (progress bar + combat if ambushed)
setTravelPlaybackData({
  totalTurns: data.travelCost ?? 0,  // need this from API
  destinationName: data.zone.name,
  events: data.events,
  aborted: data.aborted,
  refundedTurns: data.refundedTurns,
  playerHpBefore: hpBefore,
  playerMaxHp: hpState.maxHp,
});
setPlaybackActive(true);

pushLog({
  timestamp: nowStamp(),
  type: 'info',
  message: `Travelling to ${data.zone.name}...`,
});
```

Note: the API response needs to include `travelCost` so the frontend knows how many turns the bar represents. Check if it's already in the response — if not, add it to the travel endpoint response (the value is already computed as `travelCost` variable in `zones.ts`).

**Step 3: Add `handleTravelPlaybackComplete` handler**

```typescript
const handleTravelPlaybackComplete = () => {
  if (travelPlaybackData) {
    if (!travelPlaybackData.aborted) {
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Arrived at ${travelPlaybackData.destinationName}.`,
      });
    }
  }
  setTravelPlaybackData(null);
  setPlaybackActive(false);
};
```

**Step 4: Add `handleTravelPlaybackSkip` handler**

```typescript
const handleTravelPlaybackSkip = () => {
  if (travelPlaybackData) {
    // Dump remaining events to log
    const entries = travelPlaybackData.events
      .slice()
      .reverse()
      .map((event) => ({
        timestamp: nowStamp(),
        type: (event.type === 'ambush_defeat' ? 'danger' : event.type === 'ambush_victory' ? 'success' : 'info') as 'info' | 'success' | 'danger',
        message: `Turn ${event.turn}: ${event.description}`,
      }));
    pushLog(...entries);
    if (!travelPlaybackData.aborted) {
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Arrived at ${travelPlaybackData.destinationName}.`,
      });
    }
  }
  setTravelPlaybackData(null);
  setPlaybackActive(false);
};
```

**Step 5: Update `handleNavigate` auto-skip**

In the `handleNavigate` function (around line 868), add travel playback to the auto-skip:

```typescript
if (travelPlaybackData) {
  handleTravelPlaybackSkip();
}
```

**Step 6: Export new state and handlers**

Add to the return object:
- `travelPlaybackData`
- `handleTravelPlaybackComplete`
- `handleTravelPlaybackSkip`

**Step 7: Add `travelCost` to API response (if missing)**

Check `apps/api/src/routes/zones.ts` — the travel endpoint response needs to include `travelCost` so the frontend knows the total turns for the progress bar. Add it to each `res.json()` call in the travel handler:

```typescript
travelCost,  // already computed as a local variable
```

**Step 8: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/api/src/routes/zones.ts
git commit -m "feat: add travel playback state and handlers to game controller"
```

---

### Task 3: Wire `TurnPlayback` into `ZoneMap`

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Context:** The ZoneMap detail panel (lines 347-415) currently shows zone info and a Travel/Explore button. When travel playback is active, this panel should show the `TurnPlayback` component instead.

**Step 1: Add playback props to `ZoneMapProps`**

```typescript
travelPlaybackData?: {
  totalTurns: number;
  destinationName: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBefore: number;
  playerMaxHp: number;
} | null;
onTravelPlaybackComplete?: () => void;
onTravelPlaybackSkip?: () => void;
onPushLog?: (...entries: Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>) => void;
```

**Step 2: Render `TurnPlayback` in the detail panel when travel is active**

In the detail panel section (after the selected zone check), add:

```tsx
{travelPlaybackData && (
  <div style={{ /* same panel styling */ }}>
    <TurnPlayback
      totalTurns={travelPlaybackData.totalTurns}
      label={`Travelling to ${travelPlaybackData.destinationName}`}
      events={travelPlaybackData.events}
      aborted={travelPlaybackData.aborted}
      refundedTurns={travelPlaybackData.refundedTurns}
      playerHpBefore={travelPlaybackData.playerHpBefore}
      playerMaxHp={travelPlaybackData.playerMaxHp}
      onComplete={onTravelPlaybackComplete!}
      onSkip={onTravelPlaybackSkip!}
      onPushLog={onPushLog}
    />
  </div>
)}
```

**Step 3: Hide the normal detail panel during playback**

The existing `{selectedZone && selectedZone.discovered && (...)}` panel should be hidden when `travelPlaybackData` is set. Wrap it:

```tsx
{!travelPlaybackData && selectedZone && selectedZone.discovered && (...)}
```

**Step 4: Disable map interaction during playback**

The existing `playbackActive` prop already disables the Travel button. Also disable zone selection clicks during playback:

```tsx
onClick={() => {
  if (!isUndiscovered && !playbackActive) setSelectedZoneId(zone.id);
}}
```

**Step 5: Pass new props from `page.tsx`**

In the `case 'zones':` section of `page.tsx`, add the new props:

```tsx
<ZoneMap
  // ... existing props
  travelPlaybackData={travelPlaybackData}
  onTravelPlaybackComplete={handleTravelPlaybackComplete}
  onTravelPlaybackSkip={handleTravelPlaybackSkip}
  onPushLog={pushLog}
/>
```

**Step 6: Verify travel playback works**

Test:
- Click Travel to a wild zone — progress bar appears in detail panel
- Map stays visible above
- If ambushed, combat HP bars play
- On safe arrival, auto-dismiss, map updates to show you at new zone
- On knockout, manual "Return to Town" button
- Skip works
- Town-to-wild travel (no ambushes possible) still shows brief progress bar
- Breadcrumb return (free travel back) should NOT show playback (0 cost, no events)

**Step 7: Commit**

```bash
git add apps/web/src/components/screens/ZoneMap.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: wire travel playback into World Map detail panel"
```

---

### Task 4: Handle edge cases and polish

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx` (if needed)
- Modify: `apps/web/src/app/game/useGameController.ts` (if needed)
- Modify: `apps/web/src/components/playback/TurnPlayback.tsx` (if needed)

**Step 1: Breadcrumb return — skip playback**

Breadcrumb returns (`data.breadcrumbReturn === true`) are free and instant — no turns spent, no events. The controller should NOT set `travelPlaybackData` for these. Check `handleTravelToZone` handles this:

```typescript
if (data.breadcrumbReturn) {
  pushLog({ timestamp: nowStamp(), type: 'success', message: `Returned to ${data.zone.name}.` });
  await loadAll();
  return;
}
```

**Step 2: Town departures — brief progress bar, no ambushes**

Town-to-wild travel has a turn cost but no ambush chance. The playback should still show a brief progress bar filling (same as exploration with no events). The `TurnPlayback` component handles this naturally — empty events means bar fills straight to 100%.

**Step 3: Knockout respawn messaging**

When `data.respawnedTo` is set, the controller currently pushes a "knocked out and woke up in {town}" log entry. This should be deferred until after playback completes (same pattern as ambush log deferral). Move the respawn log push into `handleTravelPlaybackComplete`:

The controller should stash `respawnedTo` in the playback data or handle it in the complete callback.

**Step 4: Auto-select destination zone after arrival**

After playback completes and the player has arrived at a new zone, the ZoneMap should auto-select the new zone so the detail panel shows "Explore {zone}" immediately. This may happen naturally via `activeZoneId` update, but verify.

**Step 5: Test all travel scenarios**

1. Town → Wild (no ambush): brief progress bar, auto-dismiss, arrive
2. Wild → Wild (no ambush): progress bar, auto-dismiss, arrive
3. Wild → Wild (ambush victory): progress bar pauses, combat plays, bar resumes, arrive
4. Wild → Wild (ambush defeat, knockout): combat plays, "Return to Town", respawn
5. Wild → Wild (ambush defeat, flee): combat plays, "Continue", stay at current zone
6. Wild → Wild (multiple ambushes): HP tracks between fights
7. Breadcrumb return: instant, no playback
8. Skip button: dumps events to log, completes immediately
9. Navigate away during playback: auto-skips

**Step 6: Commit**

```bash
git add -A
git commit -m "fix: travel playback edge cases and polish"
```
