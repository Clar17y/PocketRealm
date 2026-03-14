# Plan 04: Resource Regen Scaling

## Goal

Make stamina and mana regeneration scale with player skill levels so that higher-level players recover resources faster, and fix gathering yield math so fractional multipliers apply to the full batch instead of per-action (where `Math.floor` discards the fraction every time).

---

## Changes

### 1. Add passive regen scaling constants

**File:** `packages/shared/src/constants/gameConstants.ts`

Currently `PASSIVE_REGEN_PER_SECOND` is a flat value (1.0 for stamina, 0.5 for mana). Add new constants to each block:

- `STAMINA_CONSTANTS.PASSIVE_REGEN_PER_SKILL_LEVEL: 0.02`
- `MANA_CONSTANTS.PASSIVE_REGEN_PER_MAGIC_LEVEL: 0.015`

New formulas:

- Stamina passive regen: `1.0 + avg(melee, ranged, evasion) * 0.02` per second
- Mana passive regen: `0.5 + magicLevel * 0.015` per second

### 2. Add rest heal scaling constants

**File:** `packages/shared/src/constants/gameConstants.ts`

Add to the same constant blocks:

- `STAMINA_CONSTANTS.REST_HEAL_PER_SKILL_LEVEL: 0.3`
- `MANA_CONSTANTS.REST_HEAL_PER_MAGIC_LEVEL: 0.2`

New formulas:

- Stamina rest heal: `5 + avg(melee, ranged, evasion) * 0.3` per turn
- Mana rest heal: `3 + magicLevel * 0.2` per turn

### 3. Update passive regen calculation

- Find all call sites where `PASSIVE_REGEN_PER_SECOND` is read and used to compute actual regen ticks.
- Update the calculation to include the skill-level scaling component.
- The calculation needs access to the player's skill levels: average of melee, ranged, and evasion for stamina; magic level for mana.
- If skill levels are not already available at the call site, fetch them (or pass them in from the caller).

### 4. Update rest heal calculation

- Find all call sites where `REST_HEAL_PER_TURN` is read and used.
- Update to include the skill-level scaling component, using the same skill averages as step 3.
- Verify the rest-vs-passive ratio stays roughly 5-6x (a level-50 player should still recover about 5-6x faster resting than passively).

### 5. Fix gathering yield batch calculation

**File:** `apps/api/src/routes/gathering.ts`

Currently the yield multiplier is applied per action:

```
baseYieldPerAction = Math.floor(baseYield * yieldMultiplier)
```

This causes fractional multipliers to be lost on every action. For example, 20 actions at 1.2x gives `20 * Math.floor(1 * 1.2) = 20` (the 0.2 is discarded every time).

Change to apply the multiplier to the total batch yield:

```
totalYield = Math.floor(actions * baseYield * yieldMultiplier)
```

Now 20 actions at 1.2x gives `Math.floor(20 * 1 * 1.2) = 24`.

Apply guild yield bonuses the same way -- to the batch total, not per-action.

---

## Files to Modify

| # | File | What to change |
|---|------|----------------|
| 1 | `packages/shared/src/constants/gameConstants.ts` | Add four new scaling constants to `STAMINA_CONSTANTS` and `MANA_CONSTANTS` |
| 2 | Stamina/mana regen service(s) (wherever `PASSIVE_REGEN_PER_SECOND` is used) | Apply skill-level scaling to passive regen |
| 3 | Rest service/route (wherever `REST_HEAL_PER_TURN` is used) | Apply skill-level scaling to rest healing |
| 4 | `apps/api/src/routes/gathering.ts` | Move yield multiplier from per-action to batch total |

---

## Testing

1. Run `npm run test:engine` and `npm run test:api` -- fix any failures caused by the new formulas.
2. Test passive regen at various skill levels:
   - Level 1 player: stamina regen should be close to the old flat 1.0/s.
   - Level 50 player: stamina regen should be noticeably higher (~2.0/s).
3. Test rest healing scales correctly at the same breakpoints.
4. Verify the 5-6x rest-vs-passive ratio is approximately maintained across skill levels.
5. Test gathering yield with fractional multipliers (e.g. 1.2x, 1.5x) produces correct batch totals and that the old per-action rounding loss is gone.

---

## Build Steps

After all changes:

```bash
npm run build
npm run typecheck
npm run test:engine
npm run test:api
```
