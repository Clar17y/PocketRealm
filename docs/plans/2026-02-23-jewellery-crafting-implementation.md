# Jewellery Crafting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `jewelcrafting` skill with gathering crits for gem acquisition, gem refining, and 15 craftable jewellery pieces across 5 tiers.

**Architecture:** New pure function `gatheringCrit` in game-engine for the crit calculator. Seed data additions for 30 gem resources, 15 jewellery templates, 30 recipes, and ~25 mob drop table entries. Gathering route modification to roll for gem crits on each mine action. Existing crafting/refining/forge/salvage systems handle jewellery with zero code changes.

**Tech Stack:** TypeScript, Prisma, Vitest, Express, game-engine pure functions

**Design Doc:** `docs/plans/2026-02-23-jewellery-crafting-design.md`

---

### Task 1: Add `jewelcrafting` to Shared Types

**Files:**
- Modify: `packages/shared/src/types/player.types.ts:58-83`

**Step 1: Add `jewelcrafting` to the SkillType union**

In `packages/shared/src/types/player.types.ts`, add `'jewelcrafting'` to the `SkillType` union (after `'alchemy'` on line 72) and to the `CRAFTING_SKILLS` array (line 77):

```typescript
export type SkillType =
  | 'melee'
  | 'ranged'
  | 'magic'
  | 'mining'
  | 'foraging'
  | 'woodcutting'
  | 'refining'
  | 'tanning'
  | 'weaving'
  | 'weaponsmithing'
  | 'armorsmithing'
  | 'leatherworking'
  | 'tailoring'
  | 'alchemy'
  | 'jewelcrafting';

export const COMBAT_SKILLS: SkillType[] = ['melee', 'ranged', 'magic'];
export const GATHERING_SKILLS: SkillType[] = ['mining', 'foraging', 'woodcutting'];
export const PROCESSING_SKILLS: SkillType[] = ['refining', 'tanning', 'weaving'];
export const CRAFTING_SKILLS: SkillType[] = ['weaponsmithing', 'armorsmithing', 'leatherworking', 'tailoring', 'alchemy', 'jewelcrafting'];
export const ALL_SKILLS: SkillType[] = [
  ...COMBAT_SKILLS,
  ...GATHERING_SKILLS,
  ...PROCESSING_SKILLS,
  ...CRAFTING_SKILLS,
];
```

**Step 2: Add `jewelcrafting` to auth route's ALL_SKILLS**

In `apps/api/src/routes/auth.ts:30-35`, add `'jewelcrafting'` to the local `ALL_SKILLS` array:

```typescript
const ALL_SKILLS: SkillType[] = [
  'melee', 'ranged', 'magic',
  'mining', 'foraging', 'woodcutting',
  'refining', 'tanning', 'weaving',
  'weaponsmithing', 'armorsmithing', 'leatherworking', 'tailoring', 'alchemy',
  'jewelcrafting',
];
```

**Step 3: Build shared package and typecheck**

Run: `npm run build --workspace=packages/shared`
Then: `npx tsc -b --noEmit` from project root
Expected: No new errors

**Step 4: Commit**

```bash
git add packages/shared/src/types/player.types.ts apps/api/src/routes/auth.ts
git commit -m "feat: add jewelcrafting to SkillType and CRAFTING_SKILLS"
```

---

### Task 2: Add Gathering Crit Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (after GATHERING_CONSTANTS at line 178)

**Step 1: Add GEM_CRIT_CONSTANTS block**

Insert after the `GATHERING_CONSTANTS` block (line 178) and before the `CRAFTING` comment block (line 180):

```typescript
// =============================================================================
// GATHERING CRITS (precious gem drops)
// =============================================================================

export const GEM_CRIT_CONSTANTS = {
  /** Base chance for a gathering action to yield a bonus gem */
  BASE_CHANCE: 0.03,

  /** Additional gem crit chance per skill level above node requirement */
  LEVEL_BONUS: 0.005,

  /** Additional gem crit chance per point of equipped luck */
  LUCK_BONUS: 0.003,

  /** Maximum gem crit chance (cap) */
  MAX_CHANCE: 0.25,
} as const;
```

**Step 2: Build shared and typecheck**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add GEM_CRIT_CONSTANTS for gathering crit system"
```

---

### Task 3: Implement Gathering Crit Calculator (TDD)

**Files:**
- Create: `packages/game-engine/src/gathering/gatheringCrit.ts`
- Create: `packages/game-engine/src/gathering/gatheringCrit.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Write the failing test**

