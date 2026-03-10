# Combat Data Balance Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the combat/data inconsistencies found in review, then rebalance early-game and armor progression against the corrected formulas.

**Architecture:** Start by adding regression tests and seed-data validation so the current failures are reproducible and future bad seed rows are rejected. Then fix item/mob seed data, repair action-definition/runtime mismatches in the combat engine, and finish with a balance pass that retunes early mobs and armor weight classes against the live hit formula.

**Tech Stack:** TypeScript, Prisma seed data, shared constants/types, game-engine combat modules, Vitest

---

### Task 1: Lock In Regression Coverage

**Files:**
- Modify: `packages/game-engine/src/combat/damageCalculator.test.ts`
- Modify: `apps/api/src/services/equipmentService.test.ts`
- Create: `packages/database/prisma/seed-data/items.test.ts`
- Create: `packages/database/prisma/seed-data/mobs.test.ts`

**Step 1: Write the failing ranged-scaling and starter-hit-rate tests**

```ts
it('ranged weapons must contribute rangedPower to ranged damage', () => {
  const stats = buildPlayerCombatStats(100, 100, {
    attackStyle: 'ranged',
    skillLevel: 1,
    attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
  }, {
    attack: 3, rangedPower: 0, magicPower: 0, accuracy: 0, armor: 0, magicDefence: 0, health: 0, dodge: 0,
  });
  expect(stats.damageMax).toBeGreaterThan(5);
});
```

**Step 2: Write the failing seed-validation tests**

```ts
it('item templates only use supported combat stat keys', () => {
  const invalid = getAllItemTemplates().filter((item) => hasUnsupportedStatKey(item.baseStats));
  expect(invalid).toEqual([]);
});
```

**Step 3: Run the targeted test files and confirm they fail**

Run: `npm test -w packages/game-engine -- src/combat/damageCalculator.test.ts`
Expected: FAIL on ranged weapon expectations

Run: `npm test -w apps/api -- src/services/equipmentService.test.ts`
Expected: PASS or FAIL depending on added assertions, but new unsupported-key coverage should fail once added

**Step 4: Add mob difficulty expectations for starter content**

```ts
it('tutorial Field Mouse should stay within the starter hit-rate target', () => {
  const chance = computeHitChance({ playerAccuracy: 0, mobDodge: 2 });
  expect(chance).toBeGreaterThanOrEqual(0.45);
});
```

**Step 5: Commit**

```bash
git add packages/game-engine/src/combat/damageCalculator.test.ts apps/api/src/services/equipmentService.test.ts packages/database/prisma/seed-data/items.test.ts packages/database/prisma/seed-data/mobs.test.ts
git commit -m "test: lock combat data regressions"
```

### Task 2: Add Seed-Data Guardrails

**Files:**
- Create: `packages/database/prisma/seed-data/validation.ts`
- Modify: `packages/database/prisma/seed-data/items.test.ts`
- Modify: `packages/database/prisma/seed-data/mobs.test.ts`

**Step 1: Write minimal validation helpers**

```ts
export function hasUnsupportedStatKey(stats: Record<string, number>): boolean {
  return Object.keys(stats).some((key) => !SUPPORTED_ITEM_STATS.has(key));
}
```

**Step 2: Add weapon-style validation**

```ts
export function validateWeaponTemplate(template: ItemTemplateLike): string[] {
  if (template.requiredSkill === 'ranged' && !template.baseStats.rangedPower) {
    return ['ranged weapon missing rangedPower'];
  }
  return [];
}
```

**Step 3: Run the seed-data tests and confirm they fail on current content**

Run: `npm test -w packages/database -- seed-data/items.test.ts seed-data/mobs.test.ts`
Expected: FAIL on unsupported stat keys and ranged weapons

**Step 4: Keep validation focused on combat-facing rules only**

```ts
expect(validateItemTemplates(getAllItemTemplates())).toEqual([]);
```

**Step 5: Commit**

```bash
git add packages/database/prisma/seed-data/validation.ts packages/database/prisma/seed-data/items.test.ts packages/database/prisma/seed-data/mobs.test.ts
git commit -m "test: add combat seed validation"
```

