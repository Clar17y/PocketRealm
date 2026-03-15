# Database Audit: cacheLootService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/cacheLootService.ts` (254 lines, 2 exported functions)

## Prisma Models Touched

Direct: `ResourceNode`, `ItemTemplate`, `CraftingRecipe`, `Item`
Via sub-service: `ItemTemplate` (via `addStackableItemTx`)

---

## Findings

### N+1 Queries

**1. Material granting loop calls `addStackableItemTx` 2–4 times (lines 175–210)**
Each material roll calls `addStackableItemTx` which internally does `itemTemplate.findUnique` + `item.findFirst` + `item.update`/`create` = 2–3 queries per call. For 4 rolls: 8–12 queries.

```ts
for (let i = 0; i < materialRolls; i++) {
  // ...
  await addStackableItemTx(tx, params.playerId, picked.templateId, 1);
  // ...
}
```

The existing stacks are already known (fetched at line 164), and the templates are already fetched (line 122). The `addStackableItemTx` re-queries both.

### Missing Indexes

**1. `ResourceNode` — no `@@index([zoneId])` (line 105)**
Zone resource nodes are queried by `zoneId`. No explicit index — relies on implicit FK index.

```ts
resourceNode.findMany({
  where: { zoneId: params.zoneId },
  select: { skillRequired: true, levelRequired: true },
});
```

**2. `CraftingRecipe` — no `@@index([skillType])` (line 130)**
All refining recipes fetched by `skillType: 'refining'`. No index on `skillType` — has `@@index([isAdvanced])` and `@@index([mobFamilyId])` but not the one needed here.

```ts
craftingRecipe.findMany({
  where: { skillType: 'refining' },
  select: { resultTemplateId: true, resultTemplate: { ... }, materials: true },
});
```

**3. `Item(ownerId, inStash)` — already identified in prior audits (line 164)**

### Payload Bloat

**Generally clean.** This service uses `select` on most queries — a positive pattern. One notable issue:

**1. Refining recipe fetch — all recipes then JS filter (lines 130–151)**
Fetches ALL refining recipes because `materials` is a JSON column that can't be relationally filtered for zone-specific gems. The JS filter at line 144 then narrows to zone-relevant recipes. For a large recipe table, this fetches unnecessary rows.

```ts
const refiningRecipes = await craftingRecipe.findMany({
  where: { skillType: 'refining' },  // fetches ALL refining recipes
  select: { resultTemplateId, resultTemplate: { name }, materials },
});
// Then filters in JS:
for (const recipe of refiningRecipes) {
  const usesZoneGem = recipe.materials.some(m => rawGemIdSet.has(m.templateId));
}
```

### Cache Issues

**No Redis usage. Multiple queries for STATIC game data.**

| Query | Data Type | Volatility | Cache Candidate? |
|-------|-----------|-----------|-----------------|
| `resourceNode.findMany({ zoneId })` | Zone design data | **Never** (admin-only) | **Strong** — long TTL |
| `craftingRecipe.findMany({ skillType: 'refining' })` | Recipe data | **Never** (admin-only) | **Strong** — long TTL |
| `craftingRecipe.findMany({ soulbound, mobFamilyId })` | Recipe data | **Never** | **Strong** — long TTL |

All three are seed/design data that never changes at runtime. Caching would eliminate 3 queries per hidden cache opening.

### Migration Risks

**1. `CraftingRecipe.materials` as JSON prevents relational filtering**
The `materials Json` column stores `[{ templateId, quantity }]`. This forces the service to fetch ALL refining recipes and filter in JS because Prisma can't filter by values inside JSON arrays. If recipes grow, this becomes increasingly wasteful.

A `CraftingRecipeMaterial` join table would enable relational filtering but is a significant schema change.

---

## Query Patterns

### `grantCacheLootTx` — 5–15 queries total

| Step | Query | Index | Notes |
|------|-------|-------|-------|
| 1 | `resourceNode.findMany({ zoneId })` | **No explicit index** | Static data |
| 2 | `itemTemplate.findMany({ name: { in: [...] } })` | **No name index** | Low impact (small table) |
| 3 | `craftingRecipe.findMany({ skillType: 'refining' })` | **No skillType index** | Fetches all, filters in JS |
| 4 | `item.findMany({ ownerId, inStash: false })` | **No ownerId index** | Existing stack check |
| 5–8 | `addStackableItemTx` ×2–4 (material rolls) | Various | N+1 |
| 9 | `craftingRecipe.findMany({ soulbound, mobFamilyId })` | `@@index([mobFamilyId])` | Conditional |
| 10 | `item.create` (soulbound item) | — | Conditional |
| 11 | `craftingRecipe.findMany({ soulbound, zoneMappings })` | `@@index([mobFamilyId])` partial | Fallback only |

**Typical total:** 5 (setup) + 6–12 (material grants) + 1–2 (soulbound) = **12–19 queries**

### `rollRarityWithLuck` — 0 queries (pure function)

---

## Suggested Fixes

### Priority 1 — Cache static game data

All zone/recipe queries return static data. Cache in Redis with long TTL:

```ts
// Cache resource nodes per zone
const cacheKey = `zone:nodes:${zoneId}`;
// Cache refining recipes globally
const cacheKey = `recipes:refining`;
// Cache soulbound recipes per mob family
const cacheKey = `recipes:soulbound:${mobFamilyId}`;
```

Invalidate on: admin data reload / seed. Saves 3–4 queries per cache opening.

### Priority 2 — Inline material stack granting

Instead of calling `addStackableItemTx` per roll (which re-queries template + existing stack), use the already-fetched data:

```ts
// Already have existingStacks (line 162) and template IDs (line 118)
// Aggregate quantities per template, then do one upsert per unique template:
for (const [templateId, qty] of aggregatedMaterials) {
  const existing = await tx.item.findFirst({
    where: { ownerId: playerId, templateId, inStash: false },
    select: { id: true, quantity: true },
  });
  if (existing) {
    await tx.item.update({ where: { id: existing.id }, data: { quantity: { increment: qty } } });
  } else {
    await tx.item.create({ data: { ownerId: playerId, templateId, quantity: qty, rarity: 'common', ... } });
  }
}
```

Reduces N rolls to M unique templates (typically 1–3).

### Priority 3 — Add missing indexes

```prisma
model ResourceNode {
  @@index([zoneId])
}

model CraftingRecipe {
  @@index([skillType])
  // existing: @@index([isAdvanced]), @@index([mobFamilyId])
}
```
