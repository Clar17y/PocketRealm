# Database Audit: expeditionService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/expeditionService.ts` (largest service in the codebase — ~20+ exported/private functions)

## Prisma Models Touched

Direct: `GuildExpedition`, `GuildExpeditionMember`, `MobTemplate`, `PlayerExpeditionBestiary`, `GuildMember`, `Player`, `Guild`, `GuildLog`
Via sub-services: `PlayerEquipment`, `Item`, `ItemTemplate`, `PlayerSkill`, `CombatTemplate`, `CombatTemplateSlot`, `SkillPointAllocation`, `TurnBank`

---

## Findings

### N+1 Queries

**1. `buildRaidParticipant` called per alive member — in `resolveExpeditionRound` and `autoResolveRoom`**
Each member triggers `getEquipmentStats`, `getPlayerProgressionState`, `preparePlayerForCombat`, and `buildPotionPool`. Per member: ~15–18 queries. For 5 alive members: ~75–90 queries. Parallelized via `Promise.all`, but still heavy DB load.

**2. `resolveExpeditionRound` — sequential potion deductions (per participant)**
```ts
for (const pr of result.participantResults) {
  if (pr.potionsConsumed.length > 0) await deductConsumedPotions(...);
}
```
Sequential N+1. Note: `autoResolveRoom` uses `Promise.all` for the same operation — inconsistency.

**3. `handleRoomCleared` — per-member regen update (parallel)**
N individual `guildExpeditionMember.update` calls because each member has different regen values. Parallel via `Promise.all`, but still N queries.

**4. `handleRoomCleared` — members fetched 3 times**
Same `expeditionId` members are fetched at: (1) `include: { members: true }`, (2) `guildExpeditionMember.findMany`, (3) `getMembers`. Three identical queries for the same data.

**5. `recordExpeditionKills` — N×M upserts in one transaction**
`players × mobTypes` individual `playerExpeditionBestiary.upsert` calls. Batched in a single `$transaction` which is correct, but could be more efficient with bulk operations.

**6. `checkAndResolveExpeditionRounds` — sequential expedition processing**
Iterates due expeditions in a `for` loop, each potentially triggering `resolveExpeditionRound` (75–90 queries). For 3 due expeditions: could be 225–270 queries.

### Missing Indexes

**1. `MobTemplate.isExpeditionMob` — no index**
`buildTemplateIdMap` and `buildSummonPool` query `{ isExpeditionMob: true }` — requires full table scan. Called every expedition round.

**2. `GuildExpeditionMember` — no `@@index([expeditionId])` standalone**
Multiple `findMany({ expeditionId })` queries. The `@@unique([expeditionId, playerId])` covers `expeditionId` prefix, but `getMembers` and `getExpeditionStatus` order by `signedUpAt` which isn't covered.

### Payload Bloat

**1. `getMembers` — full rows, maps to 4 fields**
Fetches all GuildExpeditionMember columns, then only uses `playerId`, `isKnockedOut`, `currentHp`, `targetMobId`.

**2. `assertActiveMember` — 2 full-row fetches for status checks**
Both `guildExpedition.findUnique` and `guildExpeditionMember.findUnique` fetch full rows. Only needs `status`/`guildId` and `isKnockedOut` respectively.

**3. Existence checks fetch full rows throughout**
- `signUpForExpedition` query #4: full member row for existence check
- `launchExpedition` cooldown queries: full rows for existence checks
- `setHealTarget` target validation: full row for `isKnockedOut`/`currentHp`

**4. Multiple queries for cooldown/active checks without `select`**
`getExpeditionCooldowns` query #1 and `launchExpedition` cooldown queries fetch full `GuildExpedition` rows when only checking existence or single fields.

### Cache Issues

**No Redis usage.** Multiple cache opportunities:

| Data | Frequency | Volatility | Cache? |
|------|-----------|-----------|--------|
| `buildTemplateIdMap` / `buildSummonPool` | Every round | **Static** (mob templates) | **Strong** — global cache |
| `getExpeditionCooldowns` | Every expedition page view | Changes on expedition start/complete | Moderate |
| Active expedition status | Polled by UI | Changes on round resolution | Weak (changes frequently) |

`buildTemplateIdMap` and `buildSummonPool` query static mob template data. Same as `DropTable` caching recommendation — static game data should be cached globally.

### Migration Risks

**1. `handleRoomCleared` re-fetches members 3 times**
Not a schema risk but a maintenance risk — any change to member data shape requires updating 3 fetch points.

**2. `recordExpeditionKills` with N×M upserts**
At scale (many players × many mob types), this transaction could become long-running and lock many rows.

---

## Query Patterns

### Hot path: `resolveExpeditionRound` — ~80–120 queries per round

| Phase | Queries | Notes |
|-------|---------|-------|
| Expedition + members fetch | 1 (with join) | Full rows + player join |
| `buildRaidParticipant` ×N | ~15–18 per member | Parallel N+1 |
| `buildSummonPool` | 1 | Static data query |
| Expedition update (optimistic lock) | 1 | `updateMany` |
| Per-participant member update | N | Parallel |
| Potion deduction | 0–N | Sequential N+1 |
| `recordExpeditionKills` | players × mobs | Batch tx |
| Room cleared handling | ~5–10 | If applicable |

### `signUpForExpedition` — ~12–15 queries

4 parallel validation + 5 parallel combat data + 1 tx (turn spend + member create)

### `checkAndResolveExpeditionRounds` — N × 80–120 queries

Background timer. Processes all due expeditions sequentially.

---

## Suggested Fixes

### Priority 1 — Cache mob template data

```ts
// buildTemplateIdMap / buildSummonPool — static game data
const cacheKey = `expedition:mobs:${themeId}`;
```

### Priority 2 — Batch-build raid participants

Instead of per-member calls to `getEquipmentStats`/`getPlayerProgressionState`/etc., build a `prepareMultiplePlayersForCombat` that batches the DB queries:

```ts
// Fetch all equipment for N players in one query
const allEquipment = await prisma.playerEquipment.findMany({
  where: { playerId: { in: playerIds }, itemId: { not: null } },
  include: { item: { include: { template: true } } },
});
// Group by playerId, then build stats per player from pre-fetched data
```

### Priority 3 — Add `select` to validation and existence checks

```ts
// assertActiveMember
guildExpedition.findUnique({ where: { id }, select: { status: true, guildId: true } });
guildExpeditionMember.findUnique({ where: { ... }, select: { isKnockedOut: true } });

// getMembers
guildExpeditionMember.findMany({
  where: { expeditionId },
  select: { playerId: true, isKnockedOut: true, currentHp: true, targetMobId: true },
});
```

### Priority 4 — Eliminate triple member fetch in `handleRoomCleared`

Pass the members data through the function chain instead of re-fetching 3 times.

### Priority 5 — Add `@@index([isExpeditionMob])` on MobTemplate

Low-cost index for the expedition mob queries.