Create `packages/game-engine/src/gathering/gatheringCrit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { calculateGemCritChance, rollGemCrit } from './gatheringCrit';

describe('calculateGemCritChance', () => {
  it('returns base chance at exact node level with no luck', () => {
    expect(calculateGemCritChance(5, 5, 0)).toBeCloseTo(0.03);
  });

  it('scales with levels above requirement', () => {
    // 0.03 + 10 * 0.005 = 0.08
    expect(calculateGemCritChance(15, 5, 0)).toBeCloseTo(0.08);
  });

  it('scales with luck stat', () => {
    // 0.03 + 0 + 10 * 0.003 = 0.06
    expect(calculateGemCritChance(5, 5, 10)).toBeCloseTo(0.06);
  });

  it('combines level and luck bonuses', () => {
    // 0.03 + 10 * 0.005 + 20 * 0.003 = 0.14
    expect(calculateGemCritChance(15, 5, 20)).toBeCloseTo(0.14);
  });

  it('clamps to max chance', () => {
    expect(calculateGemCritChance(100, 1, 500)).toBeCloseTo(0.25);
  });

  it('returns base chance when below node level', () => {
    // levelsAbove clamped to 0
    expect(calculateGemCritChance(3, 10, 0)).toBeCloseTo(0.03);
  });
});

describe('rollGemCrit', () => {
  it('returns isCrit=true when roll < critChance', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0 }, 0.01);
    expect(result.isCrit).toBe(true);
    expect(result.critChance).toBeCloseTo(0.03);
  });

  it('returns isCrit=false when roll >= critChance', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0 }, 0.5);
    expect(result.isCrit).toBe(false);
  });

  it('uses Math.random when no roll override provided', () => {
    const result = rollGemCrit({ skillLevel: 5, nodeLevel: 5, luckStat: 0 });
    expect(typeof result.isCrit).toBe('boolean');
    expect(result.critChance).toBeCloseTo(0.03);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-engine/src/gathering/gatheringCrit.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the gathering crit calculator**

Create `packages/game-engine/src/gathering/gatheringCrit.ts`:

```typescript
import { GEM_CRIT_CONSTANTS } from '@adventure/shared';

export interface GemCritInput {
  skillLevel: number;
  nodeLevel: number;
  luckStat: number;
}

export interface GemCritResult {
  isCrit: boolean;
  critChance: number;
}

export function calculateGemCritChance(
  skillLevel: number,
  nodeLevel: number,
  luckStat: number,
): number {
  const levelsAbove = Math.max(0, skillLevel - nodeLevel);
  const raw =
    GEM_CRIT_CONSTANTS.BASE_CHANCE +
    levelsAbove * GEM_CRIT_CONSTANTS.LEVEL_BONUS +
    luckStat * GEM_CRIT_CONSTANTS.LUCK_BONUS;
  return Math.min(raw, GEM_CRIT_CONSTANTS.MAX_CHANCE);
}

