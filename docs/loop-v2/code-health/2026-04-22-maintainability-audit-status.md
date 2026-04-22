# Maintainability Audit Status

Repository-wide maintainability audit focused on oversized files, mixed responsibilities, and safe refactor seams.

## Context

- Worktree: `D:\Code\Adventure\.worktrees\pocketrealm-codex_maintainability_audit`
- Branch: `codex/maintainability-audit`
- Started: `2026-04-22`

## Progress

Legend: `[ ]` pending | `[~]` in progress | `[x]` completed

- [x] Set up isolated worktree with the repo PowerShell workflow
- [x] Inventory largest non-test `.ts` and `.tsx` files under `apps/` and `packages/`
- [x] Audit hotspot files and classify structural issues vs data-heavy files
- [x] Produce ranked refactor candidates and phased execution plan
- [x] Implement first low-risk batch: split `apps/web/src/components/screens/AdminScreen.tsx` into bounded tab modules
- [x] Inventory subphase A: extract batch-mode orchestration from `apps/web/src/components/screens/Inventory.tsx`
- [x] Inventory subphase B: split backpack and stash rendering into bounded panels/modules
- [x] Inventory subphase C: extract the item detail modal into a reusable module
- [x] Game screen renderer split: move screen-specific rendering into bounded renderer modules
- [x] Game controller subphase A: extract polling and social-count hooks
- [x] Game controller subphase B: extract tutorial progression hook
- [x] Admin route split: move `apps/api/src/routes/admin.ts` to thin registrars backed by `apps/api/src/services/admin/*`
- [x] API service split A: decompose `apps/api/src/services/pvpService.ts` behind stable exports
- [x] API service split B: decompose `apps/api/src/services/bossEncounterService.ts` behind stable exports
- [x] API service split C: extract the ambush branch from `apps/api/src/services/explorationOutcomeService.ts`
- [x] Game-engine split A: move `packages/game-engine/src/combat/templateActions.ts` into bounded internal modules
- [x] Game-engine split B: extract raid outcome resolution phases from `packages/game-engine/src/combat/raidRoundResolver.ts`
- [x] Web screen split: decompose `apps/web/src/components/screens/Casino.tsx`
- [x] Game controller subphase C: extract bootstrap and loader orchestration from `apps/web/src/app/game/useGameController.ts`
- [x] Re-audit remaining oversized files and classify data-heavy or rule-constrained files for no-op disposition

## Completed Verification

- `npm run test:engine`
- `npm run test -w @pocketrealm/web -- src/components/screens/admin/useAdminAction.test.ts src/components/screens/AdminScreen.test.ts`
- `npm run test -w @pocketrealm/web -- src/components/screens/inventory/useInventoryBatchModes.test.ts src/components/screens/Inventory.test.ts`
- `npm run test -w @pocketrealm/web -- src/app/game/GameScreenRenderer.test.ts`
- `npm run test -w @pocketrealm/web -- src/app/game/hooks/useTutorialProgression.test.ts src/app/game/hooks/useGamePolling.test.ts src/app/game/hooks/useSocialCounts.test.ts src/app/game/useGameController.test.ts`
- `npm run test -w @pocketrealm/web`
- `npm run build:web`
- `npm run test -w @pocketrealm/api -- src/services/admin/adminAuditService.test.ts src/services/admin/playerAdminService.test.ts src/services/admin/eventAdminService.test.ts src/routes/admin.test.ts src/routes/admin.auth.test.ts`
- `npm run test -w @pocketrealm/api -- src/services/pvpService.test.ts`
- `npm run test -w @pocketrealm/api -- src/services/bossEncounterService.test.ts`
- `npm run test -w @pocketrealm/api -- src/routes/exploration/start.tracking.test.ts src/routes/exploration/start.tutorial.test.ts`
- `npm run test -w @pocketrealm/game-engine -- src/combat/templateCombatEngine.test.ts src/combat/actionResolver.test.ts src/combat/conditionEvaluator.test.ts`
- `npm run test -w @pocketrealm/game-engine -- src/combat/raidRoundResolver.test.ts`
- `npm run test -w @pocketrealm/web -- src/components/screens/casino/useRouletteRound.test.ts src/components/screens/Casino.test.ts`
- `npm run test -w @pocketrealm/web -- src/app/game/hooks/useGameBootstrap.test.ts src/app/game/useGameController.test.ts`
- `npm run build:api`
- `npm run build -w packages/game-engine`
- `npm run test -w @pocketrealm/web`
- `npm run build:web`

## Current Focus

- Audit execution complete; remaining large files are tracked with explicit disposition notes instead of open refactor work

## Next Queue

- `packages/shared/src/constants/npcDialogue.ts`: large primarily because of authored dialogue content; optional future split by town/vendor if content churn rises, but no behavior-bearing structural problem remains
- `packages/shared/src/constants/gameConstants.ts`: intentionally centralized by project rule; keep in place
- `packages/shared/src/constants/achievementDefinitions.ts`: static definition payload; no current maintainability win from splitting
- `packages/shared/src/constants/talentTreeDefinitions.ts`: static definition payload; no current maintainability win from splitting
- `apps/api/src/constants/commonPasswords.ts`: static payload, low structural risk
- `packages/database/prisma/seed-data/flavorText.ts`: seed content, low structural risk
