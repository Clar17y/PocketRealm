# Code Health Audit: `packages/game-engine/src/combat/templateCombatEngine.ts`

**Date:** 2026-03-15 16:41:29
**Auditor:** Automated Loop

## File Audited
`packages/game-engine/src/combat/templateCombatEngine.ts`

## Findings

### Type Safety
- [low] **`as 'hp' | 'stamina' | 'mana'` cast on `action.potionType` (line 705)** — The `potionType` field from `ActionDefinition` is narrowed with a fallback (`?? 'hp'`) then cast. The cast is needed because the source type is `string | undefined`, but the fallback ensures a valid value. — **Suggested fix:** Acceptable; or narrow the `ActionDefinition.potionType` field type to the literal union.

### Error Handling
No issues found. Pure function with injectable RNG. No async, no side effects.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 6 exports widely used across 18+ files:
- `TemplateCombatant` — mobTemplateConverter, combatOrchestrationService, pvpCombatantBuilder, sparService
- `TemplateCombatLogEntry` — combatOrchestrationService
- `TemplateCombatResult` — combat/start, exploration/start, zones, pvpService, trainingService
- `isStatDebuff`, `isMagicDot` — conditionEvaluator
- `runTemplateCombat` — combat/start, exploration/start, zones, pvpService, sparService, trainingService

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
