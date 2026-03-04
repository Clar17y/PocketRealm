# Conditional Combat Templates — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-slot if/else conditions to combat templates so players can branch actions based on their HP/Stamina/Mana levels or buff/debuff state.

**Architecture:** Replace the `actions Json` column on `CombatTemplate` with a relational `CombatTemplateSlot` table. Each slot has an optional condition (resource threshold or buff/debuff check) with a `thenActionId` (condition true) and `actionId` (condition false / default). The game engine evaluates conditions each round before picking the action.

**Tech Stack:** Prisma 6, TypeScript, Vitest, Zod, React

**Design doc:** `docs/plans/2026-03-04-conditional-combat-templates-design.md`

---

### Task 1: Add Shared Types

**Files:**
- Modify: `packages/shared/src/types/combatAction.types.ts:84-100`

**Step 1: Update types**

Replace the `CombatTemplateAction`, `CombatTemplateData` types and add condition types:

```typescript
// --- Condition Types ---

export type ConditionType =
  | 'resource_below'
  | 'resource_above'
  | 'has_buff'
  | 'has_debuff'
  | 'no_buff'
  | 'no_debuff';

export type ConditionResourceType = 'hp' | 'stamina' | 'mana';

export interface SlotCondition {
  type: ConditionType;
  resource?: ConditionResourceType;   // required for resource_below/above
  threshold?: number;                 // 0-100, required for resource_below/above
  effectName?: string;                // required for buff/debuff conditions
}

// --- Combat Template ---

export interface CombatTemplateSlotData {
  id: string;
  sortOrder: number;
  actionId: string;                   // default/else action
  condition?: SlotCondition;          // optional if/then branch
  thenActionId?: string;              // action when condition is true
}

/** @deprecated Use CombatTemplateSlotData — kept for mob template compatibility */
export interface CombatTemplateAction {
  actionId: string;
  label?: string;
}

export interface CombatTemplateData {
  id: string;
  playerId: string;
  name: string;
  isActive: boolean;
  slots: CombatTemplateSlotData[];
  createdAt: string;
  updatedAt: string;
}
```

Keep the old `CombatTemplateAction` interface (used by mob templates in `mobTemplateConverter.ts`) but mark it deprecated.

**Step 2: Rebuild shared package**

Run: `npm run build --workspace=packages/shared`
Expected: clean build

**Step 3: Commit**

```bash
git add packages/shared/src/types/combatAction.types.ts
git commit -m "feat(shared): add conditional template slot types"
```

---

### Task 2: Prisma Schema Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (the `CombatTemplate` model at ~line 914)

**Step 1: Update schema**

Add enums and `CombatTemplateSlot` model. Remove `actions Json` from `CombatTemplate`, add `slots` relation:

```prisma
enum ConditionType {
  resource_below
  resource_above
  has_buff
  has_debuff
  no_buff
  no_debuff
}

enum ResourceType {
  hp
  stamina
  mana
}

model CombatTemplate {
  id        String   @id @default(uuid())
  playerId  String   @map("player_id")
  name      String   @db.VarChar(64)
  isActive  Boolean  @default(false) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  slots  CombatTemplateSlot[]

  @@index([playerId, isActive])
  @@map("combat_templates")
}

model CombatTemplateSlot {
  id             String         @id @default(uuid())
  templateId     String         @map("template_id")
  sortOrder      Int            @map("sort_order")
  actionId       String         @map("action_id")

  conditionType  ConditionType? @map("condition_type")
  resource       ResourceType?
  threshold      Int?
  effectName     String?        @map("effect_name")
  thenActionId   String?        @map("then_action_id")

  template CombatTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@index([templateId, sortOrder])
  @@map("combat_template_slots")
}
```

**Step 2: Create migration with data migration**

Run: `npx prisma migrate dev --name conditional_template_slots --create-only`

This creates the migration SQL file. Edit the generated SQL to add data migration logic that:
1. Creates the new table and enums
2. Reads existing `actions` JSON from each `combat_templates` row
3. Inserts corresponding `combat_template_slots` rows (one per JSON array element, `sort_order` = array index, no condition)
4. Drops the `actions` column

The data migration SQL should look like:

