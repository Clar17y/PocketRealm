# Zone Exploration Progression Design

## Problem

Fresh players in any wild zone face all zone mobs equally. In Forest Edge, this means a level 1 character with 35-45% hit rate encounters Brood Mother (lvl 3, 45 HP, spells) and Great Boar (lvl 4, 50 HP) just as often as Field Mouse (lvl 1, 8 HP). Fights take 50-90 rounds and require auto-potions to survive. No progression exists within zones.

## Solution

Track cumulative turns spent exploring each zone per player. Mob encounter tiers unlock at exploration percentage thresholds. Zone exits gate behind exploration %. Newest unlocked tier gets encounter weight boost. Applies to all wild zones.

## Core Mechanics

### Exploration Percentage

- `explorationPercent = min(100, turnsExplored / zone.turnsToExplore * 100)`
- Only actually spent turns count — refunded turns from ambush defeats are excluded
- Accumulates across all exploration runs in the same zone
- Combat proficiency naturally gates exploration speed: losing ambushes = fewer credited turns per run

### Mob Tier Gating

Each mob template has an `explorationTier` (1-4). Tier thresholds are configurable per zone:

| Tier | Default Threshold | What Unlocks |
|------|-------------------|---|
| 1 | 0% | Starter mobs available immediately |
| 2 | 25% | Mid-tier zone mobs |
| 3 | 50% | Dangerous zone mobs |
| 4 | 75% | Zone apex predator(s) |

### Encounter Weight Boosting

When selecting a mob for combat or ambush:
1. Filter to mobs whose tier is unlocked at current exploration %
2. Highest unlocked tier gets **2x** encounter weight
3. All other unlocked tiers keep base encounter weight
4. Roll weighted random from filtered pool

Example at 30% explored in Forest Edge:
- Tier 1 (4 mobs, weight 100 each) = 400
- Tier 2 (3 mobs, weight 200 each, boosted) = 600
- Total pool = 1000. Tier 2: 60%, Tier 1: 40%

### Zone Exit Gating

Each zone connection has an `explorationThreshold`. Zone exit discovery rolls only begin once the player reaches that threshold in the source zone. Once discovered, the exit stays discovered permanently (existing `PlayerZoneDiscovery`).

## Forest Edge Configuration

| Field | Value |
|---|---|
| `turnsToExplore` | 30,000 |
| Tier thresholds | `{1: 0, 2: 25, 3: 50, 4: 75}` |

### Mob Tier Assignments

| Tier 1 (0%) | Tier 2 (25%) | Tier 3 (50%) | Tier 4 (75%) |
|---|---|---|---|
| Field Mouse (lvl 1) | Wild Boar (lvl 2) | Tusked Boar (lvl 3) | Great Boar (lvl 4) |
| Forest Rat (lvl 1) | Giant Rat (lvl 2) | Rat King (lvl 3) | |
| Forest Spider (lvl 1) | Venomous Spider (lvl 2) | Brood Mother (lvl 3) | |
| Web Spinner (lvl 1) | | | |

### Zone Exit Thresholds

| Connection | Exploration Threshold |
|---|---|
| Deep Forest | 40% |
| Cave Entrance | 60% |

Higher-difficulty zones scale `turnsToExplore` upward and define their own tier assignments and exit thresholds.

## Data Model Changes

### New Model: `PlayerZoneExploration`

```
model PlayerZoneExploration {
  id             String   @id @default(cuid())
  playerId       String
  zoneId         String
  turnsExplored  Int      @default(0)
  player         Player   @relation(...)
  zone           Zone     @relation(...)
  @@unique([playerId, zoneId])
}
```

### Zone Additions

- `turnsToExplore` (Int) — total turns for 100%. Null for towns
- `explorationTiers` (Json) — tier unlock thresholds, e.g. `{"1": 0, "2": 25, "3": 50, "4": 75}`

### MobTemplate Addition

- `explorationTier` (Int, default 1) — which tier this mob belongs to

### ZoneConnection Addition

- `explorationThreshold` (Float, default 0) — minimum exploration % in source zone before exit rolls begin

## Affected Systems

1. **Exploration service** — accumulate spent (not refunded) turns after each run
2. **Combat service / mob selection** — filter + weight mobs by exploration %
3. **Exploration probability model** — gate zone exit rolls behind connection threshold
4. **Encounter site generation** — filter mob families to only include unlocked-tier mobs
5. **Seed data** — assign `explorationTier` to all mobs, set `turnsToExplore` and thresholds per zone, set exit thresholds per connection

## UI Changes

### Zone Exploration Progress Bar

Displayed on the exploration/zone screen:

```
Forest Edge — 37% Explored
[██████████░░░░░░░░░░░░░░░░░] 11,100 / 30,000
```

### Milestone Hints

Flavor text at thresholds:
- 0%: "The outskirts are familiar — only small creatures roam here."
- Approaching 25%: "You sense larger creatures deeper in..."
- 25%: "Tier 2 creatures now roam the area!" (one-time notification)
- 50%: "Dangerous creatures discovered!"
- 75%: "The apex predator of this zone emerges..."

### Zone Exit Display

Locked exits shown greyed out with requirement:
- "Deep Forest — requires 40% explored (currently 37%)"

### Bestiary

Mobs in locked tiers show as "???" until tier unlocks.

## What This Does NOT Change

- Combat engine (accuracy, damage, crits)
- Turn economy / regeneration
- Mob prefix system
- HP / potion system
- Crafting or equipment
- Existing zone discovery model (reused for exits)
