#!/bin/bash
# Overnight autonomous refactor session
# Run from the main Adventure directory

claude -p "$(cat <<'PROMPT'
You are refactoring the Pocketrealm codebase to reduce file complexity. Work through ALL files below, one at a time.

## Setup
1. Run: ./scripts/setup-worktree.sh overnight-refactor --no-seed
2. cd into the worktree directory

## Files to refactor (in priority order)

### 1. apps/web/src/app/game/useGameController.ts (1,892 lines)
Split the god hook into domain-specific hooks. Extract: useCombat, useExploration, useInventory, useCrafting, useGuild, etc. useGameController should compose them. Preserve the existing public API so page.tsx doesn't need massive changes.

### 2. apps/api/src/services/expeditionService.ts (1,681 lines)
Extract sub-services by responsibility — expedition creation, expedition resolution, expedition rewards, expedition validation. Main service delegates to them.

### 3. apps/web/src/app/game/page.tsx (1,496 lines)
Extract screen-switching logic, header/nav, and any inline sub-components into separate files. The page should be a thin shell that composes components.

### 4. apps/web/src/components/guild/GuildExpeditionsTab.tsx (1,399 lines)
Extract sub-components: expedition list, expedition detail, expedition creation form, expedition rewards display, etc.

### 5. apps/api/src/services/encounterSiteCombatService.ts (1,320 lines)
Split by phase: encounter setup, combat resolution, reward distribution, cleanup. Extract helpers for repeated patterns.

### 6. packages/game-engine/src/combat/templateCombatEngine.ts (1,294 lines)
Extract condition evaluation, action resolution, and template parsing into separate modules. Keep the main engine as an orchestrator.

### 7. packages/game-engine/src/combat/raidRoundResolver.ts (1,275 lines)
Extract phase resolution (player turns, boss turns, hazard checks) into separate functions/modules.

### 8. apps/api/src/routes/exploration/start.ts (1,073 lines)
Extract validation, encounter generation, and response building into service layer. Route should be thin.

## Rules for EACH file
- Read the file fully before refactoring
- Preserve ALL existing behavior — this is pure refactoring, no feature changes
- Keep all exports/public APIs stable so other files don't break
- After refactoring each file, run: npm run typecheck && npm run test
- If typecheck or tests fail, fix before moving on
- Commit after each successful file refactor with a descriptive message
- If a file proves too tangled to safely split, document why in the commit message and move on

## When ALL files are done
1. Run a final: npm run typecheck && npm run test
2. Run /simplify on all changed files
3. Run /requesting-code-review
4. Push the branch and create a PR titled "refactor: split oversized files for maintainability"
5. Reference the file sizes before/after in the PR description
PROMPT
)" --allowedTools "Bash(*)" "Edit" "Write" "Read" "Glob" "Grep" "Agent" "Skill" "mcp__grepai__*" "mcp__context7__*" "mcp__sequential-thinking__*"
