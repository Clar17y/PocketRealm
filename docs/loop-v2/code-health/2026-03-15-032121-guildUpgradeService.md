# Code Health Audit: `apps/api/src/services/guildUpgradeService.ts`

**Date:** 2026-03-15 03:21:21
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/guildUpgradeService.ts`

## Findings

### Type Safety
- [high] **`tx: any` on transaction callback (line 74)** — The `$transaction` callback types the transaction client as `any`, disabling type checking on all DB operations inside (lines 76, 82, 89, 94, 105). — **Suggested fix:** Type as `Prisma.TransactionClient`.

- [medium] **`effectType as keyof PlayerGuildModifiers` casts (lines 268, 275, 294)** — `perk.effectType` and `bonus.effectType` are strings cast to `keyof PlayerGuildModifiers`. If an effect type doesn't match a modifier key (e.g., `'travel_cost_reduction'` vs `'travelCostReduction'`), the cast passes silently and `mods[key]` accesses `undefined` — then `+= value` produces `NaN`, corrupting the modifier. Line 269 has a `key in mods` guard, but line 275 casts from `Object.entries` which always matches. — **Suggested fix:** Add a validated set of valid keys or use a mapping from effectType strings to modifier keys.

### Error Handling
No issues found. Good TOCTOU prevention: treasury re-check and duplicate upgrade check both inside the transaction (lines 76-87). Comprehensive validation chain.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 5 exports are imported across routes and services (7 importers).

## Summary
2 findings: 0 critical, 1 high, 1 medium, 0 low
