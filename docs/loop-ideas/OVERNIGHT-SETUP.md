# Overnight Loop Setup

Paste this into a new Claude session started with `--dangerously-skip-permissions`:

---

Set up 4 overnight loops for me. The worktree at `D:/Code/Adventure/.worktrees/pocketrealm-overnight-test-gaps` already exists with its own DB and deps.

Create these folders if they don't exist: `docs/loop-ideas/`, `docs/loop-balance/`, `docs/loop-security/`

Then create these 4 recurring cron jobs (all `*/10 * * * *`):

## 1. Idea Generator → `docs/loop-ideas/`
Generate ONE unique creative idea for a NEW FEATURE, UX IMPROVEMENT, or ARCHITECTURAL ENHANCEMENT. No testing suggestions. Read existing ideas first to avoid duplicates. Explore a random area of the codebase for inspiration. Save as `YYYY-MM-DD-HHMMSS-short-title.md` with: Title, Category (feature/ux/architecture), Priority (low/medium/high), Description (2-4 sentences), Rough Scope (small/medium/large).

## 2. Test Gap Finder → worktree + `docs/loop-ideas/test-progress.md`
Find untested or under-tested code and write real passing tests. ALL work in the worktree at `D:/Code/Adventure/.worktrees/pocketrealm-overnight-test-gaps` — never modify main repo files except `docs/loop-ideas/test-progress.md` for tracking progress. Pick one service or engine file, read it, write/extend tests following existing patterns, run them with vitest, fix until passing, update progress log.

## 3. Balance Analyzer → `docs/loop-balance/`
Pick ONE constant group from `packages/shared/src/constants/gameConstants.ts`. Read existing analyses first to avoid repeats. Analyze the math — find degenerate strategies, breakpoints, scaling issues. Save as `YYYY-MM-DD-HHMMSS-constant-group-name.md` with: Constant Group, Current Values, Analysis, Recommendations (specific numbers), Risk Level.

## 4. Security Auditor → `docs/loop-security/`
Pick ONE API route or service. Read existing audits first to avoid repeats. Audit for: privilege escalation, input manipulation, race conditions, business logic abuse, data leakage. Trace full request flow from middleware → route → service → DB. Save as `YYYY-MM-DD-HHMMSS-area-audited.md` with: Area Audited, Findings, Severity, Exploit Scenario, Suggested Fix.
