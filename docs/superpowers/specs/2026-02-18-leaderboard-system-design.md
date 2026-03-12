# Leaderboard System Design

## Overview

Global leaderboard system with 22 ranking categories across PvP, Progression, Skills, and Combat. Snapshot-based with 15-minute Redis refresh cycles using sorted sets.

## Categories (22)

**PvP (4):** `pvp_rating`, `pvp_wins`, `pvp_best_rating`, `pvp_win_streak`
**Progression (3):** `character_level`, `character_xp`, `total_skill_level`
**Skills (14):** `skill_melee`, `skill_ranged`, `skill_magic`, `skill_defence`, `skill_vitality`, `skill_evasion`, `skill_mining`, `skill_foraging`, `skill_woodcutting`, `skill_refining`, `skill_tanning`, `skill_weaving`, `skill_weaponsmithing`, `skill_armorsmithing`, `skill_leatherworking`, `skill_tailoring`, `skill_alchemy`
**Combat (1):** `total_kills`
**Boss (1):** `boss_damage` (not included on initial release if boss system isn't live yet)

## Architecture

### Data Sources (no new DB tables)

| Category | Source Table | Query Type |
|----------|-------------|------------|
| PvP (4) | `PvpRating` | Single table scan |
| Character Level/XP | `Player` | Single table scan |
| Total Skill Level | `PlayerSkill` | GROUP BY playerId, SUM(level) |
| Individual Skills (14) | `PlayerSkill` WHERE skillType | Filtered scan |
| Total Kills | `PlayerBestiary` | GROUP BY playerId, SUM(kills) |
| Boss Damage | `BossParticipant` | GROUP BY playerId, SUM(totalDamage) |

### Redis Schema

One sorted set per category: `leaderboard:{category}` (member = playerId, score = value).

Companion hash per category: `leaderboard:meta:{category}` — field = playerId, value = JSON `{username, characterLevel, isBot}`.

Timestamp key: `leaderboard:last_refresh` — ISO string of last successful refresh.

### Refresh Mechanism

- On API startup: run `refreshAllLeaderboards()` immediately
- `setInterval(refreshAllLeaderboards, 900_000)` (15 minutes)
- Queries run sequentially to avoid spiking DB connections
- Partial failure: if one query fails, log error and continue with remaining categories
- If Redis is down, API returns 503 "Leaderboards temporarily unavailable"

## API

### `GET /api/v1/leaderboard/categories`

Returns available categories with display names, grouped by type.

```json
{
  "groups": [
    {
      "name": "PvP",
      "categories": [
        { "slug": "pvp_rating", "label": "PvP Rating" },
        { "slug": "pvp_wins", "label": "PvP Wins" }
      ]
    }
  ]
}
```

### `GET /api/v1/leaderboard/:category`

**Query params:** `around_me=true` (optional)

**Response:**

```json
{
  "category": "pvp_rating",
  "entries": [
    {
      "rank": 1,
      "playerId": "abc-123",
      "username": "DragonSlayer",
      "characterLevel": 45,
      "score": 1847,
      "isBot": false
    }
  ],
  "myRank": {
    "rank": 347,
    "playerId": "my-id",
    "username": "Me",
    "characterLevel": 22,
    "score": 1012,
    "isBot": false
  },
  "totalPlayers": 1200,
  "lastRefreshedAt": "2026-02-18T14:30:00Z"
}
```

- Auth optional — unauthenticated requests omit `myRank`
- PvP categories: `myRank` is `null` if player has no PvpRating record (sub-level-10)
- `around_me=true`: returns 25 entries centered on the player's rank instead of top 25

## Frontend

### LeaderboardScreen (new, main nav)

- Category group tabs: PvP | Progression | Skills | Combat
- Dropdown within group for specific category
- Top 25 display with medals for top 3 (gold/silver/bronze)
- "View my rank" button → fetches `around_me=true`, shows surrounding players
- Pinned "Your rank" bar at bottom (always visible)
- Bot players marked with a bot icon
- "Updated X minutes ago" timestamp

### Arena Rankings Tab (new tab in ArenaScreen)

- PvP Rating leaderboard only (no group tabs)
- Same LeaderboardTable component
- Link to full leaderboard screen for other categories

### LeaderboardTable (shared component)

- Props: entries, myRank, loading state
- Renders ranked rows with position medals (top 3)
- Bot indicator icon
- Highlighted row for current player
- RPG theme variables (`--rpg-gold`, etc.)

## Constants

```ts
LEADERBOARD_CONSTANTS = {
  REFRESH_INTERVAL_MS: 900_000,  // 15 minutes
  PAGE_SIZE: 25,
  TOP_N: 25,
}
```

## Files

### New
- `apps/api/src/services/leaderboardService.ts`
- `apps/api/src/routes/leaderboard.ts`
- `apps/web/src/app/game/screens/LeaderboardScreen.tsx`
- `apps/web/src/components/leaderboard/LeaderboardTable.tsx`

### Modified
- `apps/api/src/index.ts` — register route + start refresh interval
- `apps/web/src/lib/api.ts` — add API types/functions
- `apps/web/src/app/game/useGameController.ts` — add navigation
- `apps/web/src/app/game/screens/ArenaScreen.tsx` — add Rankings tab
- `packages/shared/src/constants/gameConstants.ts` — LEADERBOARD_CONSTANTS
