# Template Editor UX Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the template editor for mobile-first UX with accordion slots, effect name picker, and touch-friendly sizing.

**Architecture:** Extract known combat effect names into a shared constant. Rewrite the Templates.tsx editor section to use accordion expand/collapse per slot, replace free-text effect input with a dropdown, add slot preview to list view, ensure all interactive elements hit 44px+ touch targets.

**Tech Stack:** React, TypeScript, Tailwind CSS, @adventure/shared constants

**Design doc:** `docs/plans/2026-03-04-template-editor-ux-design.md`

---

### Task 1: Extract Known Effect Names Constant

**Files:**
- Create: `packages/shared/src/constants/combatEffectNames.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create the constant file**

Extract all effect names from `BASE_ACTION_DEFINITIONS` in `combatActionDefinitions.ts` and add Potion Sickness. Group them by category for the UI dropdown.

```typescript
import { BASE_ACTION_DEFINITIONS } from './combatActionDefinitions';

export interface EffectNameOption {
  name: string;
  category: 'buff' | 'debuff' | 'status';
  description: string;
}

// Auto-extract from action definitions
function extractEffects(): EffectNameOption[] {
  const effects: EffectNameOption[] = [];
  const seen = new Set<string>();

  for (const def of Object.values(BASE_ACTION_DEFINITIONS)) {
    if (!def.effect || seen.has(def.effect.name)) continue;
    seen.add(def.effect.name);
    effects.push({
      name: def.effect.name,
      category: def.effect.isDebuff ? 'debuff' : 'buff',
      description: `${def.effect.stat} ${def.effect.modifier > 0 ? '+' : ''}${def.effect.modifier} for ${def.effect.duration} rounds`,
    });
  }

  // Potion Sickness is always available (applied by potion use, not an action definition)
  if (!seen.has('Potion Sickness')) {
    effects.push({
      name: 'Potion Sickness',
      category: 'status',
      description: 'Prevents potion use for 4 rounds',
    });
  }

  return effects.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export const KNOWN_EFFECTS: readonly EffectNameOption[] = extractEffects();
export const BUFF_EFFECTS = KNOWN_EFFECTS.filter(e => e.category === 'buff');
export const DEBUFF_EFFECTS = KNOWN_EFFECTS.filter(e => e.category === 'debuff' || e.category === 'status');
```

**Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './constants/combatEffectNames';
```

**Step 3: Build and verify**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

**Step 4: Commit**

```bash
git add packages/shared/src/constants/combatEffectNames.ts packages/shared/src/index.ts
git commit -m "feat(shared): extract known combat effect names constant"
```

---

### Task 2: Rewrite Template Editor — Accordion Slots

**Files:**
- Modify: `apps/web/src/components/screens/Templates.tsx`

This is the main task. Rewrite the editor section of the component.

**Step 1: Add expanded slot state**

Add state for tracking which slot is expanded:

```typescript
const [expandedSlot, setExpandedSlot] = useState<number | null>(null);
```

Tap a slot to toggle expand/collapse. Only one expanded at a time.

**Step 2: Replace the ConditionEditor component**

Rewrite the `ConditionEditor` to be the expanded panel content. Key changes:

- **Condition type:** Full-width `<select>` with `min-h-[44px]` for touch target
- **Threshold:** Full-width number input with `min-h-[44px]`
- **Effect name:** Replace `<input type="text">` with a `<select>` dropdown populated from `KNOWN_EFFECTS` (imported from `@adventure/shared`). Group by category using `<optgroup>`:
  ```html
  <select>
    <optgroup label="Buffs">
      <option value="Battle Cry">Battle Cry (attack +15)</option>
      <option value="Eagle Eye">Eagle Eye (accuracy +30)</option>
      ...
    </optgroup>
    <optgroup label="Debuffs & Status">
      <option value="Potion Sickness">Potion Sickness</option>
      <option value="Crippled">Crippled (speed -20)</option>
      ...
    </optgroup>
  </select>
  ```
- **Then/Else actions:** Show as tappable rows with action name + group badge. Tap opens the picker (existing picker navigation). Use `PixelButton` size `sm` for the "Change" buttons.
- **Remove condition:** `PixelButton` variant `danger` size `sm`, full-width at bottom of expanded panel.
- **Add condition:** `PixelButton` variant `secondary` size `sm`, full-width in expanded panel for unconditional slots.

**Step 3: Rewrite the slot rendering**

Each slot renders as:

**Collapsed view:**
```tsx
<div
  className="flex items-center gap-2 p-3 rounded-lg bg-[var(--rpg-background)] border border-[var(--rpg-border)] cursor-pointer active:bg-[var(--rpg-surface)]"
  onClick={() => setExpandedSlot(expandedSlot === i ? null : i)}
>
  <span className="text-xs font-mono text-[var(--rpg-text-secondary)] w-5 shrink-0 text-center">{i + 1}</span>
  <div className="flex-1 min-w-0">
    {/* One-line summary */}
    <span className="text-sm text-[var(--rpg-text-primary)] truncate block">
      {slot.condition
        ? `IF ${conditionSummary(slot.condition)} → ${thenDef?.name ?? '?'}, else ${elseDef?.name}`
        : def.name}
    </span>
  </div>
  {/* Move/delete buttons — stop propagation so they don't toggle expand */}
  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
    <button onClick={() => moveSlot(i, -1)} disabled={i === 0} className="p-2 min-w-[36px] min-h-[36px] ...">
      <ArrowUp size={16} />
    </button>
    <button onClick={() => moveSlot(i, 1)} disabled={i === editorSlots.length - 1} className="p-2 min-w-[36px] min-h-[36px] ...">
      <ArrowDown size={16} />
    </button>
    <button onClick={() => removeSlot(i)} className="p-2 min-w-[36px] min-h-[36px] text-[var(--rpg-red)] ...">
      <X size={16} />
    </button>
  </div>
</div>
```

**Expanded view** (when `expandedSlot === i`):

Same header row, then below it a divider and the editor panel. For unconditional:
```tsx
<div className="px-3 pb-3 space-y-3">
  <div className="border-t border-[var(--rpg-border)] pt-3">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{def.name}</span>
      {groupBadge(ACTION_GROUPS[def.id] ?? 'Basic')}
    </div>
    <ActionCostLabel cost={def.cost} />
  </div>
  <PixelButton size="sm" variant="secondary" className="w-full" onClick={() => setPickerTarget({ type: 'main-change', index: i })}>
    Change Action
  </PixelButton>
  <PixelButton size="sm" variant="secondary" className="w-full" onClick={() => toggleCondition(i)}>
    + Add Condition
  </PixelButton>
</div>
```

For conditional: the full condition editor with full-width form fields.

**Step 4: Add "change main action" picker target**

Extend `PickerTarget` to support changing the main `actionId` of an existing slot:

```typescript
type PickerTarget =
  | { type: 'add' }           // add new unconditional slot
  | { type: 'then'; index: number }  // pick thenActionId
  | { type: 'else'; index: number }  // change main actionId
  | null;
```

Update `addAction` handler to handle `'else'` by updating `actionId` on the slot at that index.

**Step 5: Update the picker header to show context**

When `pickerTarget` has an index, show what it's for:
- `'add'`: "Add Action"
- `'then'` with index: "Pick Then Action (Slot #N)"
- `'else'` with index: "Pick Else Action (Slot #N)"

**Step 6: Verify in browser**

Run: `npm run dev`
Test on mobile viewport (Chrome DevTools → toggle device toolbar → pick iPhone 12/14):
- Tap a slot → expands with editor
- Tap another → first collapses, second expands
- Add condition → shows condition editor with dropdowns
- Effect name is a dropdown with grouped options
- All buttons are thumb-sized
- Reorder/delete buttons work without expanding

**Step 7: Commit**

```bash
git add apps/web/src/components/screens/Templates.tsx
git commit -m "feat(web): redesign template editor with accordion slots and mobile UX"
```

---

### Task 3: List View Slot Preview

**Files:**
- Modify: `apps/web/src/components/screens/Templates.tsx`

**Step 1: Add preview generation**

Create a helper function that generates a one-line preview from a template's slots:

```typescript
function templatePreview(slots: CombatTemplateSlotData[]): string {
  return slots.map(s => {
    const def = BASE_ACTION_DEFINITIONS[s.actionId];
    const name = def?.name ?? s.actionId;
    if (s.condition && s.thenActionId) {
      const thenName = BASE_ACTION_DEFINITIONS[s.thenActionId]?.name ?? s.thenActionId;
      return `IF ${conditionSummary(s.condition)} → ${thenName}`;
    }
    return name;
  }).join(' → ');
}
```

**Step 2: Update the list view template cards**

Add the preview line below the template name, truncated with `truncate` class:

```tsx
<span className="text-xs text-[var(--rpg-text-secondary)] block truncate">
  {templatePreview(t.slots)}
</span>
```

Keep the existing "N slots" count below it.

**Step 3: Verify in browser**

Check that the preview renders correctly for:
- Templates with all unconditional slots: "Heavy Attack → Normal Attack → Defend"
- Templates with conditions: "Heavy Attack → IF HP<50% → Use HP Potion → Defend"
- Long previews truncate with ellipsis

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Templates.tsx
git commit -m "feat(web): add slot preview to template list view"
```

---

### Task 4: Final Typecheck and Test

**Step 1: Build shared package**

Run: `npm run build --workspace=packages/shared`

**Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: Clean (or only pre-existing errors)

**Step 3: Full test suite**

Run: `npm run test`
Expected: All pass

**Step 4: Commit any fixes**

If any issues found, fix and commit.
