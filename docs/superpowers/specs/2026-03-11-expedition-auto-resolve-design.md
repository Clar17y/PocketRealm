# Expedition Room Auto-Resolve & Auto-Advance

## Goal

Two convenience features for guild expeditions: instant room resolution with a token bonus, and a client-side auto-advance toggle for faster manual pacing.

## Feature 1: Auto-Resolve (Backend)

### Overview

Before a room's first round, the expedition leader (or officer) can choose to auto-resolve the entire room. The server runs all combat rounds instantly using each member's currently active template, with no opportunity to switch templates or react to telegraphs. Successful clears earn a token bonus.

### Flow

1. Leader/officer calls `POST /guild/:id/expeditions/:expeditionId/auto-resolve`
2. Server validates: expedition status is `in_progress`, caller is leader or officer, current room `roundNumber === 0`
3. Server clears `nextRoundAt` (set to `null` or far-future) to prevent the background timer from firing during resolution
4. Server takes a `roomStartSnapshot` of all member state
5. Server builds raid participants once (stats, equipment, templates, potion pool)
6. Server loops `resolveRaidRound()` (same pure game-engine function as manual mode), carrying forward in-memory state between iterations — no DB writes per round
7. Loop exits on: room cleared (all mobs dead), party wipe (all players KO'd), or `AUTO_RESOLVE_MAX_ROUNDS` reached (treated as wipe)
8. Single DB transaction writes final state: member HP/stamina/mana/effects, potion consumption, loot, tokens with bonus
9. On wipe: restore from `roomStartSnapshot` as normal; group can retry (auto-resolve or manual). Restore `nextRoundAt` for normal timer operation.
10. On error mid-loop: room state remains unchanged (round 0, no damage applied)

### In-Memory State Carryover Between Rounds

Between loop iterations, carry forward from each round's result into the next round's input:
- `templateRoundAfter` → participant's `templateRound`
- `hpAfter` / `staminaAfter` / `manaAfter` → participant's current resources
- `activeEffectsAfter` → participant's active effects
- `threatTableAfter` → next round's threat table input
- Updated mob HP/effects/phase from round result → room mob state
- Potion pool mutations (consumed potions removed from pool)
- Summon pool: provide the full pool each round; the resolver handles summon budget tracking internally

### What stays identical to manual mode

- Combat resolution logic (`resolveRaidRound` calls)
- Potion consumption and sickness
- DOTs, buffs, threat, phase transitions, mob summons
- Wipe detection and snapshot restore
- Loot distribution on clear
- Full combat log generation (stored for player review)

### What differs from manual mode

- No timer between rounds — all rounds resolve instantly
- No intermediate DB persistence
- Templates locked for the duration (whatever's active at call time)
- Players don't see or react to telegraphs
- Token bonus applied on successful clear

### Token Bonus

Percentage bonus on room token reward: `AUTO_RESOLVE_TOKEN_BONUS_PERCENT: 0.25` (25%). Only on successful clear. Applied as `Math.floor(roomTokens * AUTO_RESOLVE_TOKEN_BONUS_PERCENT)` added on top of the normal `awardRoomTokens()` result. The completion bonus for the final room does NOT get the uplift — only per-room tokens.

### Constants

```typescript
// Add to EXPEDITION_CONSTANTS
AUTO_RESOLVE_TOKEN_BONUS_PERCENT: 0.25,
AUTO_RESOLVE_MAX_ROUNDS: 100,
```

### API

```
POST /guild/:id/expeditions/:expeditionId/auto-resolve
```

- Auth: guild member + leader or officer (same as force-round)
- Precondition: expedition status `in_progress`, current room `roundNumber === 0`
- Response: room result (clear/wipe), full round-by-round combat log, loot, tokens awarded
- Concurrency: clears `nextRoundAt` before starting to prevent background timer conflicts

### Schema Changes

None. Existing models handle everything. Track `autoResolved: boolean` in the room result JSON to apply token bonus.

## Feature 2: Auto-Advance (Frontend Only)

### Overview

A UI toggle on the expedition screen that auto-fires the existing "force next round" API call every 10 seconds. Purely client-side — the backend doesn't know or care.

### Behavior

- Leader/officer sees an "Auto" toggle button on the expedition room screen
- When toggled on: `setInterval` calls the force-next-round endpoint every 10 seconds
- When toggled off: interval is cleared, reverts to normal manual pacing (next round fires on the room-type-specific timer: 2 min for trash/elite/event, 3 min for mini_boss/final_boss)
- Templates are NOT locked — players can still switch between the 10-second rounds
- No token bonus
- Toggle state is local (not persisted — page refresh resets to off)

### No backend changes required

The force-round endpoint resolves immediately when called (no timing gate on the server). The frontend timer just automates the button click.

## Key Design Distinction

| | Auto-Resolve | Auto-Advance |
|---|---|---|
| Where | Backend | Frontend only |
| Speed | Instant (all rounds) | 10-second intervals |
| Templates | Locked | Free to switch |
| Token bonus | +25% | None |
| Risk | High (committed) | Low (can toggle off) |
| Backend changes | New endpoint + loop | None |
