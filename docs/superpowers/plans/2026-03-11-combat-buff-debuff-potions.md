# Combat Buff/Debuff Potion System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cleanse and buff potions to combat so Antivenom removes Poison, Resist Potion buffs defences, and Elixir of Power buffs attack.

**Architecture:** Extend the existing potion pipeline (types → constants → action definitions → engine execution → potion pool building → seed data). No schema changes — everything fits in the existing `consumableEffect` JSON column on ItemTemplate.

**Tech Stack:** TypeScript, Vitest, Prisma seed data

**Spec:** `docs/superpowers/specs/2026-03-11-combat-buff-debuff-potions-design.md`

**Business Rules:** `docs/business-rules.md` (check potion/combat sections before starting)

**Scope:** Backend only. Frontend combat playback changes for the new `cleanse` action type and `effectsCleansed` log field are out of scope for this plan.

**Design Note — Resist Potion & Buff Cap:** Resist Potion applies two separate buff effects ("Resist Potion" for defence, "Resist Potion (Magic)" for magicDefence), consuming 2 of 3 `MAX_ACTIVE_BUFFS` slots. Using both Resist Potion + Elixir of Power fills all 3 slots. This is intentional — it makes buff potion choices strategic.

**Compilability Note:** After Task 1 (shared type changes), the API's `potionService.ts` will not compile until Task 3 updates the exhaustive switch. Do not run full typecheck between Tasks 1-2 and Task 3. Each chunk boundary is compilable.

---

## Chunk 1: Shared Types & Constants

### Task 1: Extend ConsumableEffect types

**Files:**
- Modify: `packages/shared/src/types/item.types.ts:20-25`
- Test: `packages/shared/src/constants/gameConstants.test.ts` (existing, verify no breakage)

- [ ] **Step 1: Extend ConsumableEffectType union**

In `packages/shared/src/types/item.types.ts`, change:

```typescript
export type ConsumableEffectType = 'heal_flat' | 'heal_percent' | 'restore_stamina' | 'restore_mana';
```

to:

```typescript
export type ConsumableEffectType =
  | 'heal_flat'
  | 'heal_percent'
  | 'restore_stamina'
  | 'restore_mana'
  | 'cleanse_magic_dot'
  | 'buff_attack'
  | 'buff_defence';
```

- [ ] **Step 2: Add optional duration to ConsumableEffect**

In the same file, change:

```typescript
export interface ConsumableEffect {
  type: ConsumableEffectType;
  value: number;
}
```

to:

```typescript
export interface ConsumableEffect {
  type: ConsumableEffectType;
  value: number;
  /** Duration in rounds (used by buff potions) */
  duration?: number;
}
```

- [ ] **Step 3: Extend CombatPotion.potionType**

In `packages/shared/src/types/combat.types.ts:135-140`, change:

```typescript
export interface CombatPotion {
  name: string;
  healAmount: number;
  templateId: string;
  potionType: 'hp' | 'stamina' | 'mana';
}
```

to:

```typescript
export interface CombatPotion {
  name: string;
  /** Heal/restore amount for resource potions; 0 for cleanse/buff potions */
  healAmount: number;
  templateId: string;
  potionType: 'hp' | 'stamina' | 'mana' | 'cleanse' | 'buff_attack' | 'buff_defence';
  /** Duration in rounds (buff potions only) */
  buffDuration?: number;
  /** Buff value — percent for buff_attack, flat for buff_defence */
  buffValue?: number;
}
```

- [ ] **Step 4: Extend CombatAction type for log entries**

In `packages/shared/src/types/combat.types.ts:113`, change:

```typescript
export type CombatAction = 'attack' | 'spell' | 'defend' | 'counter' | 'ward' | 'flee' | 'potion' | 'heal' | 'regen';
```

to:

```typescript
export type CombatAction = 'attack' | 'spell' | 'defend' | 'counter' | 'ward' | 'flee' | 'potion' | 'cleanse' | 'heal' | 'regen';
```

- [ ] **Step 5: Add effectsCleansed to CombatLogEntry**

In `packages/shared/src/types/combat.types.ts`, after the `effectsExpired` field (line 110), add:

```typescript
  effectsCleansed?: Array<{
    name: string;
    target: CombatActor;
    stacksRemoved: number;
  }>;
```

- [ ] **Step 6: Extend ActionDefinition.potionType**

In `packages/shared/src/types/combatAction.types.ts:80`, change:

```typescript
  potionType?: 'hp' | 'stamina' | 'mana';
```

to:

