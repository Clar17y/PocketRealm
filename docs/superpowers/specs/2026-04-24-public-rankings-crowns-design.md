# Public Rankings And Crowns Design

## Overview

Issue 223 added weekly seasonal crowns, but exposing them only through API responses makes the feature effectively invisible. Add a public rankings surface that lets players and visitors see leaderboard competition, weekly crown races, historical seasonal winners, and lifetime crown collectors outside the game shell.

This design is based on the approved direction from brainstorming:

- Public, logged-out readable rankings.
- Dedicated Crowns tab.
- Lifetime crown collectors as the default crowns view.
- Preserve logged-in "where am I?" behavior from the existing in-game leaderboard.
- Do not add browser polling or a public homepage path that wakes Neon just to refresh leaderboard data.

External references checked during brainstorming:

- Reign of Blood exposes daily leaders and recent activity on its public landing page: https://reignofblood.net/
- Torn exposes live population and global ranking proof in its public landing flow: https://www.torn.com/

## Product Shape

Add a public `/rankings` route outside the game shell. It should be reachable from the landing page and should work for logged-out visitors.

The page has four top-level tabs:

- `Leaderboards`: all-time category rankings, with realm selector.
- `Weekly`: weekly gain rankings that show the current crown race.
- `Crowns`: lifetime crown collectors, ranked by total gold/silver/bronze crowns.
- `Hall of Fame`: archived seasonal winners.

The default `/rankings` view should be `Crowns`, because that is the new visibility gap this issue is addressing. Links can still select other tabs through query state.

The existing in-game Social -> Rankings screen can remain, but shared table/control components should be used where practical so the public and in-game experiences do not drift.

## Landing Page

Replace the current fake Champion preview on the landing page with a compact live `Realm Rankings` preview.

The preview should show:

- Top lifetime crown collectors.
- A small current weekly leader slice.
- A `View Rankings` link to `/rankings`.

The landing preview is social proof, not a full dashboard. It should fail quietly if public ranking data is unavailable.

Empty states:

- Crown collectors: `No crowns awarded yet.`
- Weekly leaders: `Weekly race starts after the next snapshot.`

## Existing Leaderboard Cache Behavior

The current leaderboard read path is lazy-refreshed:

- `GET /api/v1/leaderboard/:category` calls `ensureLeaderboardsFresh()`.
- `ensureLeaderboardsFresh()` checks `leaderboard:last_refresh`.
- If the last refresh is younger than `LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS` (`900_000ms`, 15 minutes), the request serves Redis data.
- If stale, one request takes a Redis lock and runs `refreshAllLeaderboards()`.
- `refreshAllLeaderboards()` rebuilds all categories for the permanent realm and active season realms.
- Leaderboard Redis keys do not expire through TTL; freshness is controlled by `leaderboard:last_refresh`.

This is acceptable for full `/rankings` leaderboard pages. It is not acceptable for the public landing teaser, because a homepage visit should not become "wake Neon and rebuild all boards."

## API Design

### `GET /api/v1/leaderboard/crowns`

Public endpoint for the Crowns tab. It supports optional auth.

Query params:

- `limit`: optional, defaults to the existing leaderboard page size.
- `around_me=true`: optional, centers the page on the authenticated player's crown rank where possible.

Response:

```ts
{
  entries: CrownCollectorEntry[];
  myRank: CrownCollectorEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

interface CrownCollectorEntry {
  rank: number;
  username: string;
  characterLevel: number;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns: {
    gold: number;
    silver: number;
    bronze: number;
    total: number;
  };
  topGroups: Array<{ group: string; count: number }>;
}
```

Public `entries` must not expose player UUIDs or admin flags. `myRank` is included only for the authenticated requester.

Ranking order:

1. Total crowns descending.
2. Gold crowns descending.
3. Silver crowns descending.
4. Bronze crowns descending.
5. Username ascending as deterministic tie-breaker.

Lifetime is the only required mode for this first version. Current-season crown filtering can be added later if it becomes useful.

### `GET /api/v1/leaderboard/public-summary`

Cache-only endpoint for the landing preview.

This endpoint must not call `ensureLeaderboardsFresh()` and must not rebuild data from Postgres. It reads only existing Redis snapshots and returns empty arrays if the data is missing.

Response:

```ts
{
  crownCollectors: CrownCollectorEntry[];
  weeklyLeaders: Array<{
    category: string;
    label: string;
    rank: number;
    username: string;
    characterLevel: number;
    score: number;
  }>;
  lastRefreshedAt: string | null;
}
```

The weekly leader slice should use a small curated set rather than every category. Good first choices are `character_xp`, `total_kills`, `pvp_rating`, and `casino_profit`, because they cover progression, combat, PvP, and casino without flooding the landing page.

## Crown Collector Cache

Add a Redis crown collector snapshot so public surfaces do not need to aggregate `PlayerCrown` on every page load.

Redis keys:

