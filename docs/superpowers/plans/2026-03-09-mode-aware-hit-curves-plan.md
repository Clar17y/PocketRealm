# Mode-Aware Hit Curves Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the shared d20 hit threshold with mode-aware hit curves that make evasion a real PvP and group-combat archetype without destabilizing open-world PvE.

**Architecture:** Add first-class `CombatMode` and hit-curve configs in shared code, then move the game-engine to a score-to-probability hit resolver that returns both `hitChance` and `didHit`. Wire existing callers into `pvp`, `pve_open_world`, and `pve_boss`, and define `pve_expedition` now as a supported mode/config even though the current repo does not yet have a dedicated expedition combat resolver. Finish by tagging a small set of anti-evasion counters and retuning seed data/tests against explicit per-mode hit-rate bands.

**Tech Stack:** TypeScript, Vitest, shared constants/types, game-engine combat modules, API services/routes, Prisma seed data

**Design doc:** `docs/superpowers/specs/2026-03-09-mode-aware-hit-curves-design.md`

---

### Task 1: Add Shared Combat-Mode And Hit-Curve Types

**Files:**
- Modify: `packages/shared/src/types/combat.types.ts`
- Modify: `packages/shared/src/types/combatAction.types.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/constants/gameConstants.test.ts`

**Step 1: Add shared combat-mode and hit-resolution types**

Add these types near the top of `packages/shared/src/types/combat.types.ts`:

```ts
export type CombatMode = 'pvp' | 'pve_open_world' | 'pve_expedition' | 'pve_boss';

export interface HitCurveConfig {
  minHitChance: number;
  maxHitChance: number;
  bias: number;
  exponent: number;
}

export interface HitScoreBreakdown {
  hitScore: number;
  avoidScore: number;
  hitChance: number;
}
```

Extend `CombatLogEntry` with debug fields:

```ts
  hitChance?: number;
  hitRollValue?: number;
  attackerHitScore?: number;
  defenderAvoidScore?: number;
```

**Step 2: Add explicit action/effect flags for future anti-evasion counters**

Extend `packages/shared/src/types/combatAction.types.ts`:

```ts
export interface ActionDefinition {
  // ...
  alwaysHits?: boolean;
}

export interface ActionEffect {
  // ...
  alwaysApplies?: boolean;
}
```

Keep this minimal. Do not invent a large status-effect system yet.

**Step 3: Add mode-aware hit-curve constants**

Add to `packages/shared/src/constants/gameConstants.ts`:

```ts
export const HIT_CURVE_CONSTANTS: Record<CombatMode, HitCurveConfig> = {
  pvp: { minHitChance: 0.10, maxHitChance: 0.95, bias: 5, exponent: 2.4 },
  pve_open_world: { minHitChance: 0.25, maxHitChance: 0.95, bias: 10, exponent: 1.5 },
  pve_expedition: { minHitChance: 0.20, maxHitChance: 0.95, bias: 8, exponent: 1.8 },
  pve_boss: { minHitChance: 0.35, maxHitChance: 0.98, bias: 12, exponent: 1.35 },
};
```

These values are seed values only. They will be tuned later.

**Step 4: Add shared constant tests**

Add assertions in `packages/shared/src/constants/gameConstants.test.ts`:

```ts
it('defines valid hit curve bounds for every combat mode', () => {
  for (const config of Object.values(HIT_CURVE_CONSTANTS)) {
    expect(config.minHitChance).toBeGreaterThanOrEqual(0);
    expect(config.maxHitChance).toBeLessThanOrEqual(1);
    expect(config.minHitChance).toBeLessThan(config.maxHitChance);
    expect(config.exponent).toBeGreaterThan(0);
  }
});
```

**Step 5: Run shared tests**

Run: `npm test -w packages/shared -- src/constants/gameConstants.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/shared/src/types/combat.types.ts packages/shared/src/types/combatAction.types.ts packages/shared/src/constants/gameConstants.ts packages/shared/src/constants/gameConstants.test.ts
git commit -m "feat(shared): add combat mode hit curve types"
```

---

### Task 2: Replace Threshold Hits With A Mode-Aware Hit Resolver

