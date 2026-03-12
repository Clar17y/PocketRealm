# Early-Game Difficulty: Rooms & Tier Bleedthrough

## Problem

Starting players face no meaningful danger. Tier 1 mobs deal 1-3 damage against 100 HP, passive regen heals fully in minutes, and encounter sites allow healing between every fight. A level-1 player with no equipment can clear multiple sites without risk.

## Solution

Two independent features that compound:

1. **Room-based encounter sites** — mobs grouped into rooms that must be fought consecutively
2. **Tier bleedthrough** — mob selection draws from adjacent tiers with decreasing probability

---

## Feature 1: Room System

### Site Structure

Sites contain rooms. Each room contains mobs that must be fought back-to-back with no healing between fights within a room.

| Site Size | Rooms | Mobs per Room |
|-----------|-------|---------------|
| Small     | 1     | 2-4           |
| Medium    | 2     | 2-4 each      |
| Large     | 3-4   | 2-5 each      |

Room count and mob count per room are randomized within ranges.

### Strategy Selection

When engaging a site, the player chooses one strategy (locked for that site):

**Full Clear** — All rooms fought consecutively. No breaks, no healing between rooms or mobs. HP carries over throughout the entire site.
- On success: full-clear bonus applied to chest reward
- On knockout: strategy downgrades to Room by Room. Kill progress preserved (dead mobs stay dead). Player enters recovery, returns to finish remaining mobs room-by-room.

**Room by Room** — Fight one room at a time. Within a room, mobs are consecutive (no healing). After clearing a room, player leaves the site and can heal before returning.
- On knockout mid-room: current room resets (mobs respawn). Previously cleared rooms stay cleared.
- Normal chest reward (no full-clear bonus).

### Full-Clear Bonus

Rewards for completing all rooms without resting:
- **Drop rates:** 1.5x multiplier on drop table rolls per mob
- **Recipe chance:** 1.5x on recipe rolls from site chest
- **Chest quality:** Chest rolls one tier higher (small → medium, medium → large)
- **No XP bonus** — XP from kills is identical regardless of strategy

### Data Model

New model: `EncounterRoom`
- `id`, `siteId` (FK → EncounterSite), `roomNumber` (1-indexed), `status` (pending/in_progress/cleared)

`EncounterMob` changes:
- Add `roomId` (FK → EncounterRoom), `mobOrder` (fight sequence within room)

`EncounterSite` changes:
- Add `clearStrategy` (full_clear/room_by_room), `consecutiveClear` (boolean — true until full clear fails)

### Combat Flow

**Within a room:**
1. Player starts combat → server picks next alive mob in current room
2. Combat resolves normally (existing engine)
3. If player wins and more mobs remain in room → next mob starts (HP carries)
4. If all mobs in room dead → room status = cleared

**Between rooms (Full Clear):**
- Automatic transition to next room. No client interaction needed beyond combat.

**Between rooms (Room by Room):**
- Player returned to site overview. Can leave, heal, return later.

**Knockout:**
- Full Clear: progress preserved, strategy downgrades to room-by-room, recovery state
- Room by Room: current room resets, recovery state

---

## Feature 2: Tier Bleedthrough

### Current Behavior

Exploration % determines mob tier. At 0%, only tier 1. At 25%, tier 2 unlocks. Mobs are always from the current tier.

### New Behavior

Current tier still determined by exploration %, but each mob slot rolls independently:

| Roll | Result       |
|------|-------------|
| 75%  | Current tier |
| 20%  | Tier + 1     |
| 5%   | Tier + 2     |

### Rules

- Capped at zone's maximum tier. If tier+N doesn't exist, falls back to highest available.
- Applies to both ambush encounters (during exploration) and site mob generation (when site is created).
- Mob prefixes applied after tier selection (unchanged).

### Early-Game Impact

At 0% exploration in Forest Edge:
- 75%: Tier 1 (8-14 HP, 1-3 dmg) — comfortable
- 20%: Tier 2 (20-22 HP, 2-6 dmg) — real threat
- 5%: Tier 3 (30-45 HP, 3-8 dmg) — dangerous

Combined with rooms: a 3-mob room where one is tier 2 becomes a genuine attrition check for a naked level-1 player.

---

## Scope

### Game Engine
- Tier bleedthrough mob selection function
- Room generation logic (assign mobs to rooms by site size)
- No changes to core combat resolution

### Database
- New `EncounterRoom` model
- `roomId` on `EncounterMob`
- `clearStrategy` + `consecutiveClear` on `EncounterSite`
- Migration

### API
- Exploration: use bleedthrough when generating ambush encounters and site mobs
- Combat: strategy selection, room-aware combat flow, between-mob transitions within rooms
- Site endpoints: return room structure and progress

### Frontend
- Strategy selection modal on site engagement
- Room progress indicator during combat (Room X — Mob Y/Z)
- Room transition screen (room-by-room mode)
- Full-clear bonus indicator on reward screen
- Site discovery UI shows room count

### Constants

New constants in `gameConstants.ts`:
- `TIER_BLEED_CURRENT: 0.75`
- `TIER_BLEED_PLUS_ONE: 0.20`
- `TIER_BLEED_PLUS_TWO: 0.05`
- `FULL_CLEAR_DROP_MULTIPLIER: 1.5`
- `FULL_CLEAR_RECIPE_MULTIPLIER: 1.5`
- Room count/mob count ranges per site size
