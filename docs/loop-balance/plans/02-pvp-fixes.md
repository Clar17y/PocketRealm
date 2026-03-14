# PvP Fixes Implementation Plan

Addresses four issues with the current PvP system: gold loss on defeat, knockout punishment, rating-0 deadlock, and unused `MIN_OPPONENTS_SHOWN`.

---

## 1. Remove Gold Loss from PvP Defeat

**Problem:** When an attacker loses a PvP fight and reaches 0 HP, the code calls `calculateFleeWithGold()` which deducts gold via `FLEE_CONSTANTS.GOLD_LOSS_*` percentages. This gold penalty was designed for PvE and should not apply in PvP.

**File:** `apps/api/src/services/pvpService.ts` (lines 488-499)

**Current code flow:**
- `challenge()` checks `combatResult.combatantAHpRemaining <= 0` (line 481)
- Calls `calculateFleeWithGold(attackerId, ...)` from `apps/api/src/utils/routeHelpers.ts`
- `calculateFleeWithGold` looks up the player's gold, calls `calculateFleeResult()` from `packages/game-engine/src/hp/fleeMechanics.ts`, and deducts `goldLost` from the player's DB record

**Changes:**
- Stop calling `calculateFleeWithGold()` in the PvP defeat branch. Instead, call `calculateFleeResult()` directly from `@pocketrealm/game-engine` with `currentGold: 0` so that `goldLost` computes to 0 and no gold is deducted. Alternatively, skip the gold deduction step entirely by only using the outcome/HP fields.
- The simplest approach: replace the `calculateFleeWithGold` call with a direct call to `calculateFleeResult` imported from `@pocketrealm/game-engine`, passing `currentGold: 0`. This reuses the existing flee outcome logic (knockout vs wounded vs clean) without touching gold. No gold DB update occurs.

**Import to add:**
```typescript
import { calculateFleeResult } from '@pocketrealm/game-engine';
```

**Replace lines 488-499 with logic that:**
1. Calls `calculateFleeResult({ evasionLevel, mobLevel: target.characterLevel, maxHp: attackerMaxHp, currentGold: 0 })`
2. Uses `fleeResult.outcome` and `fleeResult.remainingHp` as before
3. Skips any gold deduction (no DB update)

---

## 2. Replace Knockout with Guaranteed Flee on PvP Loss

**Problem:** When the attacker loses a PvP fight, the existing flee roll can result in `knockout`, which triggers `enterRecoveringState()` (isRecovering = true, respawn timer). This is too punishing for PvP -- the attacker should always "escape" with reduced HP but never be knocked out.

**File:** `apps/api/src/services/pvpService.ts` (lines 481-508)

**Current code flow:**
- After the flee roll (via `calculateFleeWithGold` or `calculateFleeResult`), outcome can be `clean_escape`, `wounded_escape`, or `knockout`
- On `knockout`: `enterRecoveringState()` is called, `attackerKnockedOut = true`, death achievement tracked

**Changes:**
- Do NOT use the standard `calculateFleeResult` / `calculateFleeWithGold` at all for PvP defeats. Instead, implement inline PvP-specific escape logic.
- Always treat PvP loss as a successful escape. Roll `Math.random()` and use evasion to influence the outcome quality:
  - Compute a "quality roll" that factors in evasion. Higher evasion = more likely to get a clean escape.
  - Use `FLEE_CONSTANTS.HIGH_SUCCESS_THRESHOLD` (0.80) as the dividing line:
    - If normalized roll >= 0.80: **clean escape** -- set HP to `Math.max(1, Math.floor(maxHp * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT))` (15% max HP)
    - Otherwise: **wounded escape** -- set HP to `FLEE_CONSTANTS.PARTIAL_SUCCESS_HP` (1 HP)
  - The evasion influence: compute `fleeChance` the same way as `calculateFleeChance(evasionLevel, mobLevel)` from `packages/game-engine/src/hp/fleeMechanics.ts`. Then normalize the random roll within the [0, 1) range scaled by fleeChance. Higher evasion means a higher fleeChance, which means the random roll is more likely to land in the "clean escape" zone.
