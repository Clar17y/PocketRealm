# Code Health Audit: `apps/api/src/services/achievementService.ts`

**Date:** 2026-03-14 21:42:08
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/achievementService.ts`

## Findings

### Type Safety
- [medium] **`as Record<string, number>` widening cast on line 130** — `resolveAllStats` returns `ResolvedStats` (which is `Record<StatKey, number>` with a specific key union), but it's cast to `Record<string, number>` to allow indexing by `def.statKey` (typed as `string | undefined`). This hides a type mismatch: if an achievement's `statKey` isn't a valid `StatKey`, the lookup silently returns `undefined` (caught by `?? 0`, so no crash, but no compile-time validation). — **Suggested fix:** Type `AchievementDef.statKey` as `StatKey | undefined` in the shared package, eliminating the need for the cast.

- [low] **`as Record<string, number>` on line 38** — `Promise.resolve({} as Record<string, number>)` casts an empty object. Harmless since it's a fallback when no stat keys are needed, but the cast could be avoided. — **Suggested fix:** Extract to a typed constant: `const EMPTY_STATS: Record<string, number> = {};` or use `Promise.resolve<Record<string, number>>({})`.

- [low] **`FAMILY_NAME_TO_KEY` uses `Record<string, string>` (line 16)** — Both keys and values are known string literals but typed generically. A typo in a family name (e.g., `'Wolve'` instead of `'Wolves'`) wouldn't be caught at compile time. — **Suggested fix:** Type keys as a union of known family names and values as known family keys, or use `as const satisfies Record<string, string>`.

### Error Handling
- [high] **Silent item reward skip in `claimReward` (lines 196-210)** — When a reward type is `'item'`, if `reward.itemTemplateId` is falsy or the template doesn't exist in the DB, the reward is silently skipped. The player's `rewardClaimed` flag is already set to `true` at this point (line 178), so they permanently lose the reward with no error or log. — **Suggested fix:** Throw an error if the item template is not found (data integrity issue), or at minimum log a warning. Consider moving the template check before the `rewardClaimed` update.

- [medium] **Race condition in `checkAchievements` (lines 82-84)** — `prisma.playerAchievement.create` has no duplicate handling. If two concurrent requests check the same player's achievements simultaneously (e.g., combat + casino finishing at the same time), both could pass the `unlockedSet.has()` check and try to create the same achievement, causing a unique constraint error that crashes the caller. — **Suggested fix:** Use `createMany({ skipDuplicates: true })` or wrap in try/catch to handle `P2002` (unique constraint) errors gracefully.

- [low] **`getIo()` null without logging (line 257)** — `io?.to(...)` silently does nothing if Socket.IO isn't initialized. Achievement unlock notifications are silently lost. — **Suggested fix:** Acceptable for resilience, but consider logging a warning when `io` is null so missing notifications are debuggable.

### Dead Code
No issues found.

### Unused Exports
No issues found. All 6 exports are imported in route or service files:
- `checkAchievements` — 6 importers (routeHelpers, bossLootService, guildService, casinoService, pvp, casino)
- `getPlayerAchievements` — achievements route
- `claimReward` — achievements route
- `setActiveTitle` — achievements route
- `getUnclaimedCount` — achievements route
- `emitAchievementNotifications` — 8 importers

## Summary
6 findings: 0 critical, 1 high, 2 medium, 3 low
