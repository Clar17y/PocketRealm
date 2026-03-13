# Talent Tree AoE Balance & Consistency Pass — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebalance all talent trees so every combat tree has AoE at tier 2, consistent node counts, distinct AoE identities, and a renamed/reworked Survival tree (formerly General).

**Architecture:** Modify shared constants (types, game constants, action definitions, talent trees), update game engine AoE targeting + add Pinned mechanic, update frontend tab labels. All changes are in existing files — no new files created.

**Tech Stack:** TypeScript, Vitest (testing), Prisma (no schema changes)

**Spec:** `docs/superpowers/specs/2026-03-13-talent-tree-aoe-balance-design.md`

---

## Chunk 1: Shared Package — Types, Constants, Action Definitions

### Task 1: Rename TalentTree type from 'general' to 'survival'

**Files:**
- Modify: `packages/shared/src/types/combatAction.types.ts:182`

- [ ] **Step 1: Update the TalentTree type**

```typescript
// Before:
export type TalentTree = 'melee' | 'ranged' | 'magic' | 'general';
// After:
export type TalentTree = 'melee' | 'ranged' | 'magic' | 'survival';
```

- [ ] **Step 2: Find and update all references to `'general'` as a TalentTree value**

Run: `grep -r "'general'" packages/ apps/ --include="*.ts" --include="*.tsx"` for a comprehensive sweep.

Every `tree: 'general'` must become `tree: 'survival'`. The export key in `TALENT_TREE_DEFINITIONS` must change from `general:` to `survival:`. All node IDs with `general_` prefix must change to `survival_`.

Key files to check:
- `packages/shared/src/constants/talentTreeDefinitions.ts` — tree field, node IDs, export key
- `apps/web/src/components/screens/TalentTree.tsx` — tab ID and label (change `{ id: 'general', label: 'General' }` to `{ id: 'survival', label: 'Survival' }`)
- `apps/api/src/routes/skillpoints.ts` or `apps/api/src/services/skillPointService.ts`
- `packages/shared/src/constants/combatEffectNames.ts` (auto-derives, should be fine)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`

Fix any type errors caused by the rename.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: rename TalentTree 'general' to 'survival'"
```

---

### Task 2: Add and update game constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (COMBAT_ACTION_CONSTANTS section, ~line 482-562)

- [ ] **Step 1: Add new ability cost constants**

Add these under the melee/ranged/magic talent sections:

```typescript
// New melee talents
WHIRLWIND_STAMINA: 40,

// New ranged talents
SCATTER_SHOT_STAMINA: 30,

// New magic talents (Blizzard replaces Chain Lightning)
BLIZZARD_MANA: 40,

// New survival talents
RALLY_STAMINA: 25,
RALLY_MANA: 15,
```

- [ ] **Step 2: Update existing ability cost constants**

```typescript
// Changed values:
CLEAVE_STAMINA: 30,           // was 25
RENDING_SLASH_STAMINA: 25,    // was 30
FROST_NOVA_MANA: 30,          // was 20
VOLLEY_STAMINA: 40,           // was 30
ENFEEBLE_MANA: 15,            // was 20
```

