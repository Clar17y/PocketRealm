# Code Health Audit: `packages/shared/src/constants/combatActionDefinitions.ts`

**Date:** 2026-03-15 20:38:45
**Auditor:** Automated Loop

## File Audited
`packages/shared/src/constants/combatActionDefinitions.ts`

## Findings

### Type Safety
No issues found. No `as` casts, no `any`. All action definitions strongly typed as `ActionDefinition`. Constants referenced from `COMBAT_ACTION_CONSTANTS`.

### Error Handling
No issues found. Pure data constants and a single pure lookup function — no async code, no side effects.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 3 exports used in production code:
- `ALWAYS_AVAILABLE_ACTION_IDS` — combatOrchestrationService, combatTemplateService, expeditionService, skillPointService, web wiki/Templates
- `BASE_ACTION_DEFINITIONS` — combatTemplateService, CombatLogEntry, Templates component, plus game-engine tests
- `getActionDefinition` — combatLogMapper

## Summary
0 findings: 0 critical, 0 high, 0 medium, 0 low