### Task 3: Repair Item Seed Data

**Files:**
- Modify: `packages/database/prisma/seed-data/items.ts`
- Modify: `packages/database/prisma/seed-data/items.test.ts`

**Step 1: Convert ranged weapons to `rangedPower`**

```ts
weapon(IDS.wep.oakShortbow, 'Oak Shortbow', 1, 'ranged', 1, { rangedPower: 3 })
```

**Step 2: Remove dead stat keys from achievement rewards**

```ts
it({ id: 'achievement_spiders_boots', /* ... */, baseStats: { dodge: 12, accuracy: 8 } })
```

**Step 3: Give the achievement weapon a real weapon requirement**

```ts
weapon('achievement_bandits_weapon', "Bandit Lord's Blade", 5, 'melee', 30, { attack: 12, critChance: 0.05 })
```

**Step 4: Normalize magic weapons so their budget is spent on magic stats**

```ts
weapon(IDS.wep.goblinHexStaff, 'Goblin Hex Staff', 2, 'magic', 8, { magicPower: 10 })
```

**Step 5: Run the item validation tests, then commit**

Run: `npm test -w packages/database -- seed-data/items.test.ts`
Expected: PASS

```bash
git add packages/database/prisma/seed-data/items.ts packages/database/prisma/seed-data/items.test.ts
git commit -m "fix: normalize combat item seed stats"
```

### Task 4: Fix Action Definition / Runtime Mismatches

**Files:**
- Modify: `packages/game-engine/src/combat/templateCombatEngine.ts`
- Modify: `packages/game-engine/src/combat/actionResolver.ts`
- Modify: `packages/shared/src/constants/combatActionDefinitions.ts`
- Modify: `packages/game-engine/src/combat/templateCombatEngine.test.ts`

**Step 1: Write failing tests for defensive buffs and `defenceReduction`**

```ts
it('fortify applies its buff when used', () => {
  const result = runTemplateCombat(buffUser('fortify'), dummyTarget());
  expect(result.log.some((entry) => entry.effectsApplied?.some((e) => e.stat === 'defence'))).toBe(true);
});
```

**Step 2: Route buff-style defensive actions through effect application**

```ts
if (action.effect || action.healFlat || action.healPercent) {
  executeSupportiveAction(...);
  return;
}
```

**Step 3: Either implement `defenceReduction` or remove it from misleading actions**

```ts
const effectiveDefence = applyActionDefenceReduction(baseDefence, action.defenceReduction);
```

**Step 4: Make percentage descriptions match the actual math**

```ts
effect: { name: 'Berserker Rage', stat: 'attackPercent', modifier: 0.30, duration: 5, isDebuff: false }
```

**Step 5: Run targeted engine tests, then commit**

Run: `npm test -w packages/game-engine -- src/combat/templateCombatEngine.test.ts src/combat/damageCalculator.test.ts`
Expected: PASS

```bash
git add packages/game-engine/src/combat/templateCombatEngine.ts packages/game-engine/src/combat/actionResolver.ts packages/shared/src/constants/combatActionDefinitions.ts packages/game-engine/src/combat/templateCombatEngine.test.ts
git commit -m "fix: align combat actions with runtime behavior"
```

### Task 5: Rebaseline Early-Game Combat

**Files:**
- Modify: `packages/database/prisma/seed-data/mobs.ts`
- Modify: `apps/api/src/services/zoneDiscoveryService.ts`
- Modify: `packages/database/prisma/seed-data/mobs.test.ts`

**Step 1: Pick and encode starter targets**

```ts
const STARTER_TARGETS = {
  tutorialHitRateMin: 0.45,
  forestEdgeTier1HitRateMin: 0.40,
};
```

**Step 2: Lower early Forest Edge dodge/evasion to meet those targets**

```ts
mob({ id: m.fieldMouse, /* ... */, evasion: 2 })
```

**Step 3: Make the tutorial encounter intentionally safe even if the zone later changes**

```ts
// Use a tutorial-specific starter mob row or a dedicated tutorial stat override
```

**Step 4: Re-run starter balance tests**

