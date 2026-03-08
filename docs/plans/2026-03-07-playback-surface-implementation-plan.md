# Playback Surface Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize playback presentation so travel, exploration, and embedded combat replays always appear in the player’s primary focus area, while preserving dedicated combat screens as inline stage experiences rather than forcing everything into a blocking modal.

**Architecture:** Add a reusable `PlaybackSurface` wrapper under `apps/web/src/components/playback/` that provides one visual shell and two placement modes: `overlay` for scrollable screens where playback would otherwise fall below the fold, and `stage` for dedicated combat-focused screens. Keep `TurnPlayback` and `CombatPlayback` as content engines, and migrate screens onto the shell in two delivery chunks:

1. `PlaybackSurface` + `ZoneMap` + `Exploration`
2. `CombatScreen` + secondary replay screens

**Tech Stack:** React, TypeScript, Tailwind CSS, existing `PixelCard` / fantasy UI variables, existing `TurnPlayback` and `CombatPlayback`.

**Design doc:** `docs/plans/2026-03-07-playback-surface-plan.md`

---

## Chunk 1: PlaybackSurface + ZoneMap + Exploration

### Task 1: Create `PlaybackSurface`

**Files:**
- Create: `apps/web/src/components/playback/PlaybackSurface.tsx`

**Step 1: Define the component API**

Create a reusable wrapper with explicit placement modes and shared framing. Recommended props:

```tsx
interface PlaybackSurfaceProps {
  mode: 'overlay' | 'stage';
  title: string;
  subtitle?: string;
  progressLabel?: string;
  active?: boolean;
  dimBackground?: boolean;
  className?: string;
  children: React.ReactNode;
}
```

Behavior expectations:
- `overlay`
  - sticky/floating near the top of the screen container
  - elevated above surrounding content
  - optional background dimming / backdrop treatment
- `stage`
  - same visual shell, but inline in normal layout flow
  - no dimming

**Step 2: Build the shared shell**

Implement the wrapper with:
- one shared header area for title/subtitle/progress
- a framed body area for playback content
- consistent spacing and ornamental styling
- responsive behavior that does not consume the entire viewport by default

Suggested structure:

```tsx
export function PlaybackSurface({
  mode,
  title,
  subtitle,
  progressLabel,
  active = true,
  dimBackground = mode === 'overlay',
  className,
  children,
}: PlaybackSurfaceProps) {
  // optional auto-scroll/focus effect only for overlay mode
  // render shell
}
```

**Step 3: Add optional scroll/focus behavior**

For `overlay` mode, add a light `scrollIntoView` / focus-on-activate effect:
- only when transitioning from inactive → active
- do not re-scroll on every rerender
- avoid repeated firing during long queued travel playback if the shell is already visible

Use a `ref` + `useEffect` guard for the first activation.

**Step 4: Verify component compiles**

Run:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

If the repo’s unrelated existing type errors block this, at least verify the new component has no local TS issues from imports/props.

**Step 5: Commit**

```bash
git add apps/web/src/components/playback/PlaybackSurface.tsx
git commit -m "feat(web): add reusable playback surface shell"
```

---

### Task 2: Move ZoneMap Playback Into `PlaybackSurface`

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`

**Current issue:**
- Travel playback still renders lower in the document flow.
- The user clicks travel near the top but may not realize playback started because it appears below the map tree.

**Step 1: Replace the lower travel playback container**

Find the current `travelPlaybackData` render block and remove the ad hoc bottom-page wrapper around `TurnPlayback`.

Instead:
- mount `PlaybackSurface` in the same top focus region where the sticky selected-zone action card currently lives
- render it only when `travelPlaybackData` exists

**Step 2: Use `overlay` mode**

Wrap travel playback like:

```tsx
<PlaybackSurface
  mode="overlay"
  title={`Travelling to ${travelPlaybackData.destinationName}`}
  progressLabel={
    travelPlaybackData.totalHops > 1
      ? `${travelPlaybackData.currentHop}/${travelPlaybackData.totalHops} to ${travelPlaybackData.finalDestinationName}`
      : undefined
  }
>
  <TurnPlayback ... />
</PlaybackSurface>
```

**Step 3: Preserve background context**

While playback is active:
- keep the map visible behind the shell
- visually de-emphasize the rest of the map UI
- avoid removing route context entirely

Practical approach:
- add reduced opacity or muted interaction styling to the tree while playback is active
- do not hide the map unless necessary

**Step 4: Keep existing route/hop labeling**

Preserve:
- multi-hop labeling
- queued hop progression
- skip behavior
- post-playback zone selection behavior

**Step 5: Verify map UX manually**

Manual checks:
1. Start a direct travel hop from the top of the map.
2. Start a multi-hop route from the top of the map.
3. Confirm playback is immediately visible without scrolling.
4. Confirm the map remains readable behind the shell.
5. Confirm playback completion/skip still advances queued travel correctly.

**Step 6: Commit**

```bash
git add apps/web/src/components/screens/ZoneMap.tsx
git commit -m "feat(web): move map travel playback into overlay surface"
```

---

### Task 3: Move Exploration Playback Into `PlaybackSurface`

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx`

