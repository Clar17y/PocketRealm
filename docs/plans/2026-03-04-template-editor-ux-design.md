# Template Editor UX Redesign

## Summary

Redesign the combat template editor for mobile-first UX. Replace tiny links and free-text inputs with thumb-friendly accordion slots, full-width dropdowns, and an effect name picker.

## Current Problems

- Tiny "add condition" and "change" hyperlinks — not mobile friendly
- Effect name is a free-text field — error-prone, no discoverability
- Conditional slots are hard to read when collapsed
- No slot preview in template list view

## Design

### Slot Accordion

Each slot has two states:

**Collapsed (default):** Single row showing a summary. Tap to expand.
- Unconditional: `#1  Heavy Attack  [Melee]  [move/delete buttons]`
- Conditional: `#1  IF HP<50% → Potion, else Heavy Atk  [move/delete buttons]`

**Expanded (tap to open):** Full editor inside the card. Only one slot expanded at a time.

Unconditional expanded:
- Action name + group badge + stamina/mana cost
- `[Change Action]` button (full-width, opens picker)
- `[+ Add Condition]` button (full-width, prominent)

Conditional expanded:
- **Condition row:** Full-width select dropdown (HP below, Stamina above, Has debuff, etc.)
- **Value row:** Threshold slider/input (0-100%) for resource conditions, or effect name dropdown for buff/debuff conditions
- **Then row:** Action name pill + `[Change]` button
- **Else row:** Action name pill + `[Change]` button
- `[Remove Condition]` button at bottom

### Effect Name Picker

Replace free-text input with a grouped dropdown of known effects.

**Buffs (positive modifier):**
- Battle Cry (attack +15)
- Berserker Rage (attack +30)
- Eagle Eye (accuracy +30)
- Fortitude (defence +20)
- Fortified (defence +30)
- Regeneration (heal over time)

**Debuffs (self-applied):**
- Potion Sickness (always available, from potion use)

**Debuffs (applied to player by enemies):**
- Crippled (speed -20, from Crippling Shot)
- Sniper's Mark (defence -20)
- Death Mark (defence -40, DoT)
- Frozen (speed -20, from Frost Nova)
- Arcane Burn (magicDefence -15)
- Weakened (attack -5, from boss abilities)

Source: extract effect names from `BASE_ACTION_DEFINITIONS` and `BOSS_TEMPLATE_DEFINITIONS` at build time. Export as a constant list from shared package so it stays in sync with action definitions.

### Mobile-First Sizing

- All buttons and interactive elements: minimum 44px touch target
- Dropdowns: full-width on mobile, not inline tiny selects
- Buttons: pill-shaped with clear borders and hover/active states
- Move/delete buttons: sized for thumb tapping, not mouse precision
- Condition row elements stack vertically on narrow screens

### List View Enhancement

Each template card shows a slot preview line:

```
My Fighter Template    ★ Active
Heavy → Normal → IF HP<50% Potion
3 slots · Stamina sustainable
```

The preview line is generated from slots: unconditional slots show action name, conditional slots show abbreviated condition. Truncated with ellipsis if too long.

### Action Picker Improvements

The existing action picker (full-screen overlay) works well on mobile already. Keep it as-is but:
- When picking a "then" or "else" action for a conditional slot, show the context in the header: "Pick action for: Then (IF HP < 50%)"
- Keep the picker full-screen navigation (back arrow to return)

## Files Affected

| File | Change |
|------|--------|
| `packages/shared/src/constants/combatEffectNames.ts` | New: export known effect names grouped by category |
| `packages/shared/src/index.ts` | Export new constant |
| `apps/web/src/components/screens/Templates.tsx` | Rewrite editor with accordion slots, effect dropdown, mobile sizing |

## Non-Goals

- Drag-and-drop reordering (keep arrow buttons — simpler, works on mobile)
- Dark/light theme changes (follow existing theme variables)
- Changing the action picker screen (it already works well)
