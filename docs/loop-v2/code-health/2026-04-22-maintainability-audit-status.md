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
- [x] Merge latest `origin/main` seasonal architecture work into `codex/maintainability-audit`
- [x] Preserve refactor seams for new admin season endpoints by extracting `apps/api/src/routes/admin/seasons.ts` and `apps/api/src/services/admin/seasonAdminService.ts`
- [x] Preserve refactor seams for the new admin seasons UI by extracting `apps/web/src/components/screens/admin/SeasonsTab.tsx`
- [x] Port account-role PvP changes from main into the split PvP modules
- [x] Fix post-merge web bootstrap request loop caused by unstable settings hydration callback
- [x] Fix action-level loot reveal regression for cache/pending loot inventory additions

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
- `npm run test -w @pocketrealm/api -- src/routes/admin.seasons.test.ts src/services/pvpService.test.ts`
- `npm run test -w @pocketrealm/web -- src/components/screens/AdminScreen.test.tsx src/app/game/GameScreenRenderer.test.ts`
- `npm run test -w @pocketrealm/web -- src/app/game/hooks/usePlayerSettings.test.ts src/app/game/useGameController.test.ts src/app/game/page.test.tsx`
- `npm run test -w @pocketrealm/web -- src/components/screens/Settings.test.ts src/app/game/GameScreenRenderer.test.ts`
- `npm run test -w @pocketrealm/web -- src/app/game/applyStateUpdates.test.ts src/app/game/useGameController.test.ts src/app/game/hooks/useGameBootstrap.test.ts src/app/game/page.test.tsx`
- `npm run build:web`
- `npm run test -w @pocketrealm/web`

## Current Focus

- Latest main merge is resolved.
- Post-merge web bootstrap request loop is fixed and pushed.
- Action-level inventory additions now feed loot reveal state; current follow-up is commit and push this regression fix.

## Next Queue

- `apps/api/src/routes/auth.ts`: new seasonal character/session endpoints make the route too broad; extract realm/session endpoints into route registrars backed by an auth/realm service.
- `apps/web/src/components/screens/Settings.tsx`: new realm switcher and season archive UI make the screen mixed; extract `RealmSwitcherPanel` and `SeasonArchivesPanel` before changing behavior.
- `apps/api/src/services/leaderboardService.ts`: seasonal scoping added repeated refresh and read paths; extract board refresh registration/error handling and realm-aware Redis read helpers.
- `apps/api/src/services/seasonMergeService.ts`: large but coherent workflow; split after coverage review into player transfer, archive creation, leaderboard snapshot, and merge orchestration modules.
- `apps/api/src/services/seasonBootstrapService.ts`: large clone pipeline; split clone data builders by entity type if future season template work changes it often.
- `packages/shared/src/constants/npcDialogue.ts`: large primarily because of authored dialogue content; optional future split by town/vendor if content churn rises, but no behavior-bearing structural problem remains
- `packages/shared/src/constants/gameConstants.ts`: intentionally centralized by project rule; keep in place
- `packages/shared/src/constants/achievementDefinitions.ts`: static definition payload; no current maintainability win from splitting
- `packages/shared/src/constants/talentTreeDefinitions.ts`: static definition payload; no current maintainability win from splitting
- `apps/api/src/constants/commonPasswords.ts`: static payload, low structural risk
- `packages/database/prisma/seed-data/flavorText.ts`: seed content, low structural risk