**Important:** Do NOT remove `CHAIN_LIGHTNING_MANA` in this task. It is still referenced by the `chainLightning` action definition until Task 4 Step 3 removes it. Remove `CHAIN_LIGHTNING_MANA` in Task 4 Step 3 alongside the `chainLightning` variable to keep the removal atomic.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts && git commit -m "feat: add/update combat action cost constants for talent rebalance"
```

---

### Task 3: Add new combat action definitions

**Files:**
- Modify: `packages/shared/src/constants/combatActionDefinitions.ts`

**Reference:** Spec section "New Action Definitions" and "New Abilities"

- [ ] **Step 1: Add the `whirlwind` action definition**

Add before `BASE_ACTION_DEFINITIONS` export, following existing patterns:

```typescript
const whirlwind: ActionDefinition = {
  id: 'whirlwind',
  name: 'Whirlwind',
  description: 'A spinning strike hitting all enemies in raids.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'melee',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.WHIRLWIND_STAMINA, mana: 0 },
  damageMultiplier: 1.0,
  accuracyModifier: 0,
};
```

- [ ] **Step 2: Add the `scatter_shot` action definition**

```typescript
const scatterShot: ActionDefinition = {
  id: 'scatter_shot',
  name: 'Scatter Shot',
  description: 'A spread of arrows hitting all enemies and reducing their accuracy in raids.',
  actionType: 'skill_attack',
  category: 'offensive',
  scalingStat: 'ranged',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.SCATTER_SHOT_STAMINA, mana: 0 },
  damageMultiplier: 0.7,
  accuracyModifier: 0,
  effect: {
    name: 'Suppressed',
    stat: 'accuracy',
    modifier: -15,
    duration: 2,
    isDebuff: true,
  },
};
```

- [ ] **Step 3: Add the `blizzard` action definition**

```typescript
const blizzard: ActionDefinition = {
  id: 'blizzard',
  name: 'Blizzard',
  description: 'A storm of ice hitting all enemies and freezing them in raids.',
  actionType: 'damage_spell',
  category: 'offensive',
  scalingStat: 'magic',
  cost: { stamina: 0, mana: COMBAT_ACTION_CONSTANTS.BLIZZARD_MANA },
  damageMultiplier: 1.0,
  damageType: 'magic',
  accuracyModifier: 0,
  effect: {
    name: 'Frozen',
    stat: 'evasion',
    modifier: -15,
    duration: 3,
    isDebuff: true,
    alwaysApplies: true,
  },
};
```

- [ ] **Step 4: Add the `rally` action definition**

Rally is a group buff — +15 defence to all allies. The effect is applied to all allies (not just self). This requires special handling in the raid round resolver (Task 9).

```typescript
const rally: ActionDefinition = {
  id: 'rally',
  name: 'Rally',
  description: 'Rally allies, granting +15 defence to the whole group for 3 rounds.',
  actionType: 'buff',
  category: 'supportive',
  scalingStat: 'weapon', // 'weapon' is the neutral default for non-damage survival tree actions (matches taunt, fortify)
  cost: {
    stamina: COMBAT_ACTION_CONSTANTS.RALLY_STAMINA,
    mana: COMBAT_ACTION_CONSTANTS.RALLY_MANA,
  },
  damageMultiplier: 0,
  effect: {
    name: 'Rally',
    stat: 'defence',
    modifier: 15,
    duration: 3,
    isDebuff: false,
  },
};
```

- [ ] **Step 5: Add all four to `BASE_ACTION_DEFINITIONS`**

```typescript
export const BASE_ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  // ...existing entries...
  whirlwind,
  scatter_shot: scatterShot,
  blizzard,
  rally,
};
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/constants/combatActionDefinitions.ts && git commit -m "feat: add whirlwind, scatter_shot, blizzard, rally action definitions"
```

---

### Task 4: Modify existing combat action definitions

**Files:**
- Modify: `packages/shared/src/constants/combatActionDefinitions.ts`

**Reference:** Spec section "Reworked Abilities"

- [ ] **Step 1: Update Cleave**

Change `damageMultiplier: 1.1` → `0.8`. Cost now uses updated `CLEAVE_STAMINA: 30` (handled by Task 2).

- [ ] **Step 2: Update Frost Nova — make AoE + reduce duration**

Change `damageMultiplier: 0.9` → `0.7`. Cost now uses updated `FROST_NOVA_MANA: 30`. Change effect `duration: 3` → `2`. (AoE targeting handled in Task 8 by adding to `AOE_ACTION_IDS`.)

- [ ] **Step 3: Remove Chain Lightning (replaced by Blizzard in Task 3)**

Remove the `chainLightning` variable and its entry in `BASE_ACTION_DEFINITIONS` (key `chain_lightning`). The `blizzard` definition from Task 3 replaces it. Also remove `CHAIN_LIGHTNING_MANA` from `gameConstants.ts` (safe now that nothing references it). If `chain_lightning` is referenced elsewhere (tests, types), update those references to `blizzard`.

- [ ] **Step 4: Update Meteor Strike**

Change `damageMultiplier: 2.5` → `1.3`.

- [ ] **Step 5: Update Crippling Shot — replace Crippled with Pinned**

Replace the effect entirely:

```typescript
// Before:
effect: { name: 'Crippled', stat: 'speed', modifier: -20, duration: 3, isDebuff: true }
// After:
effect: { name: 'Pinned', stat: 'pinned', modifier: 0, duration: 1, isDebuff: true }
```

Duration 1: Pinned applies during player offensive phase, mob is forced to skip its attack during mob offensive phase (same round), effect expires at end of round.

**Note:** Boss/mini-boss restriction is NOT enforced in the action definition — it is implemented in Task 9 (raid round resolver). Bosses already use a different resolver (bossRoundResolver), so Pinned cannot apply to them. For expedition mini-bosses, a flag check will be added in the resolver.

- [ ] **Step 6: Update Curse**

Change `damageMultiplier: 0.5` → `0.8`. Change effect `duration: 4` → `3`.

- [ ] **Step 7: Update Enfeeble**

Change effect `duration: 4` → `3`. Cost now uses updated `ENFEEBLE_MANA: 15`.

- [ ] **Step 8: Update Volley**

Change `damageMultiplier: 0.7` → `0.9`. Cost now uses updated `VOLLEY_STAMINA: 40`. Add a Suppressed effect:

```typescript
effect: {
  name: 'Suppressed',
  stat: 'accuracy',
  modifier: -15,
  duration: 3,
  isDebuff: true,
},
```

- [ ] **Step 9: Update description strings for all modified actions**

Update the `description` field on each modified action to match new values:
- Cleave: `'A wide swing dealing 0.8x damage. Hits all enemies in raids.'`
- Frost Nova: `'A blast of frost dealing 0.7x damage and freezing all enemies for 2 rounds in raids.'`
- Meteor Strike: `'Call down a meteor dealing 1.3x magic AoE damage.'`
- Volley: `'A rain of arrows dealing 0.9x damage and suppressing all enemies in raids.'`
- Crippling Shot: `'A precise shot that pins the target, forcing them to defend next turn.'`
- Curse: `'Curse the target, dealing 0.8x damage and reducing magic defence by 20 for 3 rounds.'`

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/constants/combatActionDefinitions.ts packages/shared/src/constants/gameConstants.ts && git commit -m "feat: rebalance combat actions — AoE multipliers, Pinned/Suppressed debuffs, Blizzard rename"
```

