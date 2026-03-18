# Leaderboard Seasonal Crowns Design

## Overview

Weekly "Crown" competitions layered on top of the existing leaderboard system. Each week, the top 3 players by score *improvement* (delta) in each category earn a permanent Crown. Crowns accumulate into per-category achievement chains that unlock titles, giving new players equal competitive footing from day one.

## Weekly Cycle

| Time | Action |
|------|--------|
| Monday 00:00 UTC | Single cron job: award previous week's crowns, then take fresh snapshot |

A single Monday job handles both tasks sequentially: first award crowns from last week's deltas, then snapshot for the new week. This avoids the race condition of separate Sunday/Monday jobs and means crowns are awarded at a clean boundary.

## How Deltas Work

The existing leaderboard stores absolute values (e.g., skill level 45, total kills 3,200). The weekly leaderboard shows how much each player *gained* this week.

**Important: Skill categories store `level` not XP.** The existing `refreshSkills()` writes `s.level` to the sorted set. For weekly deltas, level-based categories are nearly useless (a player gaining 500k XP but staying at level 42 shows delta 0). To make skill crowns meaningful, the weekly delta computation for skill categories must query `PlayerSkill.xp` directly from Postgres rather than using the sorted set value.

| Category | All-Time Score | Weekly Delta Source |
|----------|---------------|---------------------|
| skill_* (14 categories) | Level (from sorted set) | XP gained (from Postgres `PlayerSkill.xp` minus snapshot) |
| total_skill_level | Sum of levels | Sum of XP gained across all skills |
| character_level | Level | XP gained (from Postgres `Player.xp` minus snapshot) |
| character_xp | Total XP | XP gained (delta of sorted set) |
| total_kills | Kill count | Kills this week (delta of sorted set) |
| pvp_wins | Win count | Wins this week (delta of sorted set) |
| pvp_rating | ELO rating | ELO gained this week (can be negative) |
| pvp_best_rating | Best ELO | Best ELO gain this week |
| pvp_win_streak | Current streak | Streak gain this week |
| boss_damage | Total damage | Boss damage this week (delta of sorted set) |
| casino_profit | Total profit | Profit this week (delta of sorted set) |
| casino_wagered | Total wagered | Amount wagered this week (delta of sorted set) |
| guild_level | Guild level | Guild XP gained (from Postgres) |
| guild_renown | Guild renown | Renown gained (delta of sorted set) |
| guild_members | Member count | Members gained (delta of sorted set) |

A level 50 player who doesn't play this week has delta 0. A level 5 player who grinds hard beats them.

## Redis Data

### Monday Snapshot

For categories where delta = sorted set difference:
- Use Redis `COPY leaderboard:{category} leaderboard:weekly_start:{category} REPLACE` (Redis 7 supports this natively, atomic operation)

For XP-based categories (skill_*, character_level, guild_level):
- Query Postgres for current XP values, store in `leaderboard:weekly_start_xp:{category}` sorted set

### Weekly Delta Computation

Happens **inside the existing 15-minute refresh functions**, using the in-memory data already fetched from Postgres (the `rows` array passed to `writeToZset`). This avoids reading from the just-written sorted set (which `writeToZset` briefly deletes during refresh via `redis.del(key)`).

For each player in the in-memory refresh data:
- Read their snapshot score from `leaderboard:weekly_start:{category}` (or `weekly_start_xp:{category}` for XP-based categories)
- Compute `delta = currentValue - snapshotValue`
- Write delta to `leaderboard:weekly_delta:{category}` sorted set

Players not in the snapshot (new this week) use delta = their full current score.

### Monday Award + Snapshot Job

Sequential steps in a single job:
1. Read top 3 from each `leaderboard:weekly_delta:{category}` sorted set
2. Award crowns (see below)
3. Delete all `weekly_start:*`, `weekly_start_xp:*`, and `weekly_delta:*` keys
4. Take fresh snapshots for the new week