- Do NOT call `enterRecoveringState()`. Do NOT set `attackerKnockedOut = true`. Do NOT call `trackAchievements` for deaths.
- DO call `setHp(attackerId, remainingHp)` with the computed HP.
- Set `fleeOutcome` to the string `'clean_escape'` or `'wounded_escape'` accordingly.

**Suggested implementation (pseudocode):**
```typescript
if (combatResult.combatantAHpRemaining <= 0) {
  // PvP loss: guaranteed escape, no knockout, no gold loss
  const fleeChance = calculateFleeChance(attackerAttributes.evasion, target.characterLevel);
  const roll = Math.random();
  const normalizedRoll = roll / Math.max(fleeChance, 0.01); // avoid division by zero

  let remainingHp: number;
  if (normalizedRoll >= FLEE_CONSTANTS.HIGH_SUCCESS_THRESHOLD) {
    fleeOutcome = 'clean_escape';
    remainingHp = Math.max(1, Math.floor(attackerMaxHp * FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT));
  } else {
    fleeOutcome = 'wounded_escape';
    remainingHp = FLEE_CONSTANTS.PARTIAL_SUCCESS_HP;
  }

  await setHp(attackerId, remainingHp);
  await setAllResources(attackerId, remainingHp, combatResult.combatantAStaminaRemaining, combatResult.combatantAManaRemaining);
}
```

**Import to add:**
```typescript
import { calculateFleeChance } from '@pocketrealm/game-engine';
```

Verify `calculateFleeChance` is exported from `packages/game-engine/src/index.ts`. If not, add the export.

---

## 3. Add Minimum Bracket Width (Fix Rating 0 Deadlock)

**Problem:** The bracket formula `[rating * 0.75, rating * 1.25]` produces `[0, 0]` when rating is 0. Players at rating 0 can never find opponents and are stuck.

**Files:**
- `apps/api/src/services/pvpService.ts` -- `getLadder()` (lines 49-50) and bracket check in `challenge()` (lines 338-339, and re-check at lines 397-398)
- `packages/shared/src/constants/gameConstants.ts` -- add constant

**Changes to `gameConstants.ts`:**
- Add `MIN_BRACKET_HALF_WIDTH: 100` to `PVP_CONSTANTS`. This ensures a minimum bracket of +/-100 around the player's rating.

```typescript
export const PVP_CONSTANTS = {
  STARTING_RATING: 1000,
  K_FACTOR: 32,
  BRACKET_RANGE: 0.25,
  MIN_BRACKET_HALF_WIDTH: 100,   // <-- new
  CHALLENGE_TURN_COST: 500,
  // ... rest unchanged
} as const;
```

**Changes to `pvpService.ts`:**
- Extract a helper function for bracket computation used in three places:

```typescript
function computeBracketBounds(rating: number): { lower: number; upper: number } {
  const percentLower = Math.floor(rating * (1 - PVP_CONSTANTS.BRACKET_RANGE));
  const percentUpper = Math.ceil(rating * (1 + PVP_CONSTANTS.BRACKET_RANGE));
  return {
    lower: Math.max(0, Math.min(percentLower, rating - PVP_CONSTANTS.MIN_BRACKET_HALF_WIDTH)),
    upper: Math.max(percentUpper, rating + PVP_CONSTANTS.MIN_BRACKET_HALF_WIDTH),
  };
}
```

- Replace all three bracket computations (in `getLadder`, in `challenge` pre-check, and in `challenge` transaction re-check) with calls to `computeBracketBounds(rating)`.

**Affected locations:**
1. `getLadder()` lines 49-50: `const lowerBound = ...` / `const upperBound = ...`
2. `challenge()` lines 338-339: `const lowerBound = ...` / `const upperBound = ...`
3. `challenge()` transaction re-check lines 397-398: `const freshLower = ...` / `const freshUpper = ...`

---

## 4. Implement MIN_OPPONENTS_SHOWN Bracket Widening

**Problem:** `PVP_CONSTANTS.MIN_OPPONENTS_SHOWN` (value: 10) exists but is never used. When few opponents fall in the bracket, the ladder shows too few options.

**File:** `apps/api/src/services/pvpService.ts` -- `getLadder()` function (lines 47-99)

