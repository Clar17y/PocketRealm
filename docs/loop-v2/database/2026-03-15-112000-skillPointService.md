# Database Audit: skillPointService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/skillPointService.ts` (155 lines, 4 exported functions)

## Prisma Models Touched

Direct: `PlayerSkill`, `SkillPointAllocation`
Via sub-service: `TurnBank` (via `spendPlayerTurnsTx`)

---

## Findings

### N+1 Queries

No N+1 issues.

### Missing Indexes

No issues. All queries use well-indexed paths:
- `PlayerSkill` via `@@unique([playerId, skillType])` prefix
- `SkillPointAllocation` via `@@unique(playerId)`

### Payload Bloat

**1. `skillPointAllocation.findUnique` — no `select` (line 26, 75)**
Fetches full row (id, playerId, allocations, createdAt). Only uses `allocations`.

```ts
prisma.skillPointAllocation.findUnique({ where: { playerId } });
// Uses only: record.allocations
```

Minor — row is small (4 fields, but `allocations` JSON can be large for heavily invested players).

### Cache Issues

**No Redis usage.**

| Function | Call Frequency | Data Volatility | Cache Candidate? |
|----------|---------------|----------------|-----------------|
| `getSkillPoints` | Every combat (via `preparePlayerForCombat`) | Only changes on allocate/respec | **Strong** — event-invalidated |

`getSkillPoints` runs 2–3 queries per call and is invoked on every combat. Allocations change only on explicit player actions (allocate/respec). A Redis cache with invalidation on those two endpoints would save 2–3 queries per combat.

### Migration Risks

**1. `getOrCreateAllocation` — upsert-on-read pattern (lines 25–33)**
Read path creates a `SkillPointAllocation` record if none exists. This turns a read into a potential write, which is unexpected and could cause issues under concurrent requests (two concurrent reads could both try to create).

```ts
const record = await prisma.skillPointAllocation.findUnique({ where: { playerId } });
if (record) return { allocations: ... };
// Read becomes a write:
const created = await prisma.skillPointAllocation.create({ data: { playerId, allocations: {} } });
```

Should be handled at player creation time or use `upsert`.

---

## Query Patterns

### `getSkillPoints` — 2–3 queries

| Step | Query | Index |
|------|-------|-------|
| 1 | `playerSkill.findMany({ playerId })` | `@@unique([playerId, skillType])` prefix |
| 2 | `skillPointAllocation.findUnique({ playerId })` | `@@unique(playerId)` |
| 3 | (conditional) `skillPointAllocation.create` if missing | — |

### `allocatePoints` — 6–8 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `$queryRaw SELECT ... FOR UPDATE` | Row lock |
| 2 | `playerSkill.findMany({ playerId })` (in tx) | Points earned |
| 3 | `skillPointAllocation.findUnique` (in tx) | Current allocations |
| 4 | `playerSkill.findFirst` (conditional) | Skill level gate |
| 5 | `skillPointAllocation.update` | Save new allocation |
| 6–8 | `getSkillPoints(playerId)` (post-tx) | **Re-reads everything** |

### `respecPoints` — 6–9 queries

| Step | Query | Notes |
|------|-------|-------|
| 1–3 | `getSkillPoints(playerId)` | Pre-check (totalPointsSpent > 0) |
| 4–5 | `spendPlayerTurnsTx` + `update` (in tx) | Spend turns + clear allocations |
| 6–8 | `getSkillPoints(playerId)` | **Re-reads everything again** |

### `getUnlockedActions` — 2–3 queries

Calls `getSkillPoints` — same as above.

---

## Suggested Fixes

### Priority 1 — Cache `getSkillPoints`

```ts
const cacheKey = `skill-points:${playerId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await computeSkillPoints(playerId);
await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
return result;
```

Invalidate on: `allocatePoints`, `respecPoints`, and any skill level-up (XP grant).

### Priority 2 — Return data from transaction instead of re-reading

`allocatePoints` can build the return value from the data it already has inside the transaction:

```ts
const result = await prisma.$transaction(async (tx) => {
  // ... existing logic ...
  const newAllocations = { ...allocations, [nodeId]: node.pointCost };
  // ... update ...
  return {
    playerId, totalPointsEarned,
    totalPointsSpent: totalPointsSpent + node.pointCost,
    availablePoints: availablePoints - node.pointCost,
    allocations: newAllocations,
    unlockedActions: deriveUnlockedActions(newAllocations),
  };
});
return result;
```

Saves 2–3 queries per allocate/respec call.

### Priority 3 — Move allocation creation to player setup

Create `SkillPointAllocation` during player registration instead of on first read. Eliminates the upsert-on-read pattern.

### Priority 4 — Add `select` to allocation queries

```ts
prisma.skillPointAllocation.findUnique({
  where: { playerId },
  select: { allocations: true },
});
```
