# Code Health Audit: `apps/api/src/services/eventSchedulerService.ts`

**Date:** 2026-03-15 01:01:34
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/eventSchedulerService.ts`

## Findings

### Type Safety
- [low] **Non-null assertion on array access (line 224)** — `bossMobs[Math.floor(Math.random() * bossMobs.length)]!` after a length check on line 222. Safe in practice but `!` suppresses type safety. — **Suggested fix:** Use `?? bossMobs[0]` fallback.

### Error Handling
- [medium] **No error isolation in scheduler tick (lines 355-391)** — `checkAndSpawnEvents` sequentially runs `expireStaleEvents`, `checkAndResolveDueBossRounds`, `checkAndSpawnBoss`, and event spawning. If any step throws (e.g., DB connection blip during boss resolution), all subsequent steps are skipped for that tick. Since this is likely called from a recurring timer, a single transient failure could delay event spawning, boss resolution, and expiration processing. — **Suggested fix:** Wrap each major step in try/catch: `try { await checkAndResolveDueBossRounds(io); } catch (err) { logger.error('Boss round resolution failed', err); }`. This ensures one failure doesn't block the rest.

- [low] **Expired event notification loop not error-isolated (lines 362-368)** — If `emitSystemMessage` throws for one expired event, remaining events won't get their notifications emitted. — **Suggested fix:** Wrap the loop body in try/catch.

### Dead Code
No issues found.

### Unused Exports
- [low] **`checkAndSpawnBoss` exported but never imported (line 254)** — Only called internally by `checkAndSpawnEvents` (line 374). No external file imports it. — **Suggested fix:** Remove `export` keyword.

- [low] **`_resetBossSpawnTimer` exported but only imported by test file (line 18)** — Test-only export. Acceptable for testing but could be marked with a convention. — **Suggested fix:** Keep for testability, but consider a `/** @internal */` JSDoc tag.

## Summary
5 findings: 0 critical, 0 high, 1 medium, 4 low
