# Database Audit: guildSpecializationService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/guildSpecializationService.ts` (171 lines, 3 exported functions)

## Prisma Models Touched

Direct: `Guild`, `GuildLog`
Via sub-service: `GuildMember` (via `requireRole`)

---

## Findings

### N+1 Queries
None.

### Missing Indexes
None — all queries use PK lookups.

### Payload Bloat

**1. `requireRole` — full Guild row for validation (transitive, lines 25, 79)**
Both `selectSpecialization` and `respecSpecialization` call `requireRole` which fetches the full 15-column Guild row. Uses `guild.level`, `guild.specialization`, `guild.treasuryTurns` — 3 fields out of 15. The `requireRole` bloat is a recurring theme across all guild services.

### Cache Issues
No Redis usage. All player-initiated leader actions — no hot-path cache candidates.

### Migration Risks
None.

---

## Query Patterns

### `selectSpecialization` — 3 queries

| Step | Query | Index |
|------|-------|-------|
| 1 | `requireRole(leader)` → `guildMember.findUnique` with guild include | `@@unique(playerId)` |
| 2 | tx: `guild.update` | PK |
| 3 | tx: `guildLog.create` | — |

### `respecSpecialization` — 3 queries

Same pattern as `selectSpecialization`.

### `getSpecializationStatus` — 1 query

| Query | Select | Index |
|-------|--------|-------|
| `guild.findUnique({ id })` | `{ level, specialization }` | PK |

Good `select` usage. Clean.

---

## Suggested Fixes

### Priority 1 — Slim `requireRole` (in guildService)

Already recommended in multiple prior audits. Would benefit both functions here:

```ts
select: { guildId: true, role: true, guild: { select: { level: true, specialization: true, treasuryTurns: true } } }
```

Or better: `requireRole` returns only `{ guildId, role }` and callers fetch guild data they need.

No other fixes needed. Clean, minimal service.