export function rollGemCrit(input: GemCritInput, roll?: number): GemCritResult {
  const critChance = calculateGemCritChance(input.skillLevel, input.nodeLevel, input.luckStat);
  const r = typeof roll === 'number' ? roll : Math.random();
  return { isCrit: r < critChance, critChance };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run packages/game-engine/src/gathering/gatheringCrit.test.ts`
Expected: All 8 tests PASS

**Step 5: Export from game-engine index**

In `packages/game-engine/src/index.ts`, add after the `// Crafting` section (line 25):

```typescript
// Gathering
export * from './gathering/gatheringCrit';
```

**Step 6: Build game-engine and typecheck**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build

**Step 7: Commit**

```bash
git add packages/game-engine/src/gathering/ packages/game-engine/src/index.ts
git commit -m "feat: add gatheringCrit pure function with tests"
```

---

### Task 4: Add Gem & Jewellery Seed IDs

**Files:**
- Modify: `packages/database/prisma/seed-data/ids.ts`

**Step 1: Add gem resource IDs**

In `packages/database/prisma/seed-data/ids.ts`, add a new `gems` section after the `res` section (after line 70), and a `jewel` section for jewellery equipment after the `arm` section (after line 288):

```typescript
  // ── Item Templates: Raw & Cut Gems ──────────────────────────────────────────
  gems: {
    // Raw gems (gathering crits) — mining
    roughRuby: randomUUID(),
    roughSapphire: randomUUID(),
    roughEmerald: randomUUID(),
    roughDiamond: randomUUID(),
    roughOpal: randomUUID(),
    // Raw gems — foraging
    rawAmber: randomUUID(),
    rawPearl: randomUUID(),
    rawJade: randomUUID(),
    rawMoonstone: randomUUID(),
    rawStarcrystal: randomUUID(),
    // Raw gems — woodcutting
    treeResin: randomUUID(),
    fossilizedSap: randomUUID(),
    crystalBark: randomUUID(),
    heartwoodGem: randomUUID(),
    ancientAmber: randomUUID(),
    // Cut gems — mining
    cutRuby: randomUUID(),
    cutSapphire: randomUUID(),
    cutEmerald: randomUUID(),
    cutDiamond: randomUUID(),
    cutOpal: randomUUID(),
    // Cut gems — foraging
    cutAmber: randomUUID(),
    cutPearl: randomUUID(),
    cutJade: randomUUID(),
    cutMoonstone: randomUUID(),
    cutStarcrystal: randomUUID(),
    // Cut gems — woodcutting
    cutResin: randomUUID(),
    cutSap: randomUUID(),
    cutBark: randomUUID(),
    cutHeartwood: randomUUID(),
    cutAncientAmber: randomUUID(),
  },

  // ── Item Templates: Jewellery ───────────────────────────────────────────────
  jewel: {
    // Rings (T1-T5)
    copperRing: randomUUID(),
    ironBand: randomUUID(),
    darkIronRing: randomUUID(),
    mithrilRing: randomUUID(),
    ancientRing: randomUUID(),
    // Necklaces (T1-T5)
    copperPendant: randomUUID(),
    ironChain: randomUUID(),
    darkIronAmulet: randomUUID(),
    mithrilNecklace: randomUUID(),
    ancientAmulet: randomUUID(),
    // Charms (T1-T5)
    copperCharm: randomUUID(),
    ironTalisman: randomUUID(),
    darkIronCharm: randomUUID(),
    mithrilTalisman: randomUUID(),
    ancientCharm: randomUUID(),
  },
```

**Step 2: Typecheck**

Run: `npx tsc -b --noEmit` from project root
Expected: No errors

**Step 3: Commit**

```bash
git add packages/database/prisma/seed-data/ids.ts
git commit -m "feat: add seed IDs for gems and jewellery items"
```

---

### Task 5: Add Gem Resource & Jewellery Item Templates

**Files:**
- Modify: `packages/database/prisma/seed-data/items.ts`

**Step 1: Add raw gem resources**

After the `rawResources` array (line 77), add a new `rawGems` array:

```typescript
// ── Raw Gems (gathering crit drops) ──────────────────────────────────────────

const rawGems = [
  // Mining gems (T1-T5)
  resource(IDS.gems.roughRuby, 'Rough Ruby', 1),
  resource(IDS.gems.roughSapphire, 'Rough Sapphire', 2),
  resource(IDS.gems.roughEmerald, 'Rough Emerald', 3),
  resource(IDS.gems.roughDiamond, 'Rough Diamond', 4),
  resource(IDS.gems.roughOpal, 'Rough Opal', 5),
  // Foraging gems (T1-T5)
  resource(IDS.gems.rawAmber, 'Raw Amber', 1),
  resource(IDS.gems.rawPearl, 'Raw Pearl', 2),
  resource(IDS.gems.rawJade, 'Raw Jade', 3),
  resource(IDS.gems.rawMoonstone, 'Raw Moonstone', 4),
  resource(IDS.gems.rawStarcrystal, 'Raw Starcrystal', 5),
  // Woodcutting gems (T1-T5)
  resource(IDS.gems.treeResin, 'Tree Resin', 1),
  resource(IDS.gems.fossilizedSap, 'Fossilized Sap', 2),
  resource(IDS.gems.crystalBark, 'Crystal Bark', 3),
  resource(IDS.gems.heartwoodGem, 'Heartwood Gem', 4),
  resource(IDS.gems.ancientAmber, 'Ancient Amber', 5),
];
```

**Step 2: Add cut gem resources**

After `rawGems`, add:

```typescript
// ── Cut Gems (refined from raw gems) ────────────────────────────────────────

const cutGems = [
  // Mining
  resource(IDS.gems.cutRuby, 'Cut Ruby', 1),
  resource(IDS.gems.cutSapphire, 'Cut Sapphire', 2),
  resource(IDS.gems.cutEmerald, 'Cut Emerald', 3),
  resource(IDS.gems.cutDiamond, 'Cut Diamond', 4),
  resource(IDS.gems.cutOpal, 'Cut Opal', 5),
  // Foraging
  resource(IDS.gems.cutAmber, 'Cut Amber', 1),
  resource(IDS.gems.cutPearl, 'Cut Pearl', 2),
  resource(IDS.gems.cutJade, 'Cut Jade', 3),
  resource(IDS.gems.cutMoonstone, 'Cut Moonstone', 4),
  resource(IDS.gems.cutStarcrystal, 'Cut Starcrystal', 5),
  // Woodcutting
  resource(IDS.gems.cutResin, 'Cut Resin', 1),
  resource(IDS.gems.cutSap, 'Cut Sap', 2),
  resource(IDS.gems.cutBark, 'Cut Bark', 3),
  resource(IDS.gems.cutHeartwood, 'Cut Heartwood', 4),
  resource(IDS.gems.cutAncientAmber, 'Cut Ancient Amber', 5),
];
```

**Step 3: Add jewellery equipment templates**

After `cutGems`, add jewellery items. Follow the existing pattern from advanced gear (line 354+): `itemType: 'armor'`, no `weightClass`, `slot` is `ring`/`neck`/`charm`, durability scales with tier:

```typescript
// ── Jewellery Equipment ─────────────────────────────────────────────────────

const jewellery = [
  // Tier 1 — Rings: luck, critChance | Necklaces: health, luck | Charms: luck, dodge
  it({ id: IDS.jewel.copperRing, name: 'Copper Ring', itemType: 'armor', slot: 'ring', tier: 1, requiredLevel: 1, baseStats: { luck: 2, critChance: 0.01 }, maxDurability: 60 }),
  it({ id: IDS.jewel.copperPendant, name: 'Copper Pendant', itemType: 'armor', slot: 'neck', tier: 1, requiredLevel: 1, baseStats: { health: 3, luck: 1 }, maxDurability: 60 }),
  it({ id: IDS.jewel.copperCharm, name: 'Copper Charm', itemType: 'armor', slot: 'charm', tier: 1, requiredLevel: 1, baseStats: { luck: 2, dodge: 1 }, maxDurability: 60 }),
  // Tier 2
  it({ id: IDS.jewel.ironBand, name: 'Iron Band', itemType: 'armor', slot: 'ring', tier: 2, requiredLevel: 5, baseStats: { luck: 3, accuracy: 2, critChance: 0.01 }, maxDurability: 80 }),
  it({ id: IDS.jewel.ironChain, name: 'Iron Chain', itemType: 'armor', slot: 'neck', tier: 2, requiredLevel: 5, baseStats: { health: 5, luck: 2 }, maxDurability: 80 }),
  it({ id: IDS.jewel.ironTalisman, name: 'Iron Talisman', itemType: 'armor', slot: 'charm', tier: 2, requiredLevel: 5, baseStats: { luck: 3, dodge: 2 }, maxDurability: 80 }),
  // Tier 3
  it({ id: IDS.jewel.darkIronRing, name: 'Dark Iron Ring', itemType: 'armor', slot: 'ring', tier: 3, requiredLevel: 12, baseStats: { luck: 4, accuracy: 3, critChance: 0.02 }, maxDurability: 100 }),
  it({ id: IDS.jewel.darkIronAmulet, name: 'Dark Iron Amulet', itemType: 'armor', slot: 'neck', tier: 3, requiredLevel: 12, baseStats: { health: 8, luck: 3, accuracy: 1 }, maxDurability: 100 }),
  it({ id: IDS.jewel.darkIronCharm, name: 'Dark Iron Charm', itemType: 'armor', slot: 'charm', tier: 3, requiredLevel: 12, baseStats: { luck: 4, dodge: 3, critChance: 0.01 }, maxDurability: 100 }),
  // Tier 4
  it({ id: IDS.jewel.mithrilRing, name: 'Mithril Ring', itemType: 'armor', slot: 'ring', tier: 4, requiredLevel: 20, baseStats: { luck: 5, accuracy: 4, critChance: 0.03, critDamage: 0.05 }, maxDurability: 120 }),
  it({ id: IDS.jewel.mithrilNecklace, name: 'Mithril Necklace', itemType: 'armor', slot: 'neck', tier: 4, requiredLevel: 20, baseStats: { health: 12, luck: 4, accuracy: 2 }, maxDurability: 120 }),
  it({ id: IDS.jewel.mithrilTalisman, name: 'Mithril Talisman', itemType: 'armor', slot: 'charm', tier: 4, requiredLevel: 20, baseStats: { luck: 5, dodge: 4, critChance: 0.02, critDamage: 0.05 }, maxDurability: 120 }),
  // Tier 5
  it({ id: IDS.jewel.ancientRing, name: 'Ancient Ring', itemType: 'armor', slot: 'ring', tier: 5, requiredLevel: 28, baseStats: { luck: 7, accuracy: 5, critChance: 0.04, critDamage: 0.1 }, maxDurability: 150 }),
  it({ id: IDS.jewel.ancientAmulet, name: 'Ancient Amulet', itemType: 'armor', slot: 'neck', tier: 5, requiredLevel: 28, baseStats: { health: 16, luck: 5, accuracy: 3 }, maxDurability: 150 }),
  it({ id: IDS.jewel.ancientCharm, name: 'Ancient Charm', itemType: 'armor', slot: 'charm', tier: 5, requiredLevel: 28, baseStats: { luck: 7, dodge: 5, critChance: 0.03, critDamage: 0.1 }, maxDurability: 150 }),
];
```

**Step 4: Add to `getAllItemTemplates()` export**

In `getAllItemTemplates()` (line 425), add `...rawGems, ...cutGems, ...jewellery,` before `...advancedGear`:

```typescript
export function getAllItemTemplates() {
  return [
    ...rawResources,
    ...processedMaterials,
    ...mobDropMaterials,
    ...processedLeather,
    ...consumables,
    ...weapons,
    ...generateArmor(),
    ...rawGems,
    ...cutGems,
    ...jewellery,
    ...advancedGear,
    ...bossTrophyMaterials,
    ...bossEquipment,
    ...achievementFamilyItems,
  ];
}
```

**Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/database/prisma/seed-data/items.ts
git commit -m "feat: add gem resources and jewellery equipment item templates"
```

---

### Task 6: Add Gem Refining & Jewelcrafting Recipes

**Files:**
- Modify: `packages/database/prisma/seed-data/recipes.ts`

**Step 1: Add alias and recipe functions**

At the top of `recipes.ts`, add aliases for the new ID namespaces (after line 14):

```typescript
const gems = IDS.gems;
const jewel = IDS.jewel;
```

**Step 2: Add gem refining recipes**

Add a new `gemRefiningRecipes()` function before the `advancedRecipes()` function (before line 186):

```typescript
// ── Gem Refining Recipes (raw gem → cut gem via refining) ───────────────────

function gemRefiningRecipes() {
  return [
    // Mining gems
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: gems.cutRuby, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: gems.roughRuby, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: gems.cutSapphire, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: gems.roughSapphire, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: gems.cutEmerald, turnCost: 12, xpReward: 20, materials: [{ itemTemplateId: gems.roughEmerald, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: gems.cutDiamond, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: gems.roughDiamond, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 28, resultTemplateId: gems.cutOpal, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: gems.roughOpal, quantity: 2 }] }),
    // Foraging gems
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: gems.cutAmber, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: gems.rawAmber, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: gems.cutPearl, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: gems.rawPearl, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: gems.cutJade, turnCost: 12, xpReward: 20, materials: [{ itemTemplateId: gems.rawJade, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: gems.cutMoonstone, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: gems.rawMoonstone, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 28, resultTemplateId: gems.cutStarcrystal, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: gems.rawStarcrystal, quantity: 2 }] }),
    // Woodcutting gems
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: gems.cutResin, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: gems.treeResin, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: gems.cutSap, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: gems.fossilizedSap, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: gems.cutBark, turnCost: 12, xpReward: 20, materials: [{ itemTemplateId: gems.crystalBark, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: gems.cutHeartwood, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: gems.heartwoodGem, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 28, resultTemplateId: gems.cutAncientAmber, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: gems.ancientAmber, quantity: 2 }] }),
  ];
}
```

**Step 3: Add jewelcrafting recipes**

Add after `gemRefiningRecipes()`:

```typescript
// ── Jewelcrafting Recipes ───────────────────────────────────────────────────

