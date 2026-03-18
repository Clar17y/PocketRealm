# Combat Journal Design

## Overview

A read-only analytics dashboard that mines existing `ActivityLog` combat entries to show players how they're performing and whether they're improving over time. Turns write-only telemetry into actionable self-improvement feedback.

## Data Availability

The `ActivityLog.result` JSON for combat entries stores: `outcome`, `playerMaxHp`, `attackSkill`, `mobTemplateId`, `mobName`, `mobPrefix`, `mobDisplayName`, `source`, and the full `log` array (per-round entries with HP/stamina/mana snapshots, action details, `wasExhausted` flags, damage values, `staminaCost`/`manaCost`).

Fields that are **not** directly stored but must be derived from the `log` array:
- `totalRounds` → `Math.max(...log.map(e => e.round))`
- HP remaining at fight end → last log entry's `combatantAHpAfter`
- Resource costs → sum of `staminaCost` and `manaCost` across log entries
- Total damage → sum of `damage` fields from player's offensive actions in the log
- `wasExhausted` count → count of log entries where `wasExhausted: true`

Fields **not available** from stored data:
- `damageByScalingStat` — not persisted in ActivityLog. Going forward, add this to the stored `result` JSON when writing combat activity logs (small change to combat routes). Historical data can derive an approximate split from `attackSkill` (the player's equipped attack type), but per-action breakdown requires the new field.
- `mobFamilyName` — only stored on `encounter_site` logs. For other combat sources, resolve via `MobFamilyMember` join using the stored `mobTemplateId`.

## Stats (from last 50 combat logs)

| Metric | Derivation | Description |
|--------|-----------|-------------|
| Win rate | `outcome === 'victory'` count / total | Overall + broken down by mob family |
| Rounds to kill | Max round from `log` array (victories only) | Average rounds per victory, by mob family |
| Efficiency score | Last log entry `combatantAHpAfter / playerMaxHp` | Average % HP remaining at fight end |
| Defeat breakdown | Count of `outcome: 'defeat'` vs `'fled'` vs `'draw'` | Most common way you lose |
| Resource efficiency | Sum of `staminaCost`+`manaCost` from log / sum of damage | Stamina/mana spent per damage dealt |
| Damage split | From `damageByScalingStat` (new field) or approximate from `attackSkill` | Melee/ranged/magic contribution percentages |
| Exhaustion rate | Count of `wasExhausted: true` log entries / fight count | Average exhausted triggers per fight — direct feedback on resource management |

**Log type handling:** Use `encounter_site_fight` entries (individual fights), not `encounter_site` summaries (which aggregate multiple fights). This ensures each fight counts as one data point.

**Training fights excluded:** Training fights (`POST /training/fight`) do not create `ActivityLog` entries, so they're naturally excluded.

## Trends (rolling averages over time)

All trends use a rolling 10-fight window, computed across the last 200 combat logs:

| Trend | What it Shows |
|-------|--------------|
| Win rate | Are you winning more consistently? |
| Rounds to kill | Are you finishing fights faster? |
| Efficiency score | Are you taking less damage? |
| Exhaustion rate | Are you managing resources better? |

Each trend includes:
- Rolling average line (sparkline)
- Personal best marker (best rolling 10-fight average ever achieved)
- Direction indicator (improving / stable / declining over last 20 fights)

**Note:** Boss/expedition contribution trends are deferred — neither `bossEncounterService` nor `expeditionService` currently write to `ActivityLog`. This can be added in a future iteration by having those services create activity log entries.

## Implementation

### Prerequisite: Enrich combat ActivityLog writes

Before building the journal, add `damageByScalingStat` to the `result` JSON written by combat routes. This is a small change — the value is already computed by the combat engine and available in the route handlers; it just needs to be included in the `createActivityLog` call. Historical logs without this field fall back to approximation via `attackSkill`.

### New Route: `GET /player/combat-journal`

Aggregates `ActivityLog` where `activityType = 'combat'` for the requesting player.

**Query approach:**
- Fetch last 200 combat activity logs ordered by `createdAt DESC`
- Use a selective Prisma query — fetch `result` JSON but only extract needed fields server-side (outcome, playerMaxHp, mobTemplateId, source, log array)
- Filter to `encounter_site_fight`, `zone_combat`, and `exploration_ambush` sources (skip `encounter_site` summaries to avoid double-counting)
- For mob family resolution: batch-query `MobFamilyMember` for all unique `mobTemplateId` values in the result set (single query, not N+1)
- Compute all stats from the first 50 entries; compute trends from all 200

**Response shape:**
```typescript
{
  stats: {
    totalFights: number,
    winRate: number,                          // 0-1
    winRateByFamily: Record<string, number>,
    avgRoundsToKill: number,
    avgRoundsToKillByFamily: Record<string, number>,
    efficiencyScore: number,                  // 0-1, avg HP% remaining
    defeatBreakdown: { defeat: number, fled: number, draw: number },
    resourceEfficiency: { staminaPerDamage: number, manaPerDamage: number },
    damageSplit: { melee: number, ranged: number, magic: number },
    exhaustionRate: number,                   // Avg exhausted triggers per fight
  },
  trends: {
    winRate: TrendPoint[],
    roundsToKill: TrendPoint[],
    efficiency: TrendPoint[],
    exhaustionRate: TrendPoint[],
  },
  personalBests: {
    winRate: number,
    roundsToKill: number,          // Lowest is best
    efficiency: number,
    exhaustionRate: number,        // Lowest is best
  },
}

interface TrendPoint {
  fightIndex: number,     // Nth fight (chronological)
  value: number,
  timestamp: string,      // ISO date of the fight
}
```

### Caching

Redis cache per player: `combat_journal:{playerId}` with 5-minute TTL. Optionally bust the cache when writing a new combat activity log (delete the key) so that a player who just finished a fight sees fresh data immediately.

### Frontend

- New tab on the bestiary or combat logs screen: "Journal"
- Compact dashboard layout:
  - Top row: key stats as cards (win rate, avg rounds, efficiency, exhaustion rate)
  - Middle: sparkline trend charts
  - Bottom: per-family breakdown table
- Personal best badges highlighted in gold when current average matches or exceeds best

### Schema Changes

None. Reads existing `ActivityLog` data. One minor enrichment to combat activity log writes (adding `damageByScalingStat` to result JSON).

## What It Doesn't Do

- No generated recommendations or tips (too easy to give bad advice)
- No cross-player comparisons (that's what leaderboards are for)
- No real-time updates (cached, refreshes on page load)
- No boss/expedition trends (deferred until those systems write to ActivityLog)

## Edge Cases

- Player with < 10 combats: show stats but hide trends (not enough data for meaningful rolling averages). Display "Fight X more times to unlock trends."
- Player with 0 combats: empty state with prompt to go explore
- Logs without `damageByScalingStat` (historical): approximate split from `attackSkill` field (assumes all damage is from the equipped attack type)
- Logs without `mobFamilyName`: resolve via `MobFamilyMember` join on `mobTemplateId`
