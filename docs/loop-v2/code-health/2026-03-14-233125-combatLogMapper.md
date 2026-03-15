# Code Health Audit: `apps/api/src/services/combatLogMapper.ts`

**Date:** 2026-03-14 23:31:25
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/combatLogMapper.ts`

## Findings

### Type Safety
- [low] **`as T & MappedCombatFields` cast on early return (line 35)** — When no combatant actions are present, the original `entry` is returned cast as `T & MappedCombatFields`. This is technically correct because all `MappedCombatFields` properties are optional, but semantically misleading — the returned object doesn't actually have `actionName`, `staminaAfter`, etc. Callers could attempt to read these expecting defined values when they're absent. — **Suggested fix:** Return `{ ...entry }` (spread) for clarity, or document that optional fields are only present when `combatantAAction`/`combatantBAction` exist.

### Error Handling
No issues found. Pure synchronous function with no side effects.

### Dead Code
No issues found.

### Unused Exports
- [low] **`MappedCombatFields` interface exported but never imported (line 22)** — No other file imports this interface. Consumers infer the mapped type from `mapTemplateCombatLog`'s return type. — **Suggested fix:** Remove `export` keyword to keep it file-local.

## Summary
2 findings: 0 critical, 0 high, 0 medium, 2 low
