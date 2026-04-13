# P0: Database & API Efficiency Improvements

**Issue:** #242
**Date:** 2026-03-23

## Goal

Reduce database load under concurrent traffic by caching static game data, caching expensive per-player queries, adding missing indexes, and configuring the connection pool.

---

## 1. Static Data Cache Service

### Problem

Zone definitions, zone connections, mob templates, and crafting recipes are seed data that rarely changes, yet every request fetches them from PostgreSQL. Under 100 concurrent players exploring/fighting, these identical queries multiply into thousands of redundant DB round-trips per minute.

### Design

New file: `apps/api/src/services/staticDataCacheService.ts`

A thin wrapper around `cachedQuery` exposing named functions for each static dataset. All TTLs set to 24 hours (86400s), matching the existing drop table cache pattern.

```typescript
// Cache key conventions: static:{entity}:{optional-filter}
// e.g. static:zones:all, static:mobs:zone:{zoneId}, static:connections:all

export async function getCachedZones(): Promise<Zone[]>
export async function getCachedZoneConnections(): Promise<ZoneConnection[]>
export async function getCachedMobTemplatesByZone(zoneId: string): Promise<MobTemplate[]>
export async function getCachedCraftingRecipes(): Promise<CraftingRecipe[]>
export async function getCachedBossMobTemplates(): Promise<MobTemplate[]>
export async function getCachedResourceNodesByZone(zoneId: string): Promise<ResourceNode[]>
export async function getCachedZoneMobFamilies(zoneId: string): Promise<ZoneMobFamily[]>
export async function getCachedExpeditionMobTemplates(): Promise<MobTemplate[]>
export async function invalidateStaticCache(): Promise<void>  // bust all static:* keys
```

Each function encapsulates the Prisma query + select clause currently scattered across call sites. Callers replace their inline `prisma.zone.findMany()` etc. with the cached version.

`invalidateStaticCache()` maintains a Redis Set (`static:__index`) tracking all static cache keys. On invalidation, it reads the set, deletes all listed keys, then deletes the set itself. This avoids the `redis.keys()` anti-pattern (which blocks and scans the entire keyspace). Each `cachedQuery` write also `SADD`s the key to the index set. This can be wired to an admin endpoint for post-seed cache busting.

### Call sites to update

| Current call | File | Replacement |
|---|---|---|
| `prisma.zone.findMany()` (full list) | `routes/zones.ts:61` | `getCachedZones()` |
| `prisma.zoneConnection.findMany()` | `routes/zones.ts:64` | `getCachedZoneConnections()` |
| `prisma.mobTemplate.findMany({ where: { zoneId } })` | `routes/combat/start.ts:103`, `routes/exploration/start.ts:108` | `getCachedMobTemplatesByZone(zoneId)` |
| `prisma.mobTemplate.findMany({ where: { isBoss: true } })` | `services/bossBestiaryService.ts:20`, `services/eventSchedulerService.ts:217` | `getCachedBossMobTemplates()` |
| `prisma.zone.findMany({ where: { zoneType: 'wild' } })` | `services/eventSchedulerService.ts:289,304` | `getCachedZones()` + filter in-memory |
| `prisma.resourceNode.findMany({ where: { zoneId } })` | `routes/exploration/start.ts:109` | New `getCachedResourceNodesByZone(zoneId)` |
| `prisma.mobTemplate.findMany({ where: { zoneId } })` (travel ambush) | `routes/zones.ts:317` | `getCachedMobTemplatesByZone(zoneId)` |
| `prisma.zoneMobFamily.findMany({ where: { zoneId } })` | `routes/exploration/start.ts:110`, `services/eventSchedulerService.ts` | New `getCachedZoneMobFamilies(zoneId)` |
| `prisma.mobTemplate.findMany({ where: { isExpeditionMob } })` | `services/expeditionService.ts` | New `getCachedExpeditionMobTemplates()` |

**Note:** Some call sites use different `select` clauses. The cached version should fetch the superset of fields needed across all callers. Callers that need fewer fields simply ignore the extra properties — the overhead of caching slightly wider rows is negligible compared to eliminating the DB call entirely.

### Out of scope

- `routes/bestiary.ts:32` — fetches all mob templates with full `include` (zone, dropTables, itemTemplates). The wide include and player-specific filtering logic make this a poor caching candidate without significant restructuring. Drop tables are already cached separately.
- `services/encounterSiteCombatService.ts:324` — queries by specific mob IDs, not a static pattern. Low frequency (one per encounter start).
- `routes/exploration/start.ts:662` — boss mob query filtered by zone families inside exploration loop. Uses `getCachedBossMobTemplates()` + in-memory filtering.

### What NOT to cache here

- Player-specific data (inventory, skills, bestiary progress) — changes frequently
- Drop tables — already cached in `lootService.ts` with 24h TTL
- Admin-only queries — low frequency, caching adds complexity for no benefit

---

## 2. Cache Guild Modifiers

### Problem

`getPlayerGuildModifiers()` in `guildUpgradeService.ts` fires up to 5 sequential DB queries on every combat, exploration, travel, crafting, gathering, and XP grant:

