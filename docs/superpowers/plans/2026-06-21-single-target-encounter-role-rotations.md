# Single-Target Encounter Role Rotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace encounter-site elite and mini-boss AoE/simple-special templates with single-target rotations that include tunable role-scaled spike pressure.

**Architecture:** Keep role selection in `apps/api/src/services/encounterSiteMobRoleService.ts`, backed by shared constants and shared boss action definitions. Add a small set of role-specific single-target spike actions in shared constants, then have the encounter-site resolver emit only `single_target` role-generated actions. Encounter-site combat already consumes the generated `actionTemplate`, so no raid engine changes are expected.

**Tech Stack:** TypeScript, Vitest, shared constants, Express/API services, game-engine raid combat tests.

---

## Files

- Modify `packages/shared/src/constants/gameConstants.ts`
  - Add `ROLE_ACTION_MULTIPLIERS` under `ENCOUNTER_SITE_ROLE_CONSTANTS`.
- Modify `packages/shared/src/constants/bossTemplateDefinitions.ts`
  - Add role-specific spike action definitions whose damage multipliers are computed from `ROLE_ACTION_MULTIPLIERS`.
  - Export the new actions in `BOSS_ACTION_DEFINITIONS`.
- Modify `apps/api/src/services/encounterSiteMobRoleService.ts`
  - Replace the current `basic -> special -> basic` / AoE finisher resolver with single-target role rotations.
- Modify `apps/api/src/services/encounterSiteMobRoleService.test.ts`
  - Add failing tests for no AoE, elite 4-action rotations, and mini-boss single-target telegraphed spikes.
- Modify `apps/api/src/services/encounterSiteCombatCore.test.ts`
  - Update or add assertions proving loaded encounter-site mobs receive single-target role templates.
- Modify `packages/game-engine/src/combat/raidRoundResolver.test.ts`
  - Add one focused test for a new role-specific spike action if the action uses existing mechanics that are not already covered.

---

