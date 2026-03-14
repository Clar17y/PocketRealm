# Plan 03 — Combat & Flee Tweaks

## Goal

Rebalance flee mechanics and heavy attack to improve combat feel:
- Fleeing should be a genuine coin-flip at level parity (50%) instead of a near-certain knockout (70%).
- Evasion investment should scale flee chance more aggressively.
- Heavy Attack should be a meaningful burst option instead of dead content.

## Rationale

| Stat | Before | After | Effect |
|------|--------|-------|--------|
| `BASE_FLEE_CHANCE` | 0.30 | 0.50 | 50/50 knockout at level parity (was 70% knockout) |
| `FLEE_CHANCE_PER_LEVEL_DIFF` | 0.02 | 0.03 | Evasion investment more impactful for flee outcomes |
| Heavy Attack `damageMultiplier` | 1.5 | 2.0 | Meaningful burst damage |
| `HEAVY_ATTACK_STAMINA` | 40 | 35 | Better damage-per-stamina ratio (0.057 dmg/stam, was 0.038) |

## Steps

### Step 1 — Update flee constants

**File:** `packages/shared/src/constants/gameConstants.ts`

1. Find `FLEE_CONSTANTS` (around line 408).
2. Change `BASE_FLEE_CHANCE: 0.3` to `BASE_FLEE_CHANCE: 0.5`.
3. Change `FLEE_CHANCE_PER_LEVEL_DIFF: 0.02` to `FLEE_CHANCE_PER_LEVEL_DIFF: 0.03`.

### Step 2 — Update heavy attack stamina cost

**File:** `packages/shared/src/constants/gameConstants.ts`

1. Find `HEAVY_ATTACK_STAMINA` (around line 491).
2. Change `HEAVY_ATTACK_STAMINA: 40` to `HEAVY_ATTACK_STAMINA: 35`.

### Step 3 — Update heavy attack damage multiplier

**File:** `packages/shared/src/constants/combatActionDefinitions.ts`

1. Find the `heavyAttack` definition (around line 30).
2. Change `damageMultiplier: 1.5` to `damageMultiplier: 2.0`.

### Step 4 — Fix tests

Run `npm run test:engine` and fix any failures:

- **Flee tests:** Look for hardcoded expectations against `0.3` (base chance) or `0.02` (per-level diff). Update to `0.5` and `0.03` respectively.
- **Heavy attack tests:** Look for assertions against `damageMultiplier` of `1.5` or stamina cost of `40`. Update to `2.0` and `35`.
- Check for computed expected values (e.g., damage calculations that multiply by 1.5) and adjust accordingly.

### Step 5 — Build and verify

```bash
npm run build
npm run typecheck
npm run test:engine
npm run test:api
```

## Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/constants/gameConstants.ts` | `BASE_FLEE_CHANCE` 0.3 -> 0.5, `FLEE_CHANCE_PER_LEVEL_DIFF` 0.02 -> 0.03, `HEAVY_ATTACK_STAMINA` 40 -> 35 |
| `packages/shared/src/constants/combatActionDefinitions.ts` | `heavyAttack.damageMultiplier` 1.5 -> 2.0 |
| Test files (as needed) | Update hardcoded expectations to match new values |
