# Database Audit: persistedMobService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/persistedMobService.ts` (91 lines, 4 exported functions)

## Prisma Models Touched

Direct: `PersistedMob`

---

## Findings

### N+1 Queries
None.

### Missing Indexes

**1. `PersistedMob` — index `@@index([playerId, zoneId])` doesn't cover `mobTemplateId` (lines 34, 55)**
Both `persistMobHp` and `checkPersistedMobReencounter` filter by `{ playerId, mobTemplateId, zoneId }`. The existing index covers `(playerId, zoneId)` but `mobTemplateId` requires row-level scanning within the `(playerId, zoneId)` result set.

```ts
prisma.persistedMob.findFirst({
  where: { playerId, mobTemplateId, zoneId },
  // @@index([playerId, zoneId]) — mobTemplateId not in index
});
```

Should be `@@index([playerId, mobTemplateId, zoneId])` or better `@@unique([playerId, mobTemplateId, zoneId])` (since the upsert logic implies uniqueness).

**2. `cleanupFullyHealedMobs` — no index on `damagedAt` (line 86)**
```ts
prisma.persistedMob.deleteMany({ where: { damagedAt: { lte: cutoff } } });
```
Background cleanup scans the entire table. Low priority since it runs infrequently.

### Payload Bloat

**1. `persistMobHp` and `checkPersistedMobReencounter` — no `select` on `findFirst` (lines 34, 55)**
Fetch full rows. `persistMobHp` uses `id` only. `checkPersistedMobReencounter` uses `id`, `currentHp`, `maxHp`, `damagedAt` — 4/7 fields.

### Cache Issues
None.

### Migration Risks

**1. Missing unique constraint — manual upsert pattern (lines 34–47)**
`persistMobHp` does `findFirst` + `update`/`create` instead of `upsert`. This is because there's no `@@unique([playerId, mobTemplateId, zoneId])` constraint — only an index. A concurrent call could create duplicate rows. Should be `@@unique` with a proper `upsert`.

---

## Query Patterns

### `persistMobHp` — 2 queries
`findFirst` + `update` or `create`. Manual upsert.

### `checkPersistedMobReencounter` — 1–2 queries
`findFirst` + conditional `delete`.

### `cleanupFullyHealedMobs` — 1 query
`deleteMany` by `damagedAt`. Background task.

---

## Suggested Fixes

### Priority 1 — Add `@@unique([playerId, mobTemplateId, zoneId])` and use `upsert`

```prisma
model PersistedMob {
  @@unique([playerId, mobTemplateId, zoneId])
}
```

Then replace the manual findFirst + update/create with:
```ts
prisma.persistedMob.upsert({
  where: { playerId_mobTemplateId_zoneId: { playerId, mobTemplateId, zoneId } },
  create: { playerId, mobTemplateId, zoneId, currentHp, maxHp },
  update: { currentHp, maxHp, damagedAt: new Date() },
});
```

Reduces 2 queries to 1 and prevents duplicate rows.
