# Encounter Site Rework — Frontend Design

## Goal

Replace the current encounter site combat UI (sequential 1v1 playback) with an expedition-style combat view for a solo player. Reuse the guild expedition screen layout directly — room progression, mob cards, round-by-round combat log, auto-resolve with animated playback — adapted for group size 1. Extract shared components from `GuildExpeditionsTab` so both features compose from the same building blocks.

This spec covers the **frontend and API surface** for the encounter site rework. The backend/engine design (raid resolver integration, crowded debuff, splash cascade, chest tiers, constants rebalancing, decay exploit fix, admin alignment) is covered in the existing spec: `docs/superpowers/specs/2026-03-14-encounter-site-rework-design.md`.

## Issues Addressed

| # | Issue | Frontend Impact |
|---|-------|----------------|
| 6 | Ambush dominance | No frontend change (constants only) |
| 30 | Decay exploit | Bonus eligibility indicator per room |
| 37 | Decay rate misaligned | No frontend change (constants only) |
| 75 | Large full-clear weak reward | Epic chest reward display |
| 76 | Admin/player divergence | No frontend change (API only) |
| 77 | Medium mob range identical to small | More mobs visible in medium rooms |
| 79 | No chest tier above rare | Epic/legendary chest visuals and labels |

## Shared Component Extraction

Extract from `GuildExpeditionsTab` (1883 lines) into `apps/web/src/components/common/combat/`:

| Component | Source | Purpose |
|---|---|---|
| `RoomProgressBar` | InProgressView header | Gold bar showing "Room X / Y" with percentage fill |
| `MobCardGrid` | Current Room Mobs card | Clickable mob buttons with pixel image, name, HP bar, active effects, targeting badge |
| `CombatRoundLog` | Latest Round + Previous Rounds | Renders `RoundLogContent` with collapsible round history accordion |
| `CombatActionButtons` | Action buttons row | Composable button bar — consumers pass which buttons to render |
| `PlayerResourceBars` | Member resource bars | HP/stamina/mana bars — works for 1 or N players |
| `TemplateQuickSwitch` | Template dropdown | Combat template selector |
| `ThreatMeter` | Threat meter section | Horizontal threat bars per mob — useful for solo players to learn threat/taunt mechanics before expeditions |
| `HealTargetSelector` | Heal target selection | Clickable party member rows for heal targeting — only renders in expedition context, extracted now for shared ownership |

After extraction, `GuildExpeditionsTab` imports and composes these shared components. Expedition-only concerns (recruiting phase, timer/auto-advance toggle, contribution rankings, wipe/attempt system) remain inside the expedition component.

## Encounter Site Combat View

### Component

New component: `EncounterSiteCombatView` — renders when the player has entered an encounter site fight. Lives in the existing encounters section of the combat screen. The encounter site list remains in place; clicking "Fight" on a site transitions into this view.

### Layout (top to bottom)

1. **Combat Playback (sticky top)** — round log animation during auto-resolve playback, pinned to viewport top. Skip button overlaid. Same sticky behavior as arena and current encounter combat playback.
2. **Header** — site name, mob family, room type badge (trash/elite/boss)
3. **RoomProgressBar** — Room X / Y with fill percentage
4. **CombatActionButtons** — context-dependent buttons (see state machine below)
5. **TemplateQuickSwitch** — combat template selector (visible before combat and between rooms)
6. **MobCardGrid** — current room's mobs with HP bars, targeting, active effects
7. **ThreatMeter** — player's threat per mob (solo, but teaches raid mechanics)
8. **PlayerResourceBars** — single player HP/stamina/mana
9. **CombatRoundLog** — latest round + previous rounds accordion (scrollable below the fold)

### State Machine

The view has four states:

**`room_preview`** — Player just entered a room. Mob cards visible at full HP. Action buttons: "Auto-Resolve" and "Fight Manually". Template quick-switch visible.

**`auto_playback`** — Auto-resolve fired, server returned all rounds, client animating them one by one. Sticky playback container active. Skip button visible. Mob HP bars and player resource bars update in sync with each animated round. See "Animated Auto-Resolve Playback" section.

**`manual_combat`** — Round-by-round combat. Player picks target via mob cards, hits "Next Round", sees result. Action buttons: "Next Round" and "Abandon". Rounds resolve immediately on button press — no timer, no waiting. Repeat until room cleared or player defeated.

**`room_result`** — Room cleared or player defeated. Shows outcome summary. If more rooms: "Continue to Room X+1" button → transitions to `room_preview` for next room. If site cleared: chest reward display. If defeated: "Retry Room" and "Abandon Site" buttons.

### Lockout

While in encounter site combat, the player cannot navigate to other game screens (explore, craft, arena, guild). The game controller checks `activeEncounterSiteId` and disables action buttons with a tooltip ("Currently in encounter site combat"). Abandon is required to exit. On browser refresh/reconnect, the client detects the active encounter and re-enters the combat view automatically.

## Animated Auto-Resolve Playback

### Flow

1. Player presses "Auto-Resolve" in `room_preview` state
2. Client calls `POST /api/v1/combat/encounter-sites/:id/auto-resolve`
3. Server resolves all rounds in-memory via `resolveRaidRound()` loop, returns full round array with per-round state snapshots
4. Client transitions to `auto_playback` state
5. For each round in the array:
   - Render round's combat log entries in the sticky top container (same `RoundLogContent` renderer)
   - Animate mob HP bars to post-round values
   - Animate player resource bars to post-round values
   - Update active effects on mobs and player
   - Brief pause between rounds (~1-1.5s, tunable constant)