## Crown Storage

### New Table: `PlayerCrown`

```prisma
model PlayerCrown {
  id        String   @id @default(uuid())
  playerId  String
  category  String   // Leaderboard category slug (e.g., 'skill_melee', 'pvp_wins')
  rank      Int      // 1 = Gold, 2 = Silver, 3 = Bronze
  weekStart DateTime // Monday date of the competition week
  awardedAt DateTime @default(now())

  player    Player   @relation(fields: [playerId], references: [id])

  @@unique([playerId, category, weekStart])
  @@index([playerId])
}
```

### Guild Crowns

Guild leaderboard categories (guild_level, guild_renown, guild_members) are excluded from the crown system. They measure guild-level activity, and storing crowns against the guild leader's playerId is fragile (leader can change). Guild competition can be added later with a dedicated `GuildCrown` table if desired.

## Per-Category Achievement Chains

Each category group gets its own achievement chain tracking total crowns earned in that group. Gold, Silver, and Bronze all count equally — keeping it accessible.

### Category Groups → Achievement Chains

| Group | Category Slugs | Tier 1 (1 crown) | Tier 2 (3 crowns) | Tier 3 (10 crowns) |
|-------|---------------|------|------|------|
| PvP | pvp_rating, pvp_wins, pvp_best_rating, pvp_win_streak | "Arena Contender" | "Arena Veteran" | "Arena King" |
| Combat | total_kills, boss_damage | "Weekly Warrior" | "Proven Slayer" | "Warlord" |
| Skills | skill_melee, skill_ranged, skill_magic, skill_defence, skill_vitality, skill_evasion, skill_mining | "Dedicated Student" | "Skillmaster" | "Grandmaster" |
| Crafting | skill_weaponsmithing, skill_armorsmithing, skill_leatherworking, skill_tailoring, skill_alchemy, skill_refining, skill_tanning, skill_weaving | "Apprentice Artisan" | "Master Crafter" | "Legendary Artisan" |
| Gathering | skill_foraging, skill_woodcutting | "Keen Forager" | "Resource Baron" | "Land's Bounty" |
| Progression | character_level, character_xp, total_skill_level | "Up and Comer" | "Ascendant" | "Transcendent" |
| Casino | casino_profit, casino_wagered | "Lucky Streak" | "High Roller" | "Casino Mogul" |

**Note:** Title names chosen to avoid collision with existing achievement titles ("Arena Champion" and "Rising Star" are already taken).

### Achievement Tier Rewards

| Tier | Crowns Required | Reward |
|------|----------------|--------|
| 1 | 1 | Title unlock |
| 2 | 3 | Title upgrade |
| 3 | 10 | Title upgrade + 1 attribute point |

### Achievement Integration

The existing `checkAchievements` flow resolves stats via `statsService.resolveAllStats()`, which queries specific database tables. Crown counts are not covered by any existing stat resolver.

**Approach:** Add a `crowns` stat resolver to `statsService.ts` that queries `PlayerCrown` grouped by category group. This is a new `resolveCrownStats(playerId)` function returning `Record<string, number>` (e.g., `{ crownsPvp: 5, crownsCombat: 2, ... }`). Integrate it into the existing `resolveAllStats()` call.

The crown achievement definitions use `statKey` values like `crowns_pvp`, `crowns_combat`, etc. that map to these resolved stats.

Crown achievements are checked after inserting a `PlayerCrown` — the award job calls `checkAchievements(playerId, { statKeys: ['crowns_pvp'] })` (or whichever group applies).

## Leaderboard API Changes

### Existing Route: `GET /leaderboard/:category`

Add optional query param: `?period=weekly`

- `period=alltime` (default): existing behavior, returns absolute scores
- `period=weekly`: returns entries from `leaderboard:weekly_delta:{category}` sorted set, same response shape but `score` represents the weekly delta