## Task 1: Add Shared Role Action Tuning and Spike Actions

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/constants/bossTemplateDefinitions.ts`

- [ ] **Step 1: Add failing tests for the new shared action definitions**

Add this test block to `packages/game-engine/src/combat/raidRoundResolver.test.ts` near the existing boss action behavior tests:

```ts
describe('encounter role spike actions', () => {
  it('elite_venom_strike is an always-hit single-target magic spike with poison pressure', () => {
    const definition = BOSS_ACTION_DEFINITIONS.elite_venom_strike;

    expect(definition).toEqual(expect.objectContaining({
      id: 'elite_venom_strike',
      actionType: 'damage_spell',
      damageType: 'magic',
      alwaysHits: true,
      damageMultiplier: expect.any(Number),
    }));
    expect(definition.damageMultiplier).toBeGreaterThan(1);
    expect(definition.effect).toEqual(expect.objectContaining({
      name: 'Venom-Touched',
      stat: 'poison',
      isDebuff: true,
      damagePerRound: expect.any(Number),
    }));
  });

  it('role spike actions are tuned by encounter role action multipliers', () => {
    expect(BOSS_ACTION_DEFINITIONS.elite_maul.damageMultiplier).toBe(
      1.6 * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_ACTION_MULTIPLIERS.elite.spikeDamage,
    );
    expect(BOSS_ACTION_DEFINITIONS.mini_boss_execution_strike.damageMultiplier).toBe(
      2.1 * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_ACTION_MULTIPLIERS.mini_boss.spikeDamage,
    );
  });
});
```

If `BOSS_ACTION_DEFINITIONS` and `ENCOUNTER_SITE_ROLE_CONSTANTS` are not imported in that test file, add:

```ts
import { ENCOUNTER_SITE_ROLE_CONSTANTS } from '@pocketrealm/shared';
import { BOSS_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/bossTemplateDefinitions';
```

- [ ] **Step 2: Run the focused failing test**

Run:

```powershell
rtk npm run test -w packages/game-engine -- raidRoundResolver -t "encounter role spike actions"
```

Expected: FAIL because `elite_venom_strike` is not defined.

- [ ] **Step 3: Add role action multipliers**

In `packages/shared/src/constants/gameConstants.ts`, add this property inside `ENCOUNTER_SITE_ROLE_CONSTANTS`, after `ROLE_STAT_MULTIPLIERS`:

```ts
  ROLE_ACTION_MULTIPLIERS: {
    trash: {
      specialDamage: 1,
      spikeDamage: 1,
      debuffModifier: 1,
    },
    elite: {
      specialDamage: 1.25,
      spikeDamage: 1.5,
      debuffModifier: 1,
    },
    mini_boss: {
      specialDamage: 1.45,
      spikeDamage: 1.9,
      debuffModifier: 1.25,
    },
  },
```

- [ ] **Step 4: Add role spike action definitions**

In `packages/shared/src/constants/bossTemplateDefinitions.ts`, import the tuning constants:

```ts
import { ENCOUNTER_SITE_ROLE_CONSTANTS } from './gameConstants';
```

Add this helper after `BOSS_ZERO_COST`:

```ts
function roleSpikeMultiplier(role: 'elite' | 'mini_boss', base: number): number {
  return base * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_ACTION_MULTIPLIERS[role].spikeDamage;
}
```

Then add these definitions after `bossFrenzy`:

```ts
const eliteVenomStrike: ActionDefinition = {
  id: 'elite_venom_strike',
  name: 'Venom Strike',
  description: 'A precise venomous strike that leaves poison behind.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.5),
  damageType: 'magic',
  alwaysHits: true,
  effect: {
    name: 'Venom-Touched',
    stat: 'poison',
    modifier: 0,
    duration: 3,
    isDebuff: true,
    damagePerRound: 4,
    dotDamageType: 'magic',
  },
};

const eliteMaul: ActionDefinition = {
  id: 'elite_maul',
  name: 'Maul',
  description: 'A brutal tearing strike.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.6),
  damageType: 'physical',
  alwaysHits: true,
};

const eliteBackstab: ActionDefinition = {
  id: 'elite_backstab',
  name: 'Backstab',
  description: 'A precise strike from a blind angle.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.7),
  damageType: 'physical',
  alwaysHits: true,
};

const eliteCrushingBlow: ActionDefinition = {
  id: 'elite_crushing_blow',
  name: 'Crushing Blow',
  description: 'A heavy blow that lands with crushing force.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.7),
  damageType: 'physical',
  alwaysHits: true,
};

const eliteArcaneLance: ActionDefinition = {
  id: 'elite_arcane_lance',
  name: 'Arcane Lance',
  description: 'A focused lance of arcane force.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.65),
  damageType: 'magic',
  alwaysHits: true,
};

const eliteDrainingStrike: ActionDefinition = {
  id: 'elite_draining_strike',
  name: 'Draining Strike',
  description: 'A draining strike that restores the attacker.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('elite', 1.5),
  damageType: 'magic',
  alwaysHits: true,
  lifeLeechPercent: 0.25,
};

const miniBossExecutionStrike: ActionDefinition = {
  id: 'mini_boss_execution_strike',
  name: 'Execution Strike',
  description: 'A telegraphed execution strike aimed at one target.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('mini_boss', 2.1),
  damageType: 'physical',
  alwaysHits: true,
};

const miniBossArcaneSpike: ActionDefinition = {
  id: 'mini_boss_arcane_spike',
  name: 'Arcane Spike',
  description: 'A telegraphed arcane spike aimed at one target.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: roleSpikeMultiplier('mini_boss', 2.1),
  damageType: 'magic',
  alwaysHits: true,
};
```

Then add them to `BOSS_ACTION_DEFINITIONS`:

```ts
  elite_venom_strike: eliteVenomStrike,
  elite_maul: eliteMaul,
  elite_backstab: eliteBackstab,
  elite_crushing_blow: eliteCrushingBlow,
  elite_arcane_lance: eliteArcaneLance,
  elite_draining_strike: eliteDrainingStrike,
  mini_boss_execution_strike: miniBossExecutionStrike,
  mini_boss_arcane_spike: miniBossArcaneSpike,
```

- [ ] **Step 5: Run the shared action test**

Run:

```powershell
rtk npm run test -w packages/game-engine -- raidRoundResolver -t "encounter role spike actions"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
rtk git add packages/shared/src/constants/gameConstants.ts packages/shared/src/constants/bossTemplateDefinitions.ts packages/game-engine/src/combat/raidRoundResolver.test.ts
rtk git commit -m "Add encounter role spike action definitions"
```

---

## Task 2: Replace Encounter Role Templates with Single-Target Rotations

**Files:**
- Modify: `apps/api/src/services/encounterSiteMobRoleService.ts`
- Modify: `apps/api/src/services/encounterSiteMobRoleService.test.ts`
- Modify: `apps/api/src/services/encounterSiteCombatCore.test.ts`

- [ ] **Step 1: Replace old resolver tests with failing single-target expectations**

In `apps/api/src/services/encounterSiteMobRoleService.test.ts`, replace the current `resolveEncounterRoleActionTemplate` elite and mini-boss tests with:

```ts
  it('gives spider elites a single-target setup and spike rotation', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'elite',
      damageType: 'physical',
      familyName: 'Spiders',
      mobName: 'Web Spinner',
    });

    expect(actions).toEqual([
      { actionId: 'boss_root', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      { actionId: 'elite_venom_strike', targetMode: 'single_target' },
      { actionId: 'boss_physical_attack', targetMode: 'single_target' },
    ]);
  });

  it('does not emit AoE actions for any elite or mini-boss role template', () => {
    const inputs = [
      { role: 'elite' as const, damageType: 'physical' as const, familyName: 'Spiders', mobName: 'Web Spinner' },
      { role: 'elite' as const, damageType: 'magic' as const, familyName: 'Witches', mobName: 'Hedge Witch' },
      { role: 'mini_boss' as const, damageType: 'physical' as const, familyName: 'Golems', mobName: 'Stone Golem' },
      { role: 'mini_boss' as const, damageType: 'magic' as const, familyName: 'Fae Spirits', mobName: 'Glimmer Wisp' },
    ];

    for (const input of inputs) {
      expect(resolveEncounterRoleActionTemplate(input).map(action => action.targetMode)).not.toContain('aoe');
    }
  });

  it('gives physical mini-bosses a telegraphed single-target execution spike', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'physical',
      familyName: 'Golems',
      mobName: 'Stone Golem',
    });

    expect(actions).toContainEqual({
      actionId: 'mini_boss_execution_strike',
      targetMode: 'single_target',
      isTelegraphed: true,
      label: 'EXECUTION STRIKE',
    });
  });

  it('gives magic mini-bosses a telegraphed single-target arcane spike', () => {
    const actions = resolveEncounterRoleActionTemplate({
      role: 'mini_boss',
      damageType: 'magic',
      familyName: 'Fae Spirits',
      mobName: 'Glimmer Wisp',
    });

    expect(actions).toContainEqual({
      actionId: 'mini_boss_arcane_spike',
      targetMode: 'single_target',
      isTelegraphed: true,
      label: 'ARCANE SPIKE',
    });
  });
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
rtk npm run test -w apps/api -- encounterSiteMobRoleService
```

Expected: FAIL because the resolver still emits AoE and still uses the old `basic -> special -> basic` elite rotation.

- [ ] **Step 3: Implement single-target rotations**

Replace `resolveEncounterRoleActionTemplate` internals with:

```ts
  const basicAttack = input.damageType === 'magic' ? 'boss_magic_attack' : 'boss_physical_attack';
  const basicAction: BossTemplateAction = { actionId: basicAttack, targetMode: 'single_target' };
  const theme = inferFamilyTheme(input.familyName, input.mobName, input.damageType);

  if (input.role === 'trash') {
    return [basicAction];
  }

  if (input.role === 'elite') {
    return [
      resolveEliteSetup(theme, input.damageType),
      basicAction,
      resolveEliteSpike(theme, input.damageType),
      basicAction,
    ];
  }

  const finisher: BossTemplateAction = input.damageType === 'magic'
    ? { actionId: 'mini_boss_arcane_spike', targetMode: 'single_target', isTelegraphed: true, label: 'ARCANE SPIKE' }
    : { actionId: 'mini_boss_execution_strike', targetMode: 'single_target', isTelegraphed: true, label: 'EXECUTION STRIKE' };

  return [
    resolveMiniBossSetup(theme, input.damageType),
    basicAction,
    resolveMiniBossSpecial(theme, input.damageType),
    basicAction,
    finisher,
  ];