function jewelcraftingRecipes() {
  return [
    // Tier 1 — metal + gem only
    recipe({ skillType: 'jewelcrafting', requiredLevel: 1, resultTemplateId: jewel.copperRing, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.copperIngot, quantity: 3 }, { itemTemplateId: gems.cutRuby, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 1, resultTemplateId: jewel.copperPendant, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.copperIngot, quantity: 3 }, { itemTemplateId: gems.cutAmber, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 1, resultTemplateId: jewel.copperCharm, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.copperIngot, quantity: 3 }, { itemTemplateId: gems.cutResin, quantity: 1 }] }),
    // Tier 2 — metal + gem
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: jewel.ironBand, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: gems.cutSapphire, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: jewel.ironChain, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: gems.cutPearl, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: jewel.ironTalisman, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: gems.cutSap, quantity: 1 }] }),
    // Tier 3 — metal + gem + mob drop
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: jewel.darkIronRing, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 5 }, { itemTemplateId: gems.cutEmerald, quantity: 2 }, { itemTemplateId: drop.crystalShard, quantity: 2 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: jewel.darkIronAmulet, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 5 }, { itemTemplateId: gems.cutJade, quantity: 2 }, { itemTemplateId: drop.faeSilk, quantity: 2 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: jewel.darkIronCharm, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 5 }, { itemTemplateId: gems.cutBark, quantity: 2 }, { itemTemplateId: drop.harpyFeather, quantity: 2 }] }),
    // Tier 4 — metal + gem + mob drop
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: jewel.mithrilRing, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.mithrilIngot, quantity: 6 }, { itemTemplateId: gems.cutDiamond, quantity: 3 }, { itemTemplateId: drop.darkCrystal, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: jewel.mithrilNecklace, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.mithrilIngot, quantity: 6 }, { itemTemplateId: gems.cutMoonstone, quantity: 3 }, { itemTemplateId: drop.bogHeart, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: jewel.mithrilTalisman, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.mithrilIngot, quantity: 6 }, { itemTemplateId: gems.cutHeartwood, quantity: 3 }, { itemTemplateId: drop.wraithEssence, quantity: 3 }] }),
    // Tier 5 — metal + gem + rare mob drop
    recipe({ skillType: 'jewelcrafting', requiredLevel: 28, resultTemplateId: jewel.ancientRing, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.ancientIngot, quantity: 8 }, { itemTemplateId: gems.cutOpal, quantity: 4 }, { itemTemplateId: drop.eldritchFragment, quantity: 4 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 28, resultTemplateId: jewel.ancientAmulet, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.ancientIngot, quantity: 8 }, { itemTemplateId: gems.cutStarcrystal, quantity: 4 }, { itemTemplateId: drop.nagaPearl, quantity: 4 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 28, resultTemplateId: jewel.ancientCharm, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.ancientIngot, quantity: 8 }, { itemTemplateId: gems.cutAncientAmber, quantity: 4 }, { itemTemplateId: drop.lichDust, quantity: 4 }] }),
  ];
}
```

**Step 4: Add to `getAllRecipes()` export**

Update `getAllRecipes()` (line 245):

```typescript
export function getAllRecipes() {
  return [...processingRecipes(), ...gemRefiningRecipes(), ...weaponRecipes(), ...armorRecipes(), ...jewelcraftingRecipes(), ...advancedRecipes(), ...bossRecipes()];
}
```

**Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/database/prisma/seed-data/recipes.ts
git commit -m "feat: add gem refining and jewelcrafting recipes"
```

