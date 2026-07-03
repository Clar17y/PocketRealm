# Task 1 Report: Shared Contracts And Pure Auto-Forge Budget Helpers

## Scope Completed

- Added shared craft destination and auto-forge target contracts in `packages/shared/src/types/item.types.ts`.
- Added auto-forge tuning constants to `packages/shared/src/constants/gameConstants.ts`.
- Implemented pure budget helpers in `packages/game-engine/src/crafting/autoForgeBudget.ts`.
- Exported the helper module from `packages/game-engine/src/index.ts`.
- Added focused Vitest coverage in `packages/game-engine/src/crafting/autoForgeBudget.test.ts`.

## Behavior Implemented

- `CraftDestination` is now `inventory | stash`.
- `AutoForgeTarget` is now `rare | epic | legendary`.
- Auto-forge eligibility is restricted to non-stackable `weapon` and `armor` items.
- Minimum open slots are `3`, `4`, and `5` for `rare`, `epic`, and `legendary`.
- Max reserved forge cost uses conservative all-common cascade budgeting.
- Expected forge cost is computed as an advisory estimate from the same upgrade ladder.
- Craft max reserved base cost includes craft attempts plus optional auto-forge reserve.

## Verification

- Ran the focused failing test first and confirmed the expected missing-module failure.
- Reran the same focused test after implementation and cleanup.
- Result: `packages/game-engine/src/crafting/autoForgeBudget.test.ts` passed with 8/8 tests green.

## Commit

- `befc3fa` `feat: add craft auto-forge budget helpers`

## Notes

- No API or web behavior was changed in this task.
- Manual forge behavior remains untouched.
