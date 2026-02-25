# World Events System Improvements

**Status:** Design approved
**Date:** 2026-02-23

## Overview

Three improvements based on playtesting feedback:
1. **Bug fix:** Per-zone event cap bypass — player-discovered events skip count limits
2. **Feature:** Spawn rate events affect encounter site discovery and ambush rates
3. **Feature:** Event badges on affected entities across all activity screens

## 1. Per-Zone Event Cap Fix

### Problem

`MAX_ZONE_EVENTS: 2` is only enforced in `eventSchedulerService.checkAndSpawnEvents()`. Player-discovered events via exploration call `spawnWorldEvent()` directly, which only deduplicates by effectType — not count. Over 20 hours, a player can accumulate 6+ events in one zone.

### Fix

Add count enforcement inside `spawnWorldEvent()` (worldEventService.ts) so ALL spawn paths respect the limit:

```typescript
if (params.zoneId) {
  const activeInZone = await prisma.worldEvent.count({
    where: { zoneId: params.zoneId, status: 'active' },
  });
  if (activeInZone >= WORLD_EVENT_CONSTANTS.MAX_ZONE_EVENTS) return null;
}
```

Boss events count toward the per-zone cap since they have a `zoneId`. A zone with a boss can have at most 1 other event (with `MAX_ZONE_EVENTS: 2`).

The scheduler's own count check in `trySpawnZoneEvent()` currently checks global zone count — change it to be consistent (per-zone) or remove it since `spawnWorldEvent` now enforces.

### Files

- `apps/api/src/services/worldEventService.ts` — add count check in `spawnWorldEvent()`
- `apps/api/src/services/eventSchedulerService.ts` — update `trySpawnZoneEvent()` to match per-zone semantics

## 2. Spawn Rate Events Affect Encounters

### Problem

`mobSpawnRateMultiplier` is computed in `getActiveZoneModifiers()` but never consumed. The exploration probability model uses fixed constants. Spawn rate events have no gameplay effect.

### Design

Two-part approach: (A) scale total encounter rates, (B) weight family selection.

### A. New helper: `getSpawnRateModifiers(zoneId)`

Returns per-family and global spawn rate multipliers:

```typescript
interface SpawnRateModifiers {
  byFamily: Map<string, number>;  // familyId -> multiplier
  global: number;                 // from untargeted spawn rate events
}
```

Called in exploration route alongside existing `getActiveZoneModifiers()`.

### B. Total encounter rate scaling

Calculate a combined rate multiplier from spawn rate modifiers and zone families:

```
totalBaseWeight = sum of all family discoveryWeights
totalAdjustedWeight = sum of (weight * familyModifier * globalModifier) for each family
rateMultiplier = totalAdjustedWeight / totalBaseWeight
```

Example: 3 families (equal weight 1.0), Vermin +75% → multiplier = 3.75/3.0 = 1.25 → 25% more encounters.

Pass `rateMultiplier` to `simulateExploration()`:

```typescript
// Updated signature
function simulateExploration(
  turns: number,
  zoneExitChance: number | null,
  spawnRateMultiplier?: number
): ExplorationOutcome[]
```

Inside, scale per-turn chances:
```typescript
const ambushChance = EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN * (spawnRateMultiplier ?? 1);
const siteChance = EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN * (spawnRateMultiplier ?? 1);
```

### C. Family weight adjustment

When picking which family populates a discovered encounter site, adjust `discoveryWeight` per family:

```typescript
const adjustedFamilies = zoneFamilies.map(f => ({
  ...f,
  discoveryWeight: f.discoveryWeight * (spawnMods.byFamily.get(f.mobFamilyId) ?? 1) * spawnMods.global,
}));
const pickedFamily = pickWeighted(adjustedFamilies, 'discoveryWeight');
```

Same approach for ambush mob selection — boost `encounterWeight` for mobs belonging to the affected family.

### D. Exploration estimate

