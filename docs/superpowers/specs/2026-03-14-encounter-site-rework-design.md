# Encounter Site Rework

## Goal

Transform encounter sites from sequential 1v1 mob grinds into multi-mob room fights that serve as a low-level introduction to raid mechanics. Fixes seven balance issues (#6, #30, #37, #75, #76, #77, #79) and replaces the room-by-room / full-clear strategy with per-room auto-resolve / manual choice, mirroring expedition UX.

## Issues Addressed

| # | Issue | Fix |
|---|-------|-----|
| 6 | Ambush 6.25x more common than encounter sites | Raise discovery rate |
| 30 | Decay exploit: wait for mobs to decay, keep full-clear bonus | Disable auto-resolve bonus if room has decayed mobs |
| 37 | Decay rate too slow, sites accumulate | Raise decay rate |
| 75 | Large full-clear reward capped at rare | Large 4-room sites earn epic chests |
| 76 | Admin/player site generation divergence | Align admin route with room system |
| 77 | Medium per-room mob range identical to small | Differentiate medium mob counts |
| 79 | No chest tier above rare | Add epic and legendary tiers |

## Multi-Mob Room Combat

Every room in an encounter site is a single raid-style fight: party of 1 vs all alive mobs in the room, resolved by the existing raid resolver (`resolveRaidRound`).

### Splash Hit Cascade

When an attack misses its primary target, it re-rolls hit chance against each remaining alive mob in the room (in slot order) until one is hit or all are exhausted. Full damage on the cascaded hit. Applies to all attack types (melee, ranged, magic). Thematic justification: mobs are packed together in tight quarters.

### Crowded Debuff

Each mob's damage and accuracy are reduced based on how many other alive mobs share the room. Thematic justification: mobs get in each other's way.

Formula: `multiplier = 1 / (1 + (aliveMobs - 1) * CROWDED_FACTOR)`

| Alive mobs | Multiplier (at 0.15) |
|-----------|---------------------|
| 1 | 100% |
| 2 | 87% |
| 3 | 77% |
| 4 | 69% |
| 5 | 63% |

Last mob standing always fights at full power. This creates a tension curve — the fight gets harder as you thin the herd.

### Targeting

Player attacks target the lowest-HP mob by default (cleave the weak to reduce incoming actions). In manual mode, the player can override target selection.

### Combat Mode

Encounter site rooms use `pve_open_world` hit curves (same as current 1v1 encounter combat). The splash hit cascade and crowded debuff are encounter-site-specific modifiers layered on top of the standard raid resolver, not changes to the resolver itself.

## Per-Room Strategy: Auto-Resolve vs Manual

Replaces the old room-by-room / full-clear distinction entirely.

### Flow

1. Player discovers an encounter site (via exploration)
2. Player sees the room layout: room count, mob count per room, mob roles
3. Player progresses room by room sequentially
4. Before each room, player chooses:
   - **Auto-resolve**: fight resolves instantly using the player's combat template. Grants a loot multiplier. Faster, but template is locked and player cannot react.
   - **Manual**: player sees each round, picks actions. Better survival odds, no loot bonus.

### Auto-Resolve Implementation

Reuses the expedition auto-resolve pattern:

1. Player calls the auto-resolve endpoint for their current encounter site room
2. Server validates: site exists, room is current, room has not started (round 0)
3. Server builds player stats, loads active combat template
4. Server loops `resolveRaidRound()` in-memory, carrying forward HP/stamina/mana/effects between iterations
5. Loop exits on: room cleared (all mobs dead), player defeated, or `ENCOUNTER_AUTO_RESOLVE_MAX_ROUNDS` reached (treated as defeat)
6. Single DB transaction writes final state
7. On defeat: room mobs reset, turn cost lost, carry-HP cleared

### Manual Implementation

Uses the raid resolver with round-by-round player input, same as expedition manual mode but for a solo player. Each round:

1. Player selects action (or template auto-selects)
2. Server resolves one round via `resolveRaidRound()`
3. Round result returned to client
4. Repeat until room cleared or player defeated

### Loot Multiplier

Each auto-resolved room earns `AUTO_RESOLVE_DROP_MULTIPLIER` (1.5x) applied to that room's contribution to the final chest roll count. Tracked per-room.

At site clear, the effective multiplier on total material rolls is proportional:
`effectiveRolls = Math.ceil(baseRolls * (1 + (autoResolvedRooms / totalRooms) * (AUTO_RESOLVE_DROP_MULTIPLIER - 1)))`

Recipe chance uses the same proportional logic.

### Defeat Behavior

- On defeat (auto or manual): that room's mobs reset to alive, turn cost for that room is lost, carry-HP resets
- Previous rooms' progress is kept
- Player can retry the room and switch strategy (e.g., auto-resolve failed → try manual)

### Turn Cost

`mob_count * ENCOUNTER_TURN_COST` per room, charged when the player enters the room (not all upfront).

### Decay Exploit Fix (#30)

If any mobs in a room have decayed since the site was discovered, that room's auto-resolve loot bonus is disabled. The player can still auto-resolve for speed, but the multiplier does not apply. Simple check: `decayedCountInRoom > 0` disables the bonus for that room.

### Single-Room Sites (Small)

Auto-enter the room like today. Player chooses auto-resolve or manual. No strategy pre-selection screen needed.

## Chest Tier Expansion

### New Tier Table

| Site size | Rooms | Chest tier |
|-----------|-------|-----------|
| Small | 1 | Common |
| Medium | 2 | Uncommon |
| Large | 3 | Rare |
| Large | 4 | Epic |

The old `CHEST_TIER_UPGRADE` mechanic (full-clear upgrades tier) is removed. Tier is now determined by room count. The auto-resolve reward is a drop multiplier, not a tier bump.

Legendary chests are added to the system but reserved for future content (expeditions, world bosses, special events).

### New Chest Constants

```typescript
// Add to CHEST_CONSTANTS
CHEST_MATERIAL_ROLLS_EPIC: { min: 5, max: 9 },
CHEST_MATERIAL_ROLLS_LEGENDARY: { min: 7, max: 12 },
CHEST_RECIPE_CHANCE_EPIC: 0.08,
CHEST_RECIPE_CHANCE_LEGENDARY: 0.15,
```

### Drop Tables

`ChestDropTable` entries needed at epic and legendary rarity for each mob family. Seed data migration required.

## Constants Changes

### Discovery Rate (#6)

`ENCOUNTER_SITE_CHANCE_PER_TURN`: 0.0008 → 0.0015

Narrows the ambush:site ratio from 6.25:1 to ~3.3:1. Encounter sites become a regular part of exploration rather than a rare event.

### Decay Rate (#37)

`ENCOUNTER_SITE_DECAY_RATE_PER_HOUR`: 0.06 → 0.25

1 mob per 4 hours instead of per 17 hours. Sites feel urgent, not permanent. A 5-mob site fully decays in ~20 hours instead of ~83 hours.

### Medium Mob Range (#77)

`MOBS_PER_ROOM_MEDIUM`: {min: 2, max: 4} → {min: 3, max: 5}

Differentiates from small's {2, 4}. Medium rooms are noticeably denser.

### New Constants

```typescript
// Encounter site combat modifiers
ENCOUNTER_SITE_CONSTANTS: {
  CROWDED_FACTOR: 0.15,
  AUTO_RESOLVE_DROP_MULTIPLIER: 1.5,
  AUTO_RESOLVE_RECIPE_MULTIPLIER: 1.5,
  AUTO_RESOLVE_MAX_ROUNDS: 100,
}
```

### Removed Constants

- `FULL_CLEAR_CONSTANTS.DROP_MULTIPLIER` — replaced by `AUTO_RESOLVE_DROP_MULTIPLIER`
- `FULL_CLEAR_CONSTANTS.RECIPE_MULTIPLIER` — replaced by `AUTO_RESOLVE_RECIPE_MULTIPLIER`
- `FULL_CLEAR_CONSTANTS.CHEST_TIER_UPGRADE` — removed, tier determined by room count
- `EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL/MEDIUM/LARGE` — legacy admin-only constants, replaced by room system

## Admin Route Alignment (#76)

Refactor admin encounter site creation (`POST /admin/encounter-sites`) to use the same `generateRoomAssignments()` + `buildEncounterSiteMobs()` pipeline that player discovery uses. Admin can specify zone, mob family, and size — the room/mob generation uses the standard path. Removes the divergence where admin sites had flat structure, legacy mob counts, and no role distribution.

## Schema Changes

Encounter site model needs:

- `roomStrategy: Json` — per-room tracking of auto-resolve vs manual choice and whether loot bonus applies. Example: `[{ room: 1, mode: "auto", bonusEligible: true }, { room: 2, mode: "manual", bonusEligible: true }]`
- Remove `clearStrategy` and `fullClearActive` fields (replaced by per-room tracking)

## Carry-HP Between Rooms

After clearing a room, remaining HP/stamina/mana carries to the next room (same as current behavior). The choice of auto-resolve vs manual for the next room does not affect this.

## Site Deletion

When all rooms are cleared, the site is deleted and the chest is generated. Chest tier is determined by total room count (per the tier table). Auto-resolve multiplier applies proportionally based on how many rooms were auto-resolved with bonus eligibility.
