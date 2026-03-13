# Leaderboard Seasonal Crowns

**Category:** feature
**Priority:** medium
**Scope:** medium

## Description
Introduce weekly "Crown" competitions to the leaderboard system: each Monday, snapshot the current leaderboard scores across all categories, then track delta gains over the week. At Sunday midnight, the top 3 players in each category's weekly delta earn a permanent "Crown" achievement entry (Gold, Silver, Bronze) recorded with the category slug and week timestamp. Crowns accumulate on the player's profile as collectible prestige markers and unlock tiered titles ("Crowned Once", "Fivefold Champion", "Season Monarch") at 1/5/20 total crowns. This transforms the currently static leaderboard from a display of all-time totals -- which new players can never compete on -- into a recurring weekly race where anyone can win by having the best single-week improvement, giving fresh and veteran players equal footing. Implementation leverages the existing Redis `leaderboard:*` sorted sets: a scheduled job snapshots each zset into `leaderboard:weekly_start:{category}` on Monday, and the refresh cycle computes deltas by diffing current scores against the snapshot, writing to a `leaderboard:weekly_delta:{category}` zset that the existing `getLeaderboard` function can serve with a `?period=weekly` query param.
