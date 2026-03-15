# Database Audit: roundResolutionScheduler

**Date:** 2026-03-15
**Service:** `apps/api/src/services/roundResolutionScheduler.ts` (41 lines, 1 exported function)

## Prisma Models Touched
Direct: `BossEncounter`, `GuildExpedition`

## Findings
None. Tiny scheduler — 2 parallel `count` queries to check for active rounds, then delegates to `checkAndResolveDueBossRounds` + `checkAndResolveExpeditionRounds`. Dynamically adjusts poll interval (5s active / 60s idle). Clean.

## Suggested Fixes
None needed.
