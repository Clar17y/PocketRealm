# Code Health Audit: `apps/api/src/services/attributesService.ts`

**Date:** 2026-03-14 21:51:34
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/attributesService.ts`

## Findings

### Type Safety
- [critical] **Double cast `tx as unknown as any` on line 68** — The Prisma transaction client is cast through `unknown` to `any`, completely disabling type checking for all DB operations inside the transaction (lines 69, 90). Any typo in field names, wrong select shapes, or incorrect data types would be invisible to the compiler. This is the most dangerous pattern possible for type safety. — **Suggested fix:** Use the typed transaction client directly. Prisma's `$transaction` callback receives a properly typed `PrismaClient` (as `Prisma.TransactionClient`). If there's a typing issue with the transaction client, use `tx.player.findUnique(...)` directly — it should work without casting. If the issue is a Prisma version mismatch, add proper typing: `async (tx: Prisma.TransactionClient) => { ... }`.

- [medium] **`as Record<string, unknown>` cast on line 21** — After validating that `raw` is a non-null, non-array object, it's cast to `Record<string, unknown>` for property access. The validation makes this reasonably safe, but the cast bypasses structural type checks. — **Suggested fix:** Use a type guard function: `function isRecord(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }` and use it in the `if` check to narrow the type without an explicit cast.

- [low] **`Number()` coercion on `characterXp` (lines 50, 105)** — `player.characterXp` is coerced with `Number()`. If this is a `BigInt` column in Postgres (which Prisma returns as `bigint`), `Number()` loses precision for values > `Number.MAX_SAFE_INTEGER` (~9 quadrillion). For an XP field this is unlikely to be an issue in practice, but it's a latent precision risk. — **Suggested fix:** If the column is `BigInt`, use `Number(player.characterXp)` only if the range is guaranteed small, or switch to returning a string/BigInt on the API boundary.

### Error Handling
No issues found. Good use of `AppError` for validation, proper null checks, and transaction for atomicity.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 4 exports are imported in production code:
- `normalizePlayerAttributes` — hpService, pvpService, pvpCombatantBuilder, admin route
- `PlayerProgressionState` — combatOrchestrationService, trainingService, bossEncounterService, expeditionService, exploration/start, hp route
- `getPlayerProgressionState` — same importers as above
- `allocateAttributePoints` — player route (multi-line import on line 10)

## Summary
3 findings: 1 critical, 0 high, 1 medium, 1 low