---

### Task 7: Add Gem Drops to Mob Drop Tables

**Files:**
- Modify: `packages/database/prisma/seed-data/drops.ts`

**Step 1: Add gem ID alias**

At the top of `drops.ts`, add after the existing aliases (after line 7):

```typescript
const g = IDS.gems;
```

**Step 2: Add gem drop entries**

At the end of `getAllDropTables()`, before the closing `];`, add gem drops organized by zone tier. Follow the `dr()` helper pattern. Mobs drop any gem type (not skill-locked) at low rates:

```typescript
    // ── Gem Drops ────────────────────────────────────────────────────────
    // T1 zones (Forest Edge) — T1 raw gems, ~5%
    dr(m.ratKing, g.roughRuby, 5, 1, 1), dr(m.broodMother, g.rawAmber, 5, 1, 1), dr(m.greatBoar, g.treeResin, 5, 1, 1),
    // T2 zones (Deep Forest / Cave Entrance) — T1-T2 raw gems, ~5-8%
    dr(m.alphaWolf, g.roughSapphire, 8, 1, 1), dr(m.banditCaptain, g.rawPearl, 6, 1, 1), dr(m.elderTreant, g.fossilizedSap, 6, 1, 1),
    dr(m.batSwarmLord, g.roughRuby, 5, 1, 1), dr(m.goblinShaman, g.rawAmber, 5, 1, 1),
    // T3 zones (Ancient Grove / Deep Mines / Whispering Plains) — T2-T3 raw gems, ~5-8%
    dr(m.ancientSpirit, g.roughEmerald, 8, 1, 1), dr(m.faeQueen, g.rawJade, 8, 1, 1), dr(m.treantPatriarch, g.crystalBark, 6, 1, 1),
    dr(m.goblinChieftain, g.roughSapphire, 6, 1, 1), dr(m.tunnelWyrm, g.fossilizedSap, 5, 1, 1),
    dr(m.harpyMatriarch, g.rawJade, 6, 1, 1), dr(m.banditWarlord, g.crystalBark, 5, 1, 1),
    // T4 zones (Haunted Marsh / Crystal Caverns) — T3-T4 raw gems, ~5-8%
    dr(m.deathKnight, g.roughDiamond, 8, 1, 1), dr(m.covenMother, g.rawMoonstone, 8, 1, 1), dr(m.ancientCrocodile, g.heartwoodGem, 6, 1, 1),
    dr(m.golemOverlord, g.roughEmerald, 6, 1, 1), dr(m.crystalTitan, g.roughDiamond, 8, 1, 1), dr(m.goblinKingMob, g.rawMoonstone, 6, 1, 1),
    // T5 zones (Sunken Ruins) — T4-T5 raw gems, ~5-10%
    dr(m.lich, g.roughOpal, 10, 1, 1), dr(m.nagaQueenMob, g.rawStarcrystal, 10, 1, 1), dr(m.eldritchAbomination, g.ancientAmber, 10, 1, 1),
    dr(m.spectralCaptain, g.roughDiamond, 6, 1, 1), dr(m.tentacleHorror, g.heartwoodGem, 5, 1, 1),
```

**Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/database/prisma/seed-data/drops.ts
git commit -m "feat: add raw gem drops to mob drop tables"
```

---

### Task 8: Add Gathering Crit to Mine Endpoint

**Files:**
- Modify: `apps/api/src/routes/gathering.ts` (lines 208-383)

This is the key integration point. After a successful mine action, we roll for a gem crit and optionally award a bonus gem.

**Step 1: Add imports**

At the top of `apps/api/src/routes/gathering.ts`, add the imports needed:

```typescript
import { rollGemCrit } from '@adventure/game-engine';
import { GEM_CRIT_CONSTANTS } from '@adventure/shared';
```

Also import the `addStackableItemTx` function if not already imported (check existing imports).

**Step 2: Add gem crit mapping**

Add a lookup map before the route handlers that maps `(gatheringSkill, resourceTier)` → raw gem item template ID. This needs access to `IDS` or the gem template IDs. Since the route doesn't have direct access to seed IDs, we need to look up the gem template by name pattern.

A cleaner approach: add a constant mapping in the route file that maps gathering skill + tier to a gem name, then look up the ItemTemplate by name at runtime.

Actually, the simplest approach is to query the gem template at runtime. Add a helper:

```typescript
// Gem template lookup: (skill, tier) → raw gem template ID
const GEM_BY_SKILL_TIER: Record<string, Record<number, string>> = {
  mining: { 1: 'Rough Ruby', 2: 'Rough Sapphire', 3: 'Rough Emerald', 4: 'Rough Diamond', 5: 'Rough Opal' },
  foraging: { 1: 'Raw Amber', 2: 'Raw Pearl', 3: 'Raw Jade', 4: 'Raw Moonstone', 5: 'Raw Starcrystal' },
  woodcutting: { 1: 'Tree Resin', 2: 'Fossilized Sap', 3: 'Crystal Bark', 4: 'Heartwood Gem', 5: 'Ancient Amber' },
};

