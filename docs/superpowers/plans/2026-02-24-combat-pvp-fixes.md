# Combat & PvP Fixes

Three bugs discovered during 20-hour playtest from level 1.

## Fix 1: Auto-Skip Known Combat Applies to Exploration Ambushes

**Problem:** The `autoSkipKnownCombat` setting only skips encounter site combat. Exploration ambushes always play full animation because `TurnPlayback` never receives or checks the setting.

**Fix:** Thread `autoSkipKnownCombat` + `bestiaryMobs` through `ExplorationPlayback` → `TurnPlayback`. Before rendering `CombatPlayback` for an ambush, run the same bestiary check (mob discovered + prefix encountered) and pass `autoSkip={true}` when matched.

**Files:**
- `apps/web/src/app/game/page.tsx` — pass props to `ExplorationPlayback`
- `apps/web/src/components/exploration/ExplorationPlayback.tsx` — forward to `TurnPlayback`
- `apps/web/src/components/playback/TurnPlayback.tsx` — compute skip and pass to `CombatPlayback`

## Fix 2: PvP and Boss Knockouts Increment `totalDeaths`

**Problem:** Only PvE knockouts (via `handleCombatDefeat`) call `trackAchievements(playerId, { totalDeaths: 1 })`. PvP knockouts in `pvpService.challenge()` and boss knockouts in `bossEncounterService` skip this, so "Humbling Experience" (`secret_first_death`) never triggers from those sources.

**Fix:** After `enterRecoveringState()` in both PvP and boss knockout paths, add `await trackAchievements(playerId, { totalDeaths: 1 })`.

**Files:**
- `apps/api/src/services/pvpService.ts` — add `trackAchievements` after PvP knockout
- `apps/api/src/services/bossEncounterService.ts` — add `trackAchievements` after boss knockout

## Fix 3: Defer Rating Panel Refresh Until Replay Ends

**Problem:** `handleChallenge` calls `loadArenaData()` immediately after receiving the API response, updating the "Your Rating" panel while combat playback is still animating. Seeing your rating jump from 1000→1016 spoils the outcome before the replay finishes.

**Fix:** Move `loadArenaData()` from `handleChallenge` to the playback-complete/skip handler (where `pvpPlaybackActive` is set to `false`).

**Files:**
- `apps/web/src/app/game/screens/ArenaScreen.tsx` — relocate `loadArenaData()` call
