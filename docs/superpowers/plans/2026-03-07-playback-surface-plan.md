# Playback Surface System Plan

> **For Claude:** Implement this in phases. Do not refactor every playback path at once. Stabilize the shell on the problem screens first, then expand.

**Goal:** Standardize playback presentation so action resolution always appears in the primary focus area immediately after an action, without forcing every screen into the same blocking modal behavior.

**Architecture:** Introduce a reusable `PlaybackSurface` wrapper in `apps/web/src/components/playback/` and use it as the framing/placement layer around existing `TurnPlayback` and `CombatPlayback` components. The first pass targets the two currently problematic scrollable screens (`ZoneMap` and `Exploration`) plus the existing main-stage `CombatScreen`. Secondary replay surfaces can then adopt the same shell with screen-appropriate placement.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing `PixelCard` styling system, existing `TurnPlayback` / `CombatPlayback` logic.

**Scope:** Frontend-only. No backend or API contract changes required for this phase.

---

## Principles

1. Playback must appear in the primary focus area immediately after the player triggers an action.
2. Playback must never require the player to scroll to discover it.
3. Playback should share one visual language everywhere: title, framing, progress state, skip affordance, animation area.
4. Background content should remain visible enough to preserve context, unless the screen is already a dedicated combat stage.
5. Consistency means one shared playback surface system, not one identical modal on every screen.

---

## Current State Audit

### Dedicated main-stage playback

- `apps/web/src/app/game/screens/CombatScreen.tsx`
  - Combat playback already appears in the main content focus area.
  - This screen should keep inline stage playback, not a modal overlay.

### Problematic inline playback on scrollable screens

- `apps/web/src/components/screens/ZoneMap.tsx`
  - Travel playback renders below the map tree and can be missed if the user remains near the top.
- `apps/web/src/components/screens/Exploration.tsx`
  - Exploration playback renders below the zone header and can fall below the fold on smaller viewports or after scrolling.

### Secondary replay surfaces to audit after the first pass

- `apps/web/src/app/game/screens/ArenaScreen.tsx`
- `apps/web/src/components/screens/TrainingGrounds.tsx`
- `apps/web/src/components/screens/FriendsScreen.tsx`

These should use the same playback shell eventually, but only after the shell is proven on map/exploration/combat.

---

## Placement Rules

### Use `overlay` mode when

- the page is scrollable
- playback is not already mounted in the top focus region
- the player can lose track of the action outcome if playback stays inline in document flow

### Use `stage` mode when

- the screen already exists primarily to show combat or playback
- playback is already in the main content stage
- making it modal would reduce readability or create unnecessary chrome

---

## Task 1: Create `PlaybackSurface`

**Files:**
- Create: `apps/web/src/components/playback/PlaybackSurface.tsx`

**Responsibilities:**
- Provide one consistent visual shell for playback.
- Support multiple placement modes:
  - `overlay`
  - `stage`
- Render a shared header area:
  - title
  - optional subtitle
  - optional progress label
- Provide a content body slot for `TurnPlayback` or `CombatPlayback`.
- Handle optional backdrop or dimming treatment.
- Handle optional auto-focus / scroll-into-view behavior when playback starts.

**API shape (proposed):**

```tsx
interface PlaybackSurfaceProps {
  mode: 'overlay' | 'stage';
  title: string;
  subtitle?: string;
  progressLabel?: string;
  children: React.ReactNode;
  active?: boolean;
  dimBackground?: boolean;
  className?: string;
}
```

**Implementation notes:**
- `overlay` mode should use a sticky/floating shell near the top of the screen content.
- Avoid hard `position: fixed` on the first pass unless sticky proves insufficient on mobile.
- Use existing fantasy UI variables and `PixelCard` styling rather than inventing a separate visual language.
- The shell should feel consistent with the map action panel already added.
- Do not move skip logic into the surface. Skip remains owned by the playback child component.

**Acceptance criteria:**
- A single reusable component exists for playback framing.
- The component can visually support both floating overlay placement and inline stage placement.

---

## Task 2: Move Zone Travel Playback Into `PlaybackSurface`

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`

**Current problem:**
- The user clicks travel near the top of the map.
- Playback renders much lower in the document, below a potentially long zone tree.
- The user does not reliably notice that travel playback has started.

**Plan:**
- Replace the current lower-page travel playback block with a top-mounted `PlaybackSurface` in `overlay` mode.
- When `travelPlaybackData` exists:
  - use the same top focal region currently occupied by the selected-zone sticky card
  - render a playback shell there instead of the normal action panel
  - preserve the map behind it for context
  - visually de-emphasize the rest of the screen while playback is active

**Behavior goals:**
- Travel starts and the player immediately sees:
  - destination title
  - hop progress if multi-hop
  - travel/combat animation area
  - skip action
- The map should stay visible beneath or behind the shell so the route context is preserved.

**Acceptance criteria:**
- No scrolling is required to discover travel playback.
- Multi-hop labels remain visible during playback.
- The map remains readable but secondary while playback is active.

---

## Task 3: Move Exploration Playback Into `PlaybackSurface`

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx`

**Current problem:**
- Playback is inline below the zone header and can still be missed if the screen is partially scrolled or if the viewport is short.

