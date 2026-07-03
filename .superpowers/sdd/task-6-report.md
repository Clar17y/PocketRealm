Status: DONE

Commits:
- `feat: add craft stash and auto-forge controls`

Files Changed:
- apps/web/src/lib/api/items.ts
- apps/web/src/app/game/hooks/useCraftingActions.ts
- apps/web/src/app/game/renderers/professionScreenRenderers.tsx
- apps/web/src/components/screens/Crafting.tsx
- apps/web/src/components/screens/Crafting.test.tsx

Tests Run With Output Summary:
- `rtk npm run test -w apps/web -- --run src/components/screens/Crafting.test.tsx`
  - PASS: 1 test file, 6 tests passed, 0 failed

Self-Review Notes:
- Added `CraftRequestOptions` to the web craft client and forwarded destination plus craft-scoped auto-forge options in the request body.
- Extended crafting action handling to accept the new options and log backend auto-forge summaries without changing the manual forge flow.
- Passed `itemType` through the crafting renderer so the screen can gate auto-forge controls to eligible non-stackable weapon and armor recipes.
- Added destination and auto-forge controls, inventory-slot gating, cost preview text, and updated craft button labels/payloads in the Crafting screen.
- Drove the change from failing Crafting UI tests, then reran the focused Crafting suite to green.

Concerns:
- None.