6. On final round: show outcome (room cleared / defeated)
7. Transition to `room_result` state

### Skip

Skip button visible throughout playback. On press:
- Jump to final state (all HP bars at final values, resources at final values)
- Show last round's log in sticky container
- Transition to `room_result`
- All round logs available in the Previous Rounds accordion

### Server Response Shape

```typescript
interface AutoResolveResponse {
  outcome: 'clear' | 'defeat';
  rounds: Array<{
    roundNumber: number;
    log: RaidRoundLog;
    mobStates: Array<{
      slot: number;
      hp: number;
      maxHp: number;
      alive: boolean;
      activeEffects: Effect[];
    }>;
    playerState: {
      hp: number;
      maxHp: number;
      stamina: number;
      maxStamina: number;
      mana: number;
      maxMana: number;
      activeEffects: Effect[];
    };
  }>;
  chestReward?: ChestReward; // only on site clear (final room)
}
```

Per-round snapshots avoid the client needing to compute intermediate states — the server provides everything needed for the animation.

## Room Transitions & Site Completion

### Between Rooms

After a room is cleared, `room_result` shows:
- "Room X Cleared!" with summary (mobs defeated, rounds taken)
- Player's current HP/stamina/mana (carry state for next room)
- "Continue to Room X+1" button → transitions to `room_preview`

Carry state (HP/stamina/mana) persists between rooms. The choice of auto-resolve vs manual for the next room does not affect carry state.

### Site Completion

When the final room is cleared:
- Chest reward animation (same chest-open visual used elsewhere)
- Chest tier label (common/uncommon/rare/epic based on room count)
- Material drops and recipe drop (if any) listed
- Auto-resolve bonus indicator if applicable ("Bonus loot from auto-resolve!")
- "Done" button exits combat view, returns to encounter site list
- Site deleted server-side, list refreshes on return

### Defeat

- "Defeated in Room X" message
- "Retry Room" button — returns to `room_preview` for same room, mobs reset to alive, carry state cleared
- "Abandon Site" button — exits combat entirely, site remains with normal decay

## API Endpoints

### Start Room (Manual)

```
POST /api/v1/combat/encounter-sites/:id/start-room
```

- Auth: site owner
- Precondition: site exists, current room not started
- Charges turn cost: `mobCount * ENCOUNTER_TURN_COST`
- Sets `activeEncounterSiteId` on player (lockout)
- Response: `{ room, mobs: MobState[], turnCost, playerState }`

### Next Round (Manual)

```
POST /api/v1/combat/encounter-sites/:id/round
```

- Auth: site owner
- Precondition: site exists, current room in manual combat
- Request body: `{ action: ActionType, targetMobSlot?: number }`
- Resolves one round via `resolveRaidRound()` with crowded debuff + splash cascade
- Response: `{ roundResult, mobStates, playerState, roomCleared, defeated }`

### Auto-Resolve

```
POST /api/v1/combat/encounter-sites/:id/auto-resolve
```

- Auth: site owner
- Precondition: site exists, current room not started (round 0)
- Charges turn cost upfront
- Sets `activeEncounterSiteId` on player (lockout)
- Loops `resolveRaidRound()` in-memory up to `AUTO_RESOLVE_MAX_ROUNDS`
- Response: `AutoResolveResponse` (see shape above)

### Abandon

```
POST /api/v1/combat/encounter-sites/:id/abandon
```

- Auth: site owner
- Resets current room mobs to alive, clears carry state
- Clears `activeEncounterSiteId` (unlocks player)
- Turn cost for current room is lost
- Response: `{ success: true }`

## Frontend Lockout

The API returns `activeEncounterSiteId: string | null` as part of the standard player state response — same pattern as `isKnockedOut` and `isOverencumbered`. The game controller:

- Disables explore/craft/arena/guild expedition signup buttons with tooltip ("Currently in encounter site combat")
- Shows "Return to combat" prompt if the player somehow navigates away (e.g., browser refresh)
- On refresh/reconnect, detects active encounter and re-enters the combat view automatically

Server-side checks remain as a safety net, but the UI prevents the player from hitting them.

## Combat History

### Old Model (superseded)

The old UX plan stored per-mob fight logs with 1/N navigation. This was implemented for the sequential 1v1 model (commits `ac26b293`, `3efea351`, etc.) and is superseded by the rework.

### New Model

An encounter site combat session produces:
- One activity log per room (containing raid round logs)
- One summary log for the whole site (aggregated rewards, chest info)

Combat history shows the summary entry in the list. Expanding it shows per-room detail with full round logs — same structure as expedition history. Room-level grouping replaces the old per-mob 1/N navigation.

## Relationship to Existing Specs

| Document | Status |
|---|---|
| `docs/superpowers/specs/2026-03-14-encounter-site-rework-design.md` | Active — covers backend/engine. This spec extends it with frontend design. |
| `docs/superpowers/plans/2026-02-27-encounter-site-ux.md` | Superseded — all 4 tasks were implemented for the old model. Tasks 2-4 are replaced by this design. Task 1 (loot aggregation) was already completed. |
| `docs/loop-balance/plans/08-encounter-site-rework.md` | Active — implementation plan for backend. Needs a new chunk added for frontend work. |