```sql
-- CreateEnum
CREATE TYPE "ConditionType" AS ENUM ('resource_below', 'resource_above', 'has_buff', 'has_debuff', 'no_buff', 'no_debuff');
CREATE TYPE "ResourceType" AS ENUM ('hp', 'stamina', 'mana');

-- CreateTable
CREATE TABLE "combat_template_slots" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "action_id" TEXT NOT NULL,
    "condition_type" "ConditionType",
    "resource" "ResourceType",
    "threshold" INTEGER,
    "effect_name" TEXT,
    "then_action_id" TEXT,

    CONSTRAINT "combat_template_slots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "combat_template_slots_template_id_sort_order_idx" ON "combat_template_slots"("template_id", "sort_order");
ALTER TABLE "combat_template_slots" ADD CONSTRAINT "combat_template_slots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "combat_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate data: convert JSON actions to relational slots
INSERT INTO "combat_template_slots" ("id", "template_id", "sort_order", "action_id")
SELECT
    gen_random_uuid(),
    ct.id,
    (elem.ordinality - 1),
    elem.value->>'actionId'
FROM "combat_templates" ct,
LATERAL jsonb_array_elements(ct.actions::jsonb) WITH ORDINALITY AS elem(value, ordinality);

-- Drop old column
ALTER TABLE "combat_templates" DROP COLUMN "actions";
```

**Step 3: Run migration**

Run: `npx prisma migrate dev`
Expected: Migration applied successfully

**Step 4: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma client generated

**Step 5: Rebuild database package**

Run: `npm run build --workspace=packages/database`

**Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add combat_template_slots table, migrate JSON actions to relational"
```

---

### Task 3: Update Seed Script

**Files:**
- Modify: `packages/database/prisma/seed.ts` (find where templates are seeded)

**Step 1: Check if seed creates templates**

Search for `combatTemplate` in the seed file. If templates are seeded, update the seed to use `slots: { create: [...] }` nested writes instead of `actions: [...]`.

If no templates are seeded (likely — templates are player-created), skip this task.

**Step 2: Verify seed runs**

Run: `npm run db:seed`
Expected: Seed completes without errors

**Step 3: Commit if changed**

```bash
git add packages/database/prisma/seed.ts
git commit -m "fix(db): update seed for relational template slots"
```

---

### Task 4: Condition Evaluator (Game Engine)

**Files:**
- Create: `packages/game-engine/src/combat/conditionEvaluator.ts`
- Create: `packages/game-engine/src/combat/conditionEvaluator.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import type { ActiveEffect, CombatActor } from '@adventure/shared';
import type { SlotCondition } from '@adventure/shared';
import { evaluateCondition } from './conditionEvaluator';

const actor: CombatActor = 'combatantA';

function makeEffects(...effects: Partial<ActiveEffect>[]): ActiveEffect[] {
  return effects.map(e => ({
    name: e.name ?? 'Unknown',
    target: e.target ?? actor,
    stat: e.stat ?? 'attack',
    modifier: e.modifier ?? 0,
    remainingRounds: e.remainingRounds ?? 1,
  }));
}

