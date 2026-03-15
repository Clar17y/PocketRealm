# Database Audit: guildContractService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/guildContractService.ts` (189 lines, 3 exported functions)

## Prisma Models Touched

Direct: `GuildContract`, `Guild`, `GuildLog`
Via sub-services: `GuildMember`, `PlayerAchievement`, `PlayerStats` (via achievement checks)

---

## Findings

### N+1 Queries

**1. `generateWeeklyContracts` — per-contract `create` in loop (lines 55–69)**
Creates 4–5 contracts one at a time inside a transaction. Could use `createMany`.

```ts
for (const def of selected) {
  const contract = await tx.guildContract.create({
    data: { guildId, contractKey: def.key, ... },
  });
  created.push(contract);
}
```

### Missing Indexes

**1. `incrementContractProgress` findFirst — partial index coverage (line 130)**
This query runs on every combat (via `trackProgress` → `incrementContractProgress`). It filters on 5 columns but `@@index([guildId, status])` only covers 2:

```ts
prisma.guildContract.findFirst({
  where: {
    guildId,           // ✅ covered by index
    contractKey: contractType,  // ❌ not in index
    status: 'active',           // ✅ covered by index
    weekStartedAt: { gte: weekStart },  // ❌ not in index
    expiresAt: { gt: now },             // ❌ not in index
  },
});
```

After using the `(guildId, status)` prefix, Postgres must scan remaining rows to filter by `contractKey`, `weekStartedAt`, and `expiresAt`. With ~4–5 active contracts per guild, the row scan is small. But a more targeted index would eliminate the scan entirely.

### Payload Bloat

**1. `incrementContractProgress` — `findFirst` without `select` (line 130)**
Fetches 10-column `GuildContract` row. Uses 5 fields: `id`, `currentValue`, `targetValue`, `rewardGuildXp`, `rewardTreasuryTurns`.

```ts
const contract = await prisma.guildContract.findFirst({
  where: { ... },
  // no select — 10 columns, uses 5
});
```

**2. `getActiveContracts` — `findMany` without `select` (line 94)**
Fetches full rows. Uses most fields via `toContractData` — largely justified.

### Cache Issues

No Redis usage. `incrementContractProgress` runs on every combat but data changes on each tick (currentValue increments), making read caching impractical for the progress query itself.

### Migration Risks

None. Good optimistic locking pattern: `updateMany` with `status: 'active'` guard prevents double-completion on concurrent requests.

---

## Query Patterns

### `generateWeeklyContracts` — 6–7 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `guild.findUnique({ id })` with select | PK, good |
| 2–6 | `guildContract.create` ×4–5 (in tx) | **N+1** |
| 7 | `guildLog.create` (in tx) | |

### `getActiveContracts` — 1 or ~8 queries

| Scenario | Queries |
|----------|---------|
| Contracts exist | 1 (`findMany`) |
| No contracts (generation) | 1 + 1 (`updateMany`) + 6–7 (`generateWeeklyContracts`) |

### `incrementContractProgress` — 2 or 7–8 queries

| Scenario | Step | Query | Notes |
|----------|------|-------|-------|
| No match | 1 | `findFirst` | Returns null, done |
| Increment | 1–2 | `findFirst` + `update` | Typical case |
| Complete | 1 | `findFirst` | Find contract |
| | 2–4 | tx: `updateMany` + `guild.update` + `guildLog.create` | Completion |
| | 5–7 | `addGuildXp` | 2–3 queries |
| | bg | `checkGuildAchievementsForAllMembers` | 60–100 queries (fire-and-forget) |

---

## Suggested Fixes

### Priority 1 — Use `createMany` in `generateWeeklyContracts`

```ts
const contractData = selected.map(def => ({
  guildId,
  contractKey: def.key,
  targetValue: def.targets[bracket],
  currentValue: 0,
  status: 'active',
  rewardGuildXp: randomIntInclusive(REWARD_GUILD_XP_MIN, REWARD_GUILD_XP_MAX),
  rewardTreasuryTurns: randomIntInclusive(REWARD_TREASURY_MIN, REWARD_TREASURY_MAX),
  weekStartedAt: weekStart,
  expiresAt: weekEnd,
}));

await tx.guildContract.createMany({ data: contractData });
```

Reduces 4–5 creates to 1 `createMany`. Note: `createMany` doesn't return created records, so if IDs are needed use `createManyAndReturn` (Prisma 5.14+).

### Priority 2 — Add `select` to `incrementContractProgress` findFirst

```ts
prisma.guildContract.findFirst({
  where: { ... },
  select: { id: true, currentValue: true, targetValue: true, rewardGuildXp: true, rewardTreasuryTurns: true },
});
```

### Priority 3 — Improve index for contract progress queries (optional)

```prisma
@@index([guildId, status, contractKey])
```

Adds `contractKey` to the existing index, allowing the query to narrow to the specific contract type without row scanning. Low priority since guilds typically have only 4–5 active contracts.
