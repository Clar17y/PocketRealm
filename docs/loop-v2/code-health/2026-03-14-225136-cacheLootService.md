# Code Health Audit: `apps/api/src/services/cacheLootService.ts`

**Date:** 2026-03-14 22:51:36
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/cacheLootService.ts`

## Findings

### Type Safety
- [critical] **Transaction client double-cast + 6 `as any` DB accesses (lines 101, 105, 122, 130, 164, 222, 236)** — The properly typed `Prisma.TransactionClient` is immediately cast away: `const txAny = tx as unknown as Record<string, unknown>`, then every DB operation re-casts it to `any`: `(txAny as any).resourceNode.findMany(...)`. This pattern appears 6 times, disabling all type checking on queries (field names, where clauses, select shapes). Each result is then cast with `as Array<{...}>` (lines 108, 125, 137-141, 167, 225, 242), creating a second layer of unverified type assumptions. If a DB schema change renames a field, none of these would produce a compile error. — **Suggested fix:** The `tx` parameter is already typed as `Prisma.TransactionClient`. Use it directly: `tx.resourceNode.findMany(...)`. If certain models aren't on the generated client, run `prisma generate`. Remove all `as Array<{...}>` result casts.

- [medium] **`as any` on item create data (line 68)** — `tx.item.create({ data: { ... } as any })` bypasses type checking on the `Item` create payload. Fields like `maxDurability` and `currentDurability` could be wrong types or missing required fields without compile-time detection. — **Suggested fix:** Remove `as any` and let Prisma's types validate the data shape. If optional fields cause issues, use conditional spreading.

- [low] **Non-null assertions on array access (lines 54, 176)** — `recipes[...]!` and `cutGemTemplateIds[...]!` after length checks. Safe in practice but `!` suppresses type safety. — **Suggested fix:** Use `?? recipes[0]` fallback pattern.

### Error Handling
No issues found. All operations run within a caller-provided transaction, so atomicity is handled externally. Errors propagate correctly.

### Dead Code
No issues found.

### Unused Exports
- [low] **`CacheMaterialDrop` interface exported but never imported in production code (line 7)** — Only imported by the test file. Consumers of `grantCacheLootTx` rely on structural typing. — **Suggested fix:** Remove `export` or import it in the consuming route for explicit type checking.

- [low] **`CacheLootResult` interface exported but never imported in production code (line 13)** — Same pattern — only the test file imports it. — **Suggested fix:** Same as above.

- [low] **`rollRarityWithLuck` function exported but never imported in production code (line 20)** — Only used internally (line 55) and by the test file. — **Suggested fix:** Remove `export` to make it file-private.

## Summary
6 findings: 1 critical, 0 high, 1 medium, 4 low
