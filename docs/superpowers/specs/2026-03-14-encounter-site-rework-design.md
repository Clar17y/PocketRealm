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

Every room in an encounter site is a single raid-style fight: party of 1 vs all alive mobs in the room, resolved by the existing raid resolver (`resolveRaidRound` in `packages/game-engine/src/combat/raidRoundResolver.ts`).

### Mob Conversion

Encounter sites store mobs as `EncounterMobSlot` (slot, mobTemplateId, role, prefix, status, room). The raid resolver expects `ExpeditionMobState`. A new converter function `buildEncounterRaidMob(slot, template): ExpeditionMobState` maps between them:

- `hp` / `maxHp`: from `MobTemplate.hp`
- `stats`: from `MobTemplate` stat fields (attack, defence, accuracy, evasion, etc.)
- `actionTemplate`: from `MobTemplate.actionTemplate` (same template combat system used by 1v1)
- `phaseTemplates`: `null` — encounter mobs do not have phase transitions
- `activeEffects`: empty array at fight start
- `name` / `prefix`: from slot fields

This converter is called once per room entry (for auto-resolve) or once at room start (for manual), and mob HP is carried forward between rounds within a room.

### Splash Hit Cascade

When an attack misses its primary target, it re-rolls hit chance against each remaining alive mob in the room (in slot order) until one is hit or all are exhausted. Full damage on the cascaded hit. Applies to all attack types (melee, ranged, magic). Thematic justification: mobs are packed together in tight quarters.

**Integration:** Add an optional `splashCascade: boolean` parameter to `resolveRaidRound`. When enabled and a player attack misses, the resolver iterates through other alive mobs in slot order, rolling hit chance against each. First hit ends the cascade. This is a small, targeted change to the resolver — the cascade logic lives inside `resolvePlayerOffensive`.

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

When `aliveMobs = 1`, the formula naturally yields 1.0 (full power). As mobs die, total incoming DPS decreases (fewer attackers) but each surviving mob hits harder individually. The strategic incentive is to eliminate mobs quickly to reduce the number of incoming attacks per round.

**Integration:** Pre-processing approach. Before each round, compute the crowded multiplier from the current alive mob count and apply it to a **copy** of each mob's stats (damage, accuracy). Pass the modified stats copy to `resolveRaidRound`. The original `ExpeditionMobState.stats` are never mutated — the multiplier is recomputed each round as mobs die.

### Targeting

Player attacks target the lowest-HP mob by default (cleave the weak to reduce incoming actions). In manual mode, the player can override target selection via the round action payload (see API section).

### Combat Mode

Encounter site rooms use `pve_open_world` hit curves (same as current 1v1 encounter combat).

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

Manual rooms must be completed in one session. If the player disconnects mid-room, the room resets (mobs return to alive, turn cost lost). This avoids the need to persist per-round state (mob HP, effects, round number) on the encounter site model — keeping the schema simple compared to expeditions which require persistence for multi-player coordination.

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

`mob_count * ENCOUNTER_TURN_COST` per room, charged when the player enters the room (not all upfront). With `ENCOUNTER_TURN_COST = 50`, a 4-room large site with 3-5 mobs per room costs 600-1000 turns total (~10-17 minutes of regen at 1 turn/sec). This is intentional — large sites with epic chest rewards should require meaningful turn investment, comparable to expedition costs.

### Decay Exploit Fix (#30)

If any mobs in a room have decayed since the site was discovered, that room's auto-resolve loot bonus is disabled. The player can still auto-resolve for speed, but the multiplier does not apply. Simple check: `decayedCountInRoom > 0` disables the bonus for that room.

On defeat, only defeated mobs reset to alive — decayed mobs stay decayed. The decayed count persists, so the bonus remains disabled on retry.

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

**Type changes:** Extend `ChestRarity` type from `'common' | 'uncommon' | 'rare'` to include `'epic' | 'legendary'`. Add a new `getChestRarityForRoomCount(rooms: number): ChestRarity` function in `encounterChest.ts`. The chest service receives room count (not site size) when granting encounter site rewards.

### New Chest Constants

```typescript
// Add to CHEST_CONSTANTS
CHEST_MATERIAL_ROLLS_EPIC: { min: 5, max: 9 },
CHEST_MATERIAL_ROLLS_LEGENDARY: { min: 7, max: 12 },
CHEST_RECIPE_CHANCE_EPIC: 0.08,
CHEST_RECIPE_CHANCE_LEGENDARY: 0.15,
```

### Drop Tables

`ChestDropTable` entries needed at epic and legendary rarity for each mob family. Epic tables are derived from rare tables with adjusted weights (higher-quality drops, lower filler). Legendary tables are placeholder entries for future content. Added via seed data migration.

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

## API Endpoints

### Auto-Resolve a Room

```
POST /api/v1/combat/encounter-sites/:id/auto-resolve
```

- Auth: site owner
- Precondition: site exists, current room has not started combat
- Request body: none (uses active combat template)
- Response: `{ outcome: 'clear' | 'defeat', rounds: RoundResult[], loot?: ChestReward, roomState: RoomState }`

### Manual Round

```
POST /api/v1/combat/encounter-sites/:id/round
```

- Auth: site owner
- Precondition: site exists, current room is in manual combat
- Request body: `{ action: ActionType, targetMobSlot?: number }` — `targetMobSlot` overrides default lowest-HP targeting
- Response: `{ roundResult: RoundResult, roomCleared: boolean, defeated: boolean }`

### Start Manual Room

```
POST /api/v1/combat/encounter-sites/:id/start-room
```

- Auth: site owner
- Precondition: site exists, current room has not started combat
- Charges turn cost for the room, initializes manual combat state in-memory
- Response: `{ room: number, mobs: MobState[], turnCost: number }`

## Schema Changes

Encounter site model changes:

- Add `roomStrategy: Json` — per-room tracking of auto-resolve vs manual choice and whether loot bonus applies. Example: `[{ room: 1, mode: "auto", bonusEligible: true }, { room: 2, mode: "manual", bonusEligible: true }]`
- Keep `roomCarryHp: Int?` — existing field, continues to track carry HP between rooms. Stamina and mana carry are handled in-memory during combat (same as current behavior) and snapshotted to `roomCarryHp` JSON when a room is cleared (expand to `roomCarryState: Json` with `{ hp, stamina, mana }`)
- Remove `clearStrategy` and `fullClearActive` fields (replaced by per-room tracking)
- No per-round state persistence — manual rooms must complete in one session (see Manual Implementation section)

## Migration

All existing encounter sites are deleted during migration. Sites are ephemeral content that decays naturally, so no data preservation is needed. The schema migration drops old fields and adds new ones in a single step.

## Carry-HP Between Rooms

After clearing a room, remaining HP/stamina/mana is saved to `roomCarryState` and restored when the next room starts. The choice of auto-resolve vs manual for the next room does not affect this.

## Site Deletion

When all rooms are cleared, the site is deleted and the chest is generated. Chest tier is determined by total room count (per the tier table). Auto-resolve multiplier applies proportionally based on how many rooms were auto-resolved with bonus eligibility.
