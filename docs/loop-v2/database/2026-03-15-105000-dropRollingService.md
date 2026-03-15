# Database Audit: dropRollingService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/dropRollingService.ts` (144 lines, 3 exported functions + 1 utility)

## Prisma Models Touched

Direct: `Item`, `ItemTemplate`
Via sub-service: `ItemTemplate`, `Item` (via `addStackableItemTx` — redundantly)

---

## Findings

### N+1 Queries

**1. `addStackableItemTx` called per stackable roll (line 112)**
Each call internally does `itemTemplate.findUnique` + `item.findFirst` + `item.update`/`create` (2–3 queries). For 4 rolls with stackable items: 8–12 queries. This is despite the service already pre-fetching existing stacks (line 76) and template names (line 86).

```ts
for (let i = 0; i < rolls; i++) {
  // ...
  if (picked.itemTemplate.stackable) {
    // existingStacks already known from line 76
    // template already known from dropEntries
    await addStackableItemTx(tx, playerId, picked.itemTemplateId, quantity);  // re-queries both
  }
}
```

**2. Per non-stackable item creation (lines 127–136)**
Each non-stackable unit gets an individual `item.create`. For 3 non-stackable items: 3 sequential creates.

```ts
for (let q = 0; q < quantity; q++) {
  await tx.item.create({ data: { ... } });
}
```

### Missing Indexes

**1. `Item(ownerId, inStash)` — already identified (line 77)**
The existing-stacks pre-fetch query filters by `{ ownerId, inStash: false }`.

### Payload Bloat

**No issues.** This service uses `select` on both queries — a positive pattern:
- `item.findMany({ select: { templateId: true } })` — minimal
- `itemTemplate.findMany({ select: { id: true, name: true } })` — minimal

### Cache Issues

No Redis usage. No strong cache candidates — this function runs inside a caller's transaction with player-specific data.

### Migration Risks

None.

---

## Query Patterns

### `rollAndGrantDropsTx` — 2 + N×(2–3) queries

| Step | Query | Select/Include | Index |
|------|-------|---------------|-------|
| 1 | `item.findMany({ ownerId, inStash: false })` | `select: { templateId }` | **Missing** |
| 2 | `itemTemplate.findMany({ id: { in: [...] } })` | `select: { id, name }` | PK |
| 3–N | `addStackableItemTx` per stackable roll | — (internal: 2–3 queries) | Various |
| 3–N | `item.create` per non-stackable unit | — | — |

**Typical (4 rolls, 3 stackable + 1 non-stackable):**
2 (setup) + 3×3 (stackable) + 1 (non-stackable) = **12 queries**

**With fix (inline stack handling):**
2 (setup) + 3×1 (upsert) + 1 (create) = **6 queries**

---

## Suggested Fixes

### Priority 1 — Inline stack handling using pre-fetched data

The service already fetches existing stacks (line 76) and template info comes from `dropEntries`. Replace `addStackableItemTx` with direct upsert logic:

```ts
if (picked.itemTemplate.stackable) {
  const hasStack = existingStacks?.has(picked.itemTemplateId) || grantedStackableTemplates.has(picked.itemTemplateId);

  if (hasStack) {
    // Find and increment existing stack
    const existing = await tx.item.findFirst({
      where: { ownerId: playerId, templateId: picked.itemTemplateId, inStash: false },
      select: { id: true, quantity: true },
    });
    if (existing) {
      await tx.item.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + quantity },
      });
    }
  } else {
    // Create new stack — no need to re-verify template
    await tx.item.create({
      data: { ownerId: playerId, templateId: picked.itemTemplateId, rarity, quantity, ... },
    });
  }
}
```

Saves 1–2 queries per stackable roll by skipping the redundant `itemTemplate.findUnique` + duplicate `item.findFirst` inside `addStackableItemTx`.

### Priority 2 — Aggregate same-template rolls before granting

If 3 out of 4 rolls pick the same stackable template, aggregate to a single grant:

```ts
const aggregated = new Map<string, number>();
for (let i = 0; i < rolls; i++) {
  const picked = pickWeighted(...);
  aggregated.set(picked.itemTemplateId, (aggregated.get(picked.itemTemplateId) ?? 0) + quantity);
}
// Then grant once per unique template
```

Reduces N grants to M unique templates.

### Priority 3 — Batch non-stackable creates

```ts
const nonStackableItems = [];
// ... collect in loop ...
await tx.item.createMany({ data: nonStackableItems });
```
