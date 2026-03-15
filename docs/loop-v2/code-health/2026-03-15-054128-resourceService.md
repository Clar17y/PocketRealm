# Code Health Audit: `apps/api/src/services/resourceService.ts`

**Date:** 2026-03-15 05:41:28
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/resourceService.ts`

## Findings

### Type Safety
No issues found. Zero `as` casts, zero `any`. All return types explicit. Transaction clients use Prisma's inferred types. Well-defined `SkillLevels` interface. Exemplary type safety.

### Error Handling
No issues found. Proper `AppError` for validation, atomic rest operations in transactions with guild tax integration.

### Dead Code
No issues found.

### Unused Exports
- [low] **`CombatResourceState` interface exported but never imported (line 57)** — Only used within this file. — **Suggested fix:** Remove `export` keyword.

- [low] **`RestResourceResult` interface exported but never imported (line 138)** — Only used within this file as the return type of `restStamina`/`restMana`. — **Suggested fix:** Remove `export` keyword.

- [medium] **`setStamina` and `setMana` exported but never imported anywhere (lines 250, 264)** — These standalone resource setters are never called by any file (not even internally). All callers use `setAllResources` instead, which updates HP + stamina + mana in a single query. These are likely dead code from before `setAllResources` was introduced. — **Suggested fix:** Remove both functions if `setAllResources` has fully replaced them.

## Summary
3 findings: 0 critical, 0 high, 1 medium, 2 low
