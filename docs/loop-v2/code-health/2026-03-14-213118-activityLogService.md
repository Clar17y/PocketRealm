# Code Health Audit: `apps/api/src/services/activityLogService.ts`

**Date:** 2026-03-14 21:31:18
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/activityLogService.ts`

## Findings

### Type Safety
- [medium] **`as Prisma.InputJsonValue` cast on line 15** — The `result` parameter is typed `unknown` (line 8), then cast with `as Prisma.InputJsonValue` when passed to Prisma. This bypasses compile-time checking; a caller could pass a value that isn't valid JSON (e.g., a `BigInt`, `undefined` nested in an object, or circular reference) and the cast would hide it until runtime. — **Suggested fix:** Type the parameter as `Prisma.InputJsonValue` directly instead of `unknown`, so callers get compile-time validation: `result: Prisma.InputJsonValue`.

- [medium] **`activityType: string` is overly broad (line 6)** — Across 11+ call sites, the values form a known set: `'admin_action'`, `'achievement'`, `'combat'`, `'crafting'`, `'forge_upgrade'`, `'forge_reroll'`, `'salvage'`, `'salvage_batch'`, `'rest'`, `'recovery'`, `'exploration'`, plus dynamic values like `skillRequired` variables and template literals (`rest_${body.type}`). The loose `string` type means typos in activity type strings won't be caught at compile time. — **Suggested fix:** Define a union type or enum in `packages/shared` (e.g., `type ActivityType = 'admin_action' | 'achievement' | 'combat' | ...`) and use it here. For the dynamic cases, use template literal types or `string & {}` as a fallback.

### Error Handling
- [low] **No try/catch around Prisma call (line 10-17)** — The function directly returns the Prisma promise without error handling. If the DB is unreachable or a FK constraint fails (e.g., invalid `playerId`), the error propagates as-is to the caller. This is acceptable if all callers wrap it in try/catch, which appears to be the case (callers are route handlers with error middleware). However, the raw Prisma error will leak implementation details if it reaches the client. — **Suggested fix:** This is acceptable by convention (service functions throw, route handlers catch), but consider wrapping with a domain-specific error if activity logging failures should be non-fatal (i.e., swallow and log rather than fail the parent operation).

### Dead Code
No issues found.

### Unused Exports
No issues found. `createActivityLog` is imported in 11 files across routes and services.

## Summary
3 findings: 0 critical, 0 high, 2 medium, 1 low
