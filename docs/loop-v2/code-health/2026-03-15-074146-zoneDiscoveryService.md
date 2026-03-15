# Code Health Audit: `apps/api/src/services/zoneDiscoveryService.ts`

**Date:** 2026-03-15 07:41:46
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/zoneDiscoveryService.ts`

## Findings

### Type Safety
- [medium] **Untyped JSON column for `mobs` in `encounterSite.create` (line 118)** — `mobs: { mobs }` writes a hardcoded array (lines 105-107) with fields `slot`, `mobTemplateId`, `role`, `prefix`, `status`, `room` into a JSON column. No interface or schema validates this structure at compile time. If the expected mob JSON shape changes, this would silently produce invalid data. — **Suggested fix:** Define a `SiteMob` interface for the JSON structure and type the `mobs` array accordingly.
- [low] **Redundant explicit type annotations on `.map()` callbacks (12+ instances)** — Lines 12, 20, 26, 45, 71, 75, 133, 137, 154, 209, 210 all add explicit parameter types like `(z: { id: string })` to `.map()` callbacks where Prisma already infers the shape from the `select` clause. Not a type-safety weakness — just noise that makes the code harder to scan. — **Suggested fix:** Remove explicit parameter types and let Prisma's inference flow through.

### Error Handling
No issues found. Good graceful degradation pattern in setup functions: early returns on missing starter zones (line 10), missing wild zones (line 50), missing mob templates (line 103). `findUniqueOrThrow` used appropriately for player/town lookups in `respawnToHomeTown` (lines 170, 176). `skipDuplicates: true` on all `createMany` calls prevents duplicate-key errors.

### Dead Code
No issues found.

### Unused Exports
- [low] **`getStarterZoneId` exported but only consumed internally and by tests (line 162)** — Called internally by `respawnToHomeTown` (line 175) and imported by `zoneDiscoveryService.test.ts`, but no external production file imports it. — **Suggested fix:** Remove `export` keyword, or keep as test convenience.

## Summary
3 findings: 0 critical, 0 high, 1 medium, 2 low
