# Database Audit: combatOrchestrationService

**Date:** 2026-03-14
**Service:** `apps/api/src/services/combatOrchestrationService.ts`

## Prisma Models Touched

Direct + transitive: `Player`, `PlayerSkill`, `PlayerEquipment`, `Item`, `ItemTemplate`, `GuildMember`, `GuildUpgrade`, `GuildProject`, `Guild`, `GuildLog`, `CombatTemplate`, `CombatTemplateSlot`, `SkillPointAllocation`, `DropTable`, `PlayerBestiary`, `PlayerBestiaryPrefix`, `PlayerQuest`, `GuildContract`, `PlayerBuff`

**Total queries per combat: ~36–53 Prisma queries.**

---

## Findings

### N+1 Queries

**1. Loot granting loop in `rollAndGrantLootWithCapacity` (lootService.ts)**
Each drop individually queries for existing stacks then creates/updates. A mob with 4 drop table entries produces 8–12 serial queries.

```ts
// Per drop:
prisma.item.findFirst({ where: { ownerId, templateId, inStash: false } })
// then one of:
prisma.item.update({ where: { id }, data: { quantity: { increment } } })
prisma.item.create({ data: { ... } })
```

**2. Sequential `grantSkillXp` in `splitAndGrantXp` (lines 293–298)**
When XP is split across 2–3 combat skills, each `grantSkillXp` runs sequentially with its own transaction (5–6 queries each).

```ts
for (const skill of skills) {
  results.push(await grantSkillXp(playerId, skill, xpBySkill[skill], undefined, boost));
}
```

**3. Sequential `trackProgress` calls (lines 230–236)**
Three separate `trackProgress` calls (kill_count, kill_family, kill_prefix) each independently query guild ID + contracts + quests.

```ts
const killProgress = await trackProgress(playerId, 'kill_count', 1);
const familyProgress = await trackProgress(playerId, 'kill_family', 1);
const prefixProgress = await trackProgress(playerId, 'kill_prefix', 1, { prefix: mob.mobPrefix });
```

### Missing Indexes

**1. `Item.ownerId` — no explicit `@@index`**
`buildPotionPool` queries `Item` by `ownerId` with a joined filter on `template.itemType`. Relies on implicit FK index which should be verified in the actual DB.

```ts
prisma.item.findMany({
  where: { ownerId: playerId, template: { itemType: 'consumable' } },
  include: { template: true },
})
```

**2. `DropTable.mobTemplateId` — no explicit `@@index`**
`rollAndGrantLootWithCapacity` queries all drop table entries for a mob. FK exists but no explicit index.

```ts
prisma.dropTable.findMany({ where: { mobTemplateId }, include: { itemTemplate: true } })
```

**3. `GuildUpgrade` index mismatch**
Query filters on `(guildId, expiresAt)` but the index is `@@index([guildId, upgradeType, expiresAt])`. The middle column `upgradeType` isn't in the WHERE clause, so only the `guildId` prefix is usable.

```ts
prisma.guildUpgrade.findMany({ where: { guildId, expiresAt: { gt: now } } })
```

### Payload Bloat

**1. `getMainHandAttackSkill` (combatStatsService.ts)**
Uses `include: { item: { include: { template: true } } }` — fetches full `ItemTemplate` (JSON blobs like `baseStats`, `consumableEffect`) when only `requiredSkill` is needed.

**2. `getEquipmentStats` (equipmentService.ts)**
Same pattern — `include: { item: { include: { template: true } } }` for all equipped items. Only needs `baseStats`, `maxDurability`, and a few fields from `Item`.

**3. `buildPotionPool` (potionService.ts)**
`include: { template: true }` fetches full `ItemTemplate` rows for all consumables. Only needs potion-relevant fields.

**4. `getSkillPoints` → `skillPointAllocation.findUnique` (skillPointService.ts)**
Fetches full row without `select`. Minor — row is small.

### Cache Issues

**Zero Redis caching on reads in the entire combat path.** Only `storePendingLoot` (loot overflow) writes to Redis.

**High-value cache candidates:**

