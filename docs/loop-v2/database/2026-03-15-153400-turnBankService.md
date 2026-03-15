# Database Audit: turnBankService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/turnBankService.ts` (191 lines, 5 exported functions)

## Prisma Models Touched
Direct: `TurnBank`

## Findings
No issues. Optimistic lock pattern with retry loop (up to 3 attempts). `findUnique` + `updateMany` with state check. No select (full TurnBank row — uses `currentTurns`, `lastRegenAt` — 2/4 fields). Minor payload bloat. Critical infrastructure service used by every turn-spending action.

## Suggested Fixes
Minor: `select: { currentTurns: true, lastRegenAt: true }` on turnBank.findUnique.
