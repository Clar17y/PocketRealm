# Database Audit: pvpCombatantBuilder

**Date:** 2026-03-14
**Service:** `apps/api/src/services/pvpCombatantBuilder.ts` (116 lines, 2 exported functions)

## Prisma Models Touched

Direct: `PlayerEquipment`, `Item`, `ItemTemplate`, `Player`
Via sub-services: `PlayerSkill`, `CombatTemplate`, `CombatTemplateSlot`, `SkillPointAllocation`

---

## Findings

### N+1 Queries

**1. Equipment fetched twice — `getEquipmentStats` + `getAttackStyle` (lines 47–48)**
`getEquipmentStats` already fetches all equipped items (including main_hand). `getAttackStyle` then issues a separate `findUnique` for the main_hand slot to read `template.requiredSkill`. The attack style could be derived from the equipment stats result.

```ts
const [player, equipStats, attackStyle, ...] = await Promise.all([
  ...,
  getEquipmentStats(playerId),  // fetches ALL equipment incl. main_hand
  getAttackStyle(playerId),     // re-fetches main_hand equipment
  ...
]);
```

**2. Four individual `getSkillLevel` calls (lines 55–60)**
Four separate `findUnique` queries for melee, ranged, evasion, magic. Could be a single `findMany`.

```ts
const [meleeLevel, rangedLevel, evasionLevel, magicLevel] = await Promise.all([
  getSkillLevel(playerId, 'melee'),
  getSkillLevel(playerId, 'ranged'),
  getSkillLevel(playerId, 'evasion'),
  getSkillLevel(playerId, 'magic'),
]);
```

**3. Skill levels fetched twice when `useCurrentResources=true` (lines 55–60 + 80)**
`getResourceState` internally calls `getSkillLevels` (a `findMany` for ALL skills) to compute max stamina/mana. The 4× `getSkillLevel` calls in phase 2 then re-fetch the same data. Total: 4 `findUnique` + 1 `findMany` for the same player's skills.

### Missing Indexes

No new index issues — all queries hit well-indexed paths:
- `PlayerEquipment` via `@@id([playerId, slot])` composite PK
- `PlayerSkill` via `@@unique([playerId, skillType])`
- `Player` via PK

### Payload Bloat

**1. `getAttackStyle` — full `include` for one field (lines 21–24)**
Identical to `getMainHandAttackSkill` in combatStatsService. Fetches full `Item` + `ItemTemplate` rows when only `template.requiredSkill` is needed.

```ts
prisma.playerEquipment.findUnique({
  where: { playerId_slot: { playerId, slot: 'main_hand' } },
  include: { item: { include: { template: true } } },  // ~20 unused columns
});
```

### Cache Issues

**No Redis usage.**

| Data | Fetched From | Change Frequency | Cache Candidate? |
|------|-------------|-----------------|-----------------|
| Equipment stats | `getEquipmentStats` | On equip/unequip | Yes — event-invalidated |
| Active template | `getActiveTemplate` | On template edit | Yes — event-invalidated |
| Skill levels (×4) | `getSkillLevel` | On XP grant | Marginal |
| Skill points | `getSkillPoints` | On allocation | Yes |

All already flagged in prior audits. The key issue is this service compounds the problem — it's called **twice per PvP challenge** (once per combatant), doubling every missing optimization.

### Migration Risks

None specific to this service.

---

## Query Patterns

### `getAttackStyle` — 1 query (with 2 joins)

| Query | Select/Include | Index |
|-------|---------------|-------|
| `playerEquipment.findUnique` | `include: { item: { include: { template: true } } }` | `@@id([playerId, slot])` |

### `buildPvpCombatant` — 11–16 queries total

| Phase | Queries | Details |
|-------|---------|---------|
| Phase 1 (`Promise.all`) | 5–6 | player attrs + equipStats + attackStyle + template + skillPoints |
| Phase 2 (`Promise.all`) | 4 | 4× getSkillLevel |
| Phase 3 (conditional) | 0 or 3 | getHpState + getResourceState (attacker only) |
| **Total (defender)** | **~11** | |
| **Total (attacker)** | **~14** | |

**Per PvP challenge (2 combatants): ~25 queries** just for building combatants, before any match logic.

---

## Suggested Fixes

### Priority 1 — Eliminate duplicate equipment fetch

Derive attack style from `getEquipmentStats` result instead of calling `getAttackStyle` separately. The equipment data already includes the main-hand item's `template.requiredSkill`.

```ts
const [player, equipStats, template, skillPoints] = await Promise.all([...]);
const attackStyle = deriveAttackStyleFromEquipment(equipStats); // no extra query
```

Saves 1 query per combatant (2 per challenge).

### Priority 2 — Batch skill level queries

Replace 4× `getSkillLevel` with a single `findMany`:

```ts
const skills = await prisma.playerSkill.findMany({
  where: { playerId, skillType: { in: ['melee', 'ranged', 'evasion', 'magic'] } },
  select: { skillType: true, level: true },
});
```

Saves 3 queries per combatant (6 per challenge).

### Priority 3 — Share skill levels with `getResourceState`

When `useCurrentResources=true`, pass the already-fetched skill levels into `getResourceState` to avoid the internal `findMany` re-fetch. Saves 1 query per attacker combatant.

### Priority 4 — Slim `getAttackStyle`

If kept as a standalone function (e.g. for `pvpService` direct calls), use targeted `select`:

```ts
prisma.playerEquipment.findUnique({
  where: { playerId_slot: { playerId, slot: 'main_hand' } },
  select: { item: { select: { template: { select: { requiredSkill: true } } } } },
});
```

### Impact summary

| Fix | Queries saved per challenge |
|-----|---------------------------|
| Deduplicate equipment | 2 (attacker) + 2 (pvpService getAttackStyle) |
| Batch skill levels | 6 |
| Share skill levels with resources | 1 |
| **Total** | **~11 fewer queries** |