Response includes a `period` field so the frontend can distinguish score semantics:
```typescript
interface LeaderboardResponse {
  period: 'alltime' | 'weekly',
  entries: LeaderboardEntry[],
  // ... existing fields
}
```

### New Route: `GET /leaderboard/crowns/:playerId`

Returns a player's crown collection:
```typescript
{
  crowns: Array<{
    category: string,
    rank: number,          // 1, 2, or 3
    weekStart: string,     // ISO date
  }>,
  totalByGroup: Record<string, number>,  // Group → total crowns
}
```

### Existing Route: `GET /leaderboard/:category` Response Enhancement

Add crown indicators to leaderboard entries:
```typescript
interface LeaderboardEntry {
  // ... existing fields
  crowns?: { gold: number, silver: number, bronze: number },  // Lifetime crown counts for this category
}
```

## Cron Job Implementation

The codebase uses `setInterval` in `index.ts` for periodic tasks (no cron library). Add a `setInterval` that checks every 60 seconds whether it's Monday 00:00 UTC (± 60s window) and a `leaderboard:weekly_job_ran:{weekMonday}` Redis key doesn't exist yet. If conditions met, run the job and set the key with 7-day TTL. This is idempotent — safe across server restarts.

### `weeklyLeaderboardJob` — Monday 00:00 UTC

1. **Award phase** (skip if no snapshot exists — first week):
   - For each category: read top entries from `leaderboard:weekly_delta:{category}` using `ZREVRANGE ... WITHSCORES`
   - Apply tie-breaking: tied players get the same rank. Max 3 crown tiers awarded. If 3+ players tie for gold, all get gold, no silver/bronze. Cap at 5 total crowns per category per week to prevent degenerate cases.
   - Apply minimum delta threshold: must have delta > 0 to qualify
   - Filter bots (`isBot` flag — resolve from `leaderboard:meta:{category}`)
   - Insert `PlayerCrown` records
   - Check crown achievements for each winner via `checkAchievements`
   - Broadcast crown announcements via system message to world chat
2. **Snapshot phase:**
   - For each category: `COPY leaderboard:{category} leaderboard:weekly_start:{category} REPLACE`
   - For XP-based categories: query Postgres, write to `leaderboard:weekly_start_xp:{category}`
   - Initialize empty `leaderboard:weekly_delta:{category}` sorted sets
3. **Cleanup:** Delete previous week's `weekly_start:*`, `weekly_start_xp:*` keys (replaced by COPY)
4. **Log:** Record job completion with summary of crowns awarded

### Delta computation performance

Use Redis pipelines for batch reads of snapshot scores during the 15-minute refresh. For N players across M categories, pipeline the `ZSCORE` reads rather than issuing them individually.

## Frontend

### Leaderboard Screen

- Toggle: "All Time" | "This Week" (switches `period` query param)
- Weekly view shows delta scores with rank
- Crown icons (gold/silver/bronze) next to players who earned crowns in that category
- End-of-week countdown timer visible on weekly view

### Player Profile

- Crown collection section showing earned crowns grouped by category
- Total crown counts per group

## Edge Cases

- **Ties:** All tied players receive the same rank. Cap at 5 total crowns per category per week.
- **Minimum threshold:** Delta must be > 0 to qualify. Prevents winning in empty/inactive categories with 0 improvement.
- **Bot exclusion:** Bots already flagged `isBot` on leaderboard entries — filtered from crown eligibility.
- **New players mid-week:** Not in Monday snapshot, so their full current score counts as their delta. This is intentional — a new player who grinds hard can win a crown in their first week.
- **Server restart:** Snapshots and deltas are in Redis with persistence (RDB/AOF). The weekly job is idempotent via the `weekly_job_ran` key.
- **First week:** No snapshot exists yet. The Monday cron creates the first snapshot; the first awards happen the following Monday.
- **Redis flush mid-week:** Week's competition is lost. Acceptable risk.
- **Guild categories:** Excluded from crown system (see Guild Crowns section above).