async function getGemTemplateId(skill: string, tier: number): Promise<string | null> {
  const gemName = GEM_BY_SKILL_TIER[skill]?.[tier];
  if (!gemName) return null;
  const template = await prisma.itemTemplate.findFirst({
    where: { name: gemName, itemType: 'resource' },
    select: { id: true },
  });
  return template?.id ?? null;
}
```

**Step 3: Add gem crit roll after the mine transaction**

In the mine endpoint (`POST /mine`), after the XP grant (line 324) and before the achievement tracking (line 326), add the gem crit logic. The crit needs the player's luck stat from equipped items:

```typescript
  // --- Gem crit roll ---
  let gemCrit: { itemTemplateId: string; itemId: string; gemName: string; critChance: number } | null = null;
  const gemTemplateId = await getGemTemplateId(skillRequired, template.tier);
  if (gemTemplateId) {
    // Get player's equipped luck stat for crit calculation
    const equippedItems = await prisma.playerEquipment.findMany({
      where: { playerId, itemId: { not: null } },
      include: { item: { include: { template: true } } },
    });
    let luckStat = 0;
    for (const eq of equippedItems) {
      const stats = eq.item?.template?.baseStats as Record<string, number> | null;
      if (stats?.luck) luckStat += stats.luck;
    }

    const critResult = rollGemCrit({
      skillLevel: level,
      nodeLevel: template.levelRequired,
      luckStat,
    });

    if (critResult.isCrit) {
      const gemStack = await prisma.$transaction(async (tx) => {
        return addStackableItemTx(tx, playerId, gemTemplateId, 1);
      });
      const gemTemplate = await prisma.itemTemplate.findUnique({ where: { id: gemTemplateId }, select: { name: true } });
      gemCrit = {
        itemTemplateId: gemTemplateId,
        itemId: gemStack.itemId,
        gemName: gemTemplate?.name ?? 'Unknown Gem',
        critChance: critResult.critChance,
      };
    }
  }
```

**Step 4: Include gem crit in the response**

Update the `res.json()` response (line 359) to include gem crit info:

```typescript
  res.json({
    logId: log.id,
    turns: turnSpend,
    node: {
      id: playerNode.id,
      templateId: template.id,
      zoneId: template.zoneId,
      zoneName: template.zone.name,
      resourceType: template.resourceType,
      levelRequired: template.levelRequired,
      remainingCapacity: nodeDepleted ? 0 : newCapacity,
      nodeDepleted,
    },
    results: {
      actions,
      baseYield,
      yieldMultiplier,
      totalYield,
      itemTemplateId: resourceTemplateId,
      itemId: stack.itemId,
    },
    xp: serializeXpGrant(xpGrant),
    gemCrit: gemCrit ?? undefined,
    activeEvents: activeEventEffects.length > 0 ? activeEventEffects : undefined,
  });