```

Replace `resolveDamageTypeSpecial`, `resolveEliteSpecial`, and `resolveMiniBossSpecial` with:

```ts
function singleTargetAction(actionId: string): BossTemplateAction {
  return { actionId, targetMode: 'single_target' };
}

function resolveEliteSetup(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  if (theme === 'spider' || theme === 'treant') return singleTargetAction('boss_root');
  if (theme === 'bandit') return singleTargetAction('boss_smoke_bomb');
  if (theme === 'wolf') return singleTargetAction('boss_frenzy');
  if (theme === 'undead') return singleTargetAction('boss_wither');
  if (theme === 'spirit' || damageType === 'magic') return singleTargetAction('boss_weaken');
  return singleTargetAction('boss_enrage');
}

function resolveEliteSpike(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  if (theme === 'spider') return singleTargetAction('elite_venom_strike');
  if (theme === 'wolf') return singleTargetAction('elite_maul');
  if (theme === 'bandit') return singleTargetAction('elite_backstab');
  if (theme === 'treant') return singleTargetAction('elite_crushing_blow');
  if (theme === 'spirit' || damageType === 'magic') return singleTargetAction('elite_arcane_lance');
  if (theme === 'undead') return singleTargetAction('elite_draining_strike');
  return singleTargetAction(damageType === 'magic' ? 'elite_arcane_lance' : 'elite_crushing_blow');
}

