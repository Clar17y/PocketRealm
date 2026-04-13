# AGENTS.md

Codex project guide for Pocketrealm. Keep this file concise and operational; use `CLAUDE.md` for the longer historical guide and reference index.

## Project Snapshot

- Pocketrealm is a turn-based async RPG with real-time turn regeneration.
- Stack: Next.js 16 + Express 4 + PostgreSQL 16/Prisma 6 + Redis 7 + Socket.IO.
- Auth is custom JWT. Validation uses Zod. Tests use Vitest and Playwright.

## Environment

- Primary shell is Windows PowerShell 7. Prefer `pwsh`/PowerShell-compatible commands and examples.
- This repository runs on Windows in local Codex sessions unless the current environment explicitly says otherwise.
- Ports: web `3002`, API `4000`, PostgreSQL `5433`, Redis `6379`.

## Worktrees

- All feature work must happen in git worktrees. Do not work directly in the main clone.
- Prefer the PowerShell lifecycle scripts for local Codex sessions:

```powershell
.\scripts\setup-worktree.ps1 feature-branch-name
.\scripts\setup-worktree.ps1 feature-branch-name -NoSeed
.\scripts\teardown-worktree.ps1 feature-branch-name
.\scripts\teardown-worktree.ps1 feature-branch-name -KeepBranch
.\scripts\teardown-worktree.ps1 feature-branch-name -Yes
```

- The `.sh` scripts are for Git Bash/Unix environments.
- Each worktree gets its own PostgreSQL database named `pocketrealm_<branch_name>`.

## Commands

Prefer existing workspace scripts over ad hoc command variants.

```powershell
npm install
npm run dev
npm run dev:web
npm run dev:api
npm run build
npm run build:api
npm run build:web
npm run db:generate
npm run db:migrate
npm run db:seed
npm run typecheck
npm run lint
npm run test
npm run test:engine
npm run test:api
npm run test:e2e
npm run clean
```

## Working Rules

- Prefer focused verification first, then broader verification only as needed.
- When a task changes code, invoke the global `$simplify` skill before final handoff; review only the touched diff, apply worthwhile simplifications, then run focused verification again.
- Use `apply_patch` for manual file edits. Do not write files with `cat`, `echo`, heredocs, or shell redirection.
- Keep changes scoped. Do not revert user changes or unrelated worktree changes.
- Strict TypeScript: avoid `any`; preserve type safety across package boundaries.
- Put business logic and DB access in `apps/api/src/services/`; route handlers in `apps/api/src/routes/` should orchestrate request/response and delegate to services.
- Keep `packages/game-engine` pure and side-effect free.
- Keep tunable gameplay values in `packages/shared/src/constants/gameConstants.ts`.
- Validate API boundaries with Zod and use Prisma transactions for multi-step DB operations.
- Extract repeated UI or logic into existing common components/utilities when it reduces real duplication.

## File Naming

- Components: `PascalCase.tsx`
- Utilities: `camelCase.ts`
- Types: `camelCase.types.ts`
- Constants: `camelCase.constants.ts`
- Tests: `*.test.ts`, colocated where practical

## Code Search

- Use `rg`/`rg --files` for exact text and current-worktree files.
- Use grepai for architecture-level semantic exploration when available, but remember it indexes the main branch only; verify current worktree contents with local file reads/searches.

## Reference Docs

Read on demand:

- `docs/reference/project-structure.md`
- `docs/reference/api-routes.md`
- `docs/reference/database-schema.md`
- `docs/reference/feature-routing.md`
- `docs/reference/testing.md`
- `docs/business-rules.md`