**Files:**
- Modify: `packages/game-engine/src/combat/damageCalculator.ts`
- Modify: `packages/game-engine/src/combat/damageCalculator.test.ts`

**Step 1: Write the failing hit-curve tests**

Add tests in `packages/game-engine/src/combat/damageCalculator.test.ts` for:

```ts
it('pvp curve allows unchecked evasion to push hit chance below 0.30', () => {
  const result = resolveHitCheck({
    combatMode: 'pvp',
    hitScore: 30,
    avoidScore: 95,
    hitRollValue: 0.5,
  });
  expect(result.hitChance).toBeLessThan(0.30);
});

it('boss curve preserves a stronger minimum hit floor', () => {
  const result = resolveHitCheck({
    combatMode: 'pve_boss',
    hitScore: 30,
    avoidScore: 95,
    hitRollValue: 0.5,
  });
  expect(result.hitChance).toBeGreaterThanOrEqual(0.35);
});
```

Also add a regression that the current starter profile still has a sane open-world hit rate once `pve_open_world` is used.

**Step 2: Replace `doesAttackHit()` with score-based helpers**

In `packages/game-engine/src/combat/damageCalculator.ts`, add:

```ts
export function calculateHitChance(
  combatMode: CombatMode,
  hitScore: number,
  avoidScore: number,
): HitScoreBreakdown {
  const curve = HIT_CURVE_CONSTANTS[combatMode];
  const normalized = 1 / (1 + ((avoidScore + curve.bias) / Math.max(1, hitScore)) ** curve.exponent);
  const hitChance = clamp(normalized, curve.minHitChance, curve.maxHitChance);
  return { hitScore, avoidScore, hitChance };
}

export function resolveHitCheck(input: {
  combatMode: CombatMode;
  hitScore: number;
  avoidScore: number;
  hitRollValue?: number;
}) {
  const breakdown = calculateHitChance(input.combatMode, input.hitScore, input.avoidScore);
  const hitRollValue = input.hitRollValue ?? Math.random();
  return { ...breakdown, hitRollValue, didHit: hitRollValue < breakdown.hitChance };
}
```

Keep the old `rollD20()` utility for initiative and log flavor. Do not keep the old threshold hit logic as a second production path.

**Step 3: Add a compatibility wrapper only if required**

If other callers still need a boolean helper during migration, keep a thin wrapper:

```ts
export function doesAttackHitLegacy(/* ... */): boolean
```

but do not use it from new combat paths.

**Step 4: Run focused game-engine tests**

Run: `npm test -w packages/game-engine -- src/combat/damageCalculator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/game-engine/src/combat/damageCalculator.ts packages/game-engine/src/combat/damageCalculator.test.ts
git commit -m "feat(engine): add mode-aware hit resolver"
```

---

### Task 3: Thread Combat Mode Through Template Combat And Logs

**Files:**
- Modify: `packages/game-engine/src/combat/templateCombatEngine.ts`
- Modify: `packages/game-engine/src/combat/templateCombatEngine.test.ts`
- Modify: `apps/api/src/services/combatLogMapper.ts`

**Step 1: Write failing template-combat tests**

Add tests in `packages/game-engine/src/combat/templateCombatEngine.test.ts`:

```ts
it('uses pvp hit curves when combatMode is pvp', () => {
  const result = runTemplateCombat(a, b, { combatMode: 'pvp' });
  expect(result.log.find((e) => e.hitChance !== undefined)).toBeDefined();
});

it('logs hit chance, sampled roll, and score breakdown on offensive actions', () => {
  const entry = result.log.find((e) => e.rawDamage !== undefined);
  expect(entry?.hitChance).toBeDefined();
  expect(entry?.attackerHitScore).toBeDefined();
  expect(entry?.defenderAvoidScore).toBeDefined();
});
```

Add one PvP-vs-boss contrast test so the same hit/avoid scores resolve differently by mode.

**Step 2: Extend `CombatOptions` to accept `combatMode`**

Update `packages/shared/src/types/combat.types.ts`:

```ts
export interface CombatOptions {
  potions?: CombatPotion[];
  combatMode?: CombatMode;
}
```

Default template combat to `pve_open_world` if the caller does not specify a mode yet.

