# Database Audit: guildMembershipService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/guildMembershipService.ts` (303 lines, 9 exported functions)

## Prisma Models Touched

Direct: `Player`, `GuildMember`, `Guild`, `GuildJoinRequest`, `GuildLog`
Via sub-services: `GuildUpgrade`, `GuildProject`, `GuildContract` (via cascade delete on disband)

---

## Findings

### N+1 Queries

None. All functions use direct lookups — no loops with individual queries.

### Missing Indexes

No new issues. All queries use well-indexed paths:
- `GuildMember` via `@@unique(playerId)` and `@@id([guildId, playerId])`
- `GuildJoinRequest` via `@@unique([guildId, playerId])` and `@@index([guildId, status])`
- `Guild` and `Player` via PK

### Payload Bloat

**1. `requireRole` called 7 times across the service — each fetches full Guild row (transitive)**
Already flagged in guildService audit. Every management action (kick, promote, demote, transfer, disband, join requests) pays the cost of a full 15-column Guild fetch for a role check needing `role` + `guildId`.

**2. Existence checks without `select` (lines 17, 92, 116)**
Three `findUnique` calls fetch full rows just to check `!result`:

```ts
// joinGuild
const existing = await prisma.guildMember.findUnique({ where: { playerId } });
if (existing) throw ...

// requestJoinGuild
const existingMembership = await prisma.guildMember.findUnique({ where: { playerId } });
if (existingMembership) throw ...

// requestJoinGuild
const existing = await prisma.guildJoinRequest.findUnique({ where: { guildId_playerId } });
if (existing?.status === 'pending') throw ...
```

### Cache Issues

No Redis usage. All functions are player-initiated management actions — no hot-path cache needs.

### Migration Risks

**1. `guild.delete` cascade (line 301)**
`disbandGuild` calls `guild.delete` which cascade-deletes all related data: `GuildMember`, `GuildLog`, `GuildUpgrade`, `GuildProject`, `GuildContract`, `GuildJoinRequest`, `GuildExpedition`. This is intentional but is a heavy multi-table cascade on a single DELETE statement.

---

## Query Patterns

### `joinGuild` — 8–10 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `player.findUnique` with select | PK |
| 2 | `guildMember.findUnique({ playerId })` | Existence check — no select |
| 3 | `guild.findUnique({ id })` with _count | Capacity check |
| 4–5 | tx: `guildMember.create` + `guildLog.create` | |
| 6–8 | `addGuildXp` | 2–3 queries |
| 9 | `getGuild(guildId)` | Return value |

### `leaveGuild` — 3 queries
Clean. Good use of `select` on guild and player joins.

### `requestJoinGuild` — 6 queries
Two unnecessary full-row fetches for existence checks.

### `getJoinRequests` — 2 queries
Clean. Good player `select` on join. Well-indexed `@@index([guildId, status])`.

### `respondToJoinRequest` — 3–10 queries
Heaviest when accepting (guild capacity check + member creation + XP + achievements).

### Management functions (kick/promote/demote/transfer) — 4–6 queries each
All follow: `requireRole` + target lookup + tx (update + log).

### `disbandGuild` — 2 queries
`requireRole` + `guild.delete` (with cascade).

---

## Suggested Fixes

### Priority 1 — Slim `requireRole` (in guildService)

Already recommended in guildService audit. Would benefit all 7 callers in this service:

```ts
prisma.guildMember.findUnique({
  where: { playerId },
  select: { guildId: true, role: true },
});
```

### Priority 2 — Add `select` to existence checks

```ts
// Line 17, 92
const existing = await prisma.guildMember.findUnique({
  where: { playerId },
  select: { guildId: true },
});

// Line 116
const existing = await prisma.guildJoinRequest.findUnique({
  where: { guildId_playerId: { guildId, playerId } },
  select: { status: true },
});
```

### Priority 3 — Parallelize validation in `joinGuild`

Lines 14–24 run 3 sequential queries that are independent:

```ts
const [player, existing, guild] = await Promise.all([
  prisma.player.findUnique({ where: { id: playerId }, select: { id: true, characterLevel: true, username: true } }),
  prisma.guildMember.findUnique({ where: { playerId }, select: { guildId: true } }),
  prisma.guild.findUnique({ where: { id: guildId }, include: { _count: { select: { members: true } } } }),
]);
```

Reduces 3 sequential queries to 1 parallel batch.
