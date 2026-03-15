# Database Audit: resourceService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/resourceService.ts` (297 lines, 5 exported functions)

## Prisma Models Touched
Direct: `Player`, `PlayerSkill`
Via sub-services: `GuildMember`, `Guild`, `TurnBank` (via tax/turns)

## Findings
No issues. All queries use PK or `@@unique` lookups. Good `select` on all queries. `getResourceState` — 2 queries (player select + skills findMany with select). Rest/set functions are clean with proper transactions and tax integration.

## Suggested Fixes
None needed. Clean service.
