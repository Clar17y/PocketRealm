# Database Audit: guildUpgradeService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/guildUpgradeService.ts` (305 lines, 4 exported functions)

## Prisma Models Touched

Direct: `GuildMember`, `GuildUpgrade`, `Guild`, `GuildProject`, `GuildLog`

---

## Findings

### N+1 Queries

None — no loops with individual queries.

### Missing Indexes

**1. `GuildUpgrade` index not optimal for `getPlayerGuildModifiers` filter (line 218)**
The `{ guildId, expiresAt: { gt: now } }` filter uses `@@index([guildId, upgradeType, expiresAt])`, but `upgradeType` in the middle column isn't part of the filter. Postgres can only use the `guildId` prefix, then must scan for `expiresAt`.

```ts
prisma.guildUpgrade.findMany({
  where: { guildId: membership.guildId, expiresAt: { gt: now } },
  // @@index([guildId, upgradeType, expiresAt]) — upgradeType not in filter
});
```

A `@@index([guildId, expiresAt])` would allow full index-only scan.

**2. `GuildProject(guildId, status)` — already identified (line 258)**

### Payload Bloat

**1. `guildUpgrade.findMany` — no select (line 218)**
Fetches 7-column rows. Uses 3: `upgradeType`, `tier`, `expiresAt`.

**2. `guildMember.findMany` — fetches ALL guild members for active count (line 226)**
Queries every member of the guild to count how many are "active" (within 48h window). Only reads `lastActiveAt`. For a 50-member guild: 50 rows fetched on every combat.

```ts
const members = await prisma.guildMember.findMany({
  where: { guildId: membership.guildId },
  select: { lastActiveAt: true },
});
const activeCount = members.filter((m) => isActiveWithinWindow(m.lastActiveAt)).length;
```

This could be a `count` query with a `lastActiveAt` filter instead of fetching all rows.

### Cache Issues

**`getPlayerGuildModifiers` is the #1 cache candidate across the entire audit.**

Called on every PvE combat, every PvP challenge (when `guildXpBoost` not provided), and every non-combat XP grant. Executes **4–5 sequential queries** per call.

| Query | Data Source | Change Frequency |
|-------|-----------|-----------------|
| Guild membership + activity | `GuildMember` | Only on join/leave/kick |
| Active upgrades | `GuildUpgrade` | Only on activate (expires after hours/days) |
| Active member count for scaling | `GuildMember` (all) | Gradual (48h activity window) |
| Completed projects | `GuildProject` | Only on project completion |
| Specialization + level | `Guild` | Only on spec select/respec + level-up |

**All sources change infrequently.** A 60-second TTL Redis cache would eliminate 4–5 queries per combat with negligible staleness.

**Invalidation points** (only 5):
1. `activateUpgrade` → upgrade activated
2. `checkAndCompleteProject` → project completed
3. `selectSpecialization` / `respecSpecialization` → spec changed
4. `addGuildXp` → guild level-up (changes spec tier gate)
5. Guild membership changes (join/leave/kick)

### Migration Risks

None.

---

## Query Patterns

### `activateUpgrade` — 6 queries

| Step | Query | Index |
|------|-------|-------|
| 1 | `requireRole(officer)` with guild include | `@@unique(playerId)` |
| 2 | tx: `guild.findUnique` (treasury re-check) | PK |
| 3 | tx: `guildUpgrade.findFirst` (duplicate check) | `@@index([guildId, upgradeType, expiresAt])` |
| 4 | tx: `guild.update` (treasury deduct) | PK |
| 5 | tx: `guildUpgrade.create` | — |
| 6 | tx: `guildLog.create` | — |

### `getActiveUpgrades` — 1 query
### `getAvailableUpgrades` — 2 queries

Both clean. Good `select` on guild fetch.

### `getPlayerGuildModifiers` — 4–5 queries (sequential, every combat)

| Step | Query | Index | Notes |
|------|-------|-------|-------|
| 1 | `guildMember.findUnique({ playerId })` | `@@unique(playerId)` | Good select |
| 2 | `guildUpgrade.findMany({ guildId, expiresAt })` | `@@index([guildId, upgradeType, expiresAt])` partial | No select |
| 3 | `guildMember.findMany({ guildId })` | `@@id([guildId, playerId])` prefix | **All members for count** |
| 4 | `guildProject.findMany({ guildId, status })` | `@@unique([guildId, projectKey])` prefix | Good select |
| 5 | `guild.findUnique({ id })` | PK | Good select |

**Total per combat: 4–5 queries.** Completely eliminable with caching.

---

## Suggested Fixes

### Priority 1 — Cache `getPlayerGuildModifiers` in Redis (CRITICAL)

This is the single highest-impact cache across the entire codebase, affecting every combat:

```ts
const cacheKey = `guild:mods:${playerId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached) as PlayerGuildModifiers;

const mods = await computePlayerGuildModifiers(playerId);
await redis.set(cacheKey, JSON.stringify(mods), 'EX', 60);
return mods;
```

**Invalidation** (clear all guild members' caches on any of these events):
```ts
async function invalidateGuildModifierCache(guildId: string) {
  const members = await prisma.guildMember.findMany({
    where: { guildId }, select: { playerId: true },
  });
  const keys = members.map(m => `guild:mods:${m.playerId}`);
  if (keys.length > 0) await redis.del(...keys);
}
```

**Estimated savings:** 4–5 queries × every combat × every player = massive DB load reduction.

### Priority 2 — Replace member count fetch with `count` query

```ts
const activeCount = await prisma.guildMember.count({
  where: {
    guildId: membership.guildId,
    lastActiveAt: { gt: new Date(Date.now() - GUILD_CONSTANTS.BOOST_ELIGIBILITY_WINDOW_HOURS * 3600000) },
  },
});
```

Replaces fetching all members + JS filtering with a DB-side count. Needs `@@index([guildId, lastActiveAt])` on `GuildMember` for optimal performance.

### Priority 3 — Add `select` to upgrade fetch

```ts
prisma.guildUpgrade.findMany({
  where: { guildId: membership.guildId, expiresAt: { gt: now } },
  select: { upgradeType: true, tier: true },
});
```

### Priority 4 — Add `@@index([guildId, expiresAt])` on GuildUpgrade

Covers the `getPlayerGuildModifiers` filter directly without the unused `upgradeType` middle column.