**Current issue:**
- Exploration playback is still inline below the header/content and can fall below the fold or be missed after scrolling.

**Step 1: Replace the direct `TurnPlayback` mount**

Keep exploration playback logic intact, but move the render location into a top-focus `PlaybackSurface`.

Pattern:

```tsx
{playbackData && (
  <PlaybackSurface
    mode="overlay"
    title={`Exploring ${playbackData.zoneName}`}
    subtitle="Exploration in progress"
  >
    <TurnPlayback ... />
  </PlaybackSurface>
)}
```

**Step 2: Keep the zone header visible**

Do not hide the exploration header card entirely.
The desired layout is:
- zone header remains visible as context
- playback shell becomes the obvious active region
- exploration controls remain hidden or muted while playback is active

**Step 3: Avoid duplicate framing**

If `TurnPlayback` already appears inside a card-like frame, do not add clashing nested borders/padding. Adjust wrapper spacing so the outer `PlaybackSurface` is the main shell.

**Step 4: Verify exploration UX manually**

Manual checks:
1. Start exploration from top of page.
2. Scroll partway down, then start exploration again.
3. Confirm playback is immediately visible both times.
4. Confirm exploration completion and skip still write the expected activity log entries.
5. Confirm ambush combat inside `TurnPlayback` still works normally.

**Step 5: Commit**

```bash
git add apps/web/src/components/screens/Exploration.tsx
git commit -m "feat(web): move exploration playback into overlay surface"
```

---

### Task 4: Chunk 1 Verification Pass

**Files:**
- No functional code target; verification/documentation task

**Step 1: Run web verification**

Run:

```bash
npm run build -w apps/web
```

If blocked by the known unrelated `useQuests.ts` type error, note it explicitly and proceed with manual verification of the changed surfaces.

**Step 2: Manual QA checklist**

Verify:
- Map travel playback never requires scroll discovery.
- Exploration playback never requires scroll discovery.
- Overlay shell styling is consistent between map and exploration.
- Skip buttons remain accessible on mobile-width layouts.
- Background context remains visible enough during overlay playback.

**Step 3: Commit any cleanup**

```bash
git add apps/web/src/components/playback/PlaybackSurface.tsx apps/web/src/components/screens/ZoneMap.tsx apps/web/src/components/screens/Exploration.tsx
git commit -m "chore(web): polish playback surface rollout for map and exploration"
```

---

## Chunk 2: CombatScreen + Secondary Replay Screens

### Task 5: Wrap CombatScreen Playback In `PlaybackSurface`

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

**Current state:**
- Combat screen playback placement is good.
- It should remain the main stage, not become a modal overlay.

**Step 1: Wrap the existing playback block**

Locate the current `combatPlaybackData && !roomTransition` block and wrap it with:

```tsx
<PlaybackSurface
  mode="stage"
  title={combatPlaybackData.mobDisplayName}
  progressLabel={fightProgress ? `${fightProgress.current}/${fightProgress.total}` : undefined}
>
  <CombatPlayback ... />
</PlaybackSurface>
```

**Step 2: Preserve room transition handling**

Do not force room transitions into the same playback surface if that weakens readability.
It is acceptable to keep the room transition interstitial separate, immediately above the stage playback.

**Step 3: Remove duplicate wrapper styling if needed**

If the existing combat playback block already supplies border/padding that duplicates the new shell:
- simplify the old wrapper
- let `PlaybackSurface` become the main chrome

**Step 4: Verify combat UX manually**

Manual checks:
1. Start regular zone combat.
2. Start a multi-fight encounter-site run.
3. Confirm combat remains the central stage experience.
4. Confirm the screen does not feel over-modalized.
5. Confirm skip/complete still advances fight queues correctly.

**Step 5: Commit**

```bash
git add apps/web/src/app/game/screens/CombatScreen.tsx
git commit -m "feat(web): apply playback surface to combat stage"
```

---

### Task 6: Audit Secondary Replay Surfaces

**Files:**
- Inspect: `apps/web/src/app/game/screens/ArenaScreen.tsx`
- Inspect: `apps/web/src/components/screens/TrainingGrounds.tsx`
- Inspect: `apps/web/src/components/screens/FriendsScreen.tsx`

**Step 1: Categorize each screen**

