# Exploration Rework Design

## Problem

Exploration has three issues:
1. **Only two outcome types** (mobs and resource nodes) — gets boring fast
2. **Combat is too easy** — single mobs with prefixes die quickly, no real challenge
3. **Resource nodes accumulate** — they're persistent with no expiry or cap, stacking up even when the player isn't gathering
4. **No zone gating** — nothing stops a player rushing to the hardest zone and mining top-tier resources

## Design Goals

- Exploration should feel like an **adventure into the unknown**, not a menu choice
- Combat should have **depth and progression**, not just one-off fights
- Zones should have **natural danger** that gates underprepared players
- Resource nodes should have **gentle pressure** to use them

## New Exploration Model

Three discovery layers replace the current two:

### 1. Ambushes (Unavoidable Combat)

Zone-appropriate mobs attack during exploration. This is the "danger tax" of a zone.

**Trigger:** Independent per-turn chance (`AMBUSH_CHANCE_PER_TURN`). Higher than the old mob encounter rate — ambushes should happen regularly.

**Mob Selection:** Weighted pick from zone mob pool. Prefixes rolled as normal. Always a single creature.

**Resolution:** Runs through existing `runCombat()` with player's current equipment and HP.
- **Win:** Player takes HP damage, exploration continues, base XP awarded (no exploration multiplier needed).
- **Lose:** Exploration **aborts**. Discoveries from earlier turns are kept. Remaining turns are refunded. Player HP is whatever combat left them at.

**Zone Gating:** A player *can* enter a high-level zone, but ambushes will wreck them repeatedly. Exploring becomes turn-inefficient — you spend more time resting than discovering. No hard lock, just natural consequences.

### 2. Encounter Sites (Persistent Opt-in Combat)

Dens, camps, nests, and ruins populated by a **mob family**. Discovered during exploration, persisted to the database, cleared at the player's own pace.

**Replaces:** The current `PendingEncounter` system entirely.

**Discovery:** When the simulation rolls an encounter site, it picks a mob family available in the zone and rolls a size. The site is saved and the player can engage it whenever they choose.

**Clearing:** Player fights mobs one at a time in order (trash → elite → boss). Each fight is a standard `runCombat()` call. Between fights the player can rest, switch gear, or leave and come back. When all mobs are defeated, the site is cleared and removed — with a potential bonus completion reward.

**Decay:** Encounter sites decay slowly over time (the pack moves on, the camp disbands). Slower rate than resource nodes since clearing them is more involved.

### 3. Resource Nodes (Persistent Gathering — with Decay)

Works as today, but nodes now **lose remaining capacity over time** via lazy calculation.

**Mechanism:**
```
capacityLost = floor(elapsed_hours * RESOURCE_NODE_DECAY_RATE_PER_HOUR)
effectiveCapacity = max(0, remainingCapacity - capacityLost)
```

Computed on query/mine, not via cron. Node deleted when effective capacity hits 0.

**Tuning:** A medium node (~50 capacity) should last roughly 3-4 days unmined. Approximately 0.6-0.7 capacity/hour.

**UI:** Subtle indicator that nodes are weathering (faded bar or label). No countdown timer.

## Mob Families

Mob families group related mob templates with role assignments and naming patterns.

### Data Model

```
MobFamily
  id, name, siteNounSmall, siteNounMedium, siteNounLarge
  e.g., "Wolves", "Pack", "Den", "Territory"

MobFamilyMember
  mobFamilyId, mobTemplateId, role (trash | elite | boss)
  e.g., Wolves + Wolf = trash, Wolves + Dire Wolf = elite, Wolves + Pack Leader = boss

ZoneMobFamily (junction — same family can appear in multiple zones)
  zoneId, mobFamilyId, discoveryWeight, minSize, maxSize
  e.g., Forest Edge + Wolves: weight=10, min=small, max=medium
        Dark Woods + Wolves: weight=5, min=medium, max=large
```

### Size Categories

| Size | Total Mobs | Composition | Example |
|------|-----------|-------------|---------|
| Small | 2-3 | All trash | Small Wolf Pack |
| Medium | 4-6 | Trash + 1 elite | Wolf Den |
| Large | 7-10 | Trash + 2 elite + 1 boss | Large Wolf Territory |

Size probabilities controlled by `minSize`/`maxSize` on `ZoneMobFamily`. Early zones skew small, late zones can roll large.

### Site Naming

Generated from mob family name + size noun: `[size_adjective?] [family.siteNoun_for_size]`
- Small: "Small Wolf Pack"
- Medium: "Wolf Den"
- Large: "Large Wolf Territory"

