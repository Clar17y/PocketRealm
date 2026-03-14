# XP System Rebalance

## Goal

Slow progression and reduce grind frequency. Three categories of change: steeper leveling curve, fewer daily windows, and moving XP boost application to post-efficiency so boosts give a genuine percentage increase on effective XP.

## Changes

### 1. Steeper Leveling Curve: XP_EXPONENT 1.8 -> 2.0

**File:** `packages/shared/src/constants/gameConstants.ts`
**Line ~95:** Change `XP_EXPONENT: 1.8` to `XP_EXPONENT: 2.0`

This changes the XP-for-level formula (`base * level^exponent`). Higher levels will require significantly more total XP. At level 100 the requirement roughly doubles, extending the grind from ~43 days of active combat to ~107 days.

**Impact on existing data:** Players already at high levels retain their XP, but their XP-to-next-level will increase. No migration needed since XP totals are stored, not progress percentages.

### 2. Longer XP Windows: XP_WINDOW_HOURS 6 -> 12

**File:** `packages/shared/src/constants/gameConstants.ts`
**Line ~101:** Change `XP_WINDOW_HOURS: 6` to `XP_WINDOW_HOURS: 12`

This reduces from 4 windows per day to 2, making grinding less session-dependent. The per-window cap increases proportionally (daily cap stays the same, but divided by 2 instead of 4), so each window allows more XP before efficiency decay kicks in.

**Important:** Update the JSDoc comments on lines 103, 106, 109, 112 that currently say `(divided by 4 windows = per-window cap)` to say `(divided by 2 windows = per-window cap)`.

**Downstream:** The function `getWindowCap()` in `packages/game-engine/src/skills/xpCalculator.ts` dynamically computes `24 / XP_WINDOW_HOURS`, so it picks this up automatically. The comment on line 82 of that file (`4 for 6-hour windows`) should also be updated to `2 for 12-hour windows`.

### 3. Lower Non-Combat Daily Caps: 30,000 -> 20,000

**File:** `packages/shared/src/constants/gameConstants.ts`

Change all three non-combat caps:
- **Line ~107:** `DAILY_CAP_GATHERING: 30_000` -> `DAILY_CAP_GATHERING: 20_000`
- **Line ~110:** `DAILY_CAP_PROCESSING: 30_000` -> `DAILY_CAP_PROCESSING: 20_000`
- **Line ~113:** `DAILY_CAP_CRAFTING: 30_000` -> `DAILY_CAP_CRAFTING: 20_000`

Leave `DAILY_CAP_COMBAT: 14_000` unchanged.

### 4. Move XP Boost Application to Post-Efficiency

**File:** `apps/api/src/services/xpService.ts`

Currently (lines 30-36), the boost is applied BEFORE the efficiency calculation:

```ts
const totalXpBoost = xpBoost + shopXpBoost;
const boostedXpGain = totalXpBoost > 0
  ? Math.floor(rawXpGain * (1 + totalXpBoost))
  : rawXpGain;
```

Then `boostedXpGain` is passed to `applyXpGain()` on line 71 as the `rawXpGain` parameter. The problem: the efficiency curve in `applyXpGain()` reduces XP based on how close you are to the window cap, so a 15% boost does not actually yield 15% more effective XP -- it gets partially eaten by efficiency decay.

**Refactor steps:**

1. Remove the pre-boost calculation (lines 33-36). Pass the original `rawXpGain` directly to `applyXpGain()` on line 71.

2. After `applyXpGain()` returns, apply the boost to `xpResult.xpAfterEfficiency`:

   ```ts
   const xpResult = applyXpGain(currentXp, skill.level, currentWindowXpGained, rawXpGain, skillType);

   const boostedXpAfterEfficiency = totalXpBoost > 0
     ? Math.floor(xpResult.xpAfterEfficiency * (1 + totalXpBoost))
     : xpResult.xpAfterEfficiency;
   ```

3. Replace all downstream uses of `xpResult.xpAfterEfficiency` with `boostedXpAfterEfficiency` for actual XP storage. There are four occurrences to update:
   - **Line 80:** `const newTotalXp = currentXp + boostedXpAfterEfficiency;`
   - **Line 81:** `const newDailyXpGained = currentWindowXpGained + boostedXpAfterEfficiency;`
   - **Line 95:** `const characterXpGain = calculateCharacterXpGain(boostedXpAfterEfficiency);`
   - The `xpResult` object returned to callers still contains the original (unboosted) `xpAfterEfficiency`. Consider whether callers need to know the final boosted amount. If so, add `boostedXpAfterEfficiency` to the `GrantXpResult` interface.

4. **Important decision -- should boosted XP count toward the window cap?**
   - If YES (boosted XP fills the cap faster): use `boostedXpAfterEfficiency` for `newDailyXpGained`.
   - If NO (boosts let you exceed the effective cap): use the original `xpResult.xpAfterEfficiency` for `newDailyXpGained`.
   - Recommendation: use the unboosted value for `newDailyXpGained` so boosts feel rewarding and don't just accelerate hitting the wall. This means:
     ```ts
     const newDailyXpGained = currentWindowXpGained + xpResult.xpAfterEfficiency;
     ```

