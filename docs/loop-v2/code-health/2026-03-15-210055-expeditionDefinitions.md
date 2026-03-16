# Code Health Audit: `packages/shared/src/constants/expeditionDefinitions.ts`

**Date:** 2026-03-15 21:00:55
**Auditor:** Automated Loop

## File Audited
`packages/shared/src/constants/expeditionDefinitions.ts`

## Findings

### Type Safety
- [low] **Pervasive `as BossTemplateAction[]` casts on array literals (~40 occurrences)** — Every `actionTemplate` inline array in the theme definitions uses `as BossTemplateAction[]`. These are narrowing casts (not unsafe), but they are redundant since the object literals already satisfy `BossTemplateAction[]`. — **Suggested fix:** Remove the `as` casts; the `ExpeditionThemeMob` type annotation already enforces the correct shape.

### Error Handling
No issues found. Pure data constants and a single pure function — no async code, no side effects.

### Dead Code
- [medium] **6 generic mob action template constants are unused (lines 34–81)** — `TRASH_MOB_TEMPLATE`, `ELITE_MOB_TEMPLATE`, `MINI_BOSS_TEMPLATE`, `MINI_BOSS_ADD_TEMPLATE`, `FINAL_BOSS_PHASE1_TEMPLATE`, `FINAL_BOSS_PHASE2_TEMPLATE`, `FINAL_BOSS_PHASE3_TEMPLATE` are exported but never imported by any production code. The per-theme definitions in `EXPEDITION_THEMES` provide mob-specific action templates, making these generic fallbacks unused. — **Suggested fix:** Remove these constants if they are not intended as fallbacks for future themes.

### Unused Exports
- [low] **`getSetPieceCount` exported but never imported (line 598)** — Only defined here; never imported in `apps/` or `packages/game-engine/`. Referenced only in planning docs. — **Suggested fix:** Remove or implement the set bonus system that would consume it.

## Summary
3 findings: 0 critical, 0 high, 1 medium, 2 low
