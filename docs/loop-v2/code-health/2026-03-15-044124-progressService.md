# Code Health Audit: `apps/api/src/services/progressService.ts`

**Date:** 2026-03-15 04:41:24
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/progressService.ts`

## Findings

### Type Safety
- [low] **`type as GuildContractType` cast (line 23)** — `type` is `ProgressType`, cast to `GuildContractType` after a `Set.has()` check. The two union types overlap but aren't identical. The runtime check validates membership, so this is safe in practice. — **Suggested fix:** Type `GUILD_CONTRACT_TYPES` as `Set<GuildContractType>` and use a type predicate for the narrowing.

### Error Handling
- [low] **Redundant `.catch(() => {})` on contract promise (line 23)** — The contract progress error is caught and silently discarded. This is intentional (progress tracking shouldn't block the caller), but it's redundant because `Promise.allSettled` on line 26 already handles rejections gracefully. The empty catch also loses all error context, making debugging harder. — **Suggested fix:** Remove `.catch(() => {})` and let `allSettled` handle it, or change to `.catch(err => logger.warn('Contract progress failed', err))`.

### Dead Code
No issues found.

### Unused Exports
No issues found. `trackProgress` is imported by 8 files across routes and services.

## Summary
2 findings: 0 critical, 0 high, 0 medium, 2 low