**Step 3: Replace boolean hit checks inside `templateCombatEngine.ts`**

In offensive action resolution:

```ts
const hitResolution = resolveHitCheck({
  combatMode: options?.combatMode ?? 'pve_open_world',
  hitScore: Math.max(1, accuracyBonus),
  avoidScore: Math.max(0, targetStats.dodge + targetStats.evasion),
});
```

Log `hitChance`, `hitRollValue`, `attackerHitScore`, and `defenderAvoidScore` onto the entry.

**Step 4: Preserve action log mapping**

Update `apps/api/src/services/combatLogMapper.ts` only if necessary to preserve these new fields. Do not strip them.

**Step 5: Run focused template-combat tests**

Run: `npm test -w packages/game-engine -- src/combat/templateCombatEngine.test.ts src/combat/damageCalculator.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/game-engine/src/combat/templateCombatEngine.ts packages/game-engine/src/combat/templateCombatEngine.test.ts apps/api/src/services/combatLogMapper.ts packages/shared/src/types/combat.types.ts
git commit -m "feat(engine): thread combat modes through template combat"
```

---

### Task 4: Wire Existing Callers Into PvP, Open-World PvE, And Boss Modes

**Files:**
- Modify: `apps/api/src/services/pvpService.ts`
- Modify: `apps/api/src/services/sparService.ts`
- Modify: `apps/api/src/services/trainingService.ts`
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/zones.ts`
- Modify: `packages/game-engine/src/combat/bossRoundResolver.ts`
- Modify: `packages/game-engine/src/combat/bossRoundResolver.test.ts`
- Modify: `apps/api/src/services/bossEncounterService.ts`

**Step 1: Write the failing boss-resolver test**

Add a test in `packages/game-engine/src/combat/bossRoundResolver.test.ts`:

```ts
it('uses boss hit-curve tuning instead of threshold hit checks', () => {
  const result = resolveBossRound(makeInput(), fixedRng);
  expect(result.participantResults[0].hit).toBeTypeOf('boolean');
});
```

Make the assertion concrete by comparing a `pvp`-like and `pve_boss`-like case once the resolver accepts a combat mode internally.

**Step 2: Pass explicit combat modes from API callers**

Update call sites:

```ts
runTemplateCombat(attackerCombatant, defenderCombatant, { combatMode: 'pvp' });
runTemplateCombat(playerCombatant, mobCombatant, { combatMode: 'pve_open_world', potions: [...] });
```

Use:

- `pvpService.ts`: `pvp`
- `sparService.ts`: `pvp`
- `trainingService.ts`: `pve_open_world`
- `combat/start.ts`: `pve_open_world`
- `exploration/start.ts`: `pve_open_world`
- `zones.ts`: `pve_open_world`

**Step 3: Switch boss resolver to boss-mode hit checks**

In `packages/game-engine/src/combat/bossRoundResolver.ts`, replace direct `doesAttackHit()` use with `resolveHitCheck({ combatMode: 'pve_boss', ... })` for player attacks into the boss.

If boss attacks against players also use hit checks in this file after refactor, use `pve_boss` there too.

**Step 4: Thread mode through boss service if needed**

Update `apps/api/src/services/bossEncounterService.ts` only if the resolver signature changes. Keep the API minimal.

**Step 5: Run focused tests**

Run: `npm test -w packages/game-engine -- src/combat/bossRoundResolver.test.ts src/combat/templateCombatEngine.test.ts`
Expected: PASS

Run: `npm test -w apps/api -- src/services/pvpService.test.ts src/services/trainingService.test.ts src/services/bossEncounterService.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/services/pvpService.ts apps/api/src/services/sparService.ts apps/api/src/services/trainingService.ts apps/api/src/routes/combat/start.ts apps/api/src/routes/exploration/start.ts apps/api/src/routes/zones.ts packages/game-engine/src/combat/bossRoundResolver.ts packages/game-engine/src/combat/bossRoundResolver.test.ts apps/api/src/services/bossEncounterService.ts
git commit -m "feat(api): wire combat modes into live combat callers"
```

---

### Task 5: Add Explicit Anti-Evasion Counters

**Files:**
- Modify: `packages/shared/src/constants/combatActionDefinitions.ts`
- Modify: `packages/game-engine/src/combat/templateCombatEngine.ts`
- Modify: `packages/game-engine/src/combat/templateCombatEngine.test.ts`

**Step 1: Write the failing counterplay tests**

Add tests for:

```ts
it('always-hit anti-evasion debuffs apply even against extreme avoidance', () => {
  expect(debuffEntry?.effectsApplied).toEqual([
    expect.objectContaining({ stat: 'evasion', modifier: -20 }),
  ]);
});

