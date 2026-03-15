# Database Audit: attributesService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/attributesService.ts` (112 lines, 3 exported functions)

## Prisma Models Touched

Direct: `Player`

---

## Findings

### N+1 Queries
None.

### Missing Indexes
None — all queries use Player PK.

### Payload Bloat
**None.** Both `getPlayerProgressionState` and `allocateAttributePoints` use proper `select` on every query:

```ts
select: { characterXp: true, characterLevel: true, attributePoints: true, attributes: true }
```

### Cache Issues
No Redis usage. `getPlayerProgressionState` is called in the combat path (via `preparePlayerForCombat`) but caching is impractical because `characterXp` and `characterLevel` change on every XP grant. Only `attributes` is stable between explicit allocations.

### Migration Risks
None.

---

## Query Patterns

### `getPlayerProgressionState` — 1 query

| Query | Select | Index |
|-------|--------|-------|
| `player.findUnique({ id })` | `{ characterXp, characterLevel, attributePoints, attributes }` | PK |

### `allocateAttributePoints` — 2 queries (in tx)

| Step | Query | Select | Index |
|------|-------|--------|-------|
| 1 | `player.findUnique({ id })` | Same 4 fields | PK |
| 2 | `player.update({ id })` | Same 4 fields (return) | PK |

---

## Suggested Fixes

None needed. This is one of the cleanest services in the codebase:
- Proper `select` on all queries
- PK lookups only
- Transaction for write path
- Pure utility functions for data normalization
