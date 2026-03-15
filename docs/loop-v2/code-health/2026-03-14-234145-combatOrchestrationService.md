# Code Health Audit: `apps/api/src/services/combatOrchestrationService.ts`

**Date:** 2026-03-14 23:41:45
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/combatOrchestrationService.ts`

## Findings

### Type Safety
- [medium] **Double cast `as unknown as Prisma.InputJsonValue` (line 347)** — The return value of `buildCombatLogResult` is cast through `unknown` to `Prisma.InputJsonValue`. The entire object is built from a mix of typed and `unknown[]` fields, so the double-cast hides any structural mismatch. — **Suggested fix:** Type the individual fields properly or use `JSON.parse(JSON.stringify(obj))` which Prisma accepts for JSON columns.

- [medium] **`unknown[]` used for 6 fields in `CombatLogResultParams` (lines 315-326)** — `log`, `potionsConsumed`, `loot`, `durabilityLost`, `skillXpGrants`, and `eventModifiers` are all typed `unknown[]`. This provides zero compile-time safety for callers constructing these objects. Any value passes. — **Suggested fix:** Define specific types for each (e.g., `log: CombatLogEntry[]`, `loot: LootDrop[]`), or at minimum use the existing shared types.

- [medium] **`as Parameters<typeof mapTemplateCombatLog>[0]` cast on `unknown[]` (line 343)** — The `log` field is `unknown[]` in the interface, then cast to the specific parameter type of `mapTemplateCombatLog`. If the runtime shape doesn't match, the mapper would silently produce wrong output. — **Suggested fix:** Type `log` properly in the interface to match the expected shape.

- [low] **`guildXpBoost || undefined` converts `0` to `undefined` (line 256)** — Uses `||` instead of `??`. If `guildXpBoost` is `0`, it becomes `undefined`, which may cause `grantSkillXp` to skip the boost entirely rather than applying a 0% boost. In practice, 0 boost is equivalent, but the intent is unclear. — **Suggested fix:** Use `guildXpBoost ?? undefined` to only convert nullish values.

### Error Handling
No issues found. The sequential reward processing in `processCombatVictoryRewards` follows the project pattern where errors propagate to callers. The function's steps are logically dependent (XP depends on kill success), making error isolation unnecessary.

### Dead Code
No issues found.

### Unused Exports
- [low] **6 exported symbols never imported in production code:**
  - `PlayerCombatPrep` (interface, line 36) — consumers use structural typing or `Awaited<ReturnType<...>>`
  - `PreparePlayerCombatOptions` (interface, line 52)
  - `VictoryRewardParams` (interface, line 182)
  - `VictoryRewardResult` (interface, line 198)
  - `CombatLogResultParams` (interface, line 304)
  - `splitAndGrantXp` (function, line 248) — only called internally by `processCombatVictoryRewards`

  **Suggested fix:** Remove `export` from all 6. For `splitAndGrantXp`, making it file-private also hides an implementation detail.

## Summary
5 findings: 0 critical, 0 high, 3 medium, 2 low
