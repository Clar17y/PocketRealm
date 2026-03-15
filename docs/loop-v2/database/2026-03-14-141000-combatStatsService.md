# Database Audit: combatStatsService

**Date:** 2026-03-14
**Service:** `apps/api/src/services/combatStatsService.ts` (89 lines, 3 exported functions)

## Prisma Models Touched

`PlayerSkill`, `PlayerEquipment`, `Item`, `ItemTemplate` (last three via `getMainHandAttackSkill`)
Fallback path in `buildPerActionScaling` also touches `Player` (via imported `getPlayerProgressionState`).

---

## Findings

### N+1 Queries

**1. Three individual `getSkillLevel` calls in `buildPerActionScaling` (lines 38–42)**
Fires 3 separate `findUnique` queries for melee, ranged, magic skill levels. Could be a single `findMany` with a `skillType: { in: ['melee', 'ranged', 'magic'] }` filter.

```ts
const [meleeLevel, rangedLevel, magicLevel] = await Promise.all([
  getSkillLevel(playerId, 'melee'),
  getSkillLevel(playerId, 'ranged'),
  getSkillLevel(playerId, 'magic'),
]);
```

Each calls:
```ts
prisma.playerSkill.findUnique({
  where: { playerId_skillType: { playerId, skillType } },
  select: { level: true },
})
```

**Impact:** 3 round-trips instead of 1. These are parallelized via `Promise.all` (good), but still 3 separate DB hits. In the combat path, `getResourceState` also fetches ALL skill levels via `findMany` — meaning melee/ranged/magic levels are fetched twice per combat.

### Missing Indexes

No issues — all queries hit well-indexed paths:
- `PlayerEquipment` uses `@@id([playerId, slot])` composite PK
- `PlayerSkill` uses `@@unique([playerId, skillType])`

### Payload Bloat

**1. `getMainHandAttackSkill` — full `include` for one field (lines 13–16)**
Uses `include: { item: { include: { template: true } } }` which fetches entire `Item` row (id, rarity, bonusStats JSON, currentDurability, quantity, etc.) and entire `ItemTemplate` row (baseStats JSON, consumableEffect JSON, all 14 columns). Only `template.requiredSkill` is used (line 17).

```ts
const mainHand = await prisma.playerEquipment.findUnique({
  where: { playerId_slot: { playerId, slot: 'main_hand' } },
  include: { item: { include: { template: true } } },
});
const requiredSkill = mainHand?.item?.template?.requiredSkill; // only field used
```

### Cache Issues

**No Redis usage anywhere in the service.**

| Function | Data Volatility | Call Frequency | Cache Candidate? |
|----------|----------------|----------------|-----------------|
| `getMainHandAttackSkill` | Changes on equip/unequip only | Every combat | Yes — short TTL or event-invalidated |
| `getSkillLevel` | Changes on XP grant (each combat) | 3x per combat via `buildPerActionScaling` | Marginal — changes every combat |
| `buildPerActionScaling` | Composite of above | Every combat | Better to cache inputs |

`getMainHandAttackSkill` is the strongest cache candidate — weapon changes are infrequent (player action), but this is queried on every single combat.

### Migration Risks

No direct risks in this service. All models used are stable with proper PKs and FKs.

---

## Query Patterns

| Function | Prisma Call | Select/Include | Index Used |
|----------|-----------|----------------|------------|
| `getMainHandAttackSkill` | `playerEquipment.findUnique` | `include: { item: { include: { template: true } } }` — full rows | `@@id([playerId, slot])` |
| `getSkillLevel` | `playerSkill.findUnique` | `select: { level: true }` — minimal | `@@unique([playerId, skillType])` |
| `buildPerActionScaling` (preloaded) | 3× `playerSkill.findUnique` | `select: { level: true }` — minimal | `@@unique([playerId, skillType])` |
| `buildPerActionScaling` (fallback) | Above + `getEquipmentStats` + `getPlayerProgressionState` + `getMainHandAttackSkill` | Mixed | Various |

**Total queries per call:**
- `getMainHandAttackSkill`: 1 (with 2 joins)
- `getSkillLevel`: 1
- `buildPerActionScaling` (preloaded path): 3
- `buildPerActionScaling` (fallback path): 3 + 1 + 1 + 1 = 6

---

## Suggested Fixes

### Priority 1 — Reduce payload bloat

**`getMainHandAttackSkill`** — replace `include` with targeted `select`:
```ts
const mainHand = await prisma.playerEquipment.findUnique({
  where: { playerId_slot: { playerId, slot: 'main_hand' } },
  select: { item: { select: { template: { select: { requiredSkill: true } } } } },
});
```
Eliminates fetching ~20 unused columns across Item + ItemTemplate.

### Priority 2 — Batch skill level queries

Replace 3× `getSkillLevel` in `buildPerActionScaling` with a single `findMany`:
```ts
const skills = await prisma.playerSkill.findMany({
  where: { playerId, skillType: { in: ['melee', 'ranged', 'magic'] } },
  select: { skillType: true, level: true },
});
const levelMap = Object.fromEntries(skills.map(s => [s.skillType, s.level]));
```
Saves 2 DB round-trips per combat.

### Priority 3 — Deduplicate with `getResourceState`

In the combat orchestration path, `getResourceState` already fetches all skill levels. Pass those into `buildPerActionScaling` via the `preloaded` parameter to avoid re-fetching melee/ranged/magic levels. This requires reordering the `Promise.all` in `preparePlayerForCombat` so `getResourceState` resolves before `buildPerActionScaling`.