it('damage-over-time effects marked unavoidable bypass hit checks', () => {
  expect(dotTick?.damage).toBeGreaterThan(0);
});
```

**Step 2: Tag a minimal counter package**

Do not rebalance the full skill roster yet. Add explicit flags to a small set of counters:

```ts
const snipersMark: ActionDefinition = {
  // ...
  alwaysHits: true,
  effect: { name: "Sniper's Mark", stat: 'evasion', modifier: -20, duration: 3, isDebuff: true, alwaysApplies: true },
};
```

Pick a small, intentional set:

- one ranged anti-evasion counter
- one magic anti-evasion counter
- one unavoidable DoT source

Do not apply `alwaysHits` to every spell by default.

**Step 3: Respect the new flags in the engine**

In `templateCombatEngine.ts`:

```ts
const hitResolution = action.alwaysHits
  ? { didHit: true, hitChance: 1, hitRollValue: 0, hitScore: accuracyBonus, avoidScore: targetStats.dodge + targetStats.evasion }
  : resolveHitCheck(...);
```

When applying effects, respect `effect.alwaysApplies` for counter debuffs that should not miss.

**Step 4: Run focused engine tests**

Run: `npm test -w packages/game-engine -- src/combat/templateCombatEngine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/constants/combatActionDefinitions.ts packages/game-engine/src/combat/templateCombatEngine.ts packages/game-engine/src/combat/templateCombatEngine.test.ts
git commit -m "feat(combat): add explicit anti-evasion counterplay"
```

---

### Task 6: Retune Seed Data And Mode-Specific Balance Regressions

**Files:**
- Modify: `packages/database/prisma/seed-data/mobs.ts`
- Modify: `packages/database/prisma/seed-data/items.ts`
- Modify: `packages/database/prisma/seed-data/mobs.test.ts`
- Modify: `packages/database/prisma/seed-data/items.test.ts`
- Modify: `packages/database/prisma/seed-data/validation.ts`
- Modify: `apps/api/src/services/zoneDiscoveryService.ts`

**Step 1: Rewrite the current hit-rate regressions around mode-aware math**

Update `packages/database/prisma/seed-data/mobs.test.ts` so starter targets call the new hit-chance helper with `pve_open_world`.

Add a new target like:

```ts
expect(calculateHitChance('pve_open_world', starterAccuracy, fieldMouseAvoid).hitChance)
  .toBeGreaterThanOrEqual(0.45);
```

**Step 2: Add a PvP dodge ceiling regression**

In `packages/database/prisma/seed-data/items.test.ts`, add a test for an equipable max-dodge PvP loadout:

```ts
expect(calculateHitChance('pvp', 35, maxDodgeLoadout + 60).hitChance)
  .toBeLessThanOrEqual(0.25);
```

Also add the counter-build version:

```ts
expect(calculateHitChance('pvp', 95, maxDodgeLoadout + 60).hitChance)
  .toBeGreaterThanOrEqual(0.45);
```

Use slot-constrained best-in-slot aggregation, not impossible full-sum item pools.

**Step 3: Retune only the data needed to hit the new bands**

- lower or raise mob accuracy where the open-world floor demands it
- rebalance dodge/accuracy on tiered gear if the new PvP bands are unreachable
- keep tutorial seeding intentionally safe

Do not blanket-buff every mob accuracy value.

**Step 4: Keep `pve_expedition` in validation even if no caller exists yet**

Add `EXPEDITION_TARGETS` or equivalent in `validation.ts` so future expedition combat has locked-in target bands before that resolver lands.

**Step 5: Run focused seed tests**

Run: `npx vitest run packages/database/prisma/seed-data/items.test.ts packages/database/prisma/seed-data/mobs.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/prisma/seed-data/mobs.ts packages/database/prisma/seed-data/items.ts packages/database/prisma/seed-data/mobs.test.ts packages/database/prisma/seed-data/items.test.ts packages/database/prisma/seed-data/validation.ts apps/api/src/services/zoneDiscoveryService.ts
git commit -m "balance: retune combat data for mode-aware hit curves"
```

---

### Task 7: Full Verification And Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-03-09-mode-aware-hit-curves-design.md`
- Modify: `docs/superpowers/plans/2026-03-09-mode-aware-hit-curves-plan.md`