```typescript
  potionType?: 'hp' | 'stamina' | 'mana' | 'cleanse' | 'buff_attack' | 'buff_defence';
```

- [ ] **Step 7: Extend SupportiveAction type**

In `packages/shared/src/types/combatAction.types.ts:13-18`, change:

```typescript
export type SupportiveAction =
  | 'buff'
  | 'heal_self'
  | 'heal_ally'
  | 'taunt'
  | 'use_potion';
```

to:

```typescript
export type SupportiveAction =
  | 'buff'
  | 'heal_self'
  | 'heal_ally'
  | 'taunt'
  | 'use_potion'
  | 'use_cleanse_potion'
  | 'use_buff_potion';
```

- [ ] **Step 8: Build shared package and verify no TS errors**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types/item.types.ts packages/shared/src/types/combat.types.ts packages/shared/src/types/combatAction.types.ts
git commit -m "feat: extend shared types for cleanse and buff potions"
```

---

### Task 2: Add buff potion constants and action definitions

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:558` (after COMBAT_ACTION_CONSTANTS closing)
- Modify: `packages/shared/src/constants/combatActionDefinitions.ts`

- [ ] **Step 1: Add BUFF_POTION_CONSTANTS**

In `packages/shared/src/constants/gameConstants.ts`, insert after the `POTION_CONSTANTS` block (after line 606):

```typescript
export const BUFF_POTION_CONSTANTS = {
  ELIXIR_ATTACK_PERCENT: 0.25,
  ELIXIR_DURATION: 5,
  RESIST_DEFENCE_BONUS: 15,
  RESIST_MAGIC_DEFENCE_BONUS: 15,
  RESIST_DURATION: 5,
} as const;
```

- [ ] **Step 2: Add new combat action cost constants**

In `COMBAT_ACTION_CONSTANTS` (before the closing `} as const;` at line 558), add:

```typescript
  // Utility potion actions
  USE_CLEANSE_POTION_STAMINA: 5,
  USE_BUFF_POTION_STAMINA: 5,
```

- [ ] **Step 3: Add three new action definitions**

In `packages/shared/src/constants/combatActionDefinitions.ts`, after the `useManaPotion` definition (line 114), add:

```typescript
const useCleansePotion: ActionDefinition = {
  id: 'use_cleanse_potion',
  name: 'Use Cleanse Potion',
  description: 'Drink a cleanse potion to remove magic DOTs (Poison, Burn, etc.). Triggers potion sickness.',
  actionType: 'use_cleanse_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_CLEANSE_POTION_STAMINA, mana: 0 },
  potionType: 'cleanse',
  isChanneling: true,
};

const useResistPotion: ActionDefinition = {
  id: 'use_resist_potion',
  name: 'Use Resist Potion',
  description: 'Drink a resist potion to boost defence and magic defence. Triggers potion sickness.',
  actionType: 'use_buff_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_BUFF_POTION_STAMINA, mana: 0 },
  potionType: 'buff_defence',
  isChanneling: true,
};

const useElixirOfPower: ActionDefinition = {
  id: 'use_elixir_of_power',
  name: 'Use Elixir of Power',
  description: 'Drink an elixir to boost attack damage. Triggers potion sickness.',
  actionType: 'use_buff_potion',
  category: 'supportive',
  scalingStat: 'weapon',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.USE_BUFF_POTION_STAMINA, mana: 0 },
  potionType: 'buff_attack',
  isChanneling: true,
};
```

- [ ] **Step 4: Register in ALWAYS_AVAILABLE_ACTION_IDS**

Change the set at line 629:

```typescript
export const ALWAYS_AVAILABLE_ACTION_IDS = new Set([
  'light_attack', 'normal_attack', 'heavy_attack',
  'defend', 'counter', 'ward',
  'use_hp_potion', 'use_stamina_potion', 'use_mana_potion',
  'use_cleanse_potion', 'use_resist_potion', 'use_elixir_of_power',
]);
```

- [ ] **Step 5: Register in BASE_ACTION_DEFINITIONS**

Add to the registry object after `use_mana_potion`:

```typescript
  use_cleanse_potion: useCleansePotion,
  use_resist_potion: useResistPotion,
  use_elixir_of_power: useElixirOfPower,
```

