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

---

Status: DONE

Commits:
- `b302bf2d` - `fix: align craft auto-forge feedback`

Files Changed:
- apps/web/src/app/game/hooks/useCraftingActions.ts
- apps/web/src/app/game/hooks/useCraftingActions.test.ts
- apps/web/src/components/screens/Crafting.tsx
- apps/web/src/components/screens/Crafting.test.tsx

Tests Run With Output Summary:
- `rtk npm run test -w apps/web -- --run src/components/screens/Crafting.test.tsx`
  - PASS: 1 test file, 8 tests passed, 0 failed
- `rtk npm run test -w apps/web -- --run src/app/game/hooks/useCraftingActions.test.ts`
  - PASS: 1 test file, 1 test passed, 0 failed

Self-Review Notes:
- Replaced ad hoc auto-forge target string building with a dedicated label helper so `Rare+` and `Epic+` keep threshold wording while `Legendary` stays literal.
- Surfaced backend-reported `autoForge.actualForgeTurnCost` in the crafting activity log and included it in the tracked craft turn spend.
- Added focused regressions for the legendary label, stash bypass while encumbered/full, and actual auto-forge charge logging plus analytics.

Concerns:
- None.