- `leaderboard:crowns:lifetime:snapshot`: JSON snapshot containing ordered collector rows, `totalPlayers`, and `lastRefreshedAt`.
- `leaderboard:crowns:lifetime:last_refresh`: ISO timestamp.
- `leaderboard:crowns:lifetime:refresh_lock`: short-lived Redis lock for direct `/rankings` rebuilds.

The snapshot should include `playerId` internally so the service can compute authenticated `myRank` and `around_me` slices. Public route responses must strip that internal identifier from `entries`.

Use a JSON snapshot rather than a sorted set because exact tie-breaking needs total, gold, silver, bronze, and username. Crown records are awarded weekly, so rebuilding and storing an ordered snapshot is simpler and sufficient for this version.

Refresh rules:

- Rebuild the crown collector snapshot after weekly crown awards.
- Rebuild or invalidate it after season merge crown transfers.
- Direct `/rankings` Crown tab requests may rebuild under a Redis lock if the snapshot is absent.
- `public-summary` must stay cache-only and return empty/fallback data instead of rebuilding.

## Frontend Design

New public route:

- `apps/web/src/app/rankings/page.tsx`

Shared or extended components:

- `RankingsTabs`: controls `Leaderboards`, `Weekly`, `Crowns`, and `Hall of Fame`.
- `RankingCategoryControls`: realm/category controls reused by all-time and weekly views.
- `LeaderboardTable`: preserve current row highlighting, pinned `myRank`, and `View My Rank` behavior.
- `CrownCollectorsTable`: dedicated display for lifetime crown totals.
- `LandingRankingsPreview`: replaces the mock Champion leaderboard preview on the landing page.

Visual direction:

- Match the existing RPG/pixel style.
- Keep `/rankings` denser and more scannable than the landing marketing sections.
- Use clear gold/silver/bronze crown count chips and total crown count.
- Avoid hiding crowns as small decoration inside unrelated rows.

## Logged-In Personalization

Logged-out visitors see public top lists only.

Logged-in users keep the existing leaderboard affordances:

- `myRank` is returned by optional auth where supported.
- The user's row is highlighted if visible.
- A pinned `Your rank` bar appears when the user is outside the visible page.
- `View My Rank` / `Back to Top` remains available for normal leaderboards and the new Crowns tab where `around_me` is supported.

This requirement applies to the public `/rankings` page as well as the in-game ranking screen.

## Refresh And Polling Constraints

Do not add any of the following:

- Browser polling.
- A frontend timer that repeatedly checks whether a week has passed.
- A public landing call that can trigger `refreshAllLeaderboards()`.
- A backend interval for crowns beyond the existing weekly crown job guard.

Allowed read behavior:

- Full `/rankings` leaderboard tabs may use the existing lazy 15-minute Redis freshness behavior.
- The Crowns tab may lazily rebuild its crown collector snapshot under lock if needed.
- The landing preview reads cache-only data and fails quietly.

This means Neon can wake because a user intentionally opens a data-heavy rankings page, but not because the homepage is constantly checking leaderboard freshness.

## Error Handling

Landing preview:

- If API calls fail, hide the preview or show a quiet empty state.
- Do not block registration/login CTAs.

Public `/rankings` page:

- Show loading states per tab.
- Show explicit empty states for no crowns, no weekly data, and no archived Hall of Fame entries.
- Show a visible retry/error state if the selected rankings endpoint fails.

Backend:

- Serve existing Redis data if a refresh fails.
- Use Redis locks for lazy rebuilds to avoid concurrent refresh spikes.
- Keep public responses privacy-safe.

## Testing Plan

Backend tests:

- Crown collector ranking sorts by total, then gold, silver, bronze, then username.
- Crown collector endpoint strips player IDs and admin flags from public entries.
- Crown collector endpoint returns `myRank` for authenticated users outside the first page.
- `around_me=true` centers the authenticated user's crown rank where possible.
- `public-summary` reads cache-only data and does not call `ensureLeaderboardsFresh()` or Postgres rebuild paths.
- Weekly crown award and season merge paths refresh or invalidate the crown collector snapshot.

Frontend tests:

- `/rankings` renders with the Crowns tab available.
- Crowns tab renders crown totals and empty state.
- Logged-in leaderboard views preserve row highlight, pinned `myRank`, and `View My Rank`.
- Landing page renders `LandingRankingsPreview` instead of the fake Champion preview.
- Landing preview handles empty/error data without blocking the page.

Verification:

- Focused API tests for crown collectors and public summary.
- Focused web tests for `/rankings`, `CrownCollectorsTable`, and `LandingRankingsPreview`.
- `npm run typecheck`.
- `npm run build:api`.
- `npm run build:web` if the public route or shared component changes require it.
- Run `$simplify` before final handoff because implementation will change code.

## Non-Goals

- Current-season crown collector filters.
- Player profile pages for individual crown collections.
- A full public activity feed.
- Online player counts.
- Real-time leaderboard updates.
- Browser polling.
