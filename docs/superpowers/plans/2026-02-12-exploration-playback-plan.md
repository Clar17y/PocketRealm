# Exploration & Combat Playback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace instant exploration/combat resolution with animated playback — progress bar for exploration, animated HP bars for combat, unified activity log visible everywhere.

**Architecture:** All animation is client-side. The API responses stay the same (one small addition: include combat log data in exploration/travel ambush event details). New `ExplorationPlayback` and `CombatPlayback` components handle the animation state machines. Three separate activity logs merge into one unified log in `useGameController`.

**Tech Stack:** React, TypeScript, CSS transitions (HP bar smooth animation), `setTimeout`/`useRef` for playback timing.

**Design doc:** `docs/superpowers/specs/2026-02-12-exploration-playback-design.md`

---

## Task 1: Unified Activity Log — Controller State

Merge the 3 separate log arrays into a single `activityLog` in `useGameController.ts`.

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Define the unified log type and state**

Near line 64 (where `LastCombatLogEntry` is), add the `ActivityLogEntry` type:

```typescript
export type ActivityLogEntry = {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'danger';
};
```

**Step 2: Replace the three log states with one**

At lines 293-295, replace:
```typescript
const [explorationLog, setExplorationLog] = useState<Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>>([]);
const [gatheringLog, setGatheringLog] = useState<Array<{ timestamp: string; message: string; type: 'info' | 'success' }>>([]);
const [craftingLog, setCraftingLog] = useState<Array<{ timestamp: string; message: string; type: 'info' | 'success' }>>([]);
```

With:
```typescript
const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
```

**Step 3: Add helper to push log entries**

Below the `nowStamp` helper (~line 604), add:
```typescript
const pushLog = (...entries: ActivityLogEntry[]) => {
  setActivityLog((prev) => [...entries, ...prev]);
};
```

**Step 4: Replace all `setExplorationLog`, `setGatheringLog`, `setCraftingLog` calls**

Every call to any of the three setters becomes `pushLog(...)`. There are ~15 call sites across:
- `handleStartExploration` (lines 654-690)
- `handleStartCombat` (lines 748-777)
- `handleMine` (lines 796-823)
- `handleCraft` (lines 840-897)
- `handleSalvageItem` (lines 902-925)
- `handleForgeUpgrade` / `handleForgeReroll` (lines 927-987)
- `handleTravelToZone` (lines 1058-1076)

Pattern: change `setExplorationLog((prev) => [{ ... }, ...prev])` → `pushLog({ ... })` and `setExplorationLog((prev) => [...entries, ...prev])` → `pushLog(...entries)`.

**Step 5: Update the return object**

At lines 1130-1132, replace:
```typescript
explorationLog,
gatheringLog,
craftingLog,
```
With:
```typescript
activityLog,
```

**Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

This will surface all the downstream consumers that still reference the old log names. Fix those in the next task.

**Step 7: Commit**

```
feat: unify three activity logs into single activityLog in controller
```

---

## Task 2: Unified Activity Log — Shared Component

Extract the duplicated activity log rendering (Exploration, Gathering, Crafting all have identical JSX) into a reusable component.

**Files:**
- Create: `apps/web/src/components/ActivityLog.tsx`
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/components/screens/Gathering.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx`

**Step 1: Create the shared ActivityLog component**

```tsx
'use client';

import { Clock } from 'lucide-react';
import { PixelCard } from './PixelCard';
import type { ActivityLogEntry } from '@/app/game/useGameController';

const TYPE_COLORS: Record<ActivityLogEntry['type'], string> = {
  info: 'text-[var(--rpg-text-secondary)]',
  success: 'text-[var(--rpg-green-light)]',
  danger: 'text-[var(--rpg-red)]',
};

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  maxHeight?: string;
}