Update `estimateExploration()` to accept `spawnRateMultiplier` so pre-exploration estimates reflect modified rates.

### Files

- `apps/api/src/services/worldEventService.ts` — add `getSpawnRateModifiers()`
- `packages/game-engine/src/exploration/probabilityModel.ts` — update `simulateExploration()` and `estimateExploration()` signatures
- `apps/api/src/routes/exploration/start.ts` — compute rate multiplier, pass to simulation, adjust family weights
- `apps/api/src/routes/exploration/estimate.ts` — pass rate multiplier to estimate

## 3. Event Badges on Affected Entities

### Problem

Events mechanically affect combat (mob damage/HP) and gathering (yield), but the player has no visual feedback. No way to know a mob is buffed or a node has bonus yield before or during the activity.

### Design Principle

Show badges **before** committing turns (decision-making) AND **after** (impact confirmation). Players need to factor events into turn allocation decisions.

### Backend: Event modifier data in API responses

#### `GET /combat/sites` — encounter site listing

Add per-site `eventModifiers` array:

```typescript
eventModifiers?: Array<{
  title: string;
  effectType: string;
  effectValue: number;
  isGlobal: boolean;
}>
```

Filter active zone + world events to those targeting the site's mob family (or untargeted).

#### `POST /combat/start` — combat response

Enhance existing `activeEvents` with `appliedToThisMob: boolean` flag so frontend knows which events affected the specific mob fought.

#### `GET /gathering/nodes` — resource node listing

Add per-node `eventModifiers` array (same shape as encounter sites).

#### `POST /gathering/mine` — gathering response

Add yield breakdown:

```typescript
yieldBreakdown?: {
  baseYieldPerAction: number;
  eventYieldPerAction: number;
  eventModifier: number;
  eventTitle: string | null;
}
```

#### Exploration response

Add `eventModifiers` to encounter site and ambush `details` objects in the narrative events array.

### Frontend: EventBadge component

Compact inline badge:

- **Buff (good for player):** Green tint. Mob debuffs (`damage_down`, `hp_down`) or resource buffs (`yield_up`, `drop_rate_up`).
- **Debuff (bad for player):** Red/orange tint. Mob buffs (`damage_up`, `hp_up`) or resource debuffs (`yield_down`).
- **Format:** `"Ferocious Boars +50% DMG"` or `"Bountiful Harvest +25% Yield"`
- **Global tag:** Small "GLOBAL" indicator for world-wide events (reuse existing style from WorldEvents screen).
- **Size:** Single-line, fits below entity name.

### Badge placement

| Screen | Location | Data source |
|--------|----------|-------------|
| Encounter site cards | Below mob family name | `GET /combat/sites` → `eventModifiers` |
| Combat playback | Next to mob name | `POST /combat/start` → `activeEvents` |
| Resource node list | Below resource name | `GET /gathering/nodes` → `eventModifiers` |
| Gathering results | Yield line | `POST /gathering/mine` → `yieldBreakdown` |
| Exploration playback | Site/ambush narrative cards | Exploration response → `details.eventModifiers` |

### Files

- `apps/api/src/routes/combat/sites.ts` — add event modifiers to site listing
- `apps/api/src/routes/combat/start.ts` — add `appliedToThisMob` to activeEvents
- `apps/api/src/routes/gathering.ts` — add event modifiers to nodes, yield breakdown to mine
- `apps/api/src/routes/exploration/start.ts` — add event modifiers to narrative details
- `apps/web/src/components/common/EventBadge.tsx` — new reusable badge component
- `apps/web/src/components/screens/EncounterSitesScreen.tsx` — render badges on site cards
- `apps/web/src/components/combat/` — render badges in combat playback
- `apps/web/src/components/screens/GatheringScreen.tsx` — render badges on nodes + results
- `apps/web/src/components/exploration/` — render badges in exploration playback
- `apps/web/src/lib/api/combat.ts` — update types for new response fields
- `apps/web/src/lib/api/items.ts` — update gathering types