## Encounter Site Internal State

Store the mob list as structured data on the site:

```json
{
  "mobs": [
    { "slot": 0, "mobTemplateId": "wolf-1", "role": "trash", "prefix": null, "status": "alive" },
    { "slot": 1, "mobTemplateId": "wolf-1", "role": "trash", "prefix": "weak", "status": "defeated" },
    { "slot": 2, "mobTemplateId": "dire-wolf", "role": "elite", "prefix": null, "status": "alive" },
    { "slot": 3, "mobTemplateId": "pack-leader", "role": "boss", "prefix": "ancient", "status": "alive" }
  ]
}
```

This makes it trivial to query "which mobs are still alive" — important for future multiplayer/guild raids.

## Exploration Simulation Changes

`simulateExploration()` adds ambush rolls and returns richer event types.

**Per-turn rolls (independent):**
- `AMBUSH_CHANCE_PER_TURN` — ambush event
- `ENCOUNTER_SITE_CHANCE_PER_TURN` — encounter site discovery
- `RESOURCE_NODE_CHANCE` — resource node (unchanged)
- `HIDDEN_CACHE_CHANCE` — hidden cache (unchanged)
- `ZONE_EXIT_CHANCE` — zone exit (unchanged)

**Processing order:** The API processes outcomes in turn order. When it hits an ambush, it runs `runCombat()`. If the player loses, all outcomes after that turn are discarded and remaining turns are refunded.

**Single atomic request:** Exploration remains a single API call. No multi-step flow.

## Narrative Exploration Log

The result is a chronological timeline:

```
Turn 83:   You discovered a Small Copper Vein (32 capacity)
Turn 241:  A Wild Boar ambushed you — you defeated it! (+15 XP)
Turn 445:  You stumbled into a Wolf Den (5 wolves inside)
Turn 512:  You discovered a Medium Tin Deposit (58 capacity)
Turn 738:  A Ferocious Giant Spider ambushed you — you were defeated!
           Exploration aborted. 262 turns refunded.
```

**Event data model:**
- `turn` — which turn it occurred on
- `type` — `ambush_victory | ambush_defeat | encounter_site | resource_node | hidden_cache | zone_exit`
- `description` — human-readable narrative text
- `details` — type-specific payload (combat result, site info, node info)

**Empty result:** "You explored the Forest Edge for 50 turns but found nothing of interest."

## Impact on Existing Systems

### Removed
- `PendingEncounter` model and all related code
- `PENDING_ENCOUNTER_TTL_SECONDS`
- `MOB_XP_NORMALIZER_TURNS` and `MOB_XP_MULTIPLIER_MAX`
- `calculateExplorationMobXpMultiplier()` in `xpScaling.ts`

### New Database Models
- `MobFamily` — name, site noun patterns
- `MobFamilyMember` — links mob templates to families with roles
- `ZoneMobFamily` — junction, per-zone discovery weight and size range
- `EncounterSite` — player-owned, references mob family, stores mob list and clearing progress

### Modified
- `simulateExploration()` — adds ambush rolls, richer event types
- Exploration route handler — resolves ambush combat inline, creates encounter sites, builds narrative log
- `EXPLORATION_CONSTANTS` — replace `MOB_ENCOUNTER_CHANCE` with `AMBUSH_CHANCE_PER_TURN` and `ENCOUNTER_SITE_CHANCE_PER_TURN`
- `PlayerResourceNode` — decay support (lazy-calculated from `discoveredAt`)
- Frontend exploration UI — render narrative log, show encounter sites as clearable locations

### Unchanged
- `runCombat()` — used as-is for ambushes and encounter site fights
- Resource node mining mechanics (turn cost, XP, yield)
- Hidden caches and zone exits
- HP system, rest system, turn economy
- Crafting, equipment, skills

## Encounter Site Completion: Loot Chests

When all mobs in an encounter site are defeated, the player receives a **loot chest** whose rarity scales with site size.

### Chest Tiers

| Site Size | Chest Rarity | Recipe Drop Chance | Material Drops |
|---|---|---|---|
| Small (2-3) | Common | 0% | 1-2 common crafting materials |
| Medium (4-6) | Uncommon | 2% | 2-4 materials incl. mob-family-specific |
| Large (7-10) | Rare | 5% | 3-6 materials incl. rare + mob-family-specific, consumables |

Recipe drop chances are intentionally low — recipes are milestone moments, not routine drops. ~50 medium site clears or ~20 large site clears on average to see one. All rates are tunable constants in `gameConstants.ts`.

### Chest Contents

