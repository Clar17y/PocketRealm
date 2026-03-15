# Code Health Audit: `apps/api/src/routes/exploration/start.ts`

**Date:** 2026-03-15 11:52:12
**Auditor:** Automated Loop

## File Audited
`apps/api/src/routes/exploration/start.ts`

## Findings

### Type Safety
- [critical] **`tx as unknown as any` double-cast in exploration transaction (line 796)** — The Prisma transaction client is double-cast to `any`, disabling type checking on all transaction operations that use `txAny`. Same systemic pattern as xpService, combat/start.ts. — **Suggested fix:** Run `prisma generate`; remove the cast if the needed models are available on the transaction client type.
- [high] **2 `as unknown as Record<string, unknown>` double-casts on mob templates for `toMobTemplate` (lines 260, 297)** — Prisma `MobTemplate` results are double-cast to pass into `toMobTemplate()`. Same issue as combat/start.ts and bestiary.ts — suggests `toMobTemplate` doesn't accept the Prisma type directly. — **Suggested fix:** Update `toMobTemplate` to accept the Prisma-inferred type.
- [low] **4 `pickWeighted` return casts (lines 294, 528, 563, 597)** — Each `pickWeighted(...)` call requires an `as Type | null` cast because the string-based `weightKey` wrapper in `exploration/helpers.ts` loses generic type information. — **Suggested fix:** Use `pickWeightedGeneric` with a callback directly instead of the string-key wrapper.
- [low] **`as unknown as Prisma.InputJsonValue` double cast for activity log result (line 952)** — Standard pattern for storing complex objects in JSON columns. — **Suggested fix:** Acceptable.

### Error Handling
No issues found. Handler wrapped in `asyncHandler`. Comprehensive validation: HP check, zone check, expedition lockout check, turn validation. Exploration refund on abort.

### Dead Code
No issues found.

### Unused Exports
No issues found. `startRouter` is imported by `apps/api/src/routes/exploration/index.ts`.

## Summary
4 findings: 1 critical, 1 high, 0 medium, 2 low
