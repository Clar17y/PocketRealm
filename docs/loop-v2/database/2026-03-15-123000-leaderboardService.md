# Database Audit: leaderboardService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/leaderboardService.ts` (494 lines, 3 exported functions)

## Prisma Models Touched

Refresh path: `PvpRating`, `Player`, `PlayerSkill`, `PlayerBestiary`, `BossParticipant`, `Guild`, `RouletteBet`
Read path: **None** (Redis only)

---

## Findings

### N+1 Queries

None. All refresh functions use `findMany` with includes and aggregate in JS. No loops with individual queries.

### Missing Indexes

No new issues. Refresh queries are intentional full table scans (need all data for leaderboard computation).

### Payload Bloat

**1. `refreshPvp` — `pvpRating.findMany` with no select on main model (line 229)**
Fetches full `PvpRating` rows (12 fields: id, playerId, rating, wins, losses, draws, winStreak, bestWinStreak, bestRating, lastFoughtAt, createdAt, updatedAt). Uses 5: `playerId`, `rating`, `wins`, `bestRating`, `winStreak`.

```ts
prisma.pvpRating.findMany({
  include: { player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } } },
  // no select on main model — fetches 12 columns, uses 5
});
```

**2. `refreshSkills` — `playerSkill.findMany` with no select on main model (line 289)**
Fetches full `PlayerSkill` rows (7 fields) for ALL players × ALL skills. Uses 3: `playerId`, `skillType`, `level`.

```ts
prisma.playerSkill.findMany({
  include: { player: { select: { ... } } },
  // no select — fetches xp (BigInt), dailyXpGained, lastXpResetAt, id — all unused
});
```

At 10K players × 14 skills = 140K rows with unnecessary BigInt `xp` field.

### Cache Issues

**Excellent Redis architecture.** This is the model pattern for leaderboards:

| Path | Implementation | DB Queries |
|------|---------------|-----------|
| **Read** (`getLeaderboard`) | Redis sorted sets + hash metadata | **0 Prisma** |
| **Write** (`refreshAllLeaderboards`) | Batch Prisma → Redis ZADD/HSET | Background task |

No cache issues on the read path.

**Refresh path concerns:**

**1. Sequential refresh categories (lines 481–486)**
Each category refreshes sequentially. `refreshPvp`, `refreshProgression`, `refreshSkills`, `refreshCombat`, `refreshGuilds`, `refreshCasino` run one after another. Independent categories could run in parallel.

### Migration Risks

**1. Full table scans scale linearly with player count**
Every refresh loads entire tables into memory:
- `player.findMany()` — all players
- `playerSkill.findMany()` — all players × all skills (~14x player count)
- `playerBestiary.findMany()` — all players × encountered mobs
- `bossParticipant.findMany()` — all boss participation records

At current scale this is fine. At 100K+ players, `refreshSkills` alone would load 1.4M+ rows. Consider pagination or raw SQL with `LIMIT/OFFSET` or streaming cursors.

**2. Memory pressure from sequential execution**
Each refresh holds its `findMany` results in memory until the function returns. The peak is the largest single result set. Sequential execution prevents overlap, which is good, but parallelizing would multiply peak memory.

---

## Query Patterns

### `getLeaderboard` — 0 Prisma queries (Redis only)

| Step | Redis Operation | Notes |
|------|----------------|-------|
| 1 | `zcard` | Total count |
| 2 | `get` | Last refresh timestamp |
| 3 | `zrevrank` | Player's rank |
| 4 | `zrevrange WITHSCORES` | Paginated entries |
| 5 | `hmget` | Batch metadata |
| 6 | `zscore` + `hget` | Player's own entry |

**Model implementation** — zero DB load on read path.

### `refreshAllLeaderboards` — ~8 Prisma queries total

| Refresh | Query | Rows (est.) |
|---------|-------|-------------|
| PvP | `pvpRating.findMany` + player join | ~Players with PvP |
| Progression | `player.findMany` | All players |
| Skills | `playerSkill.findMany` + player join | Players × 14 skills |
| Combat | `playerBestiary.findMany` + player join | Players × mobs killed |
| Combat | `bossParticipant.findMany` + player join | Boss participations |
| Guilds | `guild.findMany` with _count | All guilds |
| Casino | `$queryRaw` (roulette aggregation) | All bets → grouped |
| Casino | `player.findMany({ in: ids })` | Casino players |

---

## Suggested Fixes

### Priority 1 — Add `select` to refresh queries

```ts
// refreshPvp
prisma.pvpRating.findMany({
  select: {
    playerId: true, rating: true, wins: true, bestRating: true, winStreak: true,
    player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } },
  },
});

// refreshSkills
prisma.playerSkill.findMany({
  select: {
    playerId: true, skillType: true, level: true,
    player: { select: { username: true, characterLevel: true, isBot: true, role: true, activeTitle: true } },
  },
});
```

Eliminates unused `xp` (BigInt), `dailyXpGained`, `lastXpResetAt`, `id` from 140K+ rows.

### Priority 2 — Parallelize independent refresh categories

```ts
await Promise.allSettled([
  refreshPvp(),
  refreshProgression(),
  refreshSkills(),
  refreshCombat(),
  refreshGuilds(),
  refreshCasino(),
]);
```

Trade-off: increases peak memory (all results in memory simultaneously) but reduces total wall time. For current scale, the memory trade-off is acceptable.

### Priority 3 — Future scaling: raw SQL aggregation

For large player bases, replace JS aggregation with raw SQL:

```sql
-- refreshSkills: total skill level per player in one query
SELECT ps.player_id, SUM(ps.level)::int AS total_level, p.username, p.character_level, ...
FROM player_skills ps
JOIN players p ON p.id = ps.player_id
GROUP BY ps.player_id, p.username, p.character_level, ...
ORDER BY total_level DESC
LIMIT 1000
```

Moves aggregation to DB and limits result set size.