For each file, determine whether playback should use:
- `stage`
- `overlay`

Decision rule:
- use `stage` if playback is already the main focus area
- use `overlay` if replay is embedded beneath lists/details and can fall below the fold

**Step 2: Document any screens that can stay as-is**

If a screen already effectively behaves like `stage`, still migrate it to `PlaybackSurface` for visual consistency if the change is straightforward.
If a screen needs a larger UX redesign to support overlay behavior, document that explicitly before changing it.

**Step 3: Commit the audit checkpoint**

If you make code changes in this step, commit them together. If it is only an audit, record the decision in the implementation notes before moving on.

---

### Task 7: Apply `PlaybackSurface` To Secondary Replay Screens

**Files:**
- Modify one or more of:
  - `apps/web/src/app/game/screens/ArenaScreen.tsx`
  - `apps/web/src/components/screens/TrainingGrounds.tsx`
  - `apps/web/src/components/screens/FriendsScreen.tsx`

**Step 1: Migrate straightforward screens first**

Start with the screen where playback integration is least invasive:
- wrap existing replay content with `PlaybackSurface`
- use the categorized mode (`stage` or `overlay`)

**Step 2: Preserve each screen’s local logic**

Do not refactor the replay logic deeply.
Preserve:
- replay data flow
- skip / complete behavior
- local surrounding screen controls

**Step 3: Keep one shared visual language**

Ensure all migrated replay surfaces now share:
- shell framing
- header treatment
- content spacing
- overall playback emphasis

**Step 4: Manual verification**

For each migrated screen:
1. Trigger replay.
2. Confirm it appears in the intended focus area.
3. Confirm it does not require scroll discovery.
4. Confirm controls and screen context still make sense.

**Step 5: Commit**

```bash
git add apps/web/src/app/game/screens/ArenaScreen.tsx apps/web/src/components/screens/TrainingGrounds.tsx apps/web/src/components/screens/FriendsScreen.tsx
git commit -m "feat(web): standardize secondary replay screens with playback surface"
```

---

### Task 8: Trim Duplicate Wrappers And Styling Debt

**Files:**
- Modify any migrated playback host components as needed
- Potentially inspect:
  - `apps/web/src/components/playback/TurnPlayback.tsx`
  - `apps/web/src/components/combat/CombatPlayback.tsx`

**Step 1: Remove redundant framing**

After migration, identify nested borders/padding/shadows that now duplicate the new playback shell and simplify them.

**Step 2: Keep content engines focused**

Only make minimal changes inside `TurnPlayback` / `CombatPlayback` if absolutely necessary for layout consistency.
Do not rewrite their behavior in this task.

**Step 3: Verify visually**

Compare:
- map overlay playback
- exploration overlay playback
- combat stage playback
- any migrated secondary replay screens

They should feel like one system with screen-specific placement, not separate bespoke widgets.

**Step 4: Commit**

```bash
git add apps/web/src/components/playback/PlaybackSurface.tsx apps/web/src/components/playback/TurnPlayback.tsx apps/web/src/components/combat/CombatPlayback.tsx apps/web/src/app/game/screens/CombatScreen.tsx apps/web/src/app/game/screens/ArenaScreen.tsx apps/web/src/components/screens/TrainingGrounds.tsx apps/web/src/components/screens/FriendsScreen.tsx
git commit -m "refactor(web): clean up playback shell styling across screens"
```

---

### Task 9: Final Verification

**Step 1: Build / typecheck**

Run:

```bash
npm run build -w apps/web
```

If still blocked by the known unrelated `apps/web/src/app/game/hooks/useQuests.ts` type issue, explicitly record that as an external blocker.

**Step 2: Manual regression sweep**

Required checks:
1. Map travel playback is immediately visible.
2. Exploration playback is immediately visible.
3. Combat screen remains a stage, not a blocking modal.
4. Secondary replay surfaces use the intended placement mode.
5. Skip/complete behavior still works for:
   - direct travel
   - multi-hop travel
   - exploration with ambushes
   - queued combat fights

**Step 3: Final commit**

```bash
git add apps/web/src/components/playback/PlaybackSurface.tsx apps/web/src/components/screens/ZoneMap.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/screens/CombatScreen.tsx apps/web/src/app/game/screens/ArenaScreen.tsx apps/web/src/components/screens/TrainingGrounds.tsx apps/web/src/components/screens/FriendsScreen.tsx
git commit -m "feat(web): standardize playback surfaces across gameplay screens"
```

---

## Notes

- Do not refactor all playback internals up front.
- Solve placement and discoverability first.
- Prefer one shared shell plus screen-specific placement over a universal modal.
- If a secondary screen needs larger UX restructuring, record that rather than forcing a rushed migration in the same pass.
