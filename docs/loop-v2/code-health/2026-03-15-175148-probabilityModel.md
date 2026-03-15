# Code Health Audit: `packages/game-engine/src/exploration/probabilityModel.ts`

**Date:** 2026-03-15 17:51:48
**Auditor:** Automated Loop

## File Audited
`packages/game-engine/src/exploration/probabilityModel.ts`

## Findings

### Type Safety
No issues found. No `as` casts, no `any`. One non-null assertion on `zoneExitChance!` (line 103) is safely guarded by the `canDiscoverZoneExit` boolean check.

### Error Handling
No issues found. Pure functions with structured validation returns (`{ valid, error }`).

### Dead Code
No issues found.

### Unused Exports
- [low] **5 type exports never imported by name externally (lines 3, 11, 16, 33, 117)** — `ExplorationOutcomeType`, `ExplorationOutcome`, `ExplorationEstimate`, `cumulativeProbability`, and `TravelAmbushOutcome` are only referenced within the file + tests. External consumers infer the return types structurally. — **Suggested fix:** Remove `export` or keep for documentation/test convenience.

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
