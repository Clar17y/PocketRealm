# Code Health Audit: `packages/shared/src/constants/combatEffectNames.ts`

**Date:** 2026-03-15 20:49:50
**Auditor:** Automated Loop

## File Audited
`packages/shared/src/constants/combatEffectNames.ts`

## Findings

### Type Safety
No issues found. No `as` casts, no `any`. Clean types throughout.

### Error Handling
No issues found. Pure data extraction at module init — no async code, no side effects.

### Dead Code
No issues found.

### Unused Exports
- [low] **`KNOWN_EFFECTS` exported but no external consumers (line 47)** — Only used internally to derive `BUFF_EFFECTS` and `DEBUFF_EFFECTS`. Not imported in `apps/` or other packages. — **Suggested fix:** Remove the `export` keyword.
- [low] **`EffectNameOption` interface exported but never imported (line 4)** — Used only internally in this file. No imports in `apps/` or other packages. — **Suggested fix:** Remove the `export` keyword, or adopt it in consumer code for type-safe iteration over `BUFF_EFFECTS`/`DEBUFF_EFFECTS`.

## Summary
2 findings: 0 critical, 0 high, 0 medium, 2 low
