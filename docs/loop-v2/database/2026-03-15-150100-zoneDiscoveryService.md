# Database Audit: zoneDiscoveryService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/zoneDiscoveryService.ts` (212 lines, 7 exported functions)

## Prisma Models Touched

Direct: `Zone`, `ZoneConnection`, `PlayerZoneDiscovery`, `Player`, `ResourceNode`, `PlayerResourceNode`, `EncounterSite`, `ZoneMobFamily`, `MobTemplate`

---

## Findings

### N+1 Queries
None — no loops with individual queries.

### Missing Indexes
No new issues. Uses `@@unique([playerId, zoneId])` on PlayerZoneDiscovery, `@@index([playerId])` on PlayerZoneExploration, PK on Zone.

### Payload Bloat

**1. `getStarterZoneId` — full Zone row for `id` only (line 163)**
```ts
prisma.zone.findFirst({ where: { isStarter: true } });
// Only uses: zone.id
```

### Cache Issues

**1. `getStarterZoneId` — static data queried on every respawn (line 163)**
The starter zone never changes. Could be cached globally or as a module-level variable.

### Migration Risks
None.

---

## Query Patterns

### `ensureStarterDiscoveries` — 3 queries
`findMany` (starter zones) + `findMany` (connections) + `createMany` with `skipDuplicates`. Clean.

### `ensureStarterEncounterAndNodes` — ~9 queries (one-time per player)
Sequential but only runs during player creation. Acceptable.

### `discoverZonesFromTown` / `discoverZone` — 1–2 queries
`createMany` with `skipDuplicates`. Clean.

### `getDiscoveredZoneIds` — 1 query with `select`. Clean.

### `getUndiscoveredNeighborZones` — 2 parallel queries. Clean.

---

## Suggested Fixes

1. Cache `getStarterZoneId` globally (static data)
2. Add `select: { id: true }` to `getStarterZoneId`
