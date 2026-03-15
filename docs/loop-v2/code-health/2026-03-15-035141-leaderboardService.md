# Code Health Audit: `apps/api/src/services/leaderboardService.ts`

**Date:** 2026-03-15 03:51:41
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/leaderboardService.ts`

## Findings

### Type Safety
No issues found. Zero `as` casts (except the valid `as const` on line 32), zero `any`. Prisma types flow naturally. Redis data is properly parsed with `JSON.parse` with fallback defaults. Raw SQL query on line 440 uses typed template literal. Clean.

### Error Handling
No issues found. Excellent patterns:
- Each leaderboard refresh is individually wrapped in try/catch (lines 481-486), ensuring one category's failure doesn't block others.
- Smart migration-aware catch in `refreshCombat` (lines 389-394) that specifically checks for P2021 (missing table) and re-throws other errors.
- `console.error` is used for logging; a structured logger would be preferable but this is a style issue, not a bug.

### Dead Code
No issues found.

### Unused Exports
- [low] **`LeaderboardEntry` interface exported but never imported (line 84)** — Only used within this file. The web app defines its own matching interface. — **Suggested fix:** Remove `export` keyword, or move to `@pocketrealm/shared` if both API and web should share the type.

- [low] **`LeaderboardResponse` interface exported but never imported (line 96)** — Same pattern. — **Suggested fix:** Same as above.

## Summary
2 findings: 0 critical, 0 high, 0 medium, 2 low
