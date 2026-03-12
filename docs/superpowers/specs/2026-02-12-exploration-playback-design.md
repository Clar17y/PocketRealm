# Exploration & Combat Playback Design

## Problem

All game actions resolve instantly. Spending 2 hours of turns on exploration dumps 15 log entries at once. Getting knocked out teleports you to town before you can read what happened. The activity log disappears when switching screens. Zero dramatic tension.

## Solution

Client-side playback animations over the existing instant API responses. No backend changes.

## 1. Exploration Progress Bar

When the player clicks "Start Exploration", the API call resolves as normal but the frontend **plays through the results** instead of dumping them.

A progress bar fills from left to right representing total turns invested. Current turn number displayed. Empty turns fly by quickly. When the bar reaches a turn where something happened, it **pauses ~1.5s** — an event icon pops above the bar with a label:

- Crossed swords + "Ambush! Goblin Scout" (red/danger)
- Pickaxe + "Found Copper Vein!" (gold/success)
- Compass + "Discovered Medium Camp!" (blue/info)

Events append to the activity log as they're revealed.

**Full stops (manual "Continue" required):**
- Ambush defeat (knockout) — transitions into combat playback
- Ambush where player fled — transitions into combat playback

All other events (ambush victories, resource finds, site discoveries) use the brief auto-pause then continue.

**"Skip" button** always visible to jump to final results.

## 2. Combat Playback with Animated HP Bars

Triggers on: ambush events during exploration, and encounter site fights.

**Layout:** Two HP bars — player (green) and mob (red). Each shows current/max HP numerically. Combat log lines appear below but the bars are the centerpiece.

**Playback flow:**
1. Fight starts — player HP bar at **current HP** (not full), mob HP bar at full
2. Each round reveals one action at a time (~0.8s between actions)
3. Damage causes the target's HP bar to **smoothly animate down** (CSS transition ~0.4s ease-out)
4. Misses/evades: brief text flash ("Dodged!" / "Miss!"), no HP change
5. Critical hits: exaggerated animation (bar shake or flash)
6. Combat log text appears line by line underneath

**After combat ends:**
- **Victory:** Mob HP hits 0, "Victory" banner, rewards fade in. Auto-continues exploration progress bar after ~1.5s
- **Defeat/Knockout:** Player HP hits 0, screen holds. "Defeated" shown. **"Return to Town" button** appears — no auto-transition. Player clicks through manually, then sees town with knockout state.
- **Fled:** "Fled!" indicator, player clicks to continue

**"Skip" button** always available.

**Reusable:** Same `CombatPlayback` component used from exploration ambushes and encounter site fights.

## 3. Unified Activity Log

Replace the three separate logs (`explorationLog`, `gatheringLog`, `craftingLog`) with a single `activityLog`.

**Contents:** exploration events, combat results, gathering, crafting, travel, recovery, skill level-ups.

**Visible on every screen** including Dashboard/town. Same styling: reverse chronological, color-coded (info/success/danger), timestamp prefix.

**Persistence:** Lives in `useGameController` state. Persists for the session, does not survive page refresh.

## 4. UI Locking During Playback

Controller tracks a `playbackActive` boolean. While `true`:
- Explore button: disabled
- Fight button: disabled
- Travel buttons: disabled
- Turn slider: locked

**"Skip" button** ends playback instantly, reveals all results, re-enables everything.

**Screen navigation stays unlocked.** Navigating away mid-playback effectively skips — when returning, final state is shown with all events in the activity log. No pause/resume across screen transitions.

## 5. Files Changed

| File | Change |
|------|--------|
| `useGameController.ts` | Replace 3 separate logs with unified `activityLog`. Add `playbackActive` state. |
| `Exploration.tsx` | Replace instant log dump with progress bar playback. Delegate to combat playback on ambush events. |
| `CombatScreen.tsx` | Add animated HP bar playback mode. Existing detailed log becomes the "finished" view after playback. |
| **New:** `CombatPlayback.tsx` | Animated HP bars + round-by-round reveal. Reusable from exploration and encounter site fights. |
| **New:** `ExplorationPlayback.tsx` | Progress bar + event icon animation. Delegates to `CombatPlayback` for ambushes. |
| `Dashboard.tsx` | Render unified activity log (previously absent). |
| `Gathering.tsx`, `Crafting.tsx` | Switch from per-screen log to shared `activityLog`. |

**No changes to:** API routes, game engine, database, shared types. Purely presentation layer.
