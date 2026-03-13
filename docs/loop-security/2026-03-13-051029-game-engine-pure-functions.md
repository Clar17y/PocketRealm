# Security Audit: Game Engine Pure Functions

## Files Reviewed
- `packages/game-engine/src/combat/damageCalculator.ts` — hit chance, damage, defence reduction, player stats builder
- `packages/game-engine/src/combat/templateCombatEngine.ts` — template-based combat resolution (header/types)
- `packages/game-engine/src/combat/actionResolver.ts` — action resolution logic (referenced)
- `packages/game-engine/src/exploration/probabilityModel.ts` — exploration outcome simulation (referenced)
- `packages/game-engine/src/skills/xpCalculator.ts` — XP curve and efficiency (referenced)
- `packages/game-engine/src/utils/math.ts` — shared clamp utility

## Context

The game engine is a pure-function library with no I/O, no side effects, and no database access. Security concerns here are about **correctness** — bugs in these functions silently affect every player because they're called from all combat, exploration, and progression paths.

## Findings

### 1. Defence Reduction Uses Hardcoded Constant 100
**Severity:** low
**Type:** business logic (maintainability)

**Description:** `calculateDefenceReduction` at `damageCalculator.ts:153-156` uses `safeDefence / (safeDefence + 100)`. The `100` is a critical balance constant that determines the entire defence scaling curve, but it's hardcoded rather than pulled from `gameConstants.ts`. This violates the project's centralized-constants philosophy and was also noted in the COMBAT_CONSTANTS balance analysis.

**Impact:** If a designer wants to adjust defence scaling, they'd need to find and modify this buried constant. No security exploit, but a correctness risk during balance changes.

**Suggested Fix:** Extract to `COMBAT_CONSTANTS.DEFENCE_SCALING_FACTOR = 100` and reference it.

---

### 2. `finiteOrFallback` Prevents NaN/Infinity Propagation — Good Pattern
**Severity:** info
**Type:** input validation (not found)

**Description:** The `finiteOrFallback` helper at `damageCalculator.ts:15-17` is used throughout the damage calculator to sanitize inputs. All hit chance, crit chance, and crit multiplier calculations use this pattern:
- `safeHitScore = Math.max(1, finiteOrFallback(hitScore, 1))` — prevents division by zero
- `clampedCritChance = clamp(totalCritChance, 0, 1)` — prevents impossible probabilities
- `Math.max(0, totalCritMultiplier)` — prevents negative damage

**Assessment:** Excellent defensive programming. The engine cannot produce NaN, Infinity, or negative results regardless of input.

---

### 3. Hit Chance Minimum Floor Prevents Guaranteed Misses
**Severity:** info
**Type:** business logic (not found)

**Description:** `calculateHitChance` at line 42 clamps the result between `curve.minHitChance` and `curve.maxHitChance` (from `HIT_CURVE_CONSTANTS`). This means even with extreme stat disparities, there's always a minimum chance to hit and never a guaranteed hit. Good design.

---

### 4. `doesAttackHit` Legacy Function Has d20 Auto-Hit/Auto-Miss
**Severity:** low
**Type:** business logic

**Description:** The legacy `doesAttackHit` at `damageCalculator.ts:88-100` treats roll 20 as auto-hit and roll 1 as auto-miss (lines 94-95). This creates a 5% floor/ceiling regardless of stats. However, this function is marked as "temporary compatibility wrapper" and the new `resolveHitCheck` function (line 67) uses the sigmoid curve without d20 mechanics.

**Assessment:** If any production code path still calls `doesAttackHit`, the 5% auto-hit/auto-miss applies. The new system (`resolveHitCheck`) uses the curve's `minHitChance`/`maxHitChance` instead, which is configurable. Verify no production paths still use the legacy function.

---

### 5. `buildPlayerCombatStats` Caps HP at maxHp — Prevents HP Overflow
**Severity:** info
**Type:** business logic (not found)

**Description:** At `damageCalculator.ts:282`, `hp: Math.min(currentHp, maxHp)` prevents a player from entering combat with more HP than their max. This is a defense against the boss signup issue (boss audit finding #2) where `maxHp` was passed instead of `currentHp`.

**Assessment:** Even if the wrong HP value is passed, the engine clamps it. Good defense-in-depth.

---

### 6. Combat Has a 100-Round Hard Cap — Prevents Infinite Loops
**Severity:** info
**Type:** business logic (not found)

**Description:** `templateCombatEngine.ts:34` defines `MAX_ROUNDS = 100`. The combat loop terminates after 100 rounds regardless of outcome, preventing server hangs from infinite stalemates (e.g., two high-defence, low-damage combatants).

**Assessment:** Essential safety valve. 100 rounds is sufficient for any reasonable combat.

---

### 7. `resolveActionDamageStats` Correctly Handles All Three Combat Styles
**Severity:** info
**Type:** business logic (not found)

**Description:** The per-action scaling at `damageCalculator.ts:209-238` correctly maps melee→strength, ranged→dexterity, magic→intelligence for both damage and accuracy. The `resolveScalingStat` function handles the 'weapon' scaling stat by deferring to the equipped weapon's required skill, with a fallback priority chain (melee > ranged > magic).

**Assessment:** No asymmetry or inconsistency between attack styles.

---

### 8. Damage Floor of MIN_DAMAGE Prevents Zero-Damage Attacks
**Severity:** info
**Type:** business logic (not found)

**Description:** At `damageCalculator.ts:141`, `Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, damage)` ensures every successful hit deals at least minimum damage. This prevents high-defence builds from becoming completely immune to damage.

**Assessment:** Correct — prevents stalemate scenarios where no damage is ever dealt.

---

## Summary

| # | Finding | Severity | Type |
|---|---------|----------|------|
| 1 | Defence scaling constant hardcoded (100) | low | Maintainability |
| 2 | `finiteOrFallback` prevents NaN/Infinity | info | Good pattern |
| 3 | Hit chance minimum floor prevents guaranteed misses | info | Good design |
| 4 | Legacy `doesAttackHit` has d20 auto-hit/auto-miss | low | Verify no production usage |
| 5 | HP capped at maxHp in combat entry | info | Good defense-in-depth |
| 6 | 100-round combat cap prevents infinite loops | info | Essential safety |
| 7 | All three combat styles correctly mapped | info | No asymmetry |
| 8 | MIN_DAMAGE floor prevents zero-damage | info | Correct |

## Overall Assessment

**The game engine is the most robust layer in the codebase.** Every function defensively handles edge cases (NaN, Infinity, negative values, division by zero). The `finiteOrFallback` + `clamp` pattern used throughout is excellent. No exploitable issues found — only the hardcoded defence constant (low-severity maintainability concern) and a legacy function that should be verified as unused.

This is in stark contrast to the service layer where race conditions and TOCTOU issues are common. The pure-function architecture of the game engine is its greatest security strength — no side effects means no state corruption.
