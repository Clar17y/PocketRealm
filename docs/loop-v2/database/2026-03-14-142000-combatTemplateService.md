# Database Audit: combatTemplateService

**Date:** 2026-03-14
**Service:** `apps/api/src/services/combatTemplateService.ts` (207 lines, 6 exported functions)

## Prisma Models Touched

`CombatTemplate`, `CombatTemplateSlot`

---

## Findings

### N+1 Queries

No N+1 issues found. All queries are direct lookups or use nested `include`/`createMany` appropriately.

### Missing Indexes

**1. `getTemplates` — `orderBy: { createdAt: 'asc' }` not covered by index**
The existing `@@index([playerId, isActive])` covers the `playerId` filter prefix but not `createdAt` ordering. The DB will filter by `playerId` then sort in memory.

```ts
prisma.combatTemplate.findMany({
  where: { playerId },
  orderBy: { createdAt: 'asc' },
  include: { slots: { orderBy: { sortOrder: 'asc' } } },
});
```

**Impact:** Low — template count is capped at `MAX_TEMPLATES` (small number), so in-memory sort is negligible.

### Payload Bloat

**1. `getActiveTemplate` — fetches full template row, discards it (lines 93–104)**
Returns only `record.slots.map(toSlotData)` — the template-level fields (id, name, isActive, createdAt, updatedAt) are fetched but never used. Called on every combat.

```ts
const record = await prisma.combatTemplate.findFirst({
  where: { playerId, isActive: true },
  include: { slots: { orderBy: { sortOrder: 'asc' } } },
});
return record.slots.map(toSlotData);
```

**2. Ownership checks fetch full rows unnecessarily (lines 107, 131)**
`setActiveTemplate` and `updateTemplate` both do `findFirst({ where: { id, playerId } })` and only check `!template` (existence). Full row fetched for a null check.

```ts
const template = await prisma.combatTemplate.findFirst({
  where: { id: templateId, playerId },
});
if (!template) throw new AppError(404, ...);
```

Note: `deleteTemplate` (line 163) actually uses `template.isActive`, so its full-row fetch is justified.

**3. `updateTemplate` re-fetches after transaction (line 155)**
After the `$transaction` that updates name + replaces slots, the template is re-fetched with a separate query to return the result. The transaction could return the data directly.

```ts
// After transaction completes:
const updated = await prisma.combatTemplate.findUniqueOrThrow({
  where: { id: templateId },
  include: { slots: { orderBy: { sortOrder: 'asc' } } },
});
```

### Cache Issues

**No Redis usage anywhere in the service.**

| Function | Call Frequency | Data Volatility | Cache Candidate? |
|----------|---------------|----------------|-----------------|
| `getActiveTemplate` | Every combat | Only changes on player template edit/switch | **Strong** — event-invalidated on set/update/delete |
| `getTemplates` | Player views template list | Same | Weak — UI call, not hot path |

`getActiveTemplate` is the #1 cache candidate here. It's called on every single combat via `preparePlayerForCombat`, but the data only changes when the player explicitly edits or switches templates.

**Invalidation points:** `setActiveTemplate`, `updateTemplate`, `deleteTemplate`, `createTemplate` (if first template, auto-activates).

### Migration Risks

**1. `updateTemplate` uses delete-all-then-recreate for slots (lines 148–151)**
Slot IDs are regenerated on every edit, which means any external references to slot IDs would break. Currently no other models reference slot IDs, so this is safe — but would become a problem if slot IDs are ever stored elsewhere (e.g., analytics, combat logs).

```ts
await tx.combatTemplateSlot.deleteMany({ where: { templateId } });
await tx.combatTemplateSlot.createMany({
  data: slots.map((s, i) => ({ templateId, ...toSlotCreateData(s, i) })),
});
```

**2. `CombatTemplateSlot` cascade delete is correct**
`onDelete: Cascade` from `CombatTemplate` means deleting a template auto-deletes its slots. This is the intended behavior.

---

## Query Patterns

| Function | Prisma Calls | Select/Include | Index Used |
|----------|-------------|----------------|------------|
| `createTemplate` | `count` + `create` with nested `slots.create` | `include: { slots }` | `@@index([playerId, isActive])` prefix |
| `getTemplates` | `findMany` | `include: { slots }` — full rows | `@@index([playerId, isActive])` prefix |
| `getActiveTemplate` | `findFirst` | `include: { slots }` — full template row discarded | `@@index([playerId, isActive])` exact match |
| `setActiveTemplate` | `findFirst` + tx(`updateMany` + `update`) | No select — full row for existence check | PK + `@@index([playerId, isActive])` |
| `updateTemplate` | `findFirst` + tx(`update` + `deleteMany` + `createMany`) + `findUniqueOrThrow` | No select on ownership check; post-tx re-fetch | PK |
| `deleteTemplate` | `findFirst` + `delete` | No select — uses `isActive` field (justified) | PK |

**Total queries per function:**
- `createTemplate`: 2
- `getTemplates`: 1 (with join)
- `getActiveTemplate`: 1 (with join)
- `setActiveTemplate`: 3 (1 check + 2 in tx)
- `updateTemplate`: 4–5 (1 check + 2–3 in tx + 1 re-fetch)
- `deleteTemplate`: 2

---

## Suggested Fixes

### Priority 1 — Cache `getActiveTemplate`

Cache with Redis, keyed by `combat-template:active:{playerId}`. Invalidate on `setActiveTemplate`, `updateTemplate`, `deleteTemplate`, and `createTemplate`. Saves 1 query + join per combat.

```ts
const cacheKey = `combat-template:active:${playerId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);
// ... fetch from DB, then:
await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
```

### Priority 2 — Select-optimize `getActiveTemplate`

Since only slot data is returned, skip fetching template-level columns:

```ts
const record = await prisma.combatTemplate.findFirst({
  where: { playerId, isActive: true },
  select: {
    slots: { orderBy: { sortOrder: 'asc' }, select: {
      id: true, sortOrder: true, actionId: true,
      conditionType: true, resource: true, threshold: true,
      effectName: true, thenActionId: true,
    }},
  },
});
```

### Priority 3 — Slim ownership checks

For `setActiveTemplate` and `updateTemplate`, use `select: { id: true }`:

```ts
const template = await prisma.combatTemplate.findFirst({
  where: { id: templateId, playerId },
  select: { id: true },
});
```

### Priority 4 — Eliminate post-transaction re-fetch in `updateTemplate`

Move the final `findUniqueOrThrow` inside the transaction, or build the return value from the input data + `createMany` result.
