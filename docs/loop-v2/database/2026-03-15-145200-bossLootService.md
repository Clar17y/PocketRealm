# Database Audit: bossLootService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/bossLootService.ts` (178 lines, 1 exported function + 1 private)

## Prisma Models Touched

Direct: `MobTemplate`, `ItemTemplate`, `CraftingRecipe`, `PlayerRecipe`
Via sub-services: `DropTable`, `Item`, `PlayerSkill`, `Player`, `PlayerBuff`, `PlayerAchievement`, `PlayerStats`

---

## Findings

### N+1 Queries

**1. `distributeBossLoot` — sequential per-contributor loop (lines 112–174)**
For each contributor (sequentially, NOT parallelized):
- `rollAndGrantLoot` — ~12 queries
- `enrichLootWithNames` — 0–1 queries
- Per trophy: `addStackableItem` — 2–3 queries each
- `grantSkillXp` — 6–8 queries
- `rollBossRecipeDrop` (conditional) — 3 queries
- `checkAchievements` + `emitAchievementNotifications` — 3–5 queries

**Per contributor: ~25–35 queries. For 5 contributors: ~125–175 queries. Sequential.**

```ts
for (const contributor of contributors) {
  const loot = await rollAndGrantLoot(contributor.playerId, mobTemplateId, ...);
  // ... trophy drops, XP, recipe, achievements — all sequential
}
```

### Missing Indexes
No new issues — transitive findings (DropTable.mobTemplateId, BossParticipant.playerId) apply.

### Payload Bloat
Good `select` usage on direct queries (`mobTemplate`, `itemTemplate`, `craftingRecipe`, `playerRecipe`). Bloat is transitive from lootService and xpService.

### Cache Issues

**1. Drop tables and trophy templates are static — queried per contributor**
The same mob drop table is queried via `rollAndGrantLoot` for every contributor. Trophy templates are batch-fetched once (good), but drop tables are not.

### Migration Risks
None.

---

## Query Patterns

### `distributeBossLoot` — 2 + N×(25–35) queries

| Phase | Queries | Notes |
|-------|---------|-------|
| Mob template + family | 1 | Good select with join |
| Trophy templates | 0–1 | Batch `findMany` — good |
| Per contributor: loot | ~12 | Via `rollAndGrantLoot` |
| Per contributor: trophies | 2–3 × trophyCount | Via `addStackableItem` |
| Per contributor: XP | 6–8 | Via `grantSkillXp` |
| Per contributor: recipe | 0–3 | Conditional |
| Per contributor: achievements | 3–5 | Via `checkAchievements` |

**Total (5 contributors): ~127–177 queries**

### `rollBossRecipeDrop` — 3 queries

Good `select` on all queries. Clean pattern (same as chestService recipe logic).

---

## Suggested Fixes

### Priority 1 — Parallelize contributor loop

The `for` loop is sequential but each contributor's rewards are independent:

```ts
await Promise.all(contributors.map(async (contributor) => {
  // ... same logic, parallel per contributor
}));
```

Reduces wall time proportionally. DB load stays the same but completes faster.

### Priority 2 — Cache drop table per mob

Fetch drop table once before the loop and reuse for all contributors.

### Priority 3 — Batch XP grants

If multiple contributors share the same attack skill, batch them into fewer `grantSkillXp` calls (or use a multi-player variant).
