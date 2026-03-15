# Database Audit: achievementService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/achievementService.ts` (272 lines, 6 exported functions)

## Prisma Models Touched

Direct: `PlayerAchievement`, `MobFamily`, `Player`, `ItemTemplate`, `Item`
Via sub-services: `PlayerStats`, `PlayerBestiary` (via `resolveStats`/`resolveFamilyKills`), `ActivityLog` (via `createActivityLog`), `TurnBank` (via `refundPlayerTurnsTx`)

---

## Findings

### N+1 Queries

**1. `checkAchievements` — per-achievement `create` in loop (lines 71–88)**
Creates `playerAchievement` records one at a time for newly unlocked achievements. Typically 0–1 per call, so impact is low.

```ts
for (const achievement of candidates) {
  if (progress >= achievement.threshold) {
    await prisma.playerAchievement.create({
      data: { playerId, achievementId: achievement.id },
    });
  }
}
```

**2. `emitAchievementNotifications` — per-achievement `createActivityLog` (lines 258–270)**
Loops over achievements creating activity log entries one at a time.

```ts
for (const ach of achievements) {
  await createActivityLog({ playerId, activityType: 'achievement', ... });
}
```

**3. `claimReward` — per-reward queries in tx (lines 184–212)**
Loops over rewards with per-reward DB calls. Typically 1–2 rewards, so low-volume.

### Missing Indexes

No critical issues. `@@id([playerId, achievementId])` covers all primary query patterns:
- `findMany({ playerId })` — uses PK prefix
- `findUnique({ playerId_achievementId })` — uses PK exact
- `findMany({ playerId, rewardClaimed: false })` — PK prefix, scans for `rewardClaimed` (minor — < 50 rows per player)

### Payload Bloat

**1. `mobFamily.findUnique` — full row for `name` field (line 57)**
Fetches all `MobFamily` columns to read `family.name`.

```ts
prisma.mobFamily.findUnique({ where: { id: options.familyId } });
// Uses only: family.name
```

**2. `playerAchievement.findUnique` — full row for existence check (lines 165, 224)**
Both `claimReward` and `setActiveTitle` fetch full `PlayerAchievement` rows for validation checks.

```ts
prisma.playerAchievement.findUnique({
  where: { playerId_achievementId: { playerId, achievementId } },
  // no select — full row for existence/rewardClaimed check
});
```

**3. `itemTemplate.findUnique` — full row in `claimReward` (line 197)**
Fetches full `ItemTemplate` to verify existence before creating the reward item. Only needs confirmation it exists.

**4. `getPlayerAchievements` — `resolveAllFamilyKills` sequential after `Promise.all` (line 110)**
Could be included in the parallel block at line 97.

### Cache Issues

**1. `mobFamily.findMany` / `mobFamily.findUnique` — static game data (lines 57, 100)**
Mob families are seed data. `getPlayerAchievements` fetches all families on every call. The family-to-key mapping could be cached globally.

| Query | Frequency | Volatility | Cache? |
|-------|-----------|-----------|--------|
| `mobFamily.findMany({ select: { id, name } })` | Every achievements page view | Never changes | **Strong** — global cache |
| `mobFamily.findUnique({ id })` | Every combat achievement check | Never changes | **Strong** — global cache |

### Migration Risks

None. Optimistic lock pattern in `claimReward` (line 176) is correct.

---

## Query Patterns

### `checkAchievements` — 2–5 queries

| Step | Query | Index | Notes |
|------|-------|-------|-------|
| 1a | `resolveStats(playerId, statKeys)` | Various | Parallel |
| 1b | `playerAchievement.findMany({ playerId })` | `@@id` prefix | Parallel, good select |
| 2 | `mobFamily.findUnique({ id })` | PK | Conditional |
| 3 | `resolveFamilyKills(playerId, familyId)` | Various | Conditional |
| 4 | `playerAchievement.create` per unlock | — | 0–1 typically |

### `getPlayerAchievements` — 4+ queries

| Step | Query | Index | Notes |
|------|-------|-------|-------|
| 1a | `resolveAllStats(playerId)` | Various | Parallel |
| 1b | `playerAchievement.findMany({ playerId })` | `@@id` prefix | Parallel |
| 1c | `mobFamily.findMany` | — | Parallel, static data |
| 2 | `resolveAllFamilyKills(playerId)` | Various | **Sequential — could be parallel** |

### `claimReward` — 3–5 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `playerAchievement.findUnique` | Validation |
| 2 | `playerAchievement.updateMany` (in tx) | Optimistic lock |
| 3–N | Per-reward: `player.update` / `turnRefund` / `item.create` | 1–2 typically |

### `setActiveTitle` — 2 queries
### `getUnclaimedCount` — 1 query (good select)

---

## Suggested Fixes

### Priority 1 — Cache mob family data

```ts
// Global cache (static data, load once at startup or first access)
let mobFamilyCache: Map<string, { id: string; name: string }> | null = null;
async function getMobFamilies() {
  if (mobFamilyCache) return mobFamilyCache;
  const families = await prisma.mobFamily.findMany({ select: { id: true, name: true } });
  mobFamilyCache = new Map(families.map(f => [f.id, f]));
  return mobFamilyCache;
}
```

Or use Redis with long TTL. Eliminates 1 query per achievement check and 1 per achievements page.

### Priority 2 — Parallelize `resolveAllFamilyKills` in `getPlayerAchievements`

Move from line 110 into the `Promise.all` at line 97:

```ts
const [allStats, unlocked, families, familyKillsById] = await Promise.all([
  resolveAllStats(playerId),
  prisma.playerAchievement.findMany({ where: { playerId } }),
  prisma.mobFamily.findMany({ select: { id: true, name: true } }),
  resolveAllFamilyKills(playerId),  // ← move here
]);
```

### Priority 3 — Add `select` to existence checks

```ts
// claimReward
prisma.playerAchievement.findUnique({
  where: { playerId_achievementId: { playerId, achievementId } },
  select: { rewardClaimed: true },
});

// setActiveTitle
prisma.playerAchievement.findUnique({
  where: { playerId_achievementId: { playerId, achievementId } },
  select: { achievementId: true },
});
```

### Priority 4 — Batch achievement unlocks with `createMany`

```ts
const newlyUnlocked = candidates.filter(a => !unlockedSet.has(a.id) && progress >= a.threshold);
if (newlyUnlocked.length > 0) {
  await prisma.playerAchievement.createMany({
    data: newlyUnlocked.map(a => ({ playerId, achievementId: a.id })),
  });
}
```