describe('evaluateCondition', () => {
  // --- No condition ---
  it('returns false when condition is undefined', () => {
    expect(evaluateCondition(undefined, 50, 100, 50, 100, 50, 100, [], actor)).toBe(false);
  });

  // --- Resource conditions ---
  it('resource_below: true when HP at 40% and threshold is 50', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'hp', threshold: 50 };
    expect(evaluateCondition(cond, 40, 100, 50, 100, 50, 100, [], actor)).toBe(true);
  });

  it('resource_below: false when HP at 60% and threshold is 50', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'hp', threshold: 50 };
    expect(evaluateCondition(cond, 60, 100, 50, 100, 50, 100, [], actor)).toBe(false);
  });

  it('resource_below: false when exactly at threshold (not strictly below)', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'hp', threshold: 50 };
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, [], actor)).toBe(false);
  });

  it('resource_above: true when Mana at 80% and threshold is 50', () => {
    const cond: SlotCondition = { type: 'resource_above', resource: 'mana', threshold: 50 };
    expect(evaluateCondition(cond, 50, 100, 50, 100, 80, 100, [], actor)).toBe(true);
  });

  it('resource_above: false when exactly at threshold', () => {
    const cond: SlotCondition = { type: 'resource_above', resource: 'mana', threshold: 50 };
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, [], actor)).toBe(false);
  });

  it('resource_below works for stamina', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'stamina', threshold: 30 };
    expect(evaluateCondition(cond, 50, 100, 20, 100, 50, 100, [], actor)).toBe(true);
  });

  // --- Buff/debuff conditions ---
  it('has_debuff: true when actor has named debuff', () => {
    const cond: SlotCondition = { type: 'has_debuff', effectName: 'Potion Sickness' };
    const effects = makeEffects({ name: 'Potion Sickness', target: actor });
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, effects, actor)).toBe(true);
  });

  it('has_debuff: false when debuff belongs to other combatant', () => {
    const cond: SlotCondition = { type: 'has_debuff', effectName: 'Potion Sickness' };
    const effects = makeEffects({ name: 'Potion Sickness', target: 'combatantB' });
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, effects, actor)).toBe(false);
  });

  it('has_buff: true when actor has named buff (positive modifier)', () => {
    const cond: SlotCondition = { type: 'has_buff', effectName: 'Battle Cry' };
    const effects = makeEffects({ name: 'Battle Cry', target: actor, modifier: 5 });
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, effects, actor)).toBe(true);
  });

  it('no_debuff: true when actor does NOT have the debuff', () => {
    const cond: SlotCondition = { type: 'no_debuff', effectName: 'Poison' };
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, [], actor)).toBe(true);
  });

  it('no_debuff: false when actor HAS the debuff', () => {
    const cond: SlotCondition = { type: 'no_debuff', effectName: 'Poison' };
    const effects = makeEffects({ name: 'Poison', target: actor });
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, effects, actor)).toBe(false);
  });

  it('no_buff: true when actor does NOT have the buff', () => {
    const cond: SlotCondition = { type: 'no_buff', effectName: 'Eagle Eye' };
    expect(evaluateCondition(cond, 50, 100, 50, 100, 50, 100, [], actor)).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/combat/conditionEvaluator.test.ts`
Expected: FAIL — module not found

**Step 3: Implement conditionEvaluator**

```typescript
import type { ActiveEffect, CombatActor } from '@adventure/shared';
import type { SlotCondition, ConditionResourceType } from '@adventure/shared';

function getResourcePercent(
  resource: ConditionResourceType,
  hp: number, maxHp: number,
  stamina: number, maxStamina: number,
  mana: number, maxMana: number,
): number {
  switch (resource) {
    case 'hp': return maxHp > 0 ? (hp / maxHp) * 100 : 0;
    case 'stamina': return maxStamina > 0 ? (stamina / maxStamina) * 100 : 0;
    case 'mana': return maxMana > 0 ? (mana / maxMana) * 100 : 0;
  }
}

export function evaluateCondition(
  condition: SlotCondition | undefined,
  hp: number, maxHp: number,
  stamina: number, maxStamina: number,
  mana: number, maxMana: number,
  activeEffects: ActiveEffect[],
  actorKey: CombatActor,
): boolean {
  if (!condition) return false;

  switch (condition.type) {
    case 'resource_below': {
      const pct = getResourcePercent(condition.resource!, hp, maxHp, stamina, maxStamina, mana, maxMana);
      return pct < condition.threshold!;
    }
    case 'resource_above': {
      const pct = getResourcePercent(condition.resource!, hp, maxHp, stamina, maxStamina, mana, maxMana);
      return pct > condition.threshold!;
    }
    case 'has_buff':
      return activeEffects.some(e => e.target === actorKey && e.name === condition.effectName && e.modifier > 0);
    case 'has_debuff':
      return activeEffects.some(e => e.target === actorKey && e.name === condition.effectName);
    case 'no_buff':
      return !activeEffects.some(e => e.target === actorKey && e.name === condition.effectName && e.modifier > 0);
    case 'no_debuff':
      return !activeEffects.some(e => e.target === actorKey && e.name === condition.effectName);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/combat/conditionEvaluator.test.ts`
Expected: All PASS

**Step 5: Export from game-engine index**

Add `export { evaluateCondition } from './combat/conditionEvaluator';` to `packages/game-engine/src/index.ts`.

**Step 6: Commit**

```bash
git add packages/game-engine/src/combat/conditionEvaluator.ts packages/game-engine/src/combat/conditionEvaluator.test.ts packages/game-engine/src/index.ts
git commit -m "feat(engine): add condition evaluator for template slots"
```

---

### Task 5: Update Action Resolver

**Files:**
- Modify: `packages/game-engine/src/combat/actionResolver.ts:1-63`
- Modify: `packages/game-engine/src/combat/actionResolver.test.ts`

**Step 1: Write failing tests for conditional resolution**

Add to the existing `actionResolver.test.ts`, within the `resolveAction` describe block. The new tests need the updated signature that accepts `CombatTemplateSlotData[]` instead of `CombatTemplateAction[]`:

```typescript
import type { CombatTemplateSlotData, SlotCondition, ActiveEffect, CombatActor } from '@adventure/shared';

function slotOf(actionId: string, condition?: SlotCondition, thenActionId?: string): CombatTemplateSlotData {
  return { id: 'slot-1', sortOrder: 0, actionId, condition, thenActionId };
}

function slotsOf(...actionIds: string[]): CombatTemplateSlotData[] {
  return actionIds.map((id, i) => ({ id: `slot-${i}`, sortOrder: i, actionId: id }));
}

// Tests for conditional slots:

it('uses thenActionId when condition is met', () => {
  const slots: CombatTemplateSlotData[] = [
    slotOf('normal_attack', { type: 'resource_below', resource: 'hp', threshold: 50 }, 'defend'),
  ];
  // HP 30/100 = 30% < 50% → condition true → defend
  const result = resolveAction(slots, 1, 30, 100, 100, 100, 100, 100, [], 'combatantA');
  expect(result.action.id).toBe('defend');
});

it('uses actionId (else) when condition is NOT met', () => {
  const slots: CombatTemplateSlotData[] = [
    slotOf('normal_attack', { type: 'resource_below', resource: 'hp', threshold: 50 }, 'defend'),
  ];
  // HP 80/100 = 80% → not below 50% → normal_attack
  const result = resolveAction(slots, 1, 80, 100, 100, 100, 100, 100, [], 'combatantA');
  expect(result.action.id).toBe('normal_attack');
});

it('unconditional slot (no condition) always uses actionId', () => {
  const slots = slotsOf('heavy_attack');
  const result = resolveAction(slots, 1, 100, 100, 100, 100, 100, 100, [], 'combatantA');
  expect(result.action.id).toBe('heavy_attack');
});

it('still falls back to Defend when conditional action is unaffordable', () => {
  const slots: CombatTemplateSlotData[] = [
    slotOf('normal_attack', { type: 'resource_below', resource: 'hp', threshold: 50 }, 'heavy_attack'),
  ];
  // HP 20% → condition true → heavy_attack but only 10 stamina (needs 40)
  const result = resolveAction(slots, 1, 20, 100, 10, 100, 100, 100, [], 'combatantA');
  expect(result.action.id).toBe('defend');
  expect(result.wasExhausted).toBe(true);
});
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run packages/game-engine/src/combat/actionResolver.test.ts`
Expected: FAIL — signature mismatch

**Step 3: Update `resolveAction` signature and implementation**

```typescript
import type { CombatTemplateSlotData, ActiveEffect, CombatActor, ActionDefinition } from '@adventure/shared';
import { BASE_ACTION_DEFINITIONS, COMBAT_ACTION_CONSTANTS } from '@adventure/shared';
import { evaluateCondition } from './conditionEvaluator';

export function resolveAction(
  slots: CombatTemplateSlotData[],
  roundNumber: number,
  currentHp: number,
  maxHp: number,
  currentStamina: number,
  maxStamina: number,
  currentMana: number,
  maxMana: number,
  activeEffects: ActiveEffect[],
  actorKey: CombatActor,
  actionDefinitions: Record<string, ActionDefinition> = BASE_ACTION_DEFINITIONS,
): ResolvedAction {
  const index = (roundNumber - 1) % slots.length;
  const slot = slots[index];

  const conditionMet = evaluateCondition(
    slot.condition, currentHp, maxHp, currentStamina, maxStamina, currentMana, maxMana, activeEffects, actorKey,
  );

  const actionId = conditionMet && slot.thenActionId ? slot.thenActionId : slot.actionId;
  const definition = actionDefinitions[actionId];

  if (!definition || !canAfford(definition, currentStamina, currentMana)) {
    return { action: DEFEND_FALLBACK, wasExhausted: true };
  }

  return { action: definition, wasExhausted: false };
}
```

**Step 4: Update ALL existing tests**

The old tests pass `CombatTemplateAction[]` and only `(template, round, stamina, mana)`. Update them to use the new signature. The `templateOf` helper becomes `slotsOf`:

```typescript
function slotsOf(...actionIds: string[]): CombatTemplateSlotData[] {
  return actionIds.map((id, i) => ({ id: `slot-${i}`, sortOrder: i, actionId: id }));
}
```

Each old `resolveAction(template, round, stamina, mana)` call becomes:
`resolveAction(slots, round, 100, 100, stamina, maxStamina, mana, maxMana, [], 'combatantA')`

Use HP 100/100 (healthy) for all old tests since they didn't test conditions. Use `maxStamina: 100`, `maxMana: 100` as reasonable defaults.

**Step 5: Run all tests to verify everything passes**

Run: `npx vitest run packages/game-engine/src/combat/actionResolver.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add packages/game-engine/src/combat/actionResolver.ts packages/game-engine/src/combat/actionResolver.test.ts
git commit -m "feat(engine): update action resolver for conditional template slots"
```

---

### Task 6: Update Template Combat Engine

**Files:**
- Modify: `packages/game-engine/src/combat/templateCombatEngine.ts`

The `TemplateCombatant.template` field type changes from `CombatTemplateAction[]` to `CombatTemplateSlotData[]`. The `resolveAction()` calls in the combat loop (~line 718-731) need updated arguments to pass HP, maxHP, activeEffects, and actorKey.

**Step 1: Update `TemplateCombatant` interface**

Change line 34 from:
```typescript
template: CombatTemplateAction[];
```
to:
```typescript
template: CombatTemplateSlotData[];
```

Update imports to include `CombatTemplateSlotData` instead of (or alongside) `CombatTemplateAction`.

**Step 2: Update `resolveAction` calls in the combat loop**

Around lines 718-731, change:

```typescript
const resolvedA = resolveAction(
  combatantA.template,
  state.round,
  getStamina(state, 'combatantA'),
  getMana(state, 'combatantA'),
  combatantA.actionDefinitions,
);
```

to:

```typescript
const resolvedA = resolveAction(
  combatantA.template,
  state.round,
  getHp(state, 'combatantA'),
  state.combatantAMaxHp,
  getStamina(state, 'combatantA'),
  state.combatantAMaxStamina,
  getMana(state, 'combatantA'),
  state.combatantAMaxMana,
  state.activeEffects,
  'combatantA',
  combatantA.actionDefinitions,
);
```

Same pattern for `resolvedB` with `'combatantB'`.

**Step 3: Run engine tests**

Run: `npm run test:engine`
Expected: All PASS (or fix any other tests that construct `TemplateCombatant` with the old shape)

**Step 4: Commit**

```bash
git add packages/game-engine/src/combat/templateCombatEngine.ts
git commit -m "feat(engine): pass combat state to action resolver for condition evaluation"
```

---

### Task 7: Update Mob Template Converter

**Files:**
- Modify: `packages/game-engine/src/combat/mobTemplateConverter.ts`

Mob templates still use simple `CombatTemplateAction[]` internally but now need to return `CombatTemplateSlotData[]` for the `TemplateCombatant.template` field.

**Step 1: Update the `mobToTemplate` function**

The function that converts mob actions to a template array needs to return `CombatTemplateSlotData[]` instead of `CombatTemplateAction[]`. Each mob action gets a slot with no condition:

```typescript
function mobToTemplate(mob: MobTemplate, prefixSpells?: SpellAction[]): CombatTemplateSlotData[] {
  // ... existing logic to pick actionIds ...
  return actionIds.map((actionId, i) => ({
    id: `mob-slot-${i}`,
    sortOrder: i,
    actionId,
  }));
}
```

**Step 2: Run engine tests**

Run: `npm run test:engine`
Expected: All PASS

**Step 3: Commit**

```bash
git add packages/game-engine/src/combat/mobTemplateConverter.ts
git commit -m "feat(engine): update mob template converter to use slot data"
```

---

### Task 8: Update Combat Template Service

**Files:**
- Modify: `apps/api/src/services/combatTemplateService.ts`
- Modify: `apps/api/src/services/combatTemplateService.test.ts`

**Step 1: Write failing tests**

Update `combatTemplateService.test.ts` to use slot-based data. Key changes:
- `makeRecord` returns `slots` array instead of `actions` JSON
- Test `createTemplate` creates template with nested `slots.create`
- Test `getActiveTemplate` returns `CombatTemplateSlotData[]`
- Test `validateTemplateSlots` validates both `actionId` and `thenActionId`
- Add test: conditional slot with invalid `thenActionId` throws

**Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/services/combatTemplateService.test.ts`
Expected: FAIL

**Step 3: Rewrite service**

Key changes to `combatTemplateService.ts`:

1. `toTemplateData()` — map `record.slots` to `CombatTemplateSlotData[]`
2. `createTemplate()` — accept `CombatTemplateSlotData[]` (without `id`), create with `slots: { create: slots.map(...) }`
3. `getActiveTemplate()` — return `CombatTemplateSlotData[]` via `include: { slots: { orderBy: { sortOrder: 'asc' } } }`
4. `getTemplates()` — same include
5. `updateTemplate()` — delete old slots + create new ones in a transaction
6. `validateTemplateActions()` → `validateTemplateSlots()` — check `actionId` AND `thenActionId` against available set; validate condition field consistency (resource conditions need resource+threshold, buff/debuff need effectName)

**Step 4: Run tests to verify pass**

Run: `npx vitest run apps/api/src/services/combatTemplateService.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/combatTemplateService.ts apps/api/src/services/combatTemplateService.test.ts
git commit -m "feat(api): rewrite template service for relational slots with conditions"
```

---

### Task 9: Update API Routes

**Files:**
- Modify: `apps/api/src/routes/templates.ts`

**Step 1: Update Zod schemas**

Replace `actionSchema` and `createSchema`/`updateSchema` with slot-based schemas:

```typescript
const conditionSchema = z.object({
  type: z.enum(['resource_below', 'resource_above', 'has_buff', 'has_debuff', 'no_buff', 'no_debuff']),
  resource: z.enum(['hp', 'stamina', 'mana']).optional(),
  threshold: z.number().int().min(0).max(100).optional(),
  effectName: z.string().min(1).optional(),
}).refine(data => {
  if (data.type === 'resource_below' || data.type === 'resource_above') {
    return data.resource !== undefined && data.threshold !== undefined;
  }
  if (['has_buff', 'has_debuff', 'no_buff', 'no_debuff'].includes(data.type)) {
    return data.effectName !== undefined;
  }
  return true;
}, { message: 'Invalid condition fields for the given type' });

const slotSchema = z.object({
  sortOrder: z.number().int().min(0),
  actionId: z.string().min(1),
  condition: conditionSchema.optional(),
  thenActionId: z.string().min(1).optional(),
}).refine(data => {
  if (data.condition && !data.thenActionId) return false;
  if (!data.condition && data.thenActionId) return false;
  return true;
}, { message: 'condition and thenActionId must both be present or both absent' });

const createSchema = z.object({
  name: z.string().min(1).max(64),
  slots: z.array(slotSchema).min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  slots: z.array(slotSchema).min(1).optional(),
});
```

**Step 2: Update route handlers**

- `POST /` — pass `body.slots` to `createTemplate`
- `PATCH /:id` — pass `body.slots` to `updateTemplate`
- `GET /active` — return `{ slots }` instead of `{ actions }`

**Step 3: Verify API starts and routes work**

Run: `npm run build:api && npm run dev:api` (smoke test manually or via curl)

**Step 4: Commit**

```bash
git add apps/api/src/routes/templates.ts
git commit -m "feat(api): update template routes for slot-based schema"
```

---

### Task 10: Update Combat Start Route

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts` (~lines 194-256)
- Modify: `apps/api/src/services/combatOrchestrationService.ts` (~lines 26-59)

**Step 1: Update `getActiveTemplate` return type usage**

`getActiveTemplate` now returns `CombatTemplateSlotData[]`. Update the combat start route where it assigns `playerTemplate` and passes it to `buildPlayerTemplateCombatant`.

**Step 2: Update `buildPlayerTemplateCombatant`**

In `combatOrchestrationService.ts`, change the `template` param type from `CombatTemplateAction[]` to `CombatTemplateSlotData[]`.

**Step 3: Verify build**

Run: `npm run build:api`
Expected: No TS errors

**Step 4: Commit**

```bash
git add apps/api/src/routes/combat/start.ts apps/api/src/services/combatOrchestrationService.ts
git commit -m "feat(api): wire conditional template slots into combat start"
```

---

### Task 11: Update Frontend API Layer

**Files:**
- Modify: `apps/web/src/lib/api/templates.ts`

**Step 1: Update types and functions**

```typescript
import type { CombatTemplateSlotData, CombatTemplateData } from '@adventure/shared';

export async function getTemplates() {
  return fetchApi<{ templates: CombatTemplateData[] }>('/api/v1/templates');
}

export async function getActiveTemplate() {
  return fetchApi<{ slots: CombatTemplateSlotData[] }>('/api/v1/templates/active');
}

export async function createTemplate(name: string, slots: Omit<CombatTemplateSlotData, 'id'>[]) {
  return fetchApi<CombatTemplateData>('/api/v1/templates', {
    method: 'POST',
    body: JSON.stringify({ name, slots }),
  });
}

export async function updateTemplate(id: string, name?: string, slots?: Omit<CombatTemplateSlotData, 'id'>[]) {
  return fetchApi<CombatTemplateData>(`/api/v1/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, slots }),
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/api/templates.ts
git commit -m "feat(web): update template API client for slot-based schema"
```

---

### Task 12: Update Frontend Template Editor

**Files:**
- Modify: `apps/web/src/components/screens/Templates.tsx`

This is the largest frontend change. The editor needs:

1. **State**: Replace `editorActions: CombatTemplateAction[]` with `editorSlots: EditorSlot[]` where `EditorSlot` includes optional condition fields.

2. **Per-slot condition toggle**: Each action slot in the editor gets an "Add condition" / "Remove condition" button.

3. **Condition editor UI**: When a slot has a condition:
   - Condition type dropdown: resource below, resource above, has buff, has debuff, no buff, no debuff
   - For resource conditions: resource picker (HP/Stamina/Mana) + threshold slider (0-100%)
   - For buff/debuff conditions: effect name text input (or dropdown of known effect names from action definitions)
   - "Then" action: opens the same action picker but stores result in `thenActionId`

4. **Display**: Slots with conditions show as:
   ```
   [1] If HP < 50% → Use HP Potion
       else → Heavy Attack
   [2] Normal Attack
   ```

5. **Resource sustainability**: Update the calculation to use worst-case cost per cycle (assume either branch fires, take the more expensive one).

6. **Save**: Map `editorSlots` to the API format when calling `createTemplate`/`updateTemplate`.

**Step 1: Implement the editor changes**

This is a substantial UI change. Follow existing patterns in the file:
- Use `PixelCard` for slot display
- Use `PixelButton` for actions
- Use the existing action picker (currently `showPicker` state) — extend it to know whether it's picking for "main action" or "then action"
- Use existing color variables (`--rpg-gold`, `--rpg-blue-light`, etc.)

**Step 2: Update list view**

The template list view shows `template.actions.length` — update to `template.slots.length`. Slot previews should show condition indicators.

**Step 3: Test in browser**

Run: `npm run dev`
Verify:
- Can create a template with unconditional slots (same as before)
- Can add a condition to a slot
- Can pick condition type, set threshold, pick then-action
- Can save and reload the template
- Active template works in combat

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Templates.tsx
git commit -m "feat(web): add conditional slot editor to template UI"
```

---

### Task 13: Fix All Remaining Type Errors

**Files:** Any files that still reference the old `CombatTemplateAction` in player contexts or the old `actions` field on `CombatTemplateData`.

**Step 1: Run full typecheck**

Run: `npm run typecheck`

**Step 2: Fix all errors**

Common fixes:
- Any file importing `CombatTemplateAction` for player templates → use `CombatTemplateSlotData`
- Any reference to `template.actions` → `template.slots`
- The `useGameController` hook likely references template data → update
- Combat log/playback may reference template shape → update

**Step 3: Run full test suite**

Run: `npm run test`
Expected: All PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve all type errors from template slot migration"
```

---

### Task 14: Final Integration Test

**Step 1: Start full dev stack**

Run: `npm run dev`

**Step 2: Manual testing checklist**

- [ ] Create a new template with 3 unconditional slots → saves correctly
- [ ] Add a condition to slot 1: "If HP < 50% → Use HP Potion, else → Heavy Attack"
- [ ] Add a condition to slot 2: "If has debuff 'Potion Sickness' → Defend, else → Normal Attack"
- [ ] Leave slot 3 unconditional: Normal Attack
- [ ] Save template, reload page — conditions persist
- [ ] Activate template, start combat
- [ ] Verify in combat log: when HP drops below 50%, the potion fires; otherwise heavy attack
- [ ] Verify potion sickness condition triggers defend on slot 2
- [ ] Edit template: remove condition from slot 1 → saves without condition
- [ ] Delete template → works
- [ ] Existing templates (if any from seed) load correctly as unconditional slots

**Step 3: Run full test suite one final time**

Run: `npm run test`
Expected: All PASS

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "test: verify conditional combat templates end-to-end"
```
