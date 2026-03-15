# Code Health Audit: `apps/api/src/services/questShopService.ts`

**Date:** 2026-03-15 05:21:29
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/questShopService.ts`

## Findings

### Type Safety
- [critical] **`prisma as any` casts disable all type checking (lines 24, 81)** — The entire Prisma client is cast to `any` at the top of both exported functions. Every subsequent DB operation — `shopItem`, `playerQuestState`, `playerShopPurchase`, `playerBuff` — loses all type checking. This is the **highest density of `any` in any service audited** (30+ `any` usages across the file). Models accessed include `shopItem`, `playerBuff`, `playerShopPurchase`, `skillPointAllocation`, `craftingRecipe`, `playerRecipe`, `playerBestiaryPrefix`, and more — all completely untyped. — **Suggested fix:** Run `prisma generate` to add missing models to the client. If models are present, remove the `as any` cast. This single fix would restore type safety across ~30 operations.

- [high] **`tx: any` on all 12 helper functions (lines 88, 156, 193, 203, 216, 242, 251, 269, 310, 343, 391, 417)** — Every `applyEffect`, `applyBuff`, `applyAttributeReset`, `applyTalentReset`, `applyEfficiencyReset`, `applyTeleport`, `applyHearthstone`, `applyBestiaryTome`, `applyRecipeScroll`, `applyContractReroll`, and `applyPrestigeTitle` function takes `tx: any`. All DB operations inside are completely untyped. — **Suggested fix:** Type as `Prisma.TransactionClient`.

- [high] **`item: any` parameters propagate untyped shop item data (lines 156, 203)** — `applyEffect` and `applyBuff` accept `item: any`, meaning accesses to `item.key`, `item.buffType`, `item.buffValue`, `item.buffUses` have zero compile-time validation. — **Suggested fix:** Define a `ShopItem` interface matching the DB schema and use it throughout.

### Error Handling
No issues found. Comprehensive validation: token balance, weekly/lifetime limits, buff stacking prevention, travel restrictions, expedition lockout. All checks inside the transaction for TOCTOU safety.

### Dead Code
No issues found.

### Unused Exports
No issues found. Both exports imported by the shop route.

## Summary
3 findings: 1 critical, 2 high, 0 medium, 0 low
