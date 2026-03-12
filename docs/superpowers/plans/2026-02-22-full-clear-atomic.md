# Full Clear: Atomic Multi-Room Combat

## Problem

Full Clear currently processes one room per API call. Between rooms, the player can leave, rest, craft potions, swap gear, then return — defeating the purpose of a risky all-or-nothing clear. The `roomCarryHp` field persists HP between separate requests, but nothing prevents the player from healing or re-equipping between them.

## Solution

When Full Clear is active, a single API call processes **all remaining rooms** sequentially. HP carries between rooms within the request. The frontend plays back all fights continuously with room transition dividers. No opportunity to leave mid-clear.

## Backend Changes

### `handleEncounterSiteRoomCombat` (`apps/api/src/routes/combat/start.ts`)

When `site.clearStrategy === 'full_clear' && site.fullClearActive`:

1. After clearing the current room's mobs, instead of returning, advance to the next room and continue the fight loop.
2. Wrap the entire multi-room loop: outer loop over rooms, inner loop over mobs per room.
3. HP carries via `currentPlayerHp` local variable (already exists) — no DB persistence between rooms.
4. On defeat at any point: break both loops, proceed to existing defeat handling (downgrade to `room_by_room`, flee/knockout).
5. Turn cost: sum of all mobs across all remaining rooms, charged upfront.
6. Each fight result includes a `room` number so the frontend knows when rooms change.

**Room-by-room mode is unchanged** — still one room per call.

### Response shape

The existing `combat.fights[]` array gains a `room` field per entry:

```typescript
fights: [
  { room: 1, mobDisplayName: "Goblin", outcome: "victory", log: [...], ... },
  { room: 1, mobDisplayName: "Goblin Archer", outcome: "victory", log: [...], ... },
  { room: 2, mobDisplayName: "Ogre", outcome: "victory", log: [...], ... },
  { room: 3, mobDisplayName: "Dragon", outcome: "defeat", log: [...], ... },
]
```

The `combat.room` object continues to report `roomCleared`, `siteCleared`, `fullClearActive`.

### `roomCarryHp` cleanup

With full clear happening atomically, `roomCarryHp` is only meaningful for room-by-room mode (where it's always `null`). On full-clear defeat, the site downgrades to room-by-room with `roomCarryHp: null` as today. The field can remain in the schema but will no longer be written during full-clear success paths.

### Turn cost calculation

Current: `roomMobs.length * ENCOUNTER_TURN_COST` (one room's mobs).

Full clear: sum all alive mobs across all remaining rooms × `ENCOUNTER_TURN_COST`. Charged upfront before any combat begins. On defeat, no refund (risk/reward of full clear).

### Defeat handling

Unchanged from current behavior:
- Downgrade `fullClearActive` to `false`, set `clearStrategy` to `room_by_room`
- Reset defeated mobs in the current room back to `alive`
- Run flee/knockout mechanics
- `roomCarryHp = null`

The player can then return and clear remaining rooms one at a time without the bonus.

## Frontend Changes

### `useGameController.ts`

**`handleStartCombat`**: The response already returns `combat.fights[]` which gets mapped to `combatPlaybackQueue`. Each entry now includes `room`. No structural change needed — the queue already handles N fights sequentially.

### `CombatScreen.tsx`

**Fight progress label**: Change from "Fight X/Y" to show room context:
- Single room: "Fight X/Y" (unchanged)
- Multi-room: "Room R — Fight X/Y"

**Room transition interstitial**: When `combatPlaybackIndex` advances and the next fight's `room` differs from the current fight's `room`, show a brief "Entering Room X" banner before rendering the next `CombatPlayback`. This can be a 1-2 second overlay that auto-dismisses.

### `CombatPlayback.tsx`

No changes needed — it already handles individual fights.

## Data Flow

```
Player clicks "Fight" on full-clear site
  → POST /combat/start { encounterSiteId }
  → Backend: loop rooms 1→2→3, fight all mobs, HP carries
  → Response: { fights: [...all rooms...], siteCleared, rewards }
  → Frontend: build combatPlaybackQueue from all fights
  → Playback: animate fight-by-fight with room dividers
  → On complete: show aggregated rewards + full clear bonus banner
```

## Edge Cases

- **Player dies in room 1**: Only room 1 fights returned, site downgraded, standard defeat handling.
- **Single-room sites**: Already auto-assigned `full_clear`. Behavior unchanged (one room = one fight sequence).
- **Decay between rooms**: Not possible — all rooms processed in one request. Decay is checked once at the start.
- **Insufficient turns**: Checked upfront for all rooms. If not enough turns, 400 error before any combat.
- **Potion pool**: Built once for the entire multi-room sequence. Potions consumed in room 1 are unavailable in room 2.
