# Database Audit: bossBestiaryService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/bossBestiaryService.ts` (76 lines, 1 exported function)

## Prisma Models Touched

Direct: `MobTemplate`, `BossParticipant`, `BossEncounter` (via join)

---

## Findings

### N+1 Queries
None — 2 queries + in-memory processing.

### Missing Indexes

**1. `MobTemplate.isBoss` — no index (line 20)**
```ts
prisma.mobTemplate.findMany({ where: { isBoss: true }, select: { ... } });
```
Same issue as `isExpeditionMob`. Table scan for static data.

**2. `BossParticipant` — no `@@index([playerId])` (line 25)**
```ts
prisma.bossParticipant.findMany({ where: { playerId }, include: { encounter: { select } } });
```
Can't use `@@unique([encounterId, playerId, roundNumber])` for `playerId`-first filter.

### Payload Bloat

**1. `bossParticipant.findMany` — no select on main model (line 25)**
Fetches full 17-column rows. Only uses `encounterId` and joined `encounter.mobTemplateId`, `encounter.status`, `encounter.baseHp`.

### Cache Issues
**1. `mobTemplate.findMany({ isBoss: true })` — static game data**
Same as expedition mob templates. Could cache globally.

### Migration Risks
None.

---

## Query Patterns

### `getWorldBossBestiary` — 2 queries

| Query | Select | Index |
|-------|--------|-------|
| `mobTemplate.findMany({ isBoss: true })` | Good select | **No isBoss index** |
| `bossParticipant.findMany({ playerId })` with encounter join | No select on main | **No playerId index** |

---

## Suggested Fixes

1. Add `@@index([playerId])` on `BossParticipant`
2. Cache boss mob templates globally
3. Add `select` to `bossParticipant.findMany` (only needs `encounterId`)