1. `guildMember.findUnique` — guild membership + activity check
2. `guildUpgrade.findMany` — active upgrades
3. `guildMember.findMany` — all members (for active-count scaling)
4. `guildProject.findMany` — completed projects
5. `guild.findUnique` — specialization + level (tier gated by `guild.level`)

### Design

Wrap the entire `getPlayerGuildModifiers` return value in `cachedQuery`:

```typescript
export async function getPlayerGuildModifiers(playerId: string): Promise<PlayerGuildModifiers> {
  return cachedQuery(
    `guild:modifiers:${playerId}`,
    () => computePlayerGuildModifiers(playerId),  // renamed current implementation
    90,  // 90 second TTL
  );
}
```

**TTL rationale:** 90 seconds balances freshness (upgrades purchased take effect within ~90s) vs load reduction. Guild modifiers change infrequently — only on upgrade purchase, project completion, specialization change, or membership change.

**Invalidation points** — call `invalidateCache(`guild:modifiers:${playerId}`)` after:

| Event | Location |
|---|---|
| Guild upgrade purchased/expired | `guildUpgradeService.ts` — purchase handler |
| Guild project completed | `guildProjectService.ts` — **after** the transaction commits (see note below) |
| Guild level-up | `guildService.ts` — `addGuildXp` when `leveledUp === true` (unlocks new specialization tiers) |
| Specialization changed | `guildService.ts` — setSpecialization |
| Player joins/leaves guild | `guildMembershipService.ts` — `joinGuild`, `respondToJoinRequest` (accept), leave/kick/disband |
| Guild member activity changes | Not needed — TTL handles staleness within 90s |

For guild-wide events (upgrade purchased, project completed, level-up), invalidate all current members. Query `guildMember.findMany({ where: { guildId }, select: { playerId: true } })` and invalidate each key. This is a rare event (minutes/hours apart) so the fan-out is acceptable.

**Transaction safety:** `checkAndCompleteProject` runs inside a Prisma `$transaction`. Per the warning in `cacheService.ts`, invalidation must happen **after** the transaction commits, not inside it. The caller that owns the transaction boundary is responsible for calling invalidation post-commit — same pattern used by `invalidateGuildIdCache` in the membership service.

---

## 3. Missing Database Indexes

### Indexes to add

```prisma
// Player — zone lookups (PvP scouting, social features)
@@index([currentZoneId])

// MobTemplate — every zone load queries mobs by zone
@@index([zoneId])

// ResourceNode — gathering queries filter by zone
@@index([zoneId])

// RefreshToken — token cleanup on logout, cascade deletes
@@index([playerId])

// Item — inventory/stash queries need ownerId+inStash
// (existing 3-col index [ownerId, templateId, inStash] can't efficiently serve ownerId+inStash filters)
@@index([ownerId, inStash])

// RouletteRound — casino round resolution scheduler
@@index([resolvedAt])

// GuildExpeditionMember — "my expeditions" lookups
@@index([playerId])

// MobTemplate — boss mob lookups (bossBestiaryService, eventScheduler)
@@index([isBoss])
```

### Migration

Single Prisma migration: `npx prisma migrate dev --name add-missing-indexes`. This is a non-breaking, additive schema change. No application code changes needed. Indexes are created concurrently by PostgreSQL by default for `CREATE INDEX`.

---

## 4. Connection Pool Configuration

### Problem

No explicit `connection_limit` is set on `DATABASE_URL`. Prisma defaults to `num_physical_cpus * 2 + 1`, which is only 5 connections on a 2-core VPS. With 145 endpoints, background schedulers, and leaderboard refreshes sharing one pool, this exhausts under moderate load.

### Design

Add connection pool parameters to `DATABASE_URL` in `.env.example` and deployment config:

```
DATABASE_URL="postgresql://user:pass@host:5433/pocketrealm?connection_limit=20&pool_timeout=15"
```

- `connection_limit=20`: Enough for concurrent requests + background jobs. Should be tuned to stay under PostgreSQL's `max_connections` (default 100) with headroom.
- `pool_timeout=15`: Seconds to wait for a connection before erroring. Default is 10, slightly more generous under spikes.

Document alongside existing environment variable configuration (`.env` / deployment docs). No `.env.example` currently exists — add a comment to the deployment reference doc at `docs/reference/deployment.md` instead.

---

## Testing Strategy

- **Static data cache:** Unit test `staticDataCacheService` functions with mocked Prisma + Redis. Verify cache hit returns stored data, cache miss calls Prisma. Verify invalidation clears keys.
- **Guild modifiers cache:** Existing `guildUpgradeService.test.ts` tests continue to work (they mock Prisma). Add test verifying cached result is returned on second call.
- **Indexes:** No application tests needed — verify via `prisma migrate dev` succeeding.
- **Connection pool:** No automated test — verify via deployment config review.
- **Integration:** Run full test suite (`npm run test`) to ensure no regressions.

### Known limitations

- **Cache stampede:** The existing `cachedQuery` implementation has no mutex/singleflight protection. Multiple concurrent cache misses for the same key will all hit the DB simultaneously. This is acceptable for this workload — static data queries are cheap individually, and the 24h TTL means stampedes only happen once per day (or on cold start). Guild modifier stampede is bounded to one player's concurrent requests.
