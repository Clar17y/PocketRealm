# Zone & Exploration Improvements Design

## 1. Exploration Counter Fix

**Bug:** `addExplorationTurns()` increments `turnsExplored` without clamping, displaying e.g. "30,527 / 30,000".

**Fix:** In `zoneExplorationService.addExplorationTurns()`:
- Fetch the zone's `turnsToExplore`
- Clamp: `increment = Math.min(turns, Math.max(0, turnsToExplore - currentTurnsExplored))`
- If `turnsToExplore` is null (unlimited), skip clamping
- Exploration continues working normally at 100% (encounters, nodes, etc. still fire)

**Files:** `apps/api/src/services/zoneExplorationService.ts`

## 2. Zone Exit Scaling + Auto-unlock at 100%

### Scaling Curve

New pure function `getScaledZoneExitChance(baseChance, explorationPercent)` in game-engine:
- Flat at 1x until 50% explored
- Exponential ramp from 50% to 99%: `baseChance * (1 + (MAX_MULT - 1) * ((percent - 50) / 50)^2)`
- At 50%: 1x | 75%: ~5.75x | 90%: ~13.2x | 99%: ~19.2x

### Auto-unlock at 100%

After `addExplorationTurns()` in the exploration route, if zone just hit 100%:
- Discover all connected zones whose `explorationThreshold` is met and are still undiscovered

### Constants

```
ZONE_EXIT_SCALING_START: 50
ZONE_EXIT_SCALING_MAX_MULTIPLIER: 20
```

**Files:** `packages/game-engine/src/exploration/probabilityModel.ts`, `apps/api/src/routes/exploration/start.ts`, `packages/shared/src/constants/gameConstants.ts`

## 3. Zone Connection Hints ('???')

### Backend

Extend `GET /zones` response to include undiscovered connections from discovered zones:
- `{ name: '???', explorationThreshold: 40, discovered: false }`
- Only expose connections from zones the player has already discovered

### Frontend

- Show '???' entries in zone list alongside discovered zones
- Display: `??? — 40% explored to discover`
- Visually distinct: dimmed, locked icon, not clickable

**Files:** `apps/api/src/routes/zones.ts`, `apps/api/src/services/zoneDiscoveryService.ts`, zone UI components

## 4. Mob Tier Selection + Bidirectional Bleedthrough

### Tier Selector

- New optional field on `POST /exploration/start`: `tier` (integer, 1-4, defaults to max unlocked)
- Backend validates tier <= max unlocked for player's exploration % in that zone
- Exploration UI adds tier selector showing unlocked tiers with labels
- **Exploration % only increments when exploring at max unlocked tier**

### Fix Filtering Bug

Investigate `filterAndWeightMobsByTier()` in `mobTierFilter.ts` — lower-tier mobs are being completely eliminated despite the code suggesting they should remain. 20,000+ turns of exploration at tier 4 produced zero non-tier-4 mobs.

### Symmetric Bleedthrough

Base distribution centered on selected tier:

```
TWO_BELOW: 10%, ONE_BELOW: 15%, SELECTED: 50%, ONE_ABOVE: 15%, TWO_ABOVE: 10%
```

Redistribution when tiers are unavailable:
- Unavailable slots **below** range (< tier 1) → weight added to **selected** tier
- Unavailable slots **above** range (> max tier) → weight added to **highest available** tier

Concrete distributions for a 4-tier zone:

| Selected | T1 | T2 | T3 | T4 |
|----------|-----|-----|-----|-----|
| Tier 1 | 75 | 15 | 10 | 0 |
| Tier 2 | 15 | 60 | 15 | 10 |
| Tier 3 | 10 | 15 | 50 | 25 |
| Tier 4 | 0 | 10 | 15 | 75 |

### Constants

```
TIER_BLEEDTHROUGH: {
  TWO_BELOW: 0.10,
  ONE_BELOW: 0.15,
  SELECTED: 0.50,
  ONE_ABOVE: 0.15,
  TWO_ABOVE: 0.10
}
```

### Encounter Sites

Use the player's selected tier for mob generation with the same bleedthrough rules.

**Files:** `packages/game-engine/src/exploration/mobTierFilter.ts`, `apps/api/src/routes/exploration/start.ts`, `packages/shared/src/constants/gameConstants.ts`, exploration UI components

## 5. Hidden Cache Rewards

**Problem:** Caches (0.01% per turn, rarest non-exit outcome) give no rewards.

### Loot Table

1. **Guaranteed refined materials** — 2-4 rolls from zone mob family drop tables (similar to encounter site chests but smaller)
2. **Soulbound item chance** — 15% base chance to drop an existing soulbound recipe item
   - Rarity roll: common / uncommon / rare / epic (no legendary)
   - Player's luck attribute scales the rarity roll upward

### Constants

```
HIDDEN_CACHE: {
  MATERIAL_ROLLS_MIN: 2,
  MATERIAL_ROLLS_MAX: 4,
  SOULBOUND_DROP_CHANCE: 0.15,
  LUCK_RARITY_SCALING: 0.005
}
```

**Files:** `apps/api/src/routes/exploration/start.ts`, `apps/api/src/services/chestService.ts` (reuse infrastructure), `packages/shared/src/constants/gameConstants.ts`

## 6. Encounter Site Turn Cost Display

### Backend

Add computed fields to encounter site API response:
- `totalTurnCost = remainingMobCount * ENCOUNTER_TURN_COST` (50 turns/mob)
- Per-room: `rooms[].turnCost = roomMobCount * 50`

### Frontend

- Display total cost on encounter site card: "Cost: 250 turns (5 mobs)"
- Color-code red if player doesn't have enough turns

**Files:** `apps/api/src/routes/combat.ts` (sites endpoint), combat site UI components
