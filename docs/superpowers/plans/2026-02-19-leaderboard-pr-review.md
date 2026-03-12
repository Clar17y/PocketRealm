# Leaderboard System — PR Review Prompt

## Branch
`feature/leaderboard-system` → `main`

## Implementation Plan
`docs/superpowers/plans/2026-02-18-leaderboard-implementation-plan.md` (11 tasks)

## Design Doc
`docs/superpowers/specs/2026-02-18-leaderboard-system-design.md`

## Commits (7)
1. `b66bc3b` feat(shared): add LEADERBOARD_CONSTANTS — (Plan Task 1)
2. `88016c9` feat(api): add Redis client singleton — (Plan Task 2)
3. `4f753d4` feat(api): add optionalAuthenticate middleware — (Plan Task 3)
4. `6610eb8` feat(api): add leaderboard service with Redis ZSET refresh — (Plan Task 4)
5. `4247fc8` feat(api): add leaderboard routes and startup refresh — (Plan Task 5)
6. `b6df119` feat(web): add leaderboard API types and functions — (Plan Task 6)
7. `91b2e8c` feat(web): add leaderboard UI with rankings table, screen, and arena tab — (Plan Tasks 7-9, partial 10)

## Files Changed (12 files, +761 / -4)

### New files
- `apps/api/src/redis.ts` — Redis client singleton
- `apps/api/src/routes/leaderboard.ts` — Two GET endpoints (categories, rankings by category)
- `apps/api/src/services/leaderboardService.ts` — Core service: refresh all leaderboards to Redis ZSETs, read paginated rankings
- `apps/web/src/components/leaderboard/LeaderboardTable.tsx` — Shared table component (medals, bot icons, pinned rank)
- `apps/web/src/components/screens/Leaderboard.tsx` — Full leaderboard screen with group tabs + category dropdown

### Modified files
- `packages/shared/src/constants/gameConstants.ts` — Added LEADERBOARD_CONSTANTS
- `apps/api/src/middleware/auth.ts` — Added optionalAuthenticate
- `apps/api/src/index.ts` — Route registration + startup refresh interval
- `apps/web/src/lib/api.ts` — Leaderboard types + fetch functions
- `apps/web/src/app/game/useGameController.ts` — Added 'leaderboard' to Screen type + getActiveTab
- `apps/web/src/app/game/page.tsx` — Import, switch case, sub-nav tab
- `apps/web/src/app/game/screens/ArenaScreen.tsx` — Rankings tab with PvP leaderboard + "View All" link

---

## Review Checklist

### 1. Plan Completeness
- [ ] Verify all 11 plan tasks are addressed (Task 11 is manual E2E testing — not code)
- [ ] Check that Arena Rankings tab (Task 10) includes: ArenaView type update, state, useEffect, tab button, rankings view content, "View All Leaderboards" navigation link
- [ ] Confirm no plan tasks were skipped or partially implemented

### 2. Architecture & Design Alignment
- [ ] Redis ZSET pattern matches design doc (key: `leaderboard:{category}`, meta hash: `leaderboard:meta:{category}`)
- [ ] 22+ ranking categories implemented across 4 groups: PvP (4), Progression (3), Skills (14+), Combat (2)
- [ ] `refreshAllLeaderboards()` called on startup + setInterval at REFRESH_INTERVAL_MS (900,000ms = 15min)
- [ ] `optionalAuthenticate` correctly attaches player if token valid, proceeds without if not
- [ ] `getLeaderboard` supports `around_me` query param for centered-on-player view

### 3. Type Safety
- [ ] No `any` types introduced
- [ ] Frontend `LeaderboardEntry` / `LeaderboardResponse` types match API service interfaces
- [ ] `Screen` union type includes `'leaderboard'`
- [ ] `ArenaView` union type includes `'rankings'`

### 4. Code Quality
- [ ] Service follows existing patterns (Prisma queries, error handling with try/catch per category)
- [ ] Route follows existing patterns (Router, middleware, async handler with next(err))
- [ ] Frontend components follow existing patterns (PixelCard, RPG CSS variables, tab styling)
- [ ] No duplicated logic between LeaderboardTable usage in Leaderboard screen vs ArenaScreen
- [ ] `formatScore` handles large numbers readably (K/M suffixes)
- [ ] `timeSince` provides human-readable refresh timestamps

### 5. Edge Cases & Robustness
- [ ] Invalid category slug returns error (VALID_SLUGS set check)
- [ ] Empty leaderboard renders "No rankings available yet" state
- [ ] Loading state renders correctly
- [ ] BossParticipant query wrapped in try/catch (model may not exist)
- [ ] Redis operations handle empty ZSET gracefully (zcard returns 0, zrevrange returns [])
- [ ] Meta hash missing entries fall back to `{ username: 'Unknown', characterLevel: 1, isBot: false }`

### 6. Performance
- [ ] No N+1 queries in refresh logic (batch Prisma queries, single ZADD per category)
- [ ] Meta hashes use HGET per entry during read — acceptable for PAGE_SIZE=25, but review if this could be HMGET batch
- [ ] Redis DEL before ZADD is non-atomic — brief window of empty data during refresh. Acceptable for dev; note if concerning for prod

### 7. Security
- [ ] Leaderboard routes use `optionalAuthenticate` (not `authenticate`) — public access is intentional
- [ ] No player-sensitive data exposed (only username, characterLevel, score, isBot, rank)
- [ ] Category slug validated against allowlist before Redis key construction (no injection risk)

### 8. UI/UX
- [ ] Top 3 ranks get medal icons (gold, silver, bronze)
- [ ] Current player row highlighted with gold border
- [ ] Bot players show Bot icon
- [ ] "View My Rank" toggles between top-N and around-me views
- [ ] Pinned rank bar appears when player not visible in current view
- [ ] Group tabs match existing app tab styling
- [ ] Category dropdown only shown when group has >1 category
- [ ] Arena Rankings tab includes navigation link to full Leaderboard screen

### 9. Missing or Deferred
- [ ] No unit tests for leaderboardService (plan didn't include test task — flag if needed)
- [ ] No pagination beyond PAGE_SIZE=25 (design intentionally shows top 25 or around-me window)
- [ ] No WebSocket/SSE for real-time updates (by design — snapshot-based)
