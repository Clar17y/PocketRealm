# Code Health Audit: `apps/api/src/services/combatStatsService.ts`

**Date:** 2026-03-14 23:51:30
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/combatStatsService.ts`

## Findings

### Type Safety
- [low] **`as SkillType | null | undefined` cast on Prisma field (line 17)** — `mainHand?.item?.template?.requiredSkill as SkillType | null | undefined` narrows the Prisma-generated type (likely `string | null`) to the `SkillType` union. This is immediately validated by `attackSkillFromRequiredSkill` which does a proper runtime check (line 8), so the cast is technically redundant — the function already handles arbitrary string values safely. — **Suggested fix:** Remove the `as` cast and let `attackSkillFromRequiredSkill` accept `string | null | undefined` instead of `SkillType | null | undefined`, since it already validates at runtime.

### Error Handling
No issues found. Standard error propagation. Dynamic imports (lines 65-66) for circular dependency avoidance are a clean pattern.

### Dead Code
No issues found.

### Unused Exports
- [low] **`attackSkillFromRequiredSkill` exported but never imported (line 7)** — Only used internally on line 18. No other file imports it. — **Suggested fix:** Remove `export` keyword to make it file-private.

## Summary
2 findings: 0 critical, 0 high, 0 medium, 2 low