| Data | Change Frequency | Queries Saved |
|------|-----------------|---------------|
| `getPlayerGuildModifiers` | Rarely (guild upgrades/projects change) | 4–5 per combat |
| `getActiveTemplate` | Only on player edit | 1 per combat |
| `getEquipmentStats` | Only on equip/unequip | 1 per combat |
| `getSkillPoints` → `unlockedActions` | Only on skill point spend | 2–3 per combat |
| `DropTable` for mob | Never (static data) | 1 per combat |

**Invalidation points needed:** equip/unequip, guild upgrade purchase, guild project completion, template edit, skill point allocation, admin mob/drop edits.

### Migration Risks

**1. `PlayerBuff` implicit cascade**
`PlayerBuff` has `player Player @relation(...)` with implicit cascade delete. If a player is deleted, buffs are silently removed — fine for now but risky if buff history is ever needed.

**2. `SkillPointAllocation` upsert-on-read pattern**
`getSkillPoints` creates a `SkillPointAllocation` record if it doesn't exist (line ~45 of skillPointService.ts). This turns a read path into a write path, which is unexpected and could cause issues under concurrent requests.

---

## Query Patterns Summary

### Pre-combat (`preparePlayerForCombat`) — ~16–18 queries

| Function | Queries | Parallelized? |
|----------|---------|---------------|
| `getMainHandAttackSkill` | 1 (2 joins) | Step 1 (before Promise.all) |
| `getSkillLevel` | 1 | Promise.all |
| `getPlayerProgressionState` | 1 | Promise.all |
| `getEquipmentStats` | 1 (2 joins) | Promise.all |
| `getPlayerGuildModifiers` | 4–5 | Promise.all |
| `getActiveTemplate` | 1 (1 join) | Promise.all |
| `getResourceState` | 2 | Promise.all |
| `getSkillPoints` | 2–3 | Promise.all |
| `buildPerActionScaling` | 3 | Step 3 (after Promise.all) |
| `buildPotionPool` | 0–1 | Step 4 (conditional) |

### Post-combat (`processCombatVictoryRewards`) — ~20–35 queries

| Function | Queries | Parallelized? |
|----------|---------|---------------|
| `rollAndGrantLootWithCapacity` | 3 + N per drop | Sequential |
| `splitAndGrantXp` (1–3 skills) | 5–6 per skill | Sequential |
| `recordBestiaryKill` | 1–2 | Sequential |
| `getPlayerGuildId` | 1 | Sequential |
| `addGuildXp` | 2–3 | Sequential |
| `trackProgress` ×3 | ~4–6 each | Sequential |

---

## Suggested Fixes

### Priority 1 — Redundant queries (easy wins)

1. **Pass `guildId` to `trackProgress`** — it's already fetched at line 225. Each of the 3 calls re-fetches it. Saves 3 queries per combat.

2. **Deduplicate skill level fetches** — `getResourceState` fetches all skill levels via `findMany`, but `buildPerActionScaling` then fetches melee/ranged/magic individually. Share the result to save 3 queries.

3. **Parallelize post-combat calls** — `recordBestiaryKill`, `getPlayerGuildId` + `addGuildXp`, and the 3 `trackProgress` calls are independent. Use `Promise.all`.

### Priority 2 — Add `select` clauses

4. **`getMainHandAttackSkill`** — `select: { item: { select: { template: { select: { requiredSkill: true } } } } }`
5. **`getEquipmentStats`** — select only `baseStats`, `maxDurability`, `currentDurability`, `slot`
6. **`buildPotionPool`** — select only potion-relevant template fields

### Priority 3 — Redis caching

7. **Cache `getPlayerGuildModifiers`** with 60s TTL, invalidate on guild upgrade/project/specialization changes. Saves 4–5 queries per combat.
8. **Cache `DropTable` per mob** with long TTL (static data). Saves 1 query + joins per combat.

### Priority 4 — Batch operations

9. **Batch loot granting** — collect all drops, group stackables by templateId, upsert in bulk or use `createMany` + single `updateMany`.
10. **Batch `trackProgress`** — accept an array of progress types and do a single guild/quest lookup.

### Priority 5 — Add explicit indexes

11. `@@index([ownerId])` on `Item` model
12. `@@index([mobTemplateId])` on `DropTable` model
13. Add `@@index([guildId, expiresAt])` on `GuildUpgrade` (or reorder existing index)