```

**Step 5: Also include gem crit in the activity log**

Update the activity log `result` object (line 340) to include gem crit data:

Add `gemCrit: gemCrit ? { itemTemplateId: gemCrit.itemTemplateId, gemName: gemCrit.gemName } : undefined,` to the result object.

**Step 6: Build and typecheck**

Run: `npm run build --workspace=packages/game-engine && npm run build --workspace=packages/shared`
Then: `npx tsc -b --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add apps/api/src/routes/gathering.ts
git commit -m "feat: add gem crit roll to gathering mine endpoint"
```

---

### Task 9: Data Migration for Existing Players

**Files:**
- Create: `packages/database/prisma/migrations/manual/add-jewelcrafting-skill.sql`

Existing players won't have a `jewelcrafting` PlayerSkill row. New players get it via the registration `ALL_SKILLS` array (updated in Task 1). For existing players, we need a one-time migration.

**Step 1: Write the SQL migration**

Create `packages/database/prisma/migrations/manual/add-jewelcrafting-skill.sql`:

```sql
-- Add jewelcrafting skill to all existing players who don't have it
INSERT INTO player_skills (id, player_id, skill_type, level, xp, daily_xp_gained, last_xp_reset_at)
SELECT
  gen_random_uuid(),
  p.id,
  'jewelcrafting',
  1,
  0,
  0,
  NOW()
FROM players p
WHERE NOT EXISTS (
  SELECT 1 FROM player_skills ps
  WHERE ps.player_id = p.id AND ps.skill_type = 'jewelcrafting'
);
```

**Step 2: Document how to run it**

This migration should be run manually against the database after deploying the new code. In local dev, re-seeding (`npm run db:seed`) will handle it since new players get all skills.

**Step 3: Commit**

```bash
git add packages/database/prisma/migrations/manual/add-jewelcrafting-skill.sql
git commit -m "feat: add manual migration to grant jewelcrafting skill to existing players"
```

---

### Task 10: Seed & Smoke Test

**Step 1: Reset and reseed the database**

Run: `npm run db:seed`
Expected: Seed completes without errors

**Step 2: Start the dev server**

Run: `npm run dev`
Expected: Both API and web start without errors

**Step 3: Verify new data via Prisma Studio**

Run: `npm run db:studio`
Check:
- `ItemTemplate` table has 30 new gem resources + 15 jewellery items
- `CraftingRecipe` table has 15 gem refining + 15 jewelcrafting recipes
- `DropTable` table has new gem drop entries

**Step 4: Test gathering endpoint manually**

Register a new player (should have `jewelcrafting` skill). Mine a resource and check the response includes `gemCrit` field (may be `undefined` since crits are rare — check the logic works by temporarily setting `BASE_CHANCE` to `1.0`).

**Step 5: Test crafting endpoint**

If you have materials, try crafting a T1 jewellery item via the crafting endpoint.

**Step 6: Run all tests**

Run: `npm run test`
Expected: All existing tests pass + new gatheringCrit tests pass

**Step 7: Commit**

```bash
git commit -m "chore: verify jewellery crafting system integration"
```

---

## Summary of Changes

| Area | Files Changed | What |
|---|---|---|
| Types | `packages/shared/src/types/player.types.ts` | Add `jewelcrafting` to SkillType + CRAFTING_SKILLS |
| Constants | `packages/shared/src/constants/gameConstants.ts` | Add `GEM_CRIT_CONSTANTS` |
| Game Engine | `packages/game-engine/src/gathering/gatheringCrit.ts` | Pure gem crit calculator |
| Game Engine | `packages/game-engine/src/gathering/gatheringCrit.test.ts` | Tests for gem crit |
| Game Engine | `packages/game-engine/src/index.ts` | Export new module |
| Seed Data | `packages/database/prisma/seed-data/ids.ts` | Gem + jewellery IDs |
| Seed Data | `packages/database/prisma/seed-data/items.ts` | 30 gems + 15 jewellery templates |
| Seed Data | `packages/database/prisma/seed-data/recipes.ts` | 15 refining + 15 jewelcrafting recipes |
| Seed Data | `packages/database/prisma/seed-data/drops.ts` | ~25 gem drop table entries |
| API Route | `apps/api/src/routes/gathering.ts` | Gem crit roll in mine endpoint |
| Auth Route | `apps/api/src/routes/auth.ts` | Add `jewelcrafting` to registration skills |
| Migration | `prisma/migrations/manual/add-jewelcrafting-skill.sql` | Backfill skill for existing players |

**Total: ~12 files, 10 implementation tasks**

## What Doesn't Need Changing

These existing systems handle jewellery items with **zero code changes**:
- **Crafting route** (`apps/api/src/routes/crafting.ts`) — recipes work for any skillType
- **Forge system** (upgrade/reroll) — works on any equipment item
- **Salvage system** — works on any equipment item
- **Equipment system** — ring/neck/charm slots already exist
- **Inventory system** — stackable resources + equipment already handled
- **Durability system** — applies to all armor items
- **Crafting crit system** — works for any crafted equipment
- **Stat pools** — ring/neck/charm pools already defined in `SLOT_STAT_POOLS`
