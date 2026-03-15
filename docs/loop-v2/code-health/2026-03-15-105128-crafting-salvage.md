# Code Health Audit: `apps/api/src/routes/crafting/salvage.ts`

**Date:** 2026-03-15 10:51:28
**Auditor:** Automated Loop

## File Audited
`apps/api/src/routes/crafting/salvage.ts`

## Findings

### Type Safety
- [high] **`item: any` in `SalvagePlan` type and 4 explicit `any` annotations in batch endpoint (lines 195, 200, 211, 220)** — The batch salvage endpoint (`/batch`) has pervasive `any` usage. The `SalvagePlan` type declares `item: any` (line 220), making all 6+ accesses to `plan.item.*` (lines 248, 270, 325-327, 337-338) completely untyped. Additionally, map/filter callbacks use explicit `: any` annotations (lines 195, 200, 211) despite `prisma.item.findMany` returning typed results. — **Suggested fix:** Type `item` in `SalvagePlan` using the Prisma inferred type from `findMany({ include: { template: true } })`. Remove `: any` annotations from callbacks.
- [medium] **`(item as any).isSoulbound` and `(item as any).inStash` in single salvage endpoint (lines 38, 41)** — `getOwnedItem` returns a typed object that doesn't include `isSoulbound` or `inStash` fields. Casting to `any` to access these fields bypasses type checking — if either field is renamed or removed, the check silently stops working. — **Suggested fix:** Update `getOwnedItem` to include these fields in its return type, or query them separately.
- [medium] **2x `data: { ... } as any` on `tx.item.create` (lines 117, 304)** — Systemic Item model issue: the data payload for item creation is cast to `any`, disabling validation on `ownerId`, `templateId`, `rarity`, `quantity`, `maxDurability`, `currentDurability`, `inStash`. — **Suggested fix:** Fix the Item model's optional field types so the cast isn't needed.

### Error Handling
No issues found. Optimistic locking on item deletion with count check (lines 76-78, 274-276). Transaction wraps turns + deletion + material minting atomically.

### Dead Code
No issues found.

### Unused Exports
No issues found. `salvageRouter` is imported by `apps/api/src/routes/crafting.ts`.

## Summary
3 findings: 0 critical, 1 high, 2 medium, 0 low
