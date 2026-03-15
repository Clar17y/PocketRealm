# Code Health Audit: `apps/api/src/services/bossLootService.ts`

**Date:** 2026-03-14 22:31:31
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/bossLootService.ts`

## Findings

### Type Safety
- [medium] **`as SkillType` cast without validation (line 143)** — `(contributor.attackSkill ?? 'magic') as SkillType` narrows a generic `string` to the `SkillType` union. The `attackSkill` field on `BossContributor` is typed `string | undefined` (line 16), so any string value passes through unchecked. If a caller passes an invalid skill string, XP would be granted to a non-existent skill type. — **Suggested fix:** Type `attackSkill` as `SkillType | undefined` in the `BossContributor` interface, or validate at runtime: `if (!SKILL_TYPES.includes(contributor.attackSkill)) { ... }`.

- [medium] **Redundant `as` casts on Prisma results (lines 33-38, 48)** — Prisma's `findMany` with `select` already returns typed results. The explicit `as Array<{...}>` casts mask potential mismatches between the `select` clause and the expected shape. If a field is added/removed from the `select`, TypeScript won't flag the discrepancy. — **Suggested fix:** Remove the `as` casts and let Prisma's inferred types flow through.

- [low] **Non-null assertion on array access (lines 54, 76)** — `unknown[...]!` and `BOSS_BASE_XP_REWARD_BY_TIER[tierIndex]!`. Both are safe in practice (length-checked and clamped respectively), but `!` suppresses type checking. — **Suggested fix:** Use fallback values: `unknown[idx] ?? unknown[0]` and `?? baseXpFallback`.

### Error Handling
- [high] **No transaction or error isolation in per-contributor loot loop (lines 112-174)** — The `for` loop processes each contributor sequentially with multiple DB writes (`rollAndGrantLoot`, `addStackableItem`, `grantSkillXp`, `checkAchievements`), but none are wrapped in a transaction or try/catch. If processing fails for contributor N, contributors 1..N-1 have already received rewards while N+1..M get nothing. The entire `distributeBossLoot` call throws, and the caller (`bossEncounterService`) won't persist `rewardsByPlayer`, so the partial rewards are invisible in the UI. — **Suggested fix:** Wrap each contributor's reward processing in a try/catch so one failure doesn't block others: `try { ... result[playerId] = reward; } catch (err) { logger.error('Boss loot failed', { playerId, err }); }`. Alternatively, wrap the whole loop in a transaction for atomicity.

### Dead Code
No issues found.

### Unused Exports
- [low] **`BossContributor` interface exported but never imported (line 10)** — The only consumer (`bossEncounterService`) builds contributor objects using structural typing without importing the interface. — **Suggested fix:** Remove the `export` keyword, or import it in `bossEncounterService` for explicit type checking at the call site.

## Summary
5 findings: 0 critical, 1 high, 2 medium, 2 low
