# Code Health Audit: `apps/api/src/routes/crafting/helpers.ts`

**Date:** 2026-03-15 10:31:35
**Auditor:** Automated Loop

## File Audited
`apps/api/src/routes/crafting/helpers.ts`

## Findings

### Type Safety
- [high] **`(prisma as any).item.findUnique(...)` in `getValidatedSacrificialItem` (line 184)** — The entire Prisma client is cast to `any` to access the `item` model. The returned `sacrificial` variable is implicitly `any`, making all 8 downstream accesses untyped: `sacrificial.ownerId` (line 188), `sacrificial.quantity` (line 192), `sacrificial.rarity` (line 204), `sacrificial.id` (lines 225-228), `sacrificial.templateId` (lines 221, 227), `sacrificial.template.itemType` (line 213). A renamed column would silently return `undefined`. Same systemic Item model issue. — **Suggested fix:** If `prisma.item` is available (it should be — `item` is used elsewhere without cast), remove `as any`. If not, run `prisma generate`.

### Error Handling
No issues found. Comprehensive validation in `getValidatedSacrificialItem`: ownership check, stack check, equipped check, rarity match, item type match, template match. `parseMaterials` uses Zod for runtime validation of JSON material arrays.

### Dead Code
No issues found.

### Unused Exports
- [low] **`isItemRarity` exported but never imported externally (line 26)** — Only used internally by `parseItemRarity` (line 31). No other file imports it. — **Suggested fix:** Remove `export` keyword.
- [low] **`SacrificialItemMatch` interface exported but never imported externally (line 165)** — Used only as the return type of `getValidatedSacrificialItem`. Consumers infer the return type without importing the interface. — **Suggested fix:** Remove `export` keyword.

## Summary
3 findings: 0 critical, 1 high, 0 medium, 2 low