- [ ] **Step 6: Build and verify**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts packages/shared/src/constants/combatActionDefinitions.ts
git commit -m "feat: add buff potion constants and combat action definitions"
```

---

## Chunk 2: Potion Service & Engine

### Task 3: Extend potion pool building

**Files:**
- Modify: `apps/api/src/services/potionService.ts`
- Test: `apps/api/src/services/potionService.test.ts`

- [ ] **Step 1: Write failing tests for new potion types**

Add to `apps/api/src/services/potionService.test.ts`, inside the `buildPotionPool` describe block:

```typescript
    it('builds cleanse potions from cleanse_magic_dot consumables', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 3,
          template: {
            id: 'tmpl-antivenom',
            name: 'Antivenom Potion',
            consumableEffect: { type: 'cleanse_magic_dot' },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: 'Antivenom Potion',
        healAmount: 0,
        templateId: 'tmpl-antivenom',
        potionType: 'cleanse',
      });
    });

    it('builds buff_attack potions with duration and value', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 1,
          template: {
            id: 'tmpl-elixir',
            name: 'Elixir of Power',
            consumableEffect: { type: 'buff_attack', value: 0.25, duration: 5 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Elixir of Power',
        healAmount: 0,
        templateId: 'tmpl-elixir',
        potionType: 'buff_attack',
        buffDuration: 5,
        buffValue: 0.25,
      });
    });

    it('builds buff_defence potions with duration and value', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 2,
          template: {
            id: 'tmpl-resist',
            name: 'Resist Potion',
            consumableEffect: { type: 'buff_defence', value: 15, duration: 5 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Resist Potion',
        healAmount: 0,
        templateId: 'tmpl-resist',
        potionType: 'buff_defence',
        buffDuration: 5,
        buffValue: 15,
      });
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/services/potionService.test.ts`
Expected: 3 new tests FAIL (potionType mismatch / missing properties).

- [ ] **Step 3: Update getEffectPotionType and buildPotionPool**

In `apps/api/src/services/potionService.ts`, change the `getEffectPotionType` function and update imports:

```typescript
import type { CombatPotion, CombatTemplateSlotData, ConsumableEffect, ConsumableEffectType, PotionConsumed } from '@pocketrealm/shared';
```

Replace `getEffectPotionType`:

```typescript
function getEffectPotionType(effectType: ConsumableEffectType): CombatPotion['potionType'] {
  switch (effectType) {
    case 'heal_flat':
    case 'heal_percent':
      return 'hp';
    case 'restore_stamina':
      return 'stamina';
    case 'restore_mana':
      return 'mana';
    case 'cleanse_magic_dot':
      return 'cleanse';
    case 'buff_attack':
      return 'buff_attack';
    case 'buff_defence':
      return 'buff_defence';
  }
}
```

Update the potion-building loop inside `buildPotionPool` to handle new types:

```typescript
  const potions: CombatPotion[] = [];
  for (const item of consumables) {
    const effect = item.template.consumableEffect as ConsumableEffect | null;
    if (!effect) continue;

    const potionType = getEffectPotionType(effect.type);
    const isResource = potionType === 'hp' || potionType === 'stamina' || potionType === 'mana';

    const healAmount = isResource
      ? (effect.type === 'heal_flat'
          ? effect.value
          : effect.type === 'heal_percent'
            ? Math.floor(maxHp * effect.value)
            : effect.value)
      : 0;

    for (let i = 0; i < item.quantity; i++) {
      const potion: CombatPotion = {
        name: item.template.name,
        healAmount,
        templateId: item.template.id,
        potionType,
      };

      if (effect.duration) potion.buffDuration = effect.duration;
      if (!isResource && effect.value) potion.buffValue = effect.value;

      potions.push(potion);
    }
  }
  return potions;
```

- [ ] **Step 4: Update POTION_ACTION_IDS set**

Change the `POTION_ACTION_IDS` constant at the top of the file:

```typescript
const POTION_ACTION_IDS = new Set([
  'use_hp_potion', 'use_stamina_potion', 'use_mana_potion',
  'use_cleanse_potion', 'use_resist_potion', 'use_elixir_of_power',
]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/services/potionService.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/potionService.ts apps/api/src/services/potionService.test.ts
git commit -m "feat: extend potion pool building for cleanse and buff potions"
```

---

### Task 4: Add cleanse and buff execution to combat engine

**Files:**
- Modify: `packages/game-engine/src/combat/templateCombatEngine.ts`
- Test: `packages/game-engine/src/combat/templateCombatEngine.test.ts`

This is the core task. Three new execution functions + potion fallback extension.

- [ ] **Step 1: Write failing test for cleanse potion execution**

Add to `packages/game-engine/src/combat/templateCombatEngine.test.ts`:

```typescript
describe('cleanse potion', () => {
  it('removes all stacks of the highest-damage magic DOT group', () => {
    const spy = mockCombatRandom({ initA: 0.9, initB: 0.1, attackRoll: 0.85, damageRoll: 0.0, critRoll: 0.99 });

    // Combatant A uses cleanse potion; B does light attacks
    const a = makeCombatant('Hero', {
      template: templateOf('use_cleanse_potion'),
    });
    const b = makeCombatant('Spider', {
      template: templateOf('light_attack'),
    });

    const result = runTemplateCombat(a, b, {
      potions: [
        { name: 'Antivenom Potion', healAmount: 0, templateId: 'tmpl-av', potionType: 'cleanse' },
      ],
    });

    // With no active DOTs, cleanse should fail gracefully (no DOTs to remove)
    const cleanseLog = result.log.find(l => l.message.includes('no magic DOTs'));
    expect(cleanseLog).toBeDefined();

    spy.mockRestore();
  });

  it('removes poison stacks when active', () => {
    const spy = mockCombatRandom({ initA: 0.9, initB: 0.1, attackRoll: 0.85, damageRoll: 0.0, critRoll: 0.99 });

    // B uses venomous_strike round 1, A cleanses round 2
    const a = makeCombatant('Hero', {
      template: [
        { id: 'slot-0', sortOrder: 0, actionId: 'defend' },
        { id: 'slot-1', sortOrder: 1, actionId: 'use_cleanse_potion' },
      ],
    });
    const b = makeCombatant('Spider', {
      stats: makeStats({ damageMin: 5, damageMax: 5 }),
      template: templateOf('venomous_strike'),
      actionDefinitions: BASE_ACTION_DEFINITIONS,
    });

    const result = runTemplateCombat(a, b, {
      potions: [
        { name: 'Antivenom Potion', healAmount: 0, templateId: 'tmpl-av', potionType: 'cleanse' },
      ],
    });

    // Verify cleanse log entry exists
    const cleanseLog = result.log.find(l => l.message.includes('cleanses'));
    expect(cleanseLog).toBeDefined();
    // Verify potion was consumed
    expect(result.potionsConsumed).toHaveLength(1);
    expect(result.potionsConsumed[0].templateId).toBe('tmpl-av');

    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-engine/src/combat/templateCombatEngine.test.ts -t "cleanse potion"`
Expected: FAIL — no cleanse execution logic exists.

- [ ] **Step 3: Add executeCleanseAction function**

In `packages/game-engine/src/combat/templateCombatEngine.ts`, add after the `executePotionAction` function (after line 743):

```typescript
function executeCleanseAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  // Check potion sickness
  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  // Find a cleanse potion in pool
  const potionIndex = availablePotions.findIndex(p => p.potionType === 'cleanse');
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to drink a cleanse potion but has none left!`,
    }));
    return;
  }

  // Find magic DOTs on this actor, grouped by name
  const magicDots = state.activeEffects.filter(
    e => e.target === actorKey && e.resolvedDamagePerRound && e.resolvedDamagePerRound > 0 && e.dotDamageType === 'magic',
  );

  if (magicDots.length === 0) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'cleanse',
      message: `${actorName} tries to cleanse but has no magic DOTs to remove!`,
    }));
    return;
  }

  // Group by name, sum damage per group
  const groups = new Map<string, { totalDamage: number; count: number }>();
  for (const dot of magicDots) {
    const existing = groups.get(dot.name) ?? { totalDamage: 0, count: 0 };
    existing.totalDamage += dot.resolvedDamagePerRound!;
    existing.count++;
    groups.set(dot.name, existing);
  }

  // Find the group with highest total damage
  let worstName = '';
  let worstDamage = -1;
  for (const [name, group] of groups) {
    if (group.totalDamage > worstDamage) {
      worstName = name;
      worstDamage = group.totalDamage;
    }
  }

  // Remove all effects with that name targeting this actor
  const removedCount = groups.get(worstName)!.count;
  state.activeEffects = state.activeEffects.filter(
    e => !(e.target === actorKey && e.name === worstName && e.resolvedDamagePerRound && e.dotDamageType === 'magic'),
  );

  // Consume potion
  const potion = availablePotions[potionIndex];
  availablePotions.splice(potionIndex, 1);
  potionsConsumed.push({
    templateId: potion.templateId,
    name: potion.name,
    healAmount: 0,
    round: state.round,
  });

  // Apply potion sickness
  state.activeEffects.push({
    name: 'Potion Sickness',
    target: actorKey,
    stat: 'potionSickness',
    modifier: 0,
    remainingRounds: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
  });

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'cleanse',
    spellName: potion.name,
    effectsCleansed: [{ name: worstName, target: actorKey, stacksRemoved: removedCount }],
    effectsApplied: [{
      stat: 'potionSickness',
      modifier: 0,
      duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      target: actorKey,
    }],
    message: `${actorName} drinks ${potion.name}! Cleanses ${removedCount}x ${worstName}!`,
  }));
}
```

- [ ] **Step 4: Add executeBuffPotionAction function**

Add after `executeCleanseAction`:

```typescript
function executeBuffPotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  const potionType = action.potionType as 'buff_attack' | 'buff_defence';

  // Check potion sickness
  if (hasPotionSickness(state, actorKey)) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a potion but is still sick!`,
    }));
    return;
  }

  // Find matching buff potion
  const potionIndex = availablePotions.findIndex(p => p.potionType === potionType);
  if (potionIndex === -1) {
    state.log.push(buildLogEntry(state, ctx, {
      actor: actorKey,
      actorName,
      action: 'potion',
      message: `${actorName} tries to drink a buff potion but has none left!`,
    }));
    return;
  }

  const potion = availablePotions[potionIndex];
  const duration = potion.buffDuration ?? 5;
  const value = potion.buffValue ?? 0;

  // Apply buff effect(s)
  const appliedEffects: CombatLogEntry['effectsApplied'] = [];

  if (potionType === 'buff_attack') {
    const applied = applyActionEffect(state, {
      name: 'Elixir of Power',
      stat: 'attackPercent',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (applied) appliedEffects.push(...applied);
  } else {
    // buff_defence: apply both defence and magicDefence
    const defApplied = applyActionEffect(state, {
      name: 'Resist Potion',
      stat: 'defence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (defApplied) appliedEffects.push(...defApplied);

    const mdefApplied = applyActionEffect(state, {
      name: 'Resist Potion (Magic)',
      stat: 'magicDefence',
      modifier: value,
      duration,
      isDebuff: false,
    }, actorKey);
    if (mdefApplied) appliedEffects.push(...mdefApplied);
  }

  // Consume potion
  availablePotions.splice(potionIndex, 1);
  potionsConsumed.push({
    templateId: potion.templateId,
    name: potion.name,
    healAmount: 0,
    round: state.round,
  });

  // Apply potion sickness
  state.activeEffects.push({
    name: 'Potion Sickness',
    target: actorKey,
    stat: 'potionSickness',
    modifier: 0,
    remainingRounds: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
  });

  const buffDesc = appliedEffects.length > 0
    ? appliedEffects.map(e => `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier} (${e.duration} rds)`).join(', ')
    : 'buff cap reached';

  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'potion',
    spellName: potion.name,
    effectsApplied: [
      ...(appliedEffects.length > 0 ? appliedEffects : []),
      { stat: 'potionSickness', modifier: 0, duration: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS, target: actorKey },
    ],
    message: `${actorName} drinks ${potion.name}! ${buffDesc}`,
  }));
}
```

- [ ] **Step 5: Wire new actions into executeSupportiveAction**

In `executeSupportiveAction` (around line 593-650), change the first block:

```typescript
  // Potion use
  if (action.actionType === 'use_potion') {
    executePotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }
```

to:

```typescript
  // Resource potion use (hp/stamina/mana)
  if (action.actionType === 'use_potion') {
    executePotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Cleanse potion
  if (action.actionType === 'use_cleanse_potion') {
    executeCleanseAction(state, actorKey, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  // Buff potion (resist / elixir)
  if (action.actionType === 'use_buff_potion') {
    executeBuffPotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }
```

- [ ] **Step 6: Extend potion fallback logic in main combat loop**

In `runTemplateCombat`, the potion fallback block (lines ~860-877) checks `resolvedA.action.potionType`. This needs to handle the new potion types. Replace the two potion fallback blocks with a helper:

Add before `runTemplateCombat`:

```typescript
function canUsePotionAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  availablePotions: CombatPotion[],
): boolean {
  if (!action.potionType) return true;
  if (hasPotionSickness(state, actorKey)) return false;

  // Cleanse: need a cleanse potion AND at least one magic DOT
  if (action.potionType === 'cleanse') {
    const hasPotion = availablePotions.some(p => p.potionType === 'cleanse');
    const hasMagicDot = state.activeEffects.some(
      e => e.target === actorKey && e.resolvedDamagePerRound && e.resolvedDamagePerRound > 0 && e.dotDamageType === 'magic',
    );
    return hasPotion && hasMagicDot;
  }

  // Buff potions: just need a matching potion
  return availablePotions.some(p => p.potionType === action.potionType);
}
```

Then replace the two fallback blocks (lines ~860-877) with:

```typescript
    if (resolvedA.action.potionType) {
      if (!canUsePotionAction(state, 'combatantA', resolvedA.action, availablePotions)) {
        resolvedA = resolvedA.alternateAction
          ? { action: resolvedA.alternateAction, wasExhausted: false }
          : { action: DEFEND_FALLBACK, wasExhausted: true };
      }
    }
    if (resolvedB.action.potionType) {
      if (!canUsePotionAction(state, 'combatantB', resolvedB.action, availablePotions)) {
        resolvedB = resolvedB.alternateAction
          ? { action: resolvedB.alternateAction, wasExhausted: false }
          : { action: DEFEND_FALLBACK, wasExhausted: true };
      }
    }
```

- [ ] **Step 7: Update actionToCombatAction helper**

Change:

```typescript
function actionToCombatAction(action: ActionDefinition): CombatAction {
  if (action.category === 'offensive') return 'attack';
  if (action.category === 'defensive') return 'defend';
  if (action.actionType === 'use_potion') return 'potion';
  return 'spell';
}
```

to:

```typescript
function actionToCombatAction(action: ActionDefinition): CombatAction {
  if (action.category === 'offensive') return 'attack';
  if (action.category === 'defensive') return 'defend';
  if (action.actionType === 'use_potion') return 'potion';
  if (action.actionType === 'use_cleanse_potion') return 'cleanse';
  if (action.actionType === 'use_buff_potion') return 'potion';
  return 'spell';
}
```

- [ ] **Step 8: Run tests to verify cleanse tests pass**

Run: `npx vitest run packages/game-engine/src/combat/templateCombatEngine.test.ts`
Expected: All tests PASS, including the new cleanse tests.

- [ ] **Step 9: Write buff potion tests**

Add to `packages/game-engine/src/combat/templateCombatEngine.test.ts`:

```typescript
describe('buff potions', () => {
  it('elixir of power applies attackPercent buff', () => {
    const spy = mockCombatRandom({ initA: 0.9, initB: 0.1, attackRoll: 0.85, damageRoll: 0.0, critRoll: 0.99 });

    const a = makeCombatant('Hero', {
      template: templateOf('use_elixir_of_power'),
    });
    const b = makeCombatant('Mob', {
      stats: makeStats({ hp: 500, maxHp: 500 }),
      template: templateOf('light_attack'),
    });

    const result = runTemplateCombat(a, b, {
      potions: [
        { name: 'Elixir of Power', healAmount: 0, templateId: 'tmpl-elixir', potionType: 'buff_attack', buffDuration: 5, buffValue: 0.25 },
      ],
    });

    const buffLog = result.log.find(l => l.message.includes('Elixir of Power'));
    expect(buffLog).toBeDefined();
    expect(result.potionsConsumed).toHaveLength(1);

    spy.mockRestore();
  });

  it('resist potion applies defence and magicDefence buffs', () => {
    const spy = mockCombatRandom({ initA: 0.9, initB: 0.1, attackRoll: 0.85, damageRoll: 0.0, critRoll: 0.99 });

    const a = makeCombatant('Hero', {
      template: templateOf('use_resist_potion'),
    });
    const b = makeCombatant('Mob', {
      stats: makeStats({ hp: 500, maxHp: 500 }),
      template: templateOf('light_attack'),
    });

    const result = runTemplateCombat(a, b, {
      potions: [
        { name: 'Resist Potion', healAmount: 0, templateId: 'tmpl-resist', potionType: 'buff_defence', buffDuration: 5, buffValue: 15 },
      ],
    });

    const buffLog = result.log.find(l => l.message.includes('Resist Potion'));
    expect(buffLog).toBeDefined();
    expect(result.potionsConsumed).toHaveLength(1);

    spy.mockRestore();
  });

  it('buff potions trigger potion sickness', () => {
    const spy = mockCombatRandom({ initA: 0.9, initB: 0.1, attackRoll: 0.85, damageRoll: 0.0, critRoll: 0.99 });

    const a = makeCombatant('Hero', {
      template: [
        { id: 'slot-0', sortOrder: 0, actionId: 'use_elixir_of_power' },
        { id: 'slot-1', sortOrder: 1, actionId: 'use_hp_potion' },
      ],
    });
    const b = makeCombatant('Mob', {
      stats: makeStats({ hp: 500, maxHp: 500 }),
      template: templateOf('light_attack'),
    });

    const result = runTemplateCombat(a, b, {
      potions: [
        { name: 'Elixir of Power', healAmount: 0, templateId: 'tmpl-elixir', potionType: 'buff_attack', buffDuration: 5, buffValue: 0.25 },
        { name: 'Health Potion', healAmount: 150, templateId: 'tmpl-hp', potionType: 'hp' },
      ],
    });

    // Round 2: HP potion should fail due to sickness from elixir
    const sickLog = result.log.find(l => l.message.includes('still sick'));
    expect(sickLog).toBeDefined();

    spy.mockRestore();
  });

  it('respects MAX_ACTIVE_BUFFS cap', () => {
    const spy = mockCombatRandom({ initA: 0.9, initB: 0.1, attackRoll: 0.85, damageRoll: 0.0, critRoll: 0.99 });

    // Use resist potion (2 buffs) then try to apply a 3rd + 4th buff via another resist potion
    // Resist uses 2 slots, elixir would be the 3rd — should work
    // But if we pre-fill 3 buffs (battle_cry + eagle_eye + fortify) then resist should fail
    const a = makeCombatant('Hero', {
      template: [
        { id: 'slot-0', sortOrder: 0, actionId: 'battle_cry' },
        { id: 'slot-1', sortOrder: 1, actionId: 'eagle_eye' },
        { id: 'slot-2', sortOrder: 2, actionId: 'fortify' },
        { id: 'slot-3', sortOrder: 3, actionId: 'use_elixir_of_power' },
      ],
      stamina: 200,
      maxStamina: 200,
      mana: 200,
      maxMana: 200,
    });
    const b = makeCombatant('Mob', {
      stats: makeStats({ hp: 2000, maxHp: 2000 }),
      template: templateOf('light_attack'),
    });

    const result = runTemplateCombat(a, b, {
      potions: [
        { name: 'Elixir of Power', healAmount: 0, templateId: 'tmpl-elixir', potionType: 'buff_attack', buffDuration: 5, buffValue: 0.25 },
      ],
    });

    // Round 4: elixir should log "buff cap reached" since 3 buffs are already active
    const capLog = result.log.find(l => l.message.includes('buff cap reached'));
    expect(capLog).toBeDefined();
    // Potion should still be consumed even if buff failed
    expect(result.potionsConsumed).toHaveLength(1);

    spy.mockRestore();
  });
});
```

- [ ] **Step 10: Run all engine tests**

Run: `npx vitest run packages/game-engine/src/combat/templateCombatEngine.test.ts`
Expected: All tests PASS.

- [ ] **Step 11: Build game-engine package**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build.

- [ ] **Step 12: Commit**

```bash
git add packages/game-engine/src/combat/templateCombatEngine.ts packages/game-engine/src/combat/templateCombatEngine.test.ts
git commit -m "feat: add cleanse and buff potion execution to combat engine"
```

---

## Chunk 3: Seed Data & Integration

### Task 5: Update seed data for placeholder potions

**Files:**
- Modify: `packages/database/prisma/seed-data/items.ts:4` (ConsumableEffectJson type)
- Modify: `packages/database/prisma/seed-data/items.ts:250-254` (potion entries)

- [ ] **Step 0: Update ConsumableEffectJson local type**

In `packages/database/prisma/seed-data/items.ts`, line 4, change:

```typescript
type ConsumableEffectJson = { type: 'heal_flat' | 'heal_percent' | 'restore_stamina' | 'restore_mana'; value: number };
```

to:

```typescript
type ConsumableEffectJson = {
  type: 'heal_flat' | 'heal_percent' | 'restore_stamina' | 'restore_mana' | 'cleanse_magic_dot' | 'buff_attack' | 'buff_defence';
  value: number;
  duration?: number;
};
```

- [ ] **Step 1: Update Antivenom Potion seed**

In `packages/database/prisma/seed-data/items.ts`, change line 250:

```typescript
  consumable(IDS.pots.antivenomPotion, 'Antivenom Potion', 2),
```

to:

```typescript
  consumable(IDS.pots.antivenomPotion, 'Antivenom Potion', 2, { type: 'cleanse_magic_dot', value: 0 }),
```

- [ ] **Step 2: Update Resist Potion seed**

Change line 252:

```typescript
  consumable(IDS.pots.resistPotion, 'Resist Potion', 4),
```

to:

```typescript
  consumable(IDS.pots.resistPotion, 'Resist Potion', 4, { type: 'buff_defence', value: 15, duration: 5 }),
```

- [ ] **Step 3: Update Elixir of Power seed**

Change line 254:

```typescript
  consumable(IDS.pots.elixirOfPower, 'Elixir of Power', 5),
```

to:

```typescript
  consumable(IDS.pots.elixirOfPower, 'Elixir of Power', 5, { type: 'buff_attack', value: 0.25, duration: 5 }),
```

- [ ] **Step 4: Verify the consumable helper accepts the new shape**

Read `packages/database/prisma/seed-data/items.ts` and confirm the `consumable()` helper passes `consumableEffect` through correctly. The `ConsumableEffect` type already has `duration?: number`, so no helper changes needed.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/seed-data/items.ts
git commit -m "feat: activate antivenom, resist, and elixir seed data with effects"
```

---

### Task 6: Database migration for existing items

**Files:**
- Create: new Prisma migration

Since `consumableEffect` is a JSON column, existing Antivenom/Resist/Elixir items in the DB have `null` for their effect. A data migration updates existing `ItemTemplate` rows.

- [ ] **Step 1: Create a data migration**

Run: `npx prisma migrate dev --name add-potion-effects --create-only` in `packages/database/`

Then replace the empty migration SQL with:

```sql
-- Update existing placeholder potion templates with their effects
UPDATE "ItemTemplate"
SET "consumableEffect" = '{"type": "cleanse_magic_dot", "value": 0}'::jsonb
WHERE name = 'Antivenom Potion' AND "consumableEffect" IS NULL;

UPDATE "ItemTemplate"
SET "consumableEffect" = '{"type": "buff_defence", "value": 15, "duration": 5}'::jsonb
WHERE name = 'Resist Potion' AND "consumableEffect" IS NULL;

UPDATE "ItemTemplate"
SET "consumableEffect" = '{"type": "buff_attack", "value": 0.25, "duration": 5}'::jsonb
WHERE name = 'Elixir of Power' AND "consumableEffect" IS NULL;
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev` in `packages/database/`
Expected: Migration applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/migrations/
git commit -m "feat: data migration to activate potion effects on existing items"
```

---

### Task 7: Update consumableService for new effect types

**Files:**
- Modify: `apps/api/src/services/consumableService.ts`
- Test: `apps/api/src/services/consumableService.test.ts`

The out-of-combat `useConsumable` function currently throws `'NO_EFFECT'` for items without effects. With the new types, it should throw a more specific error for cleanse/buff potions (combat-only).

- [ ] **Step 1: Write failing test**

Add to `consumableService.test.ts`:

```typescript
    it('rejects cleanse potions outside combat', async () => {
      mockPrisma.item.findUnique.mockResolvedValue({
        id: 'item-1',
        ownerId: 'player-1',
        template: { itemType: 'consumable', consumableEffect: { type: 'cleanse_magic_dot', value: 0 } },
      });

      await expect(useConsumable('player-1', 'item-1')).rejects.toMatchObject({
        statusCode: 400,
        code: 'COMBAT_ONLY',
      });
    });

    it('rejects buff potions outside combat', async () => {
      mockPrisma.item.findUnique.mockResolvedValue({
        id: 'item-1',
        ownerId: 'player-1',
        template: { itemType: 'consumable', consumableEffect: { type: 'buff_attack', value: 0.25, duration: 5 } },
      });

      await expect(useConsumable('player-1', 'item-1')).rejects.toMatchObject({
        statusCode: 400,
        code: 'COMBAT_ONLY',
      });
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run apps/api/src/services/consumableService.test.ts`
Expected: New tests FAIL.

- [ ] **Step 3: Update consumableService**

In `apps/api/src/services/consumableService.ts`, after the existing combat-only check for stamina/mana, extend to include new types:

```typescript
  // Stamina, mana, cleanse, and buff potions can only be used in combat
  if (effect.type === 'restore_stamina' || effect.type === 'restore_mana'
      || effect.type === 'cleanse_magic_dot' || effect.type === 'buff_attack' || effect.type === 'buff_defence') {
    throw new AppError(400, 'This potion can only be used in combat', 'COMBAT_ONLY');
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run apps/api/src/services/consumableService.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/consumableService.ts apps/api/src/services/consumableService.test.ts
git commit -m "feat: reject cleanse and buff potions from out-of-combat use"
```

---

### Task 8: Run full test suite and typecheck

- [ ] **Step 1: Build all packages**

Run: `npm run build`
Expected: Clean build across all workspaces.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Fix any failures**

If tests fail, diagnose and fix. Re-run until green.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git commit -m "fix: resolve any integration issues from buff/debuff potion system"
```
