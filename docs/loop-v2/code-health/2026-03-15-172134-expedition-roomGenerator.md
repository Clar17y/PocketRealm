# Code Health Audit: `packages/game-engine/src/expedition/roomGenerator.ts`

**Date:** 2026-03-15 17:21:34
**Auditor:** Automated Loop

## File Audited
`packages/game-engine/src/expedition/roomGenerator.ts`

## Findings

### Type Safety
- [low] **4 `as BossTemplateAction[]` casts on theme action templates (lines 61, 116, 117, 119)** — `themeMob.actionTemplate`, `theme.finalBoss.phase1/phase2/phase3` are cast to `BossTemplateAction[]`. The source type in `ExpeditionTheme` may be broader. — **Suggested fix:** Tighten the `ExpeditionTheme` types to use `BossTemplateAction[]` directly.

### Error Handling
No issues found. Pure function. Throws on invalid tier (line 139).

### Dead Code
- [low] **`MobPoolEntry` interface is `@deprecated` and unused by any app code (line 16)** — Marked deprecated with comment "Use ExpeditionTheme roster instead. Kept for expeditionService compatibility." However, no file in `apps/` imports it — only re-exported from the game-engine barrel. — **Suggested fix:** Remove the deprecated interface.

### Unused Exports
No issues found. `generateExpeditionRooms` is used by `expeditionService`.

## Summary
2 findings: 0 critical, 0 high, 0 medium, 2 low
