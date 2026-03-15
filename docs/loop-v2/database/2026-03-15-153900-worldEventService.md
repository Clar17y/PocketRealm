# Database Audit: worldEventService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/worldEventService.ts`

## Prisma Models Touched
Direct: `WorldEvent`, `Zone`

## Findings
No issues. Clean CRUD for world events. Good `include: { zone: { select: { name } } }` pattern. `expireStaleEvents` uses `updateMany` for bulk expiration. `getActiveZoneModifiers` fetches active events for a zone — well-indexed with `WorldEvent(zoneId, status)` via `@@index`.

## Suggested Fixes
None needed. Clean service.
