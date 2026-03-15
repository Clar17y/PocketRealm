# Database Audit: expeditionLockoutService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/expeditionLockoutService.ts` (17 lines, 1 exported function)

## Prisma Models Touched

Direct: `GuildExpeditionMember` (with joined filter on `GuildExpedition`)

---

## Findings

### N+1 Queries
None.

### Missing Indexes

**1. `GuildExpeditionMember` — no `@@index([playerId])` for lockout check**
The query filters by `playerId` with a joined filter on `expedition.status`. The `@@unique([expeditionId, playerId])` has `expeditionId` as the leading column — a `playerId`-only filter can't use it efficiently.

```ts
prisma.guildExpeditionMember.findFirst({
  where: { playerId, expedition: { status: 'in_progress' } },
  select: { expeditionId: true },
});
```

This is called as a gate check before combat, exploration, and other actions. Without a `playerId` index, Postgres scans the entire `guild_expedition_members` table.

### Payload Bloat
None — uses `select: { expeditionId: true }`. Clean.

### Cache Issues
No Redis. Called frequently as a gate check but data changes on expedition join/leave/completion. Short-TTL cache possible but low priority.

### Migration Risks
None.

---

## Query Patterns

### `checkExpeditionLockout` — 1 query

| Query | Select | Index |
|-------|--------|-------|
| `guildExpeditionMember.findFirst({ playerId, expedition: { status } })` | `{ expeditionId }` | **Missing playerId index** |

---

## Suggested Fixes

### Priority 1 — Add `@@index([playerId])` on GuildExpeditionMember

```prisma
model GuildExpeditionMember {
  @@index([playerId])
}
```

Enables efficient lockout check. The `@@unique([expeditionId, playerId])` only covers `expeditionId`-first queries.