**Step 1: Run shared verification**

Run: `npm test -w packages/shared -- src/constants/gameConstants.test.ts`
Expected: PASS

**Step 2: Run engine verification**

Run: `npm test -w packages/game-engine -- src/combat/damageCalculator.test.ts src/combat/templateCombatEngine.test.ts src/combat/bossRoundResolver.test.ts`
Expected: PASS

**Step 3: Run API verification**

Run: `npm test -w apps/api -- src/services/pvpService.test.ts src/services/trainingService.test.ts src/services/bossEncounterService.test.ts src/services/equipmentService.test.ts`
Expected: PASS

**Step 4: Run seed-data verification**

Run: `npx vitest run packages/database/prisma/seed-data/items.test.ts packages/database/prisma/seed-data/mobs.test.ts`
Expected: PASS

**Step 5: Record final tuned values**

Append a short verification section to both docs with:

- final per-mode hit-curve constants
- PvP unchecked evasion ceiling result
- PvP counter-build recovery result
- open-world starter hit-rate floor result
- any boss-floor adjustments made during tuning

---

## Execution Record

### Implementation Commits

- `7625558` `feat(shared): add combat mode hit curve types`
- `1274baf` `fix(shared): make hit curve constants readonly`
- `1113e29` `feat(engine): add mode-aware hit resolver`
- `c68d0bc` `fix(engine): sanitize hit curve inputs`
- `5613d2b` `feat(engine): thread combat modes through template combat`
- `c167bd3` `feat(api): wire combat modes into live combat callers`
- `407bf6e` `feat(combat): add explicit anti-evasion counterplay`
- `578e7f6` `balance: retune combat data for mode-aware hit curves`
- `c2df169` `fix(seed): align expedition validation targets`

### Final Verification

- `npm test -w packages/shared -- src/constants/gameConstants.test.ts`
  - `52/52` tests passed
- `npm test -w packages/game-engine -- src/combat/damageCalculator.test.ts src/combat/templateCombatEngine.test.ts src/combat/bossRoundResolver.test.ts`
  - `120/120` tests passed
- `npm test -w apps/api -- src/services/pvpService.test.ts src/services/trainingService.test.ts src/services/bossEncounterService.test.ts src/services/equipmentService.test.ts`
  - `78/78` tests passed
- `npx vitest run packages/database/prisma/seed-data/items.test.ts packages/database/prisma/seed-data/mobs.test.ts`
  - `5/5` tests passed

### Final Recorded Values

- Hit-curve constants:
  - `pvp`: `0.10 / 0.95 / 5 / 2.4`
  - `pve_open_world`: `0.25 / 0.95 / 10 / 1.5`
  - `pve_expedition`: `0.20 / 0.95 / 8 / 1.8`
  - `pve_boss`: `0.35 / 0.98 / 12 / 1.35`
- PvP unchecked evasion ceiling:
  - `0.1000` hit chance at `hitScore 35` vs `avoidScore 98`
- PvP counter-build recovery:
  - `0.4516` hit chance at `hitScore 95` vs `avoidScore 98`
- Open-world starter floor:
  - `0.5000` hit chance at `hitScore 12` vs `Field Mouse avoid 2`
  - `0.4700` hit chance at `hitScore 12` vs `Forest Edge tier-1 avoid 3`
- Boss-floor adjustments:
  - none after initial constant selection; `pve_boss` remained at `0.3500` on the verification probe

**Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-03-09-mode-aware-hit-curves-design.md docs/superpowers/plans/2026-03-09-mode-aware-hit-curves-plan.md
git commit -m "docs: record mode-aware hit curve verification"
```