Run: `npm test -w packages/database -- seed-data/mobs.test.ts`
Expected: PASS with the new hit-rate floor

**Step 5: Commit**

```bash
git add packages/database/prisma/seed-data/mobs.ts apps/api/src/services/zoneDiscoveryService.ts packages/database/prisma/seed-data/mobs.test.ts
git commit -m "balance: smooth starter combat difficulty"
```

### Task 6: Rebalance Armor Weight Classes

**Files:**
- Modify: `packages/database/prisma/seed-data/items.ts`
- Modify: `packages/database/prisma/seed-data/items.test.ts`
- Modify: `apps/api/src/services/pvpService.ts`

**Step 1: Decide explicit weight-class identities**

```ts
// heavy: best mitigation, lowest dodge
// medium: mixed mitigation + moderate dodge
// light: best dodge + magic defence, but cannot reach near-immunity
```

**Step 2: Reduce light-set dodge budgets and raise medium/heavy distinctiveness**

```ts
light: { prefix: 'Spectral', chestName: 'Spectral Robe', stats: { armor: 6, magicDefence: 14, dodge: 4 } }
```

**Step 3: Add a regression test that full light armor cannot force nat-20-only PvE hit rates**

```ts
expect(computeHitChance({ mobAccuracy: 26, playerDodge: totalLightDodge })).toBeGreaterThan(0.20);
```

**Step 4: Keep `weightClass` meaningful in downstream summaries**

```ts
expect(armorClass).toBeDefined();
```

**Step 5: Run the item tests and commit**

Run: `npm test -w packages/database -- seed-data/items.test.ts`
Expected: PASS

```bash
git add packages/database/prisma/seed-data/items.ts packages/database/prisma/seed-data/items.test.ts apps/api/src/services/pvpService.ts
git commit -m "balance: retune armor weight classes"
```

### Task 7: Full Verification

**Files:**
- Modify: `docs/plans/2026-03-09-combat-data-balance-remediation-plan.md`

**Step 1: Run the focused suites**

Run: `npm test -w packages/game-engine -- src/combat/damageCalculator.test.ts src/combat/templateCombatEngine.test.ts`
Expected: PASS

**Step 2: Run API/service coverage for equipment and combat prep**

Run: `npm test -w apps/api -- src/services/equipmentService.test.ts src/services/combatStatsService.test.ts src/services/trainingService.test.ts`
Expected: PASS

**Step 3: Run seed-data tests**

Run: `npm test -w packages/database -- seed-data/items.test.ts seed-data/mobs.test.ts`
Expected: PASS

**Step 4: Record the final balance deltas in this plan**

```md
- Field Mouse evasion: 5 -> 2
- Tier 5 light full-set dodge: 39 -> 22
- Ranged weapons now use rangedPower exclusively
```

**Step 5: Commit**

```bash
git add docs/plans/2026-03-09-combat-data-balance-remediation-plan.md
git commit -m "docs: record combat balance remediation verification"
```
## Final Balance Deltas

- Field Mouse evasion: `5 -> 2`
- Forest Spider evasion: `4 -> 3`
- Tutorial starter encounter: `2x Field Mouse -> 1x Field Mouse`
- Ranged weapons now use `rangedPower` exclusively
- Magic staffs now spend their offensive budget on `magicPower` instead of dead `attack`
- Achievement rewards now use supported combat stat keys only
- Bandit Lord's Blade now requires `melee` level `30`
- Tier 5 generated light armor full-set dodge: `39 -> 23`
- Tier 5 best-in-slot light armor dodge across equipable core slots: capped at `23`
- Tier 5 heavy armor chest value: `24 -> 26`
- Tier 5 medium armor chest value: `16 armor / 6 dodge -> 18 armor / 5 dodge`

## Verification Run

- `npm test -w packages/game-engine -- src/combat/damageCalculator.test.ts src/combat/templateCombatEngine.test.ts`
- `npm test -w apps/api -- src/services/equipmentService.test.ts src/services/combatStatsService.test.ts src/services/trainingService.test.ts`
- `npx vitest run packages/database/prisma/seed-data/items.test.ts packages/database/prisma/seed-data/mobs.test.ts`