export function ActivityLog({ entries, maxHeight = 'max-h-64' }: ActivityLogProps) {
  return (
    <PixelCard>
      <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3">Recent Activity</h3>
      <div className={`space-y-2 ${maxHeight} overflow-y-auto`}>
        {entries.length === 0 ? (
          <div className="text-sm text-[var(--rpg-text-secondary)] text-center py-4">
            No recent activity
          </div>
        ) : (
          entries.map((entry, index) => (
            <div key={index} className="flex gap-2 text-sm">
              <Clock size={14} className="text-[var(--rpg-text-secondary)] flex-shrink-0 mt-0.5" />
              <span className="text-[var(--rpg-text-secondary)] flex-shrink-0 font-mono">
                {entry.timestamp}
              </span>
              <span className={TYPE_COLORS[entry.type]}>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </PixelCard>
  );
}
```

**Step 2: Update Exploration.tsx**

Change the `ExplorationProps` interface:
- Replace `activityLog: Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>` with `activityLog: ActivityLogEntry[]` (import type from useGameController)
- Replace the inline activity log JSX (lines 180-207) with `<ActivityLog entries={activityLog} />`

**Step 3: Update Gathering.tsx**

- Remove the `GatheringLog` interface
- Replace `gatheringLog: GatheringLog[]` prop with `activityLog: ActivityLogEntry[]`
- Replace the inline log JSX (lines 377-398) with `<ActivityLog entries={activityLog} maxHeight="max-h-48" />`

**Step 4: Update Crafting.tsx**

- Remove the `CraftingLogEntry` interface
- Replace `activityLog: CraftingLogEntry[]` prop with `activityLog: ActivityLogEntry[]`
- Replace the inline log JSX (lines 329-350) with `<ActivityLog entries={activityLog} maxHeight="max-h-48" />`

**Step 5: Update page.tsx**

In `apps/web/src/app/game/page.tsx`:
- Destructure `activityLog` instead of `explorationLog, gatheringLog, craftingLog` (line 189-191)
- Pass `activityLog={activityLog}` to `Exploration`, `Gathering`, and `Crafting` components
- For `Gathering`, change prop name from `gatheringLog` to `activityLog`

**Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 7: Commit**

```
refactor: extract shared ActivityLog component, wire to all screens
```

---

## Task 3: Add Activity Log to Dashboard

**Files:**
- Modify: `apps/web/src/components/screens/Dashboard.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add activityLog prop to Dashboard**

In `Dashboard.tsx`, add to the `DashboardProps` interface:
```typescript
activityLog: ActivityLogEntry[];
```

Import `ActivityLogEntry` from `@/app/game/useGameController` and `ActivityLog` from `@/components/ActivityLog`.

**Step 2: Render the ActivityLog**

Add after the Skills grid section (before the closing fragment), at the bottom of the Dashboard:
```tsx
<ActivityLog entries={activityLog} />
```

**Step 3: Pass the prop in page.tsx**

In the `case 'home':` section (~line 257), add to the `<Dashboard>` component:
```tsx
activityLog={activityLog}
```

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 5: Commit**

```
feat: show unified activity log on Dashboard
```

---

## Task 4: Include Combat Log in Exploration Ambush Event Details

The exploration API returns ambush events with a `details` object, but it doesn't include the combat log (round-by-round data). We need this for the combat playback animation. Same for the travel route.

**Files:**
- Modify: `apps/api/src/routes/exploration.ts`
- Modify: `apps/api/src/routes/zones.ts` (travel route)

**Step 1: Add combat log to exploration ambush_victory details**

In `exploration.ts` at line 532-542, add `log`, `playerMaxHp`, `mobMaxHp` to the details:

```typescript
events.push({
  turn: outcome.turnOccurred,
  type: 'ambush_victory',
  description: `A ${prefixedMob.mobDisplayName} ambushed you - you defeated it! (+${xpGain} XP)`,
  details: {
    mobTemplateId: prefixedMob.id,
    mobName: baseMob.name,
    mobPrefix: prefixedMob.mobPrefix,
    mobDisplayName: prefixedMob.mobDisplayName,
    outcome: combatResult.outcome,
    playerMaxHp: combatResult.playerMaxHp,
    mobMaxHp: combatResult.mobMaxHp,
    log: combatResult.log,
    playerHpRemaining: currentHp,
    xp: xpGain,
    loot,
    durabilityLost,
  },
});
```

**Step 2: Add combat log to exploration ambush_defeat details**

In `exploration.ts` at line 591-610, add `log`, `playerMaxHp`, `mobMaxHp`:

```typescript
events.push({
  turn: outcome.turnOccurred,
  type: 'ambush_defeat',
  description: defeatDescription,
  details: {
    mobTemplateId: prefixedMob.id,
    mobName: baseMob.name,
    mobPrefix: prefixedMob.mobPrefix,
    mobDisplayName: prefixedMob.mobDisplayName,
    outcome: combatResult.outcome,
    playerMaxHp: combatResult.playerMaxHp,
    mobMaxHp: combatResult.mobMaxHp,
    log: combatResult.log,
    playerHpRemaining: currentHp,
    fleeResult: {
      outcome: fleeResult.outcome,
      remainingHp: fleeResult.remainingHp,
      goldLost: fleeResult.goldLost,
      recoveryCost: fleeResult.recoveryCost,
    },
    durabilityLost,
  },
});
```

**Step 3: Add combat log to travel ambush_victory details**

In `zones.ts` at line 372, expand the details:

```typescript
details: {
  mobName: prefixedMob.mobDisplayName,
  mobDisplayName: prefixedMob.mobDisplayName,
  outcome: combatResult.outcome,
  playerMaxHp: combatResult.playerMaxHp,
  mobMaxHp: combatResult.mobMaxHp,
  log: combatResult.log,
  xp: xpGain,
  loot,
  durabilityLost,
},
```

**Step 4: Add combat log to travel ambush_defeat details**

In `zones.ts` at lines 422 and 486, expand both defeat detail objects similarly — add `mobDisplayName`, `outcome`, `playerMaxHp`, `mobMaxHp`, `log` fields from `combatResult`.

**Step 5: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`

**Step 6: Commit**

```
feat: include combat log in exploration/travel ambush event details
```

---

## Task 5: CombatPlayback Component

The animated HP bar + round-by-round combat reveal component.

**Files:**
- Create: `apps/web/src/components/combat/CombatPlayback.tsx`

**Step 1: Create the component**

Props:
```typescript
interface CombatPlaybackProps {
  mobDisplayName: string;
  outcome: string; // 'victory' | 'defeat' | 'fled'
  playerMaxHp: number;
  playerStartHp: number; // current HP before fight (NOT max)
  mobMaxHp: number;
  log: LastCombatLogEntry[];
  rewards?: LastCombat['rewards'];
  onComplete: () => void; // called when playback finishes and user is ready to continue
  onSkip: () => void;     // called when skip button clicked
}
```

State machine phases:
1. `'playing'` — Animating through log entries one by one
2. `'finished'` — All entries revealed, showing outcome + rewards
3. `'waiting'` — Defeat/fled: waiting for user to click "Continue" / "Return to Town"

Implementation details:
- `revealedCount` state: how many log entries to show (starts at 0, increments via `setTimeout`)
- Each entry reveals after ~800ms delay
- HP bars use CSS `transition: width 0.4s ease-out` on the inner fill div
- Player HP bar: `width = (currentPlayerHp / playerMaxHp) * 100%` — derive `currentPlayerHp` from the last revealed entry's `playerHpAfter`
- Mob HP bar: same with `mobHpAfter`
- Starting values: player bar starts at `playerStartHp/playerMaxHp`, mob at 100%
- Critical hits: add `animate-shake` class (a short CSS keyframe) to the target's HP bar for ~0.3s
- Miss/evade: show a floating text "Miss!" or "Dodged!" that fades out

After all entries revealed:
- **Victory**: Show "Victory!" banner in gold, fade in rewards via `CombatRewardsSummary`. Call `onComplete()` after 1.5s auto-delay.
- **Defeat**: Show "Defeated!" in red. Show "Return to Town" button. Button calls `onComplete()`.
- **Fled**: Show "Fled!" in yellow. Show "Continue" button. Button calls `onComplete()`.

Skip button always visible — calls `onSkip()` which jumps to finished state with all entries revealed.

The combat log lines below HP bars reuse the existing `CombatLogEntry` component, only rendering entries up to `revealedCount`.

**Step 2: Add CSS keyframe for shake animation**

In `apps/web/src/app/globals.css` (or wherever Tailwind utilities are extended), add:
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.animate-shake {
  animation: shake 0.3s ease-in-out;
}
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 4: Commit**

```
feat: add CombatPlayback component with animated HP bars
```

---

## Task 6: ExplorationPlayback Component

The progress bar that plays through exploration results with event icons popping up.

**Files:**
- Create: `apps/web/src/components/exploration/ExplorationPlayback.tsx`

**Step 1: Define the event data type**

```typescript
interface ExplorationEvent {
  turn: number;
  type: string; // 'ambush_victory' | 'ambush_defeat' | 'encounter_site' | 'resource_node' | etc.
  description: string;
  details?: Record<string, unknown>;
}

interface ExplorationPlaybackProps {
  totalTurns: number;
  zoneName: string;
  events: ExplorationEvent[];
  aborted: boolean;
  refundedTurns: number;
  playerMaxHp: number;
  playerCurrentHp: number; // HP before exploration started
  onEventRevealed: (event: ExplorationEvent) => void; // push to activity log
  onCombatPlaybackNeeded: (event: ExplorationEvent) => void; // pause for combat
  onComplete: () => void; // all done
  onSkip: () => void;
}
```

**Step 2: Implement the progress bar state machine**

Phases:
1. `'running'` — Bar filling, revealing events
2. `'paused-event'` — Paused on a non-combat event (~1.5s auto-resume)
3. `'paused-combat'` — Paused for combat playback (ambush defeat/fled). Calls `onCombatPlaybackNeeded` and waits for parent to signal completion.
4. `'complete'` — Bar full, all events revealed

Logic:
- Sort events by turn number ascending
- `currentTurn` state animates from 0 to `totalTurns`
- Between events, the bar fills quickly (CSS transition on width)
- When `currentTurn` reaches the next event's turn:
  - Pause the bar
  - Show event icon above bar with label
  - Call `onEventRevealed(event)` to push to activity log
  - If `ambush_defeat` or `ambush_victory` with defeat outcome → enter `'paused-combat'`
  - Else → auto-resume after 1.5s

Event icons (Lucide):
- `ambush_victory` / `ambush_defeat` → `Swords` icon (red)
- `encounter_site` → `Compass` icon (blue)
- `resource_node` → `Pickaxe` icon (gold)
- `hidden_cache` → `Gift` icon (purple)
- `zone_exit` → `DoorOpen` icon (green)

Progress bar visual:
- Outer: `bg-[var(--rpg-surface)]` with border
- Inner fill: `bg-[var(--rpg-gold)]` with CSS `transition: width 0.3s linear`
- Current turn counter: `Turn {current} / {total}` label
- Event popup: positioned above bar at the proportional x-position

Skip button calls `onSkip()`.

**Step 3: Expose a `resumeAfterCombat()` method**

The parent needs to tell the playback to continue after combat finishes. Use `useImperativeHandle` with a ref, or simply a `combatComplete` prop boolean the parent toggles.

Simpler approach: the parent passes a `combatPlaybackDone` boolean prop. When it flips from `false` → `true`, the playback resumes from the paused combat event.

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 5: Commit**

```
feat: add ExplorationPlayback component with progress bar animation
```

---

## Task 7: Wire Exploration Screen to Playback

Connect the exploration screen to use `ExplorationPlayback` and `CombatPlayback` instead of instantly dumping log entries.

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add playback state to the controller**

In `useGameController.ts`, add new state:

```typescript
// Playback state
const [playbackActive, setPlaybackActive] = useState(false);
const [explorationPlaybackData, setExplorationPlaybackData] = useState<{
  totalTurns: number;
  zoneName: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBeforeExploration: number;
  playerMaxHp: number;
} | null>(null);
```

**Step 2: Modify handleStartExploration**

Instead of immediately pushing all events to the activity log, store them as playback data:

```typescript
const handleStartExploration = async (turnSpend: number) => {
  await runAction('explore', async () => {
    const hpBefore = hpState.currentHp;
    const maxHp = hpState.maxHp;
    const res = await startExploration(activeZoneId!, turnSpend);
    const data = res.data;
    if (!data) { setActionError(res.error?.message ?? 'Exploration failed'); return; }

    setTurns(data.turns.currentTurns);

    // Store for playback instead of instant log dump
    setExplorationPlaybackData({
      totalTurns: turnSpend,
      zoneName: data.zone.name,
      events: data.events,
      aborted: data.aborted,
      refundedTurns: data.refundedTurns,
      playerHpBeforeExploration: hpBefore,
      playerMaxHp: maxHp,
    });
    setPlaybackActive(true);

    // Still do the side-effect refreshes
    if (data.encounterSites?.length > 0 && activeScreen === 'combat') {
      await refreshPendingEncounters();
    }
    if (data.resourceDiscoveries?.length > 0) {
      await loadGatheringNodes();
    }
    const hadAmbush = data.events.some((e) => e.type === 'ambush_victory' || e.type === 'ambush_defeat');
    if (hadAmbush) {
      await Promise.all([loadAll(), loadTurnsAndHp()]);
    }
  });
};
```

**Step 3: Add playback completion handler**

```typescript
const handleExplorationPlaybackComplete = () => {
  setExplorationPlaybackData(null);
  setPlaybackActive(false);
};

const handlePlaybackSkip = () => {
  // Dump all remaining events to activity log at once
  if (explorationPlaybackData) {
    const events = explorationPlaybackData.events.slice().reverse();
    const entries = events.map((event) => ({
      timestamp: nowStamp(),
      type: event.type === 'ambush_defeat' ? 'danger' as const
          : event.type === 'ambush_victory' || event.type === 'encounter_site' || event.type === 'resource_node' ? 'success' as const
          : 'info' as const,
      message: `Turn ${event.turn}: ${event.description}`,
    }));
    pushLog(
      { timestamp: nowStamp(), type: 'info', message: `Explored ${explorationPlaybackData.totalTurns.toLocaleString()} turns in ${explorationPlaybackData.zoneName}.` },
      ...entries,
    );
  }
  handleExplorationPlaybackComplete();
};
```

**Step 4: Expose new state and handlers in return object**

Add to the return object:
```typescript
playbackActive,
explorationPlaybackData,
handleExplorationPlaybackComplete,
handlePlaybackSkip,
pushLog,
```

**Step 5: Update Exploration.tsx**

Add new props for playback data. When `explorationPlaybackData` is present, render `ExplorationPlayback` instead of the normal exploration UI (slider + button). The `ActivityLog` always shows below.

When `ExplorationPlayback` reveals an event, call `pushLog` to add it to the unified log. When combat playback is needed for an ambush, render `CombatPlayback` overlaid on top.

**Step 6: Update page.tsx**

Pass the new playback props to `<Exploration>`.

**Step 7: Handle navigation away during playback**

In the controller, when `setActiveScreen` is called while `playbackActive` is true, call `handlePlaybackSkip()` to instantly finish playback and populate the log.

**Step 8: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 9: Manual test**

- Explore a zone with some turns
- Verify progress bar appears and fills
- Verify events pop up with icons
- Verify activity log populates as events are revealed
- Verify Skip button works
- Navigate away mid-playback — verify events appear in log

**Step 10: Commit**

```
feat: wire exploration screen to animated playback
```

---

## Task 8: Wire Encounter Site Combat to Playback

When the player clicks "Fight" on an encounter site, show `CombatPlayback` instead of instantly displaying the result.

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

**Step 1: Add combat playback state to controller**

```typescript
const [combatPlaybackData, setCombatPlaybackData] = useState<{
  mobDisplayName: string;
  outcome: string;
  playerMaxHp: number;
  playerStartHp: number;
  mobMaxHp: number;
  log: LastCombatLogEntry[];
  rewards: LastCombat['rewards'];
} | null>(null);
```

**Step 2: Modify handleStartCombat**

Before setting `lastCombat`, store playback data and set `playbackActive`:

```typescript
const hpBefore = hpState.currentHp;
// ... existing API call ...
setCombatPlaybackData({
  mobDisplayName: data.combat.mobDisplayName,
  outcome: data.combat.outcome,
  playerMaxHp: data.combat.playerMaxHp,
  playerStartHp: hpBefore,
  mobMaxHp: data.combat.mobMaxHp,
  log: data.combat.log,
  rewards: { /* same as existing lastCombat.rewards construction */ },
});
setPlaybackActive(true);
```

After playback completes, set `lastCombat` as normal (so the detailed log view is available in History).

**Step 3: Add combat playback completion handler**

```typescript
const handleCombatPlaybackComplete = () => {
  // Transfer playback data to lastCombat for the detailed view
  if (combatPlaybackData) {
    setLastCombat({
      mobTemplateId: '', // not needed for display
      mobPrefix: null,
      mobDisplayName: combatPlaybackData.mobDisplayName,
      outcome: combatPlaybackData.outcome,
      playerMaxHp: combatPlaybackData.playerMaxHp,
      mobMaxHp: combatPlaybackData.mobMaxHp,
      log: combatPlaybackData.log,
      rewards: combatPlaybackData.rewards,
    });
  }
  setCombatPlaybackData(null);
  setPlaybackActive(false);
};
```

**Step 4: Expose in return object**

```typescript
combatPlaybackData,
handleCombatPlaybackComplete,
```

**Step 5: Update CombatScreen.tsx**

When `combatPlaybackData` is present, render `CombatPlayback` in the "Last Combat" section instead of the static log. After playback completes, show the normal detailed `lastCombat` view.

**Step 6: Verify and commit**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

```
feat: wire encounter site combat to animated playback
```

---

## Task 9: Wire Travel Ambush to Playback

When travelling triggers an ambush, play it back instead of instant resolution.

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Modify handleTravelToZone**

When the travel response includes events with combat details, store them as playback data instead of immediately pushing to the activity log.

For travel, there's at most one ambush event. If it has combat log data in `details`, trigger the combat playback:

```typescript
if (data.events.length > 0) {
  const ambushEvent = data.events.find((e) => e.type === 'ambush_victory' || e.type === 'ambush_defeat');
  if (ambushEvent?.details?.log) {
    // Play back the combat
    setCombatPlaybackData({
      mobDisplayName: (ambushEvent.details.mobDisplayName as string) ?? 'Unknown',
      outcome: (ambushEvent.details.outcome as string) ?? 'defeat',
      playerMaxHp: (ambushEvent.details.playerMaxHp as number) ?? hpState.maxHp,
      playerStartHp: hpBefore,
      mobMaxHp: (ambushEvent.details.mobMaxHp as number) ?? 100,
      log: ambushEvent.details.log as LastCombatLogEntry[],
      rewards: { xp: 0, loot: [], siteCompletion: null, skillXp: null },
    });
    setPlaybackActive(true);
    // Push the travel log entry, but defer the combat event until playback completes
    pushLog({ timestamp: nowStamp(), type: 'info', message: `Travelling to ${data.zone.name}...` });
  } else {
    // No combat log data — push events as before (fallback)
    const stampedEvents = data.events.map((event) => ({ ... }));
    pushLog(...stampedEvents.reverse());
  }
}
```

**Step 2: Handle the respawn message**

After combat playback completes for a travel knockout, push the respawn message:
```typescript
if (data.respawnedTo) {
  pushLog({ timestamp: nowStamp(), type: 'danger', message: `You were knocked out and woke up in ${data.respawnedTo.townName}.` });
}
```

This needs to be deferred until after the combat playback finishes. Store the pending respawn message alongside the playback data, and push it in the completion handler.

**Step 3: Verify and commit**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

```
feat: wire travel ambush combat to animated playback
```

---

## Task 10: UI Locking During Playback

Disable action buttons while playback is active.

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`

**Step 1: Pass playbackActive to screens**

Through `page.tsx`, pass `playbackActive` as a prop to Exploration, CombatScreen, and ZoneMap.

**Step 2: Disable buttons**

- **Exploration**: Disable "Start Exploration" button and lock the turn slider when `playbackActive` is true
- **CombatScreen**: Disable all "Fight" buttons when `playbackActive` is true
- **ZoneMap**: Disable "Travel" buttons when `playbackActive` is true

**Step 3: Auto-skip on navigation**

In `useGameController`, wrap `setActiveScreen` to skip playback:
```typescript
const handleNavigate = (screen: string) => {
  if (playbackActive) {
    handlePlaybackSkip();
  }
  setActiveScreen(screen as Screen);
};
```

Note: `handleNavigate` already exists — just add the playback skip logic at the top.

**Step 4: Verify and commit**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

```
feat: lock UI during playback, auto-skip on navigation
```

---

## Task 11: Polish and Edge Cases

**Files:**
- Various frontend files

**Step 1: Handle exploration with zero events**

If the exploration returns no meaningful events (only a "found nothing" hidden_cache), skip playback entirely and just push the log entry as before.

**Step 2: Handle rapid re-exploration**

If a player skips playback and immediately explores again, ensure the previous playback state is fully cleaned up before starting a new one.

**Step 3: Activity log trimming**

Add a max length to the activity log (e.g., 100 entries) to prevent memory growth in long sessions:
```typescript
const pushLog = (...entries: ActivityLogEntry[]) => {
  setActivityLog((prev) => [...entries, ...prev].slice(0, 100));
};
```

**Step 4: Visual polish**

- Ensure the progress bar and HP bars use RPG theme CSS variables
- Add a subtle glow/pulse to the progress bar while filling
- Make the Skip button unobtrusive but always accessible

**Step 5: Manual test full flow**

Test these scenarios end to end:
1. Explore 1000 turns, watch progress bar fill, events pop up
2. Get ambushed during exploration — combat playback triggers
3. Get knocked out during exploration — "Return to Town" button, then town view
4. Fight from encounter site — HP bar combat playback
5. Travel to zone, get ambushed — combat playback during travel
6. Skip button at various points
7. Navigate away mid-playback — log populated, playback stopped
8. Activity log visible on all screens (Dashboard, Exploration, Gathering, Crafting)

**Step 6: Commit**

```
fix: playback edge cases, log trimming, visual polish
```
