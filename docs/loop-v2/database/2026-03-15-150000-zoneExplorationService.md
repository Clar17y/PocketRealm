# Database Audit: zoneExplorationService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/zoneExplorationService.ts` (73 lines, 3 exported functions)

## Prisma Models Touched

Direct: `PlayerZoneExploration`, `Zone`

---

## Findings

### N+1 Queries
None.

### Missing Indexes
None — uses `@@unique([playerId, zoneId])` on PlayerZoneExploration and PK on Zone.

### Payload Bloat
None — proper `select` on all queries.

### Cache Issues
None.

### Migration Risks
None.

---

## Query Patterns

### `getExplorationPercent` — 2 queries (parallel)
Good `select`, `Promise.all`. Clean.

### `addExplorationTurns` — 0–3 queries
Accepts pre-fetched `turnsToExplore` and `currentTurnsExplored` parameters — **good pattern** that avoids redundant queries when callers already have the data. Falls back to DB only when pre-fetched values aren't available.

---

## Suggested Fixes
None needed. Clean service with good patterns (pre-fetched data acceptance, parallel queries, proper select).
