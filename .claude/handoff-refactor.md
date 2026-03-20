# Handoff: Encounter Site Frontend Rework — Refactoring Pass

## Context

Branch `encounter-site-rework` in worktree `D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework`. This branch has 30+ commits implementing the encounter site frontend rework — replacing sequential 1v1 combat with an expedition-style room combat view. It was developed iteratively with many bug fixes layered on top, so the code would benefit from a consolidation/refactoring pass.

## What to do

Review and refactor the code touched by this branch for efficiency, clarity, and correctness. Run `/simplify` to get structured review, then fix issues found. Key areas to focus on:

### Files to review (most important first)

1. **`apps/api/src/services/encounterSiteCombatService.ts`** — Core combat service. Has Redis-backed session management (was originally in-memory Map, migrated mid-session). Check for:
   - Duplicated patterns between `autoResolveEncounterRoom` and `resolveManualEncounterRound`
   - The `buildParticipantForEncounterSite` function duplicates `buildRaidParticipant` from `expeditionService.ts`
   - `RoundSnapshot` uses `unknown[]` for `activeEffects` and `log` — should use proper types
   - The resume path in `startManualEncounterRoom` could be cleaner

2. **`apps/api/src/routes/combat/sites.ts`** — Route handlers with DTO transformations. Check for:
   - The `mapChestRewardDTO` uses `l.itemTemplateId` as fallback `name` — could this be cleaner?
   - Multiple `prisma.player.update` calls for lockout set/clear — could these be in the service layer instead?
   - The mob slot regex parsing (`/^encounter-mob-(\d+)$/`) appears here AND in the service — should be a shared utility

3. **`apps/web/src/components/encounter/EncounterSiteCombatView.tsx`** — Main frontend component. Check for:
   - 14+ props (parameter sprawl) — consider grouping callbacks or extracting a hook
   - `onRetryRoom` and `onStartRoom` call the same API endpoint — could be merged
   - The `resumeSession` probe effect creates a session as a side effect of checking
   - Inline async callbacks in `CombatScreen.tsx` that wrap API calls — could be a `useEncounterSiteCombat` hook

4. **`apps/web/src/components/common/combat/`** — 13 shared components extracted from GuildExpeditionsTab. Verify:
   - No dead imports or unused props
   - Components are actually used by both expedition and encounter views (some may be encounter-only)

5. **`apps/web/src/app/game/screens/CombatScreen.tsx`** — Integration layer. Check for:
   - `onStartCombat` prop is likely dead code now (old sequential combat flow)
   - The reconnect `useEffect` duplicates `enterEncounterCombat` logic instead of calling it

### Known architectural decisions to preserve

- Redis-backed combat sessions with 84h TTL (matches max encounter site decay)
- `activeEncounterSiteId` on Player model for lockout (DB) + game controller state (frontend)
- Shared combat components in `common/combat/` reused by both GuildExpeditionsTab and EncounterSiteCombatView
- `RoomProgressBar` supports both 0-indexed (expeditions) and 1-indexed (encounters) via `zeroIndexed` prop
- `ThreatMeter` uses generic `ThreatEntry[]` (not expedition-specific `ExpeditionMemberData[]`)

### Commands

```bash
cd D:/Code/Adventure/.worktrees/pocketrealm-encounter-site-rework
npm run build          # Full build (shared → game-engine → API → web)
npm run test:engine    # 755 tests
npm run test:api       # 1793 tests
npm run build:web      # Web-only build (faster iteration)
```

### Branch state

All tests pass, full build clean. 30+ commits from `origin/main`. PR: https://github.com/Clar17y/Adventure/pull/235