**Changes:**
- After the initial bracket query (line 62-72), check if the filtered `opponents` array has fewer than `PVP_CONSTANTS.MIN_OPPONENTS_SHOWN` entries.
- If so, progressively widen the bracket and re-query:
  - Widen by 50 rating points each iteration (add 50 to upper, subtract 50 from lower, clamping lower at 0)
  - Hard cap: stop after 10 iterations (500 total widening) or when enough opponents are found
  - Re-run the same Prisma query with the widened bounds
  - Apply the same cooldown filter

**Suggested implementation (pseudocode):**
```typescript
const { lower: baseLower, upper: baseUpper } = computeBracketBounds(myRating.rating);
let lowerBound = baseLower;
let upperBound = baseUpper;
const WIDEN_STEP = 50;
const MAX_WIDEN_ITERATIONS = 10;

let candidates = await findCandidates(lowerBound, upperBound);
let opponents = filterAndMap(candidates, cooldownIds);

let widenCount = 0;
while (opponents.length < PVP_CONSTANTS.MIN_OPPONENTS_SHOWN && widenCount < MAX_WIDEN_ITERATIONS) {
  widenCount++;
  lowerBound = Math.max(0, lowerBound - WIDEN_STEP);
  upperBound = upperBound + WIDEN_STEP;
  candidates = await findCandidates(lowerBound, upperBound);
  opponents = filterAndMap(candidates, cooldownIds);
}
```

- Extract the Prisma query and the filter/map logic into small helper functions within `getLadder` (or as module-level helpers) to avoid duplicating the query code.
- The bracket widening only affects the **ladder display** (opponent discovery). The `challenge()` bracket validation still uses the base bracket (with min width from change #3). This is intentional -- players can see opponents slightly outside bracket but cannot challenge them, which is fine UX (they know who's nearby).

**Alternative design (recommended):** Also widen the challenge bracket to match, so opponents shown on the ladder are always challengeable. If choosing this approach, use the same `computeBracketBounds` helper but pass the widened bounds. This requires storing the widened bounds or re-computing in `challenge()`. The simpler approach is to only widen for display.

---

## Files to Modify (Summary)

| File | Changes |
|------|---------|
| `packages/shared/src/constants/gameConstants.ts` | Add `MIN_BRACKET_HALF_WIDTH: 100` to `PVP_CONSTANTS` |
| `apps/api/src/services/pvpService.ts` | (1) PvP defeat: remove gold loss, (2) replace knockout with guaranteed flee, (3) extract `computeBracketBounds` helper and use in 3 locations, (4) add bracket widening loop in `getLadder` |
| `packages/game-engine/src/index.ts` | Verify `calculateFleeChance` is exported (add if missing) |

---

## Testing

### Existing tests
- Run `npm run test:api` -- existing PvP tests are in `apps/api/src/services/pvpService.test.ts`
- Run `npm run test:engine` -- flee mechanics tests are in `packages/game-engine/src/hp/fleeMechanics.test.ts`

### New/updated test cases needed

**In `apps/api/src/services/pvpService.test.ts`:**
1. PvP loss does NOT deduct gold (mock player gold, verify no gold decrement after loss)
2. PvP loss never triggers `enterRecoveringState` (verify mock not called)
3. PvP loss always results in `fleeOutcome` being `'clean_escape'` or `'wounded_escape'`, never `'knockout'`
4. PvP loss sets HP to either `FLEE_CONSTANTS.PARTIAL_SUCCESS_HP` (1) or 15% of maxHP

**Bracket tests (can be unit tests for `computeBracketBounds`):**
5. Rating 0 produces bracket `[0, 100]` (not `[0, 0]`)
6. Rating 400 uses percentage-based bracket since `400 * 0.25 = 100` equals the min half-width
7. Rating 1000 uses percentage-based bracket: `[750, 1250]`

**Ladder widening tests:**
8. When fewer than 10 opponents in initial bracket, bracket widens
9. Widening stops after 10 iterations (500 points)
10. Widening stops when MIN_OPPONENTS_SHOWN is reached

---

## Build & Verify

```bash
npm run build           # Full build (packages first, then apps)
npm run typecheck        # Verify no type errors
npm run test:engine      # Flee mechanics tests still pass
npm run test:api         # PvP service tests pass (including new ones)
```
