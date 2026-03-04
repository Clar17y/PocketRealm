# Conditional Combat Templates

## Summary

Add per-slot if/else conditions to combat templates. Each slot in the cyclic template can optionally branch based on the player's resource levels or active buff/debuff state. Replaces the `actions Json` column with a relational `CombatTemplateSlot` table.

## Current System

Templates store a JSON array of `CombatTemplateAction[]`. Each round, the engine picks `template[round % length]` and fires it. No branching — potions fire on their scheduled round regardless of need.

## Design

### Schema Changes

Drop `actions Json` from `CombatTemplate`. Add:

```prisma
model CombatTemplateSlot {
  id             String         @id @default(uuid())
  templateId     String         @map("template_id")
  sortOrder      Int            @map("sort_order")
  actionId       String         @map("action_id")       // default/else action

  conditionType  ConditionType? @map("condition_type")
  resource       ResourceType?                           // for resource conditions
  threshold      Int?                                    // percentage 0-100
  effectName     String?        @map("effect_name")      // for buff/debuff conditions
  thenActionId   String?        @map("then_action_id")   // action when condition is true

  template CombatTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@index([templateId, sortOrder])
  @@map("combat_template_slots")
}

enum ConditionType {
  resource_below   // resource < threshold%
  resource_above   // resource > threshold%
  has_buff         // player has named buff active
  has_debuff       // player has named debuff active
  no_buff          // player does NOT have named buff
  no_debuff        // player does NOT have named debuff
}

enum ResourceType {
  hp
  stamina
  mana
}
```

Update `CombatTemplate` to add `slots CombatTemplateSlot[]` relation and remove `actions Json`.

### Condition Constraints

- One condition per slot (no AND/OR)
- Strict if/else: condition true → `thenActionId`, false → `actionId`
- No condition (`conditionType` null) → fires `actionId` unconditionally (backwards compat behavior)
- `resource` + `threshold` required when `conditionType` is `resource_below` or `resource_above`
- `effectName` required when `conditionType` is `has_buff`, `has_debuff`, `no_buff`, or `no_debuff`
- `thenActionId` required whenever `conditionType` is set

### Type Changes

Replace `CombatTemplateAction` and `CombatTemplateData` in `combatAction.types.ts`:

