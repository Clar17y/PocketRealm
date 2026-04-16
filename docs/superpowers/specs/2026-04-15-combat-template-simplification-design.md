# Combat Template Simplification Design

Date: 2026-04-15
Issue: #271

## Summary

Simplify the combat template screen by hiding undiscovered skills from the template creator and reordering visible actions so the most common combat setup flow appears first. Players should discover locked actions through the skill tree, not through unusable options in the template editor.

## Problem

The template creator currently exposes locked talent actions in the action picker. That creates noise and suggests options the player cannot actually use. Utility actions and consumables also compete visually with the most common combat picks, which slows down routine template editing.

## Goals

- Remove undiscovered talent actions from all template picker surfaces.
- Keep always-available actions visible.
- Reorder visible actions so common combat picks are shown first.
- Push lower-frequency utility actions below the core combat choices.
- Keep the change scoped to the template creator UX.

## Non-Goals

- No combat engine changes.
- No API or persistence changes.
- No changes to how the skill tree presents unlockable actions.
- No advanced toggle for showing locked actions.
- No broad redesign of the template editor outside the picker behavior.

## Player Experience

When a player opens the combat template screen:

- Locked talent actions are not shown in the add-action picker.
- Locked talent actions are not shown when changing an existing slot action.
- Locked talent actions are not shown when picking a conditional `then` action.
- Players still see all always-available actions such as attacks, defend, counter, ward, and potion actions.

The picker should be organized into two presentation sections:

1. `Combat Core`
2. `Utility`

`Combat Core` should contain:

- Basic attacks
- Unlocked offensive talent actions
- `use_hp_potion`

`Utility` should contain:

- `defend`
- `counter`
- `ward`
- `use_stamina_potion`
- `use_mana_potion`

Within each section, ordering should be stable so the picker feels predictable between sessions and unlock states.

## Technical Approach

The change stays frontend-only in `apps/web/src/components/screens/Templates.tsx`.

Introduce a single filtered-and-ordered action source for the picker. That source should:

- Start from `BASE_ACTION_DEFINITIONS`
- Keep actions in `ALWAYS_AVAILABLE_ACTION_IDS`
- Keep talent actions only when their IDs are present in `unlockedActions`
- Exclude locked talent actions entirely instead of rendering them as disabled options

The picker UI should render from this single source for all picker modes:

- Add action
- Change slot action
- Change conditional `then` action

This avoids inconsistencies where one picker entry point hides an action but another still exposes it.

## Existing Template Handling

No migration is needed. Existing templates are left unchanged until edited. The backend already validates action availability on save, so this work does not need to duplicate server-side validation changes.

## Files Expected To Change

- `apps/web/src/components/screens/Templates.tsx`
- A focused web test file for the picker filtering and ordering logic, likely colocated with the template screen or extracted helper logic

## Testing Strategy

Add focused tests around the picker action list behavior:

- locked talent actions are excluded
- unlocked talent actions are included
- always-available actions remain included
- `use_hp_potion` appears in the `Combat Core` section
- utility actions sort after the core combat picks

Then run targeted verification for the touched web code.

## Risks And Guardrails

- If filtering logic is duplicated across picker entry points, the UI can drift. Use one shared source of truth.
- If ordering is inferred indirectly from current group names only, `use_hp_potion` may remain buried with utility actions. Give explicit ordering rules to the picker data.
- If tests target DOM details too aggressively, they will be brittle. Prefer testing filtered/ordered picker data where possible.

## Success Criteria

- Players do not see undiscovered skills anywhere in the template creator.
- The picker surfaces common combat actions before low-frequency utility actions.
- Existing template creation and editing flows continue to work without backend changes.