### 5. (Optional) Add MAX_XP_BOOST Cap

**File:** `packages/shared/src/constants/gameConstants.ts`

Add a new constant inside `SKILL_CONSTANTS`:

```ts
/** Maximum combined XP boost multiplier (guild + shop + future sources) */
MAX_XP_BOOST: 0.50,
```

**File:** `apps/api/src/services/xpService.ts`

Import and apply the cap:

```ts
const totalXpBoost = Math.min(xpBoost + shopXpBoost, SKILL_CONSTANTS.MAX_XP_BOOST);
```

This prevents runaway stacking if additional boost sources are added in the future.

## Files to Modify (Summary)

| File | What Changes |
|---|---|
| `packages/shared/src/constants/gameConstants.ts` | XP_EXPONENT, XP_WINDOW_HOURS, three DAILY_CAP values, JSDoc comments, optionally MAX_XP_BOOST |
| `apps/api/src/services/xpService.ts` | Move boost application from pre-efficiency to post-efficiency |
| `packages/game-engine/src/skills/xpCalculator.ts` | Update comment on line 82 (window count reference) |

## Testing

### Existing Tests That Will Need Attention

**`packages/game-engine/src/skills/xpCalculator.test.ts`:**
- Tests reference `SKILL_CONSTANTS` values dynamically (e.g., `getWindowCap('melee')`, `SKILL_CONSTANTS.XP_WINDOW_HOURS`), so most will pass automatically with new constant values.
- Test on line 255 has a comment `// 6` for `XP_WINDOW_HOURS` -- update the comment to `// 12`.
- Test on line 269 says `"does not reset within the rolling 6-hour window"` -- update description string to `"12-hour"`.
- Test on line 275 says `"resets when the rolling 6-hour window duration elapses"` -- update description string and the test data. Currently uses `sevenHoursAgo` and expects a reset (7 > 6). With 12-hour windows, this needs to use `thirteenHoursAgo` or similar (> 12).
- Test on line 271 uses 5h59m gap and expects no reset -- this still passes with 12-hour windows, but the intent of the test is "near the boundary." Consider adjusting to 11h59m for the same effect.

**`apps/api/src/services/xpService.test.ts`:**
- The "guild XP boost" and "shop XP boost" test groups (lines 133-258) assert that the boost is applied to `xpResult.xpGained` (the raw input to `applyXpGain`). After the refactor, the boost is no longer applied to the raw input, so these assertions will need to change:
  - Line 164-167: `resultBoosted.xpResult.xpAfterEfficiency > resultNoBoosted.xpResult.xpAfterEfficiency` -- this still holds but for a different reason (post-efficiency boost). Verify it passes.
  - Line 175: `result.xpResult.xpGained` should now be `100` (unboosted), not `100` -- this already matches.
  - Line 186: `result.xpResult.xpGained` currently expects `120` (boosted). After refactor it should expect `100` (unboosted). Update assertion.
  - Line 205: expects `125`. After refactor expects `100`. Update.
  - Line 239: expects `130`. After refactor expects `100`. Update.
  - Line 255-256: expects `36`. After refactor expects `33`. Update.
  - Line 578: expects `105`. After refactor expects `100`. Update.
- Add new test: verify that `boostedXpAfterEfficiency` (or whatever the return field is named) equals `floor(xpAfterEfficiency * (1 + totalBoost))`.
- Add new test: verify that boost does not affect the window cap consumption (if going with the recommendation in step 4).

**`apps/api/src/services/xpService.test.ts` -- window reset tests:**
- Line 264: comment says `XP_WINDOW_HOURS is 6` -- update to `12`. The test uses `7 * 60 * 60 * 1000` for a 7-hour gap. With 12-hour windows this will NOT trigger a reset. Change to 13 hours.
- Line 284: comment says `2 hours ago, still within 6-hour window` -- this is still valid for 12-hour windows but update the comment.

### New Tests to Write

1. **Post-efficiency boost test:** Grant XP with a known efficiency (e.g., half-cap reached), verify the boosted result equals `floor(xpAfterEfficiency * (1 + boost))`.
2. **Boost cap test (if MAX_XP_BOOST added):** Set guild boost to 0.4 and shop boost to 0.3, verify total is capped at 0.50.
3. **Window boundary with 12-hour windows:** Verify reset at exactly 12 hours, no reset at 11h59m.

### Running Tests

```bash
npm run build                # Rebuild shared + game-engine + downstream
npm run typecheck            # Verify no type errors
npm run test:engine          # XP calculator tests
npm run test:api             # XP service tests + all API tests
```

## Rollback

All changes are constant values and a small logic reorder. To rollback: revert the constants and move the boost multiplication back before `applyXpGain()`. No database migrations are involved.
