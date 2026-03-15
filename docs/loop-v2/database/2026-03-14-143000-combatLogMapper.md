# Database Audit: combatLogMapper

**Date:** 2026-03-14
**Service:** `apps/api/src/services/combatLogMapper.ts` (53 lines, 1 exported function)

## Prisma Models Touched

None.

---

## Findings

**No database interaction.** This is a pure data-mapping utility that transforms combat engine log entries (combatant-indexed fields like `combatantAAction`) into frontend-friendly shapes (actor-relative fields like `actionName`). All lookups use in-memory constants via `getActionDefinition()` from `@pocketrealm/shared`.

### N+1 Queries
None — no DB calls.

### Missing Indexes
N/A

### Payload Bloat
N/A

### Cache Issues
N/A

### Migration Risks
N/A

---

## Query Patterns

No Prisma calls.

---

## Suggested Fixes

None needed. Clean utility with no DB concerns.
