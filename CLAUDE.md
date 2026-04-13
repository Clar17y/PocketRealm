# Pocketrealm - Project Instructions

## Overview

Turn-based async RPG with real-time turn regeneration. Players explore, fight mobs, craft gear, join guilds, compete in PvP, tackle bosses, and progress skills.

**Tech Stack:** Next.js 16 (TS) PWA + Express 4 (TS) + PostgreSQL 16 (Prisma 6) + Redis 7 + Socket.IO. Auth: custom JWT. Validation: Zod. Testing: Vitest + Playwright.

## Git Workflow

**All work MUST be done in git worktrees.** Do not work directly in the main clone.

```bash
# Windows PowerShell 7 (preferred for local Codex sessions)
.\scripts\setup-worktree.ps1 feature-branch-name        # Create worktree + DB + deps
.\scripts\setup-worktree.ps1 feature-branch-name -NoSeed
.\scripts\teardown-worktree.ps1 feature-branch-name     # Remove worktree + drop DB + branch
.\scripts\teardown-worktree.ps1 feature-branch-name -KeepBranch
.\scripts\teardown-worktree.ps1 feature-branch-name -Yes # Non-interactive

# Git Bash / Unix
./scripts/setup-worktree.sh feature-branch-name
./scripts/setup-worktree.sh feature-branch-name --no-seed
./scripts/teardown-worktree.sh feature-branch-name
./scripts/teardown-worktree.sh feature-branch-name --keep-branch
./scripts/teardown-worktree.sh feature-branch-name -y
```

Each worktree gets its own PostgreSQL database (`pocketrealm_<branch_name>`).

## Commands

```bash
npm install                # Install all dependencies
npm run dev                # Start all services (web:3002, api:4000)
npm run dev:web / dev:api  # Start individual services
npm run build              # Build everything (packages → apps)
npm run build:api          # Build shared + game-engine + database + api
npm run build:web          # Build shared + web
npm run db:generate        # Generate Prisma client
npm run db:migrate         # Run migrations (dev)
npm run db:seed            # Seed database
npm run typecheck          # tsc -b (project references)
npm run lint               # ESLint
npm run test               # All tests
npm run test:engine        # Game engine tests
npm run test:api           # API tests
npm run test:e2e           # Playwright E2E
npm run clean              # Remove build artifacts
```

**Ports:** Web: 3002, API: 4000, PostgreSQL: 5433, Redis: 6379

## Coding Guidelines

1. **KISS** - Simplest solution that satisfies the requirement
2. **DRY** - Re-use existing utilities, hooks, components
3. **Type Safety** - Strict TypeScript, no `any`
4. **Pure Game Logic** - `game-engine` has no side effects, fully testable
5. **Service Layer** - `apps/api/src/services/` for all business logic and DB access
6. **Route Handlers** - `apps/api/src/routes/` orchestrate request/response, delegate to services
7. **Constants Central** - All tunable values in `packages/shared/src/constants/gameConstants.ts`
8. **Zod Validation** - Request validation at API boundaries
9. **Prisma Transactions** - Used for multi-step DB operations
10. **Extract Shared Patterns** - Proactively extract duplicated UI/logic into `components/common/` or utilities
11. **File Operations** - ALWAYS use Write tool for files, Edit tool for modifications. NEVER use cat/sed/awk/echo/heredocs.

## File Naming

- Components: `PascalCase.tsx` | Utilities: `camelCase.ts` | Types: `camelCase.types.ts` | Constants: `camelCase.constants.ts` | Tests: `*.test.ts` (colocated)

## grepai - Semantic Code Search

**Use grepai as PRIMARY tool for code exploration.**

grepai indexes **main branch only** — worktree changes won't appear. Use for architectural understanding, then Read/Grep/Glob for actual file contents.

```bash
grepai search "user authentication flow" --json --compact
grepai trace callers "HandleRequest" --json
grepai trace graph "ValidateToken" --depth 3 --json
```

Use Grep/Glob/Read for: exact text matching, file patterns, reading current worktree files. Fall back to standard tools if grepai is unavailable.

## Reference Docs (read on demand, not loaded at startup)

- **Project Structure:** `docs/reference/project-structure.md`
- **API Routes (~145 endpoints):** `docs/reference/api-routes.md`
- **Game Constants (43 groups):** `docs/reference/game-constants.md`
- **Database Schema (50 models):** `docs/reference/database-schema.md`
- **Design Decisions:** `docs/reference/design-decisions.md`
- **Feature Routing Table:** `docs/reference/feature-routing.md`
- **Testing Distribution:** `docs/reference/testing.md`
- **Deployment:** `docs/reference/deployment.md`
- **Business Rules:** `docs/business-rules.md`
- **Game Design:** `docs/superpowers/plans/2026-01-31-game-design.md`
- **Asset Workflow:** `docs/assets/stable-diffusion-workflow.md`
- **Color Palette:** `docs/assets/color-palette.md`
