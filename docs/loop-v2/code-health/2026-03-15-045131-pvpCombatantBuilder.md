# Code Health Audit: `apps/api/src/services/pvpCombatantBuilder.ts`

**Date:** 2026-03-15 04:51:31
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/pvpCombatantBuilder.ts`

## Findings

### Type Safety
- [low] **`requiredSkill as string | null` cast (line 25)** — Prisma's `requiredSkill` field is cast to `string | null` without using the validated `attackSkillFromRequiredSkill` helper from `combatStatsService` (which does runtime validation). The subsequent `if` checks on lines 26-28 handle the narrowing manually. — **Suggested fix:** Use `attackSkillFromRequiredSkill(reqSkill)` for consistency with `combatStatsService`.

- [low] **`'evasion' as SkillType` cast (line 58)** — Cast of a known-valid string literal to `SkillType`. This is safe since `'evasion'` is a valid member of the union, but the cast suggests a type inference gap. The other `getSkillLevel` calls on lines 56-57, 59 don't need this cast because their string literals (`'melee'`, `'ranged'`, `'magic'`) match directly. — **Suggested fix:** Check if `'evasion'` is missing from `SkillType`; if it's present, the cast is unnecessary and can be removed.

### Error Handling
No issues found. Good use of `findUniqueOrThrow` (line 43) and parallel query execution.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 3 exports are imported in production code:
- `AttackStyle` — pvpService
- `getAttackStyle` — pvpService
- `buildPvpCombatant` — pvpService, sparService

## Summary
2 findings: 0 critical, 0 high, 0 medium, 2 low
