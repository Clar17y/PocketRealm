# Travel Playback Design

## Goal

When travelling between zones on the World Map, show an animated progress bar and combat playback instead of instantly resolving. Reuse the same playback components already built for exploration.

## Current State

- Player clicks "Travel to {Zone} (X turns)" in the ZoneMap detail panel
- API resolves everything instantly: turn spend, ambush simulation, combat, arrival/knockout/flee
- Frontend receives events in `{ turn, type, description, details }` format (same as exploration)
- Travel ambush rate: 4% per turn (wild-to-wild only, not town departures)
- Multiple ambushes possible per journey, HP carries between fights
- Currently: no animation at all — results dump to activity log instantly

## Design

### Shared Playback Component

Extract orchestration logic from `Exploration.tsx` into a reusable `TurnPlayback` component that handles:
- `ExplorationPlayback` progress bar (hidden during combat, not unmounted)
- `CombatPlayback` HP bars with `key={turn}` per fight
- `playerHpForNextCombat` tracking between consecutive fights
- Deferred ambush log entries (only written after combat playback completes)
- Resume-from-combat signaling

Props:
- `totalTurns` — number of turns to fill the bar over
- `label` — header text (e.g. "Exploring Dark Forest" or "Travelling to Iron Peaks")
- `events` — array of `{ turn, type, description, details }`
- `aborted` / `refundedTurns` — whether journey was cut short
- `playerHpBefore` / `playerMaxHp` — for combat HP bars
- `onComplete` / `onSkip` — callbacks
- `onPushLog` — deferred activity log writes

Both `Exploration.tsx` and `ZoneMap.tsx` use this single component.

### ZoneMap Integration

- When player clicks Travel, the detail panel expands to show `TurnPlayback`
- Map stays visible above — grounds you spatially
- Travel button is replaced by the playback UI
- All other map interaction disabled during playback

### Outcomes

| Outcome | Playback behavior | After dismiss |
|---------|------------------|---------------|
| Safe arrival | Bar fills, "Arrived!" auto-dismisses after ~2s | Map shows you at new zone, button says "Explore {zone}" |
| Ambush victory | Bar pauses, combat plays, bar resumes | Continues to next event or arrival |
| Knockout | Combat plays, "Defeated!" + manual "Return to Town" | Map shows you at home town |
| Fled | Combat plays, "Defeated!" + manual "Continue" | You stay at current zone, travel failed |

### What doesn't change

- No backend/API changes — travel endpoint already returns events with combat logs
- `ExplorationPlayback` and `CombatPlayback` components unchanged
- Activity log continues to work the same way
