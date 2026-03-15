# Database Audit: expeditionBestiaryService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/expeditionBestiaryService.ts` (105 lines, 1 exported function)

## Prisma Models Touched

Direct: `PlayerExpeditionBestiary`

---

## Findings

### N+1 Queries
None — single query + in-memory processing with constant data.

### Missing Indexes
None — `PlayerExpeditionBestiary` has `@@id([playerId, mobTemplateId])` which covers `playerId` prefix.

### Payload Bloat

**1. `playerExpeditionBestiary.findMany` — no select (line 67)**
Fetches full rows (5 fields: playerId, mobTemplateId, killCount, theme, firstKilledAt). Uses 3: `mobTemplateId`, `killCount`, `theme`.

```ts
prisma.playerExpeditionBestiary.findMany({ where: { playerId } });
```

### Cache Issues
None. Player-initiated UI view.

### Migration Risks
None.

---

## Query Patterns

### `getExpeditionBestiary` — 1 query

| Query | Select | Index |
|-------|--------|-------|
| `playerExpeditionBestiary.findMany({ playerId })` | No select (full rows) | `@@id([playerId, mobTemplateId])` prefix |

Then in-memory join with `EXPEDITION_THEMES` constant data. Clean pattern.

---

## Suggested Fixes

Minor: add `select: { mobTemplateId: true, killCount: true, theme: true }`.
