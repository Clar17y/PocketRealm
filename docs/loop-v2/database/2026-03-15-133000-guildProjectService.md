# Database Audit: guildProjectService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/guildProjectService.ts` (442 lines, 5 exported functions)

## Prisma Models Touched

Direct: `GuildProject`, `GuildProjectContribution`, `Guild`, `GuildMember`, `GuildLog`, `ItemTemplate`
Via sub-services: `TurnBank` (via `spendPlayerTurnsTx`), `Item` (via `consumeItemsByTemplateTx`)

---

## Findings

### N+1 Queries

None — no loops with individual queries.

### Missing Indexes

**1. `GuildProject` — no `@@index([guildId, status])` for active project checks**
Four functions query `{ guildId, status: 'active' }` using `findFirst`. The `@@unique([guildId, projectKey])` covers `guildId` prefix but `status` requires row scanning. Low-impact since guilds typically have < 10 projects.

```ts
// Used in startProject, contributeTurns, contributeMaterials, getAvailableProjects
prisma.guildProject.findFirst({
  where: { guildId, status: 'active' },
});
```

### Payload Bloat

**1. Six `findUnique`/`findFirst` calls without `select` for validation checks**

| Line | Model | Uses | Could select |
|------|-------|------|-------------|
| 148 | `guildMember.findUnique` | `guildId` | `{ guildId }` |
| 217 | `guildMember.findUnique` | `guildId` | `{ guildId }` |
| 34 | `guildProject.findFirst` | existence | `{ id: true }` |
| 153 | `guildProject.findFirst` | full row (uses `projectKey`, `turnsContributed`) | Justified |
| 161 | `guildProjectContribution.findUnique` | `turnsContributed` | `{ turnsContributed }` |
| 233 | `itemTemplate.findUnique` | `name` | `{ name: true }` |

**2. `getGuildProjects` — `include: { contributions: true }` without select (line 101)**
Fetches full `GuildProjectContribution` rows (5 fields: id, projectId, playerId, turnsContributed, materialsContributed) for all projects. Only uses `playerId`, `turnsContributed`, `materialsContributed`.

**3. `getAvailableProjects` — redundant `findFirst` (line 321)**
Calls `guildProject.findMany({ guildId })` (line 314) and then a separate `guildProject.findFirst({ guildId, status: 'active' })` (line 321). The active project is already in the `findMany` results.

```ts
const allProjects = await prisma.guildProject.findMany({ where: { guildId }, select: { projectKey, status } });
// ...
const hasActiveProject = await prisma.guildProject.findFirst({ where: { guildId, status: 'active' } });
// Redundant — allProjects.some(p => p.status === 'active') gives the same answer
```

**4. `contributeMaterials` — contribution fetched twice (lines 248, 284)**
`guildProjectContribution.findUnique` is called pre-tx (line 248) for cap validation, then again inside the tx (line 284) for data consistency. The pre-tx fetch is needed for early validation, but could be moved inside the tx to eliminate one query.

### Cache Issues

No Redis usage. All player-initiated guild management actions — no hot-path cache candidates.

### Migration Risks

None. `materialsProgress` and `materialsContributed` as JSON columns are appropriate for flexible category-based progress tracking.

---

## Query Patterns

### `startProject` — 5–7 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `requireRole(officer)` | With full guild include (bloat) |
| 2 | `guildProject.findFirst({ status: 'active' })` | Existence check |
| 3 | `guildProject.findMany({ guildId })` | Good select |
| 4–6 | tx: `guild.update` + `guildProject.create` + `guildLog.create` | |

### `getGuildProjects` — 2–3 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `guildProject.findMany` with contributions include | Full contribution rows |
| 2 | `player.findMany({ in: playerIds })` | **Good batch pattern** for usernames |

### `contributeTurns` — 6–10 queries
### `contributeMaterials` — 8–14 queries

Both follow: validation queries → transaction (spend + update + upsert + completion check + re-fetch).

### `getAvailableProjects` — 2 queries (could be 1)

---

## Suggested Fixes

### Priority 1 — Eliminate redundant query in `getAvailableProjects`

```ts
const allProjects = await prisma.guildProject.findMany({
  where: { guildId },
  select: { projectKey: true, status: true },
});
const hasActiveProject = allProjects.some(p => p.status === 'active');
```

Removes 1 `findFirst` query.

### Priority 2 — Add `select` to validation queries

```ts
// Membership checks
prisma.guildMember.findUnique({ where: { playerId }, select: { guildId: true } });

// Template name
prisma.itemTemplate.findUnique({ where: { id: templateId }, select: { name: true } });

// Contribution cap
prisma.guildProjectContribution.findUnique({ ..., select: { turnsContributed: true } });
```

### Priority 3 — Add `select` to contributions include

```ts
prisma.guildProject.findMany({
  where: { guildId },
  include: {
    contributions: {
      select: { playerId: true, turnsContributed: true, materialsContributed: true },
    },
  },
});
```
