# Database Audit: trainingService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/trainingService.ts` (132 lines, 2 exported functions)

## Prisma Models Touched

Direct: `PlayerBestiary`, `PlayerBestiaryPrefix`, `MobTemplate`, `Player`
Via sub-services: `PlayerEquipment`, `Item`, `ItemTemplate`, `PlayerSkill`, `CombatTemplate`, `CombatTemplateSlot`, `SkillPointAllocation`
Redis: `training:cooldown:{playerId}`

---

## Findings

### N+1 Queries

No N+1 issues (no loops).

### Missing Indexes

No issues — all direct queries use PK or `@@id` composite key lookups:
- `PlayerBestiary` via `@@id([playerId, mobTemplateId])`
- `PlayerBestiaryPrefix` via `@@id([playerId, mobTemplateId, prefix])`
- `MobTemplate` via PK
- `Player` via PK

### Payload Bloat

**1. Bestiary checks fetch full rows for existence check (lines 42–53)**
Both `findUnique` calls only check `!bestiaryEntry` / `!prefixEntry` but fetch full rows.

```ts
prisma.playerBestiary.findUnique({
  where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
  // no select — full row for null check
});
```

**2. Duplicate `getEquipmentStats` fetch (lines 74–82 + inside `getHpState`)**
`getEquipmentStats` is called directly in the `Promise.all` (line 78), and `getHpState` (line 75) internally calls `getEquipmentStats` again. Equipment is fetched twice with full `include: { item: { include: { template: true } } }`.

**3. Duplicate skill level fetches (line 76 + line 91)**
`getSkillLevel` at line 76 fetches the attack skill level. Then `buildPerActionScaling` at line 91 fetches melee, ranged, magic levels (3 queries), and `getResourceState` at line 80 also fetches all skill levels internally. Same data queried 2–3 times.

**4. Sequential validation queries could be parallelized (lines 42–68)**
Bestiary check, prefix check, mob template fetch, and player username fetch are all independent but run sequentially.

### Cache Issues

**Good Redis usage for cooldowns:**
- `redis.ttl(key)` for cooldown check
- `redis.set(key, '1', 'EX', cooldownSeconds)` for setting cooldown

**Transitive cache issues** from sub-services (already audited):
- `getEquipmentStats` — strongest cache candidate
- `getActiveTemplate` — strong cache candidate
- `getSkillPoints` — strong cache candidate

### Migration Risks

None specific to this service.

---

## Query Patterns

### `simulateFight` — ~20–24 queries

| Phase | Step | Query | Notes |
|-------|------|-------|-------|
| Validation | 1 | `redis.ttl` | Cooldown check |
| | 2 | `playerBestiary.findUnique` | Existence check |
| | 3 | `playerBestiaryPrefix.findUnique` | Conditional |
| | 4 | `mobTemplate.findUnique` | Full row (justified) |
| | 5 | `player.findUnique` with select | Username only |
| | 6 | `getMainHandAttackSkill` | 1 query (bloated include) |
| Parallel fetch | 7 | `getHpState` | 3 queries (incl. equipment dupe) |
| | 8 | `getSkillLevel` | 1 query |
| | 9 | `getPlayerProgressionState` | 1 query |
| | 10 | `getEquipmentStats` | 1 query (**duplicate of #7**) |
| | 11 | `getActiveTemplate` | 1 query + join |
| | 12 | `getResourceState` | 2 queries |
| | 13 | `getSkillPoints` | 2–3 queries |
| Post-parallel | 14 | `buildPerActionScaling` | 3 queries (skill levels **duplicate**) |
| Cooldown | 15 | `redis.set` | Set cooldown |

**With deduplication:** Could be ~14–16 queries instead of ~20–24.

### `getCooldownRemaining` — 0 Prisma queries

Redis only.

---

## Suggested Fixes

### Priority 1 — Parallelize validation queries

```ts
const [bestiaryEntry, prefixEntry, mob, player, mainHandAttackSkill] = await Promise.all([
  prisma.playerBestiary.findUnique({ where: { playerId_mobTemplateId: { playerId, mobTemplateId } }, select: { id: true } }),
  prefix ? prisma.playerBestiaryPrefix.findUnique({ where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId, prefix } }, select: { id: true } }) : null,
  prisma.mobTemplate.findUnique({ where: { id: mobTemplateId } }),
  prisma.player.findUnique({ where: { id: playerId }, select: { username: true } }),
  getMainHandAttackSkill(playerId),
]);
```

Reduces 5–6 sequential queries to 1 parallel batch.

### Priority 2 — Use `preparePlayerForCombat` instead of duplicating

This function replicates the exact pattern from `combatOrchestrationService.preparePlayerForCombat`. Refactor to:

```ts
const prep = await preparePlayerForCombat(playerId, { requestedAttackSkill: null, maxHp: hpState.maxHp });
```

Centralizes the data-fetching pattern and any future optimizations apply to both combat and training.

### Priority 3 — Add `select: { id: true }` to bestiary checks

```ts
prisma.playerBestiary.findUnique({
  where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
  select: { id: true },
});
```

### Priority 4 — Remove duplicate equipment fetch

Pass `hpState.maxHp` or pre-fetched equipment stats to avoid `getHpState` + `getEquipmentStats` both querying equipment independently. Or move `getHpState` check before the `Promise.all` as a gate (if recovering, skip the expensive parallel fetch).