---

## Chunk 2: Talent Trees, Game Engine, Frontend

### Task 5: Write talent tree structural validation test

**Files:**
- Create: `packages/shared/src/constants/talentTreeDefinitions.test.ts` (if it doesn't already exist, otherwise modify)

- [ ] **Step 1: Check if test file exists**

Run: `ls packages/shared/src/constants/talentTreeDefinitions.test.ts 2>/dev/null || echo "not found"`

If it exists, read it and add the structural tests below. If not, create it.

- [ ] **Step 2: Write structural validation tests**

```typescript
import { describe, expect, it } from 'vitest';
import { TALENT_TREE_DEFINITIONS, getAllTalentNodes, getTalentNode } from './talentTreeDefinitions';
import { BASE_ACTION_DEFINITIONS } from './combatActionDefinitions';

describe('talentTreeDefinitions', () => {
  describe('tree structure consistency', () => {
    it('combat trees have 4 nodes per tier (T1-T4) and 2 at T5', () => {
      for (const treeName of ['melee', 'ranged', 'magic'] as const) {
        const nodes = TALENT_TREE_DEFINITIONS[treeName];
        for (let tier = 1; tier <= 4; tier++) {
          const tierNodes = nodes.filter(n => n.tier === tier);
          expect(tierNodes.length, `${treeName} tier ${tier}`).toBe(4);
        }
        const t5Nodes = nodes.filter(n => n.tier === 5);
        expect(t5Nodes.length, `${treeName} tier 5`).toBe(2);
        expect(nodes.length, `${treeName} total`).toBe(18);
      }
    });

    it('survival tree has 3 nodes per tier (T1-T4) and 2 at T5', () => {
      const nodes = TALENT_TREE_DEFINITIONS.survival;
      for (let tier = 1; tier <= 4; tier++) {
        const tierNodes = nodes.filter(n => n.tier === tier);
        expect(tierNodes.length, `survival tier ${tier}`).toBe(3);
      }
      const t5Nodes = nodes.filter(n => n.tier === 5);
      expect(t5Nodes.length, 'survival tier 5').toBe(2);
      expect(nodes.length, 'survival total').toBe(14);
    });
  });

  describe('AoE availability at tier 2', () => {
    const aoeActions = ['cleave', 'scatter_shot', 'frost_nova'];

    it('each combat tree has an AoE action at tier 2', () => {
      const trees = { melee: 'cleave', ranged: 'scatter_shot', magic: 'frost_nova' } as const;
      for (const [treeName, expectedAoe] of Object.entries(trees)) {
        const t2Nodes = TALENT_TREE_DEFINITIONS[treeName as keyof typeof trees]
          .filter(n => n.tier === 2);
        const aoeNode = t2Nodes.find(n => n.unlocksAction === expectedAoe);
        expect(aoeNode, `${treeName} should have ${expectedAoe} at tier 2`).toBeDefined();
      }
    });
  });

  describe('prerequisite validity', () => {
    it('all prerequisites reference existing node IDs', () => {
      const allNodes = getAllTalentNodes();
      const allIds = new Set(allNodes.map(n => n.id));
      for (const node of allNodes) {
        for (const prereq of node.prerequisites) {
          expect(allIds.has(prereq), `${node.id} prereq '${prereq}' must exist`).toBe(true);
        }
      }
    });

    it('all unlocksAction references exist in BASE_ACTION_DEFINITIONS', () => {
      const allNodes = getAllTalentNodes();
      for (const node of allNodes) {
        if (node.unlocksAction) {
          expect(
            BASE_ACTION_DEFINITIONS[node.unlocksAction],
            `${node.id} unlocksAction '${node.unlocksAction}' must exist`,
          ).toBeDefined();
        }
      }
    });

    it('tier 1 nodes have no prerequisites', () => {
      const allNodes = getAllTalentNodes();
      const t1Nodes = allNodes.filter(n => n.tier === 1);
      for (const node of t1Nodes) {
        expect(node.prerequisites, `${node.id} (tier 1) should have no prereqs`).toEqual([]);
      }
    });

    it('prerequisites only reference nodes from earlier tiers in the same tree', () => {
      for (const [treeName, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
        for (const node of nodes) {
          for (const prereqId of node.prerequisites) {
            const prereqNode = getTalentNode(prereqId);
            expect(prereqNode, `${node.id} prereq '${prereqId}' must exist`).toBeDefined();
            expect(prereqNode!.tier, `${node.id} prereq '${prereqId}' must be earlier tier`).toBeLessThan(node.tier);
            expect(prereqNode!.tree, `${node.id} prereq '${prereqId}' must be same tree`).toBe(treeName);
          }
        }
      }
    });
  });

  describe('node ID conventions', () => {
    it('all node IDs follow {tree}_{snake_case} pattern', () => {
      for (const [treeName, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
        for (const node of nodes) {
          expect(node.id.startsWith(`${treeName}_`), `${node.id} should start with ${treeName}_`).toBe(true);
        }
      }
    });

    it('all nodes have matching tree field', () => {
      for (const [treeName, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
        for (const node of nodes) {
          expect(node.tree, `${node.id} tree field`).toBe(treeName);
        }
      }
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/constants/talentTreeDefinitions.test.ts`

Expected: FAIL — the structural tests will fail because the trees haven't been restructured yet (wrong node counts, missing AoE at T2 for ranged/magic, general tree still exists).

- [ ] **Step 4: Commit test file**

```bash
git add packages/shared/src/constants/talentTreeDefinitions.test.ts && git commit -m "test: add structural validation tests for talent tree consistency"
```

---

### Task 6: Restructure all four talent trees

**Files:**
- Modify: `packages/shared/src/constants/talentTreeDefinitions.ts`

**Reference:** Spec section "Complete Talent Trees" for node details, this plan for prerequisite chains.

- [ ] **Step 1: Restructure melee tree**

Replace the melee nodes array. Key changes:
- Move `melee_rending_slash` from T3 to T1: change `tier: 3` → `1`, `pointCost: 20` → `5`, remove `skillLevelGate: { skill: 'melee', level: 35 }`, change `prerequisites: ['melee_stamina_surge']` → `[]`
- Update `melee_venomous_strike` prereq from `['melee_endurance_training']` → `['melee_rending_slash']`
- Add new `melee_whirlwind` at T3 — `tier: 3, prerequisites: ['melee_cleave'], unlocksAction: 'whirlwind', pointCost: 20, skillLevelGate: { skill: 'melee', level: 35 }`

Full melee prerequisite chain:
```
T1: power_strike[], rending_slash[], iron_skin[], endurance_training[]
T2: cleave[power_strike], venomous_strike[rending_slash], battle_cry[iron_skin], stamina_surge[endurance_training]
T3: devastating_blow[cleave], whirlwind[cleave], berserker_rage[battle_cry], weapon_mastery[stamina_surge]
T4: execute[devastating_blow], flame_sword[weapon_mastery], unbreakable[berserker_rage], iron_will[weapon_mastery]
T5: titans_wrath[execute], champions_resolve[unbreakable, iron_will]
```

- [ ] **Step 2: Restructure ranged tree**

Key changes:
- Move `ranged_barbed_arrow` from T2 to T1: change `tier: 2` → `1`, `pointCost: 10` → `5`, remove `skillLevelGate: { skill: 'ranged', level: 15 }`, change `prerequisites: ['ranged_aimed_shot']` → `[]`
- Add new `ranged_scatter_shot` at T2 — `tier: 2, prerequisites: ['ranged_aimed_shot'], unlocksAction: 'scatter_shot', pointCost: 10, skillLevelGate: { skill: 'ranged', level: 15 }`
- Update `ranged_crippling_shot` prereq from `['ranged_aimed_shot']` → `['ranged_barbed_arrow']`
- Update `ranged_volley` prereq from `['ranged_crippling_shot']` → `['ranged_scatter_shot']`
- Fix Sniper's Mark description (pre-existing bug): change from `'Mark a target to take +20% damage for 3 rounds.'` to `'Reduce target evasion by 20 for 3 rounds. Always hits.'`

Full ranged prerequisite chain:
```
T1: aimed_shot[], barbed_arrow[], quick_draw[], keen_eye[]
T2: scatter_shot[aimed_shot], crippling_shot[barbed_arrow], eagle_eye[keen_eye], steady_hands[quick_draw]
T3: volley[scatter_shot], snipers_mark[eagle_eye], flame_arrow[steady_hands], evasive_maneuver[steady_hands]
T4: piercing_shot[volley], shadow_arrow[flame_arrow], quick_reflexes[snipers_mark], fleet_foot[evasive_maneuver]
T5: death_mark[piercing_shot], windwalker[quick_reflexes, fleet_foot]
```

- [ ] **Step 3: Restructure magic tree**

Key changes:
- Move `magic_enfeeble` from T2 to T1: change `tier: 2` → `1`, `pointCost: 10` → `5`, remove `skillLevelGate: { skill: 'magic', level: 15 }`, change `prerequisites: ['magic_fire_bolt']` → `[]`
- Update `magic_curse` prereq from `['magic_arcane_focus']` → `['magic_enfeeble']` (debuff path)
- Rename `magic_chain_lightning` → `magic_blizzard`: change `id`, `name`, `description`, `unlocksAction: 'blizzard'`, prereq stays `['magic_frost_nova']`
- Update `magic_arcane_blast` prereq from `['magic_chain_lightning']` → `['magic_blizzard']`
- Update Frost Nova description to reflect AoE

Full magic prerequisite chain:
```
T1: fire_bolt[], enfeeble[], minor_heal[], arcane_focus[]
T2: frost_nova[fire_bolt], curse[enfeeble], enhanced_fortitude[minor_heal], mana_flow[arcane_focus]
T3: blizzard[frost_nova], earth_spikes[mana_flow], heal_ally[enhanced_fortitude], spell_penetration[mana_flow]
T4: arcane_blast[blizzard], life_drain[spell_penetration], regeneration[heal_ally], mind_shield[spell_penetration]
T5: meteor_strike[arcane_blast], archmage[regeneration, mind_shield]
```

- [ ] **Step 4: Restructure survival tree (rename from general)**

Replace entire general tree. All node IDs change from `general_*` to `survival_*`. Tree field changes from `'general'` to `'survival'`. Remove all crafting/gathering nodes. Add new combat support nodes.

Full survival nodes and prerequisite chain:
```
T1: improved_defend[], first_aid[], toughness[] — no skillLevelGate
T2: taunt[toughness], quick_recovery[first_aid], resourceful[improved_defend] — no skillLevelGate
T3: fortify[taunt, resourceful], brace[quick_recovery], second_wind[quick_recovery] — no skillLevelGate
T4: last_stand[fortify], rally[brace], thick_skin[second_wind] — no skillLevelGate
T5: undying[last_stand], bulwark[rally, thick_skin] — no skillLevelGate
```

New passive bonus definitions for new nodes:
- `survival_brace`: `passiveBonus: { stat: 'physicalDamageReduction', value: 10, isPercent: true, description: '+10% physical damage reduction' }`
- `survival_second_wind`: `passiveBonus: { stat: 'lowHpRegen', value: 3, isPercent: true, description: 'Regen 3% max HP/rd when below 40% HP' }`
- `survival_thick_skin`: `passiveBonus: { stat: 'magicDamageReduction', value: 10, isPercent: true, description: '+10% magic damage reduction' }`
- `survival_bulwark`: This needs two bonuses (+15% HP + 10% defence). Since `passiveBonus` is a single object, either use a combined description or implement as two separate effects. Check existing precedent — `melee_champions_resolve` has `description: '+25% stamina regeneration and pool size'`. Follow the same pattern: single `passiveBonus` with combined description.
  - `passiveBonus: { stat: 'bulwark', value: 1, description: '+15% max HP, +10% defence' }` — the stat name is a custom identifier, implementation reads specific named passives.

Note: `survival_rally` has `unlocksAction: 'rally'` (not a passive).

**Skill level gates:** The spec's tier headers show skill level requirements but the Implementation Notes recommend keeping survival ungated. Follow the spec's recommendation: survival tree nodes have NO `skillLevelGate` on any tier. This differs from combat trees which gate on their respective skill.

Update the `TALENT_TREE_DEFINITIONS` export: change key from `general` to `survival`.

Update the internal lookup `Map` and `getAllTalentNodes()` / `getTalentNode()` functions if they reference `'general'`.

- [ ] **Step 5: Run structural tests**

Run: `npx vitest run packages/shared/src/constants/talentTreeDefinitions.test.ts`

Expected: PASS — all structural validation tests should pass now.

- [ ] **Step 6: Full shared package typecheck**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/constants/talentTreeDefinitions.ts && git commit -m "feat: restructure all talent trees — AoE at T2, survival rename, consistent node counts"
```

---

### Task 7: Build shared and game-engine packages

**Files:** None (build step)

- [ ] **Step 1: Build shared package**

Run: `npm run build --workspace=packages/shared`

This must succeed before downstream packages can typecheck.

- [ ] **Step 2: Build game-engine package**

Run: `npm run build --workspace=packages/game-engine`

- [ ] **Step 3: Commit if build scripts needed updates**

---

### Task 8: Update AOE_ACTION_IDS in raid round resolver

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts:57-59`

- [ ] **Step 1: Update the AOE_ACTION_IDS set**

```typescript
// Before:
const AOE_ACTION_IDS = new Set([
  'cleave', 'volley', 'chain_lightning', 'meteor_strike',
]);
// After:
const AOE_ACTION_IDS = new Set([
  'cleave', 'scatter_shot', 'volley', 'frost_nova', 'blizzard', 'whirlwind', 'meteor_strike',
]);
```

- [ ] **Step 2: Commit**

```bash
git add packages/game-engine/src/combat/raidRoundResolver.ts && git commit -m "feat: add new AoE actions to AOE_ACTION_IDS"
```

---

### Task 9: Implement Pinned mechanic and Rally group buff

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`

**Reference:** Existing "rooted" mechanic at Step 1b (lines 279-293) forces players to defend. Pinned does the same for mobs.

- [ ] **Step 1: Add Pinned check in mob offensive phase**

Find the section where mob offensive actions are resolved (after player phases, around the mob attack loop). Add a check similar to the rooted pattern at Step 1b: if the mob has an active effect with `stat === 'pinned'` and `roundsRemaining > 0`, skip the mob's attack for this round.

```typescript
// Before resolving each mob's attack:
const isPinned = mob.activeEffects?.some(
  e => e.stat === 'pinned' && e.roundsRemaining > 0,
);
if (isPinned) {
  // Log that mob was pinned and couldn't attack
  // Continue to next mob — skip damage dealing
  continue;
}
```

The Pinned effect will be ticked down at end-of-round with all other effects (duration 1 → 0 → removed).

**Boss/mini-boss restriction:** Bosses use `bossRoundResolver.ts` (separate code path), so Pinned cannot reach them. For expedition mini-bosses: check if `ExpeditionMobState` has a flag indicating boss/mini-boss status. If such a flag exists, add a condition to skip applying the Pinned effect during `resolvePlayerOffensive`. If no flag exists, note this as a follow-up task — all expedition mobs will be Pinnable for now.

- [ ] **Step 2: Add Rally group buff handling**

**Context:** The current `resolveSupportiveActions()` in `combatHelpers.ts` only handles `heal_self` and `heal_ally`. Buff actions (`actionType: 'buff'`) like `battle_cry` and `berserker_rage` apply their effects through the service layer, not the round resolver. Rally needs to apply its buff to ALL alive participants during round resolution.

Add Rally handling in the supportive action processing section of `resolveRaidRound`. Look for where supportive actions are iterated. After heal processing, add a Rally-specific block:

```typescript
// After heal processing in the supportive phase:
if (s.actionId === 'rally' && s.actionDef?.effect) {
  const effect = s.actionDef.effect;
  for (const ally of pState.filter(p => p.hp > 0)) {
    ally.activeEffects = ally.activeEffects || [];
    ally.activeEffects.push({
      name: effect.name,
      stat: effect.stat,
      modifier: effect.modifier,
      roundsRemaining: effect.duration,
    });
  }
}
```

If no supportive action processing loop exists that handles `'buff'` action types, add one. Read `resolveSupportiveActions` in `combatHelpers.ts` first to understand the existing flow, then extend it or add the Rally check directly in `resolveRaidRound` after that function is called.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p packages/game-engine/tsconfig.json`

- [ ] **Step 4: Commit**

```bash
git add packages/game-engine/src/combat/raidRoundResolver.ts && git commit -m "feat: implement Pinned mechanic (mob forced-defend) and Rally group buff"
```

---

### Task 10: Add raid round resolver tests for new mechanics

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

- [ ] **Step 1: Add test for Pinned mechanic**

**Important:** Use the actual `RaidRoundResult` API — the result has `participantResults` (with `hpAfter`) and `mobsAfter` (with `activeEffects`), NOT `mobResults` or `hpBefore`. Use `makeParticipant` with explicit HP and `template` arrays (not `slotsOf`). Check existing test patterns in the file first.

Add under a new `describe('pinned effect')` block:

```typescript
describe('pinned effect', () => {
  it('mob with pinned effect skips its attack', () => {
    const startHp = 200;
    const input = makeInput({
      participants: [makeParticipant({
        hp: startHp, maxHp: startHp,
        template: [{ actionId: 'normal_attack', sortOrder: 0 }],
      })],
      mobs: [
        makeMob({
          hp: 500, maxHp: 500, // High HP so mob survives
          activeEffects: [{ name: 'Pinned', stat: 'pinned', modifier: 0, roundsRemaining: 1 }],
        }),
      ],
    });
    const result = resolveRaidRound(input, alwaysHitRng);
    // Player should take no damage from the pinned mob
    expect(result.participantResults[0].hpAfter).toBe(startHp);
  });

  it('mob without pinned effect attacks normally', () => {
    const startHp = 200;
    const input = makeInput({
      participants: [makeParticipant({
        hp: startHp, maxHp: startHp,
        template: [{ actionId: 'normal_attack', sortOrder: 0 }],
      })],
      mobs: [makeMob({ hp: 500, maxHp: 500 })],
    });
    const result = resolveRaidRound(input, alwaysHitRng);
    expect(result.participantResults[0].hpAfter).toBeLessThan(startHp);
  });

  it('pinned effect is consumed after one round', () => {
    const input = makeInput({
      participants: [makeParticipant({
        template: [{ actionId: 'normal_attack', sortOrder: 0 }],
      })],
      mobs: [
        makeMob({
          hp: 500, maxHp: 500,
          activeEffects: [{ name: 'Pinned', stat: 'pinned', modifier: 0, roundsRemaining: 1 }],
        }),
      ],
    });
    const result = resolveRaidRound(input, alwaysHitRng);
    // Mob survives, check its effects after the round
    const mob = result.mobsAfter[0];
    const pinnedEffect = mob?.activeEffects.find(e => e.stat === 'pinned');
    expect(pinnedEffect).toBeUndefined(); // Ticked to 0 and removed
  });
});
```

- [ ] **Step 2: Add test for new AoE actions**

Verify that `scatter_shot`, `frost_nova`, `blizzard`, and `whirlwind` hit all mobs. Check existing AoE tests (search for `cleave` in the test file) for the exact pattern used — particularly how multi-mob damage is verified. The mobs array is `mobsAfter` on the result:

```typescript
describe('new AoE actions', () => {
  const aoeActions = ['scatter_shot', 'frost_nova', 'blizzard', 'whirlwind'];

  for (const actionId of aoeActions) {
    it(`${actionId} hits all alive mobs`, () => {
      const mobHp = 500;
      const input = makeInput({
        participants: [makeParticipant({
          template: [{ actionId, sortOrder: 0 }],
        })],
        mobs: [
          makeMob({ hp: mobHp, maxHp: mobHp }),
          makeMob({ hp: mobHp, maxHp: mobHp }),
          makeMob({ hp: mobHp, maxHp: mobHp }),
        ],
      });
      const result = resolveRaidRound(input, alwaysHitRng);
      // All 3 mobs should have taken damage
      for (const mob of result.mobsAfter) {
        expect(mob.hp).toBeLessThan(mobHp);
      }
    });
  }
});
```

- [ ] **Step 3: Add test for Suppressed debuff application**

```typescript
describe('suppressed debuff', () => {
  it('scatter_shot applies Suppressed to all targets', () => {
    const input = makeInput({
      participants: [makeParticipant({
        template: [{ actionId: 'scatter_shot', sortOrder: 0 }],
      })],
      mobs: [
        makeMob({ hp: 500, maxHp: 500 }),
        makeMob({ hp: 500, maxHp: 500 }),
      ],
    });
    const result = resolveRaidRound(input, alwaysHitRng);
    for (const mob of result.mobsAfter) {
      const suppressed = mob.activeEffects.find(e => e.name === 'Suppressed');
      expect(suppressed).toBeDefined();
      expect(suppressed!.stat).toBe('accuracy');
      expect(suppressed!.modifier).toBe(-15);
    }
  });
});
```

- [ ] **Step 4: Add test for Rally group buff**

```typescript
describe('rally group buff', () => {
  it('rally applies defence buff to all alive participants', () => {
    const input = makeInput({
      participants: [
        makeParticipant({
          template: [{ actionId: 'rally', sortOrder: 0 }],
        }),
        makeParticipant({
          template: [{ actionId: 'normal_attack', sortOrder: 0 }],
        }),
      ],
      mobs: [makeMob({ hp: 500, maxHp: 500 })],
    });
    const result = resolveRaidRound(input, alwaysHitRng);
    // Both participants should have the Rally buff
    for (const p of result.participantResults) {
      const rallyBuff = p.activeEffectsAfter.find(e => e.name === 'Rally');
      expect(rallyBuff).toBeDefined();
      expect(rallyBuff!.stat).toBe('defence');
      expect(rallyBuff!.modifier).toBe(15);
    }
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run packages/game-engine/src/combat/raidRoundResolver.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/combat/raidRoundResolver.test.ts && git commit -m "test: add tests for Pinned mechanic, new AoE actions, Suppressed/Rally"
```

---

### Task 11: Update frontend and API references

**Files:**
- Modify: `apps/web/src/components/screens/TalentTree.tsx`
- Possibly modify: `apps/api/src/routes/skillpoints.ts`

- [ ] **Step 1: Update frontend TalentTree component**

The component has a hardcoded tab definition at approximately line 27:
```typescript
{ id: 'general', label: 'General', color: 'var(--rpg-gold)' },
```
Change both the `id` and `label`:
```typescript
{ id: 'survival', label: 'Survival', color: 'var(--rpg-gold)' },
```

The `id` field is typed as `TalentTree`, so after Task 1's type change, keeping `'general'` would cause a TypeScript error. Also search for any other `'general'` references in the file (conditional logic, display strings).

- [ ] **Step 2: Check API route**

Read `apps/api/src/routes/skillpoints.ts`. The route returns `trees: TALENT_TREE_DEFINITIONS` to the frontend. Since the key changed from `general` to `survival`, the frontend will automatically receive the new key. Verify no hardcoded `'general'` references exist in the route.

- [ ] **Step 3: Check skillPointService**

Read `apps/api/src/services/skillPointService.ts`. Verify no hardcoded `'general'` references. The service uses `getTalentNode(nodeId)` which searches by ID, not by tree name, so it should work without changes.

- [ ] **Step 4: Update frontend SkillPointState type if needed**

Check `apps/web/src/lib/api/skillPoints.ts`. The `trees` field is typed as `Record<string, TalentNodeDefinition[]>` — generic string keys, so no type change needed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: update frontend and API for general→survival tree rename"
```

---

### Task 12: Final build, typecheck, and test verification

- [ ] **Step 1: Build all packages**

Run: `npm run build`

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck`

Ignore the pre-existing TS error in `apps/web/src/app/game/page.tsx:333` (string→SkillType).

- [ ] **Step 3: Run all tests**

Run: `npm run test`

Verify all tests pass. Key test files to watch:
- `packages/shared/src/constants/talentTreeDefinitions.test.ts` — structural validation
- `packages/game-engine/src/combat/raidRoundResolver.test.ts` — AoE + Pinned
- `apps/api/src/services/skillPointService.test.ts` — may need updates if it references `'general'` tree or removed node IDs

- [ ] **Step 4: Fix any test failures**

If `skillPointService.test.ts` fails due to removed/renamed node IDs, update the test fixtures to use valid node IDs from the new tree structure.

If `raidRoundResolver.test.ts` has existing tests referencing `'chain_lightning'`, update them to `'blizzard'`.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "chore: fix test references for talent tree rebalance"
```

---

## Implementation Order Summary

Tasks 1-4 are sequential (each depends on the previous). After Task 4, Tasks 5-6 depend on Tasks 1-4. Tasks 7-8 can run after Tasks 3-4. Task 9 depends on Task 8. Task 10 depends on Task 9. Task 11 depends on Tasks 1+6. Task 12 is final verification.

```
Task 1 (type rename) → Task 2 (constants) → Task 3 (new actions) → Task 4 (modify actions)
                                                                          ↓
                                              Task 5 (structural test) → Task 6 (tree restructure) → Task 7 (build)
                                                                                                          ↓
                                                                          Task 8 (AoE IDs) → Task 9 (Pinned+Rally) → Task 10 (tests)
                                                                                                                          ↓
                                                                                              Task 11 (frontend) → Task 12 (final verify)
```
