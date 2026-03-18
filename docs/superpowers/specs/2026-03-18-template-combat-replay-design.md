# Template Combat Replay Design

## Overview

When a player loses a fight (defeat or fled), the combat results screen offers a "Replay Fight" button. They can edit their template slots inline and re-simulate that exact fight with the same RNG seed, same mob, and same starting state. This turns combat losses into an immediate learning opportunity.

## Core Mechanic

- **Trigger:** Combat outcome is `defeat`, `fled`, or `draw` (not `victory`)
- **Window:** 10 minutes from end of fight
- **Cost:** Free. No turns, no cooldown, no rewards/XP/durability
- **Repeatable:** Can replay the same fight multiple times within the 10-minute window
- **Scope:** All PvE combat losses — encounter sites, exploration ambushes, zone combat. Not PvP or training (training is already side-effect-free).

## Combat Engine Changes

### Seeded PRNG

`runTemplateCombat` gets a new optional `seed: number` parameter in its options object.

**PRNG injection approach:** When a seed is provided, `runTemplateCombat` temporarily replaces `Math.random` with a deterministic PRNG (mulberry32 or xorshift128) for the duration of the combat simulation, then restores the original `Math.random` afterward. This works because `runTemplateCombat` is fully synchronous — no async interleaving can occur. This avoids modifying the signatures of `rollD20`, `rollDamage`, `resolveHitCheck`, `isCriticalHit`, and `rollInitiative` in `damageCalculator.ts`, which all call `Math.random()` internally.

```typescript
// In runTemplateCombat:
const originalRandom = Math.random;
if (options?.seed !== undefined) {
  Math.random = createSeededRng(options.seed);
}
try {
  // ... existing combat loop
} finally {
  Math.random = originalRandom;
}
```

When `seed` is omitted: uses `Math.random()` as today (fully backwards compatible). All existing callers are unaffected.

Every real combat generates a random seed at the start (`Math.floor(Math.random() * 2**32)`) and includes it in the cache. Replays pass this seed back to produce the same sequence of random numbers.

**Important:** Changing the player's template changes which actions execute, which changes how many random numbers are consumed per round. This means the RNG sequence shifts slightly when the template changes. This is acceptable and correct — the player is testing strategy changes in the same "luck environment," not expecting a frame-perfect deterministic replay.

## Server-Side

### Combat Loss Cache

On combat loss (defeat, fled, or draw), cache the following in Redis:

Key: `replay:{playerId}`
TTL: `REPLAY_CONSTANTS.CACHE_TTL_SECONDS` (600 seconds / 10 minutes, defined in `gameConstants.ts`)

```typescript
{
  playerCombatant: Omit<TemplateCombatant, 'template'>,  // Full player combatant minus template slots
  mobCombatant: TemplateCombatant,                        // Full mob combatant (template, prefix, stats)
  combatOptions: { combatMode: CombatMode },              // pve_open_world, etc.
  seed: number,                                            // RNG seed from original combat
  originalOutcome: CombatOutcome,                          // 'defeat' | 'fled' | 'draw'
  zoneId: string,                                          // For context display
  mobDisplayName: string,                                  // For UI
}
```

The `playerCombatant` is captured at the moment combat begins, before any rounds execute. It is the exact `TemplateCombatant` object built by `buildPlayerTemplateCombatant()`, which already contains `stats` (HP, maxHp, attack, defence, accuracy, evasion), `stamina`, `maxStamina`, `mana`, `maxMana`, `actionDefinitions`, and `perActionScaling`. We strip `template` because the player will provide new slots on replay.

This ensures the replay starts from the exact same HP, stamina, mana, and stats as the original fight — not the player's current (potentially different) state.

Only one replay cache per player — the latest loss. Starting a new real combat overwrites it.

### Where the cache is populated

The cache must be written in each combat route that can produce a loss:
- `apps/api/src/routes/combat/start.ts` — encounter site combat
- `apps/api/src/routes/exploration/start.ts` — exploration ambushes
- Zone combat routes

In each case, after `runTemplateCombat` returns a non-victory outcome, serialize the combatants (captured before combat) + seed to Redis.

For multi-fight encounter sites: cache the *last* fight that was lost (the one that ended the run), not earlier victories in the same site.

### New Route: `POST /training/replay`

Request body:
```typescript
{
  slots: CombatTemplateSlotData[]  // Edited template slots for the replay
}
```

Logic:
1. Load replay cache from Redis. If expired, return 410 Gone with message "Replay expired."
2. Validate template slots (same validation as template save)
3. Reconstruct player combatant: take cached `playerCombatant`, inject new `template` from provided slots
4. Run `runTemplateCombat(playerCombatant, mobCombatant, { seed, ...combatOptions })`
5. Return result (combat log, outcome, HP/resource remaining)
6. Do NOT consume the cache — player can replay again within the window

### New Route: `GET /training/replay`

Returns whether a replay is available and time remaining:
```typescript
{
  available: boolean,
  secondsRemaining: number,
  mobDisplayName?: string,
  originalOutcome?: CombatOutcome,
}
```

Alternatively, this can be folded into the existing `GET /training/cooldown` response to reduce API surface.

## Frontend

### Combat Results Screen

- On defeat/fled/draw: show "Replay Fight" button with countdown timer (10:00 → 0:00)
- Button disabled/hidden on victory

### Replay Flow

1. Player taps "Replay Fight"
2. Inline template editor opens (reuse existing `TemplateSlotEditor` component)
3. Shows current active template slots — player can reorder, swap actions, change conditions
4. "Simulate" button runs the replay
5. New combat log renders in the same combat playback UI
6. Player can edit and re-simulate again (within the 10-minute window)
7. Timer visible throughout — when it expires, the replay UI closes gracefully

### No Side Effects

The replay result screen should clearly indicate this is a simulation — no rewards, no XP, no state changes. A subtle label like "Simulation — no rewards" is sufficient.

## Edge Cases

- Redis cache expires mid-edit: "Simulate" returns error, UI shows "Replay expired" and disables further attempts
- Player logs out and back in: cache persists in Redis, replay still available if within window
- Player enters a new real combat: overwrites the replay cache (new loss = new replay opportunity)
- Player has no active template: should not happen (template required for combat), but defensively disable replay button
- Draw outcome: included as a replay trigger — the player didn't win and may want to optimize
- Multi-fight encounter sites: only the final losing fight is cached for replay, not earlier victories in the same site