- **Mob-family-specific crafting materials** — Wolf pelts from wolf dens, goblin steel from goblin camps. These are required by advanced recipes and can't be obtained through mining. Scales with chest tier.
- **Consumables** — Potions, temporary buffs. Minor but useful.
- **Advanced recipes** (rare) — Unique soulbound gear recipes tied to the mob family. See below.

### Advanced Recipe System

Two crafting tiers:

**Basic recipes** (unchanged) — Unlocked by skill level alone. Current system untouched.

**Advanced recipes** (new) — Require finding the recipe drop from a chest AND meeting the skill level. Produce unique, soulbound items tied to the mob family they came from.

Properties:
- `isAdvanced: true` — Distinguishes from basic recipes in the crafting UI
- `soulbound: true` — Crafted item cannot be traded (future-proofing for trade system)
- `mobFamilyId` — Ties recipe to the mob family it drops from
- Materials include mob-family-specific drops (from chests) + standard materials
- Crafted items have higher base stats and a guaranteed rarity floor (uncommon+)

Examples:
- Wolf Den chest → "Packmaster's Hood" recipe → requires wolf pelts + standard leather + skill level
- Goblin Camp chest → "Warchief's Blade" recipe → requires goblin steel + standard ore + skill level
- Spider Nest chest → "Silkweaver's Robe" recipe → requires spider silk + standard cloth + skill level

### Recipe Unlock Flow

1. Player discovers and clears encounter sites
2. Chest drops (guaranteed on completion)
3. Rare chance: chest contains an advanced recipe
4. Player learns the recipe (added to their known recipes)
5. Player gathers required materials (mob-family-specific from more chests + standard from mining)
6. Player crafts the soulbound item at the forge

### Future-Proofing: Set Gear

`ItemTemplate` gets a nullable `setId` field (unused now). Advanced items from the same mob family can later be grouped into named sets with set bonuses when guild raids / harder dungeons are implemented. No set logic yet — just the data hook.

### Database Changes

**New fields on `CraftingRecipe`:**
- `isAdvanced` (boolean, default false)
- `soulbound` (boolean, default false)
- `mobFamilyId` (nullable FK to MobFamily)

**New fields on `ItemTemplate`:**
- `setId` (nullable, unused — future set bonuses)

**New model: `PlayerRecipe`**
- `playerId`, `recipeId` — tracks which advanced recipes a player has learned
- Basic recipes don't need entries (unlocked by level)

**New model: `ChestDropTable`**
- `mobFamilyId`, `chestRarity`, `itemTemplateId`, `dropChance`, `minQuantity`, `maxQuantity`
- Separate from mob `DropTable` — chests have their own loot pools per mob family

### New Constants

```typescript
CHEST_RECIPE_CHANCE_SMALL: 0,       // 0% — no recipes from small sites
CHEST_RECIPE_CHANCE_MEDIUM: 0.02,   // 2%
CHEST_RECIPE_CHANCE_LARGE: 0.05,    // 5%
CHEST_MATERIAL_ROLLS_SMALL: { min: 1, max: 2 },
CHEST_MATERIAL_ROLLS_MEDIUM: { min: 2, max: 4 },
CHEST_MATERIAL_ROLLS_LARGE: { min: 3, max: 6 },
```

## Future Extension: Multiplayer / Guild Raids

The architecture accommodates shared encounter sites:

1. Decouple discovery from participation — add `guildId`/`partyId`, make `playerId` optional
2. Track per-mob defeat state (already structured as slot array with status) so multiple players can clear concurrently
3. Add a raid size tier to `ZoneMobFamily`:

| Size | Mobs | Who can find it |
|------|------|-----------------|
| Raid | 15-30+ | Guild exploration |

Same mob family structure, just bigger compositions with multiple bosses. The mob slot array scales naturally.

## New Constants

```typescript
// Ambush
AMBUSH_CHANCE_PER_TURN: number        // e.g., 0.005 (1 per ~200 turns)

// Encounter sites
ENCOUNTER_SITE_CHANCE_PER_TURN: number // e.g., 0.0008
ENCOUNTER_SITE_DECAY_RATE_PER_HOUR: number

// Resource node decay
RESOURCE_NODE_DECAY_RATE_PER_HOUR: number // e.g., 0.65

// Size definitions
ENCOUNTER_SIZE_SMALL: { min: 2, max: 3 }
ENCOUNTER_SIZE_MEDIUM: { min: 4, max: 6 }
ENCOUNTER_SIZE_LARGE: { min: 7, max: 10 }
```

All values tunable in `gameConstants.ts`.