**Plan:**
- Wrap exploration playback in `PlaybackSurface` using `overlay` mode.
- Keep the zone header visible as context.
- Hide or mute the normal exploration controls while playback is active.
- Ensure the playback shell occupies the clear top focus area once exploration begins.

**Implementation notes:**
- `TurnPlayback` itself should stay mostly unchanged.
- The exploration screen should continue to own the action-state transitions and callbacks.
- The shell should not duplicate the zone header content unless it improves clarity.

**Acceptance criteria:**
- Exploration playback becomes immediately visible on start.
- Zone context remains visible.
- The player never has to scroll to see the animated playback.

---

## Task 4: Wrap Combat Screen Playback With The Same Shell

**Files:**
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`

**Current state:**
- Combat playback already occupies the main stage area.
- Placement is good; styling and framing are independent from the map/exploration playback treatment.

**Plan:**
- Wrap the existing combat playback block with `PlaybackSurface` in `stage` mode.
- Preserve current behavior:
  - room transition handling
  - fight progress display
  - skip/complete callbacks
  - no modal overlay behavior

**Implementation notes:**
- `stage` mode should look like the same playback system, but without floating/sticky overlay treatment.
- The shell should absorb the current ad hoc border/padding wrapper where practical.

**Acceptance criteria:**
- Combat screen keeps its dedicated-stage behavior.
- It now visually matches the standardized playback surface system.

---

## Task 5: Audit Secondary Replay Surfaces

**Files to inspect after the first pass:**
- `apps/web/src/app/game/screens/ArenaScreen.tsx`
- `apps/web/src/components/screens/TrainingGrounds.tsx`
- `apps/web/src/components/screens/FriendsScreen.tsx`

**Decision rule:**
- If playback is already the screen’s primary stage, use `stage`.
- If playback is embedded beneath other content and can fall below the fold, move it into a top-focus `overlay` shell.

**Goal:**
- Extend the same playback surface system without over-modalizing every screen.

**Acceptance criteria:**
- Each secondary replay screen is categorized as `stage` or `overlay`.
- Follow-up implementation tasks are documented if not completed in the same PR.

---

## Task 6: Avoid Deep Playback Logic Refactors In Pass One

**Files potentially affected later but not a first-pass target:**
- `apps/web/src/components/playback/TurnPlayback.tsx`
- `apps/web/src/components/combat/CombatPlayback.tsx`
- `apps/web/src/components/exploration/ExplorationPlayback.tsx`

**Guideline:**
- In the first implementation pass, treat these as content engines, not placement systems.
- Only make minimal changes required to support the shared shell.
- Do not merge all playback state machines together.

**Reason:**
- The immediate UX problem is placement and discoverability.
- Refactoring animation/control internals at the same time increases risk without improving the core issue.

---

## Visual Design Notes

- Use one consistent fantasy frame treatment across playback contexts.
- For `overlay` mode:
  - sticky top placement inside the screen container
  - subtle backdrop blur or dimming
  - strong elevation/shadow so it reads as the active layer
- For `stage` mode:
  - same ornamental shell
  - no backdrop dimming
  - preserve the dedicated combat layout
- Keep background context visible enough to orient the player.
- Avoid full hard modals unless a specific screen truly benefits from blocking the rest of the UI.

---

## Risks

1. Sticky behavior may be inconsistent inside nested scroll containers.
2. Existing wrappers may produce double borders or excessive padding once `PlaybackSurface` is added.
3. Mobile viewport height may make the playback shell too tall if not constrained.
4. Auto-scroll/focus behavior may feel jarring during queued travel hops if it fires repeatedly.
5. Combat and turn playback children may implicitly assume they own the outer card framing.

---

## Verification Plan

### Manual verification

1. Map screen
   - Start direct travel.
   - Start multi-hop travel.
   - Confirm playback is immediately visible without scrolling.
   - Confirm queued hops remain understandable.

2. Exploration screen
   - Start exploration from top of page and from a scrolled position.
   - Confirm playback appears in the top focus region.
   - Confirm normal exploration controls are appropriately muted/hidden during playback.

3. Combat screen
   - Start standard combat.
   - Start multi-fight encounter-site combat.
   - Confirm playback remains in the main stage area and does not become overly modal.

4. Mobile-width checks
   - Confirm overlay shell does not overflow viewport awkwardly.
   - Confirm skip and progress text remain visible.

### Build verification

- Run `npm run build -w apps/web` after implementation.
- Note: as of March 7, 2026, the web build is already blocked by an unrelated existing type error in `apps/web/src/app/game/hooks/useQuests.ts` importing `PlayerQuestData` from `@pocketrealm/shared`. If that remains unresolved, verify changed screens manually and record the unrelated blocker explicitly.

---

## Suggested Delivery Order

### PR / chunk 1

- Add `PlaybackSurface`
- Apply it to `ZoneMap`
- Apply it to `Exploration`

### PR / chunk 2

- Apply it to `CombatScreen`
- Audit and update secondary replay surfaces
- Remove any duplicate wrapper styling left over from pre-shell implementations

---

## Definition of Done

- A reusable `PlaybackSurface` exists.
- Map playback no longer renders below the fold.
- Exploration playback no longer renders below the fold.
- Combat screen uses the same playback surface system while remaining a dedicated stage.
- Secondary replay surfaces are either updated or explicitly categorized for follow-up.
- Playback visibility no longer depends on the user noticing content lower in the page flow.
