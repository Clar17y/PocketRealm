# Code Health Audit: `packages/game-engine/src/combat/raidRoundResolver.ts`

**Date:** 2026-03-15 16:31:34
**Auditor:** Automated Loop

## File Audited
`packages/game-engine/src/combat/raidRoundResolver.ts`

## Findings

### Type Safety
- [low] **`as Record<string, ActionDefinition>` cast on participant action definitions (line 239)** — `input.participants[0]?.actionDefinitions` is cast from `Record<string, unknown>` (inherited from `CombatParticipantInput`) to `Record<string, ActionDefinition>`. Same root cause as combatHelpers.ts where `actionDefinitions` is typed as `Record<string, unknown>`. — **Suggested fix:** Fix the type in `CombatParticipantInput` (see combatHelpers audit).

### Error Handling
No issues found. Pure function with injectable RNG (`RaidRoundRng`). No async, no side effects.

### Dead Code
No issues found.

### Unused Exports
No issues found. Both exports used in production:
- `RaidRoundRng` — expeditionService (tests)
- `resolveRaidRound` — expeditionService

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
