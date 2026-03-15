# Code Health Audit: `apps/api/src/services/dropRollingService.ts`

**Date:** 2026-03-15 00:21:31
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/dropRollingService.ts`

## Findings

### Type Safety
- [high] **`(tx as any)` casts bypass transaction client typing (lines 76, 86)** — Two `(tx as any).item.findMany(...)` and `(tx as any).itemTemplate.findMany(...)` calls cast the properly typed `Prisma.TransactionClient` to `any`, disabling type checking on queries. Results are then cast with `as Array<{...}>` (lines 79, 89). Same systemic pattern seen across multiple services. — **Suggested fix:** Use `tx` directly — if `item` and `itemTemplate` aren't on the generated client, run `prisma generate`.

- [medium] **`as any` on item create data (line 135)** — `tx.item.create({ data: {...} as any })` bypasses Prisma type validation on the create payload. Optional fields like `maxDurability`/`currentDurability` could have wrong types without compile-time detection. — **Suggested fix:** Remove `as any` and address any type errors from Prisma's expected shape.

- [low] **Index signature `[key: string]: unknown` on `DropTableEntry.itemTemplate` (line 27)** — The index signature makes the interface accept any property access without error, weakening type checking. For example, `picked.itemTemplate.nonExistent` would compile silently and return `unknown`. — **Suggested fix:** Remove the index signature and enumerate the properties actually accessed (`itemType`, `stackable`, `maxDurability`).

### Error Handling
No issues found. Operations run within the caller-provided transaction. `pickWeighted` returning null is properly handled (line 95).

### Dead Code
No issues found.

### Unused Exports
- [low] **`decimalLikeToNumber` exported but never imported in production code (line 9)** — Only used internally (line 94) and by the test file. — **Suggested fix:** Remove `export` keyword.

- [low] **`createLootAccumulator` exported but never imported in production code (line 31)** — Only used internally (line 67) and by the test file. — **Suggested fix:** Remove `export` keyword.

## Summary
5 findings: 0 critical, 1 high, 1 medium, 3 low
