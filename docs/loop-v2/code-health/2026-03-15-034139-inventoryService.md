# Code Health Audit: `apps/api/src/services/inventoryService.ts`

**Date:** 2026-03-15 03:41:39
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/inventoryService.ts`

## Findings

### Type Safety
- [medium] **`as any` on item create data (line 62)** — `client.item.create({ data: { ... } as any })` bypasses Prisma's type checking on the create payload. Fields like `maxDurability: null`, `currentDurability: null`, and `inStash` wouldn't be validated against the Prisma schema. — **Suggested fix:** Remove `as any` and fix any resulting type errors from optional fields.

- [low] **`slot.item.rarity as ItemRarity` cast (line 213)** — String to union cast without runtime validation. Standard pattern. — **Suggested fix:** Add runtime check or use a validated helper.

- [low] **`slot.item.bonusStats as Record<string, number> | null` JSON column cast (line 216)** — Followed by safe `?.inventorySlots ?? 0` access, so the risk is minimal. Similar to `equipmentService` pattern but without the full `typeof === 'number'` validation. — **Suggested fix:** Add `typeof bonus?.inventorySlots === 'number'` check for parity with `equipmentService`.

### Error Handling
No issues found. Good validation on quantities, template existence, stackable checks, and insufficient-items detection. Smart `InventoryClient` interface (lines 6-17) using Prisma type extraction for type-safe dual prisma/tx support.

### Dead Code
No issues found.

### Unused Exports
- [low] **`consumeItemsByTemplate` exported but never imported in production code (line 135)** — Only the Tx variant (`consumeItemsByTemplateTx`) is used by callers. — **Suggested fix:** Remove `export` or remove the function entirely if no route needs a standalone version.

- [low] **`getUsedSlots` exported but never imported externally (line 174)** — Only called internally by `getInventoryState` (line 155). — **Suggested fix:** Remove `export` keyword.

- [low] **`getPlayerCapacity` exported but never imported externally (line 200)** — Only called internally by `getInventoryState` (line 156). — **Suggested fix:** Remove `export` keyword.

## Summary
6 findings: 0 critical, 0 high, 1 medium, 5 low