```typescript
export interface CombatTemplateSlotData {
  id: string;
  sortOrder: number;
  actionId: string;                    // default/else action
  conditionType?: ConditionType;
  resource?: ResourceType;
  threshold?: number;
  effectName?: string;
  thenActionId?: string;               // action if condition true
}

export type ConditionType =
  | 'resource_below'
  | 'resource_above'
  | 'has_buff'
  | 'has_debuff'
  | 'no_buff'
  | 'no_debuff';

export type ResourceType = 'hp' | 'stamina' | 'mana';

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

### Engine Changes

**`actionResolver.ts`** — update `resolveAction()`:

```typescript
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
  actionDefinitions: Record<string, ActionDefinition>,
): ResolvedAction {
  const index = (roundNumber - 1) % slots.length;
  const slot = slots[index];

  const actionId = evaluateCondition(slot, currentHp, maxHp, currentStamina, maxStamina, currentMana, maxMana, activeEffects, actorKey)
    ? slot.thenActionId!
    : slot.actionId;

  const definition = actionDefinitions[actionId];

  if (!definition || !canAfford(definition, currentStamina, currentMana)) {
    return { action: DEFEND_FALLBACK, wasExhausted: true };
  }

  return { action: definition, wasExhausted: false };
}
```

New `evaluateCondition()` function:

```typescript
function evaluateCondition(
  slot: CombatTemplateSlotData,
  hp: number, maxHp: number,
  stamina: number, maxStamina: number,
  mana: number, maxMana: number,
  activeEffects: ActiveEffect[],
  actorKey: CombatActor,
): boolean {
  if (!slot.conditionType) return false;

  switch (slot.conditionType) {
    case 'resource_below':
    case 'resource_above': {
      const pct = getResourcePercent(slot.resource!, hp, maxHp, stamina, maxStamina, mana, maxMana);
      return slot.conditionType === 'resource_below'
        ? pct < slot.threshold!
        : pct > slot.threshold!;
    }
    case 'has_buff':
      return activeEffects.some(e => e.target === actorKey && e.name === slot.effectName && e.modifier > 0);
    case 'has_debuff':
      return activeEffects.some(e => e.target === actorKey && e.name === slot.effectName);
    case 'no_buff':
      return !activeEffects.some(e => e.target === actorKey && e.name === slot.effectName && e.modifier > 0);
    case 'no_debuff':
      return !activeEffects.some(e => e.target === actorKey && e.name === slot.effectName);
  }
}
```

### `TemplateCombatant` Changes

The `template` field changes from `CombatTemplateAction[]` to `CombatTemplateSlotData[]`. All call sites that construct `TemplateCombatant` need updating:

- `apps/api/src/routes/combat/start.ts` — builds combatant from DB template
- `templateCombatEngine.ts` — reads `combatant.template` during loop
- `actionResolver.ts` — receives slots instead of actions

The combat loop must also pass current HP/max HP, stamina, mana, and active effects into `resolveAction()` (currently only passes stamina and mana).

### Service Changes

**`combatTemplateService.ts`** — CRUD operations update:

- `createTemplate()` — creates template + slots in a transaction
- `updateTemplate()` — deletes existing slots, inserts new ones in transaction
- `getActiveTemplate()` — returns template with slots eagerly loaded (`include: { slots: { orderBy: { sortOrder: 'asc' } } }`)
- `validateTemplateActions()` → `validateTemplateSlots()` — validates both `actionId` and `thenActionId` against unlocked actions, validates condition field consistency

### API Changes

Template endpoints accept/return the new slot structure:

- `POST /api/v1/templates` — body includes `slots: CombatTemplateSlotData[]` instead of `actions`
- `PATCH /api/v1/templates/:id` — same
- `GET` responses return `slots` instead of `actions`

### Frontend Changes

**Template editor (`Templates.tsx`):**

- Each action slot gets an "Add condition" toggle button
- Toggling it reveals:
  - Condition type dropdown (resource below/above, has/no buff/debuff)
  - For resource: resource picker (HP/Stamina/Mana) + threshold slider (0-100%)
  - For buff/debuff: effect name dropdown (populated from known effect names in action definitions)
  - "Then" action picker (what happens when condition is true)
- The existing action in the slot becomes the "else" (default) action
- Slots without conditions display as they do today

**Resource sustainability calculation** needs updating to account for conditional branches (worst-case and best-case cost per cycle).

### Migration

Single migration that:
1. Creates `ConditionType` and `ResourceType` enums
2. Creates `combat_template_slots` table
3. Migrates existing JSON data: for each template, reads `actions` JSON and inserts corresponding slots with `sortOrder` matching array index, no conditions
4. Drops `actions` column from `combat_templates`

### Validation Rules

- Template must have at least 1 slot
- Both `actionId` and `thenActionId` (when present) must be in the player's available action set
- `conditionType` set → `thenActionId` required
- `resource_below` / `resource_above` → `resource` and `threshold` (0-100) required
- `has_buff` / `has_debuff` / `no_buff` / `no_debuff` → `effectName` required

## Files Affected

| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Add enums, `CombatTemplateSlot` model, update `CombatTemplate` |
| `packages/shared/src/types/combatAction.types.ts` | Replace `CombatTemplateAction`/`Data` with slot-based types |
| `packages/game-engine/src/combat/actionResolver.ts` | Add condition evaluation, update `resolveAction()` signature |
| `packages/game-engine/src/combat/templateCombatEngine.ts` | Pass combat state to `resolveAction()`, update `TemplateCombatant` |
| `apps/api/src/services/combatTemplateService.ts` | Relational CRUD for slots, updated validation |
| `apps/api/src/routes/templates.ts` | Updated request/response shapes |
| `apps/api/src/routes/combat/start.ts` | Build combatant with slots instead of actions |
| `apps/web/src/components/screens/Templates.tsx` | Condition UI per slot |
| `apps/web/src/lib/api/templates.ts` | Updated API types |
| Tests for actionResolver, templateCombatEngine, combatTemplateService | Updated for new signatures + condition logic |