function resolveMiniBossSetup(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  if (theme === 'spider' || theme === 'treant') return singleTargetAction('boss_root');
  if (theme === 'bandit') return singleTargetAction('boss_smoke_bomb');
  if (theme === 'wolf') return singleTargetAction('boss_frenzy');
  if (theme === 'undead') return singleTargetAction('boss_wither');
  if (theme === 'spirit' || damageType === 'magic') return singleTargetAction('boss_weaken');
  return singleTargetAction('boss_enrage');
}

function resolveMiniBossSpecial(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  return resolveEliteSpike(theme, damageType);
}
```

Remove the old `themedSpecial` helper if it becomes unused.

- [ ] **Step 4: Add encounter combat loading assertion**

In `apps/api/src/services/encounterSiteCombatCore.test.ts`, find the test that asserts role action templates are loaded for encounter-site mobs. Update its expected action IDs so an elite spider mob expects:

```ts
expect(mob.actionTemplate.map(action => action.actionId)).toEqual([
  'boss_root',
  'boss_physical_attack',
  'elite_venom_strike',
  'boss_physical_attack',
]);
expect(mob.actionTemplate.map(action => action.targetMode)).toEqual([
  'single_target',
  'single_target',
  'single_target',
  'single_target',
]);
```

If there is no existing elite-template loading assertion, add this assertion to the test that already calls the room mob loading helper and inspects `result.mobs`.

- [ ] **Step 5: Run resolver and encounter combat tests**

Run:

```powershell
rtk npm run test -w apps/api -- encounterSiteMobRoleService encounterSiteCombatCore
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
rtk git add apps/api/src/services/encounterSiteMobRoleService.ts apps/api/src/services/encounterSiteMobRoleService.test.ts apps/api/src/services/encounterSiteCombatCore.test.ts
rtk git commit -m "Use single-target encounter role rotations"
```

---

## Task 3: Focused Verification and PR Update

**Files:**
- No planned code changes.

- [ ] **Step 1: Run whitespace check**

Run:

```powershell
rtk git diff --check origin/main..HEAD
```

Expected: no output and exit code 0.

- [ ] **Step 2: Run focused shared/game-engine tests**

Run:

```powershell
rtk npm run test -w packages/game-engine -- raidRoundResolver encounterRolePromotion
```

Expected: PASS.

- [ ] **Step 3: Run focused API tests**

Run:

```powershell
rtk npm run test -w apps/api -- encounterSiteMobRoleService encounterSiteCombatCore exploration/helpers zoneRoutesService.travelPerformance
```

Expected: PASS.

- [ ] **Step 4: Run web combat display tests**

Run:

```powershell
rtk npm run test -w apps/web -- combatHelpers CombatScreen useEncounterSites
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript check**

Prefer:

```powershell
rtk npm run typecheck
```

Expected: PASS.

If Prisma generation fails with `EPERM` on `node_modules/.prisma/client/query_engine-windows.dll.node` because local dev servers are holding the DLL, do not kill user processes. Run:

```powershell
rtk npx tsc -b --force
```

Expected: `TypeScript: No errors found`.

- [ ] **Step 6: Push branch**

Run:

```powershell
rtk git push
```

Expected: branch `codex/encounter-site-role-promotion-plan` updates PR #347.
