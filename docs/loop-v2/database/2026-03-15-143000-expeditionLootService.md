# Database Audit: expeditionLootService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/expeditionLootService.ts` (167 lines, 3 exported functions)

## Prisma Models Touched

Direct: `Player`, `GuildExpeditionMember`
Via sub-services: `DropTable`, `ItemTemplate`, `Item`, `PlayerEquipment` (via `rollAndGrantLoot`)

---

## Findings

### N+1 Queries

**1. `distributeRoomLoot` — nested contributor × mob loop (lines 49–84)**
For each contributor, for each mob template ID, calls `rollAndGrantLoot` individually. Each call triggers ~12 queries (dropTable fetch, inventory state, per-drop stack checks, item creation). For 5 players × 3 mobs = 15 calls = **~180 queries**.

```ts
for (const contributor of contributors) {
  for (const mobTemplateId of mobTemplateIds) {
    const drops = await rollAndGrantLoot(contributor.playerId, mobTemplateId, mobLevel, dropMultiplier);
    const enriched = await enrichLootWithNames(drops);
    // ...
  }
}
```

Also calls `enrichLootWithNames` per-mob instead of batching all drops per player.

### Missing Indexes

No new issues — transitive findings from lootService (DropTable.mobTemplateId, Item.ownerId) apply.

### Payload Bloat

None directly. All bloat is transitive from lootService (already audited).

### Cache Issues

No Redis. Drop table caching (already recommended in lootService) would benefit here since the same mob drop tables are queried repeatedly across contributors.

### Migration Risks

None.

---

## Query Patterns

### `distributeRoomLoot` — contributors × mobs × ~12 queries each

| Phase | Queries | Notes |
|-------|---------|-------|
| Per contributor × per mob | ~12 each | Via `rollAndGrantLoot` |
| Per contributor × per mob | 0–1 each | Via `enrichLootWithNames` |
| **Total (5 players × 3 mobs)** | **~180** | Sequential nested loop |

### `awardRoomTokens` / `awardCompletionBonus` — 2 queries each

| Query | Notes |
|-------|-------|
| `player.updateMany({ in: playerIds })` | Bulk token increment — **good** |
| `guildExpeditionMember.updateMany` | Bulk tracking — **good** |

Clean bulk patterns.

---

## Suggested Fixes

### Priority 1 — Batch drop table fetches across contributors

Since all contributors share the same mob template IDs, fetch drop tables once per mob and reuse:

```ts
// Fetch all drop tables upfront (1 query per unique mob, or cache)
const dropTablesByMob = new Map();
for (const mobId of mobTemplateIds) {
  dropTablesByMob.set(mobId, await fetchDropTable(mobId)); // or cache
}
// Then roll per-contributor using pre-fetched data
```

### Priority 2 — Batch `enrichLootWithNames` per player

Collect all drops per player, call `enrichLootWithNames` once per player instead of once per mob.
