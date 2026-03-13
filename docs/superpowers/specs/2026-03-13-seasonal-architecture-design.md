# Seasonal Architecture Design

## Overview

PocketRealm supports a permanent realm (the core game) and optional time-limited seasonal realms that run alongside it. Seasons are competitive resets where players create fresh characters, compete on leaderboards, and earn permanent rewards. When a season ends, eligible progress merges into the permanent character, winners are immortalized in a hall of fame, and seasonal characters are archived.

The first release ships with only the permanent realm. All seasonal infrastructure is dormant until an admin creates the first Season record.

## Design Goals

- **Zero day-one impact** — seasonal schema is in place but invisible until activated
- **Clean isolation** — seasonal and permanent characters are separate Player records; no service needs season-aware logic
- **Constants-as-data** — season balance tuning lives in the database, not in code branches
- **Lightweight archives** — past seasons preserved as denormalized snapshots, not full relational data
- **Proven model** — follows the Path of Exile league-to-standard pattern

## Account & Player Model

### Current State

`Player` is the top-level identity. Auth tokens reference `playerId`. Registration creates a Player directly.

### New State

```
Account (new)
├── id, email, passwordHash, role, createdAt, lastActiveAt
├── activePlayerId (FK → Player, nullable)
│
├── Player (permanent, seasonId = null)
│   ├── all existing Player fields (minus email/passwordHash/role)
│   ├── accountId (FK → Account)
│   └── seasonId = null
│
└── Player (seasonal, seasonId = Season.id)
    ├── all existing Player fields (fresh character)
    ├── accountId (FK → Account)
    └── seasonId (FK → Season)
```

**Key changes:**
- `email`, `passwordHash`, `role` move from Player to Account
- `username` stays on Player (players can choose a different name per season)
- `username` remains globally unique across all Players (permanent and seasonal). Avoids confusion on leaderboards, chat, and hall of fame where the same name could appear from different realms.
- Auth tokens reference `accountId`
- Auth middleware resolves `req.account` → `req.player` from `account.activePlayerId` → `req.season` if player has a seasonId
- Unique constraint on `(accountId, seasonId)` — one seasonal character per season per account. Since `seasonId = NULL` for permanent players and PostgreSQL treats NULLs as distinct, this needs a partial unique index (`WHERE seasonId IS NOT NULL`) plus a separate unique constraint on `accountId WHERE seasonId IS NULL` to enforce one permanent player per account.

## Season Model

```
Season
├── id
├── name (e.g. "Season 1", "Preseason")
├── status: 'upcoming' | 'active' | 'ended' | 'archived'
├── startsAt, endsAt
├── constantOverrides (JSON)
├── features (JSON array)
├── createdAt
```

### Lifecycle

```
upcoming → active → ended → archived
```

- **upcoming** — announced, players can preview but not join
- **active** — players can create seasonal characters and play
- **ended** — season over, merge process runs, leaderboards frozen
- **archived** — merge complete, seasonal Players pruned to archive snapshots

**Rules:**
- Only one season can be `active` at a time
- `seasonId = null` means permanent realm (no Season record needed)
- Transition `active → ended` triggers the merge pipeline (admin-initiated or scheduled)
- First release ships with no Season rows

## Content Scoping

Nullable `seasonId` FK added to content template tables to flag seasonal-exclusive content:

| Table | Column | Meaning |
|---|---|---|
| ItemTemplate | `seasonId` (nullable FK) | null = available everywhere, set = seasonal exclusive |
| CraftingRecipe | `seasonId` (nullable FK) | same |
| Zone | `seasonId` (nullable FK) | same |
| MobTemplate | `seasonId` (nullable FK) | same |

Content queries add `WHERE seasonId IS NULL OR seasonId = :currentSeason`.

**Zone/Mob precedence:** A zone's `seasonId` is authoritative for all its content. If a zone is seasonal, all mobs in it are implicitly seasonal — the `seasonId` on `MobTemplate` is only needed for permanent mobs that get seasonal variants. Rule: a mob is seasonal if either `mob.seasonId` or `mob.zone.seasonId` is non-null.

**Guild scoping:** `Guild` also gets a nullable `seasonId` FK. Seasonal guilds are created within a season and dissolved at season end. This distinguishes them from permanent guilds during cleanup.

## Constants Resolution

### Current

Services import constants directly:
```ts
import { SKILL_CONSTANTS } from '@pocketrealm/shared';
const xp = SKILL_CONSTANTS.XP_BASE * Math.pow(level, SKILL_CONSTANTS.XP_EXPONENT);
```

### With Seasons

A resolver function returns the effective constant value per request:

```ts
function getSeasonConstant<G extends keyof GameConstants>(
  group: G,
  key: keyof GameConstants[G],
  overrides?: Record<string, Record<string, number>> | null
): number {
  const base = GAME_CONSTANTS[group][key];
  return overrides?.[group]?.[key as string] ?? base;
}
```

- Season `constantOverrides` JSON loaded once on season start, cached in memory
- Auth middleware attaches `req.season` (including overrides) for seasonal players
- Route handlers pass overrides to service/engine functions
- Permanent realm: no overrides, resolver returns base constants (identical to today)
- Incremental adoption — refactor constants access in priority order:
  - **Phase 1 (season launch):** SKILL_CONSTANTS, COMBAT_CONSTANTS, EXPLORATION_CONSTANTS, TURN_CONSTANTS
  - **Phase 2 (post-launch tuning):** all other groups, refactored as needed when a season wants to override them

### Game Engine

`packages/game-engine` functions are pure and accept parameters. Where functions currently import constants directly, refactor them to accept values as arguments, keeping the engine pure and season-agnostic.

## Auth Refactor

### JWT Payload

```ts
// Current: { playerId: string, role: string }
// New:     { accountId: string, playerId: string, seasonId: string | null, role: string }
```

Embedding `playerId` and `seasonId` in the JWT avoids database lookups on every request (current middleware does zero DB queries — preserving that performance). The middleware only hits the database when `seasonId` is non-null and the Season's `constantOverrides` are not yet cached.

### Middleware Flow

1. Decode JWT → get accountId, playerId, seasonId, role
2. Set `req.account = { id: accountId }` and `req.player = { id: playerId }` from JWT claims
3. If `seasonId` → load Season from in-memory cache (refreshed on admin action), attach `req.season`
4. Lazy-load full Player/Account from DB only when a service actually needs it (most routes already fetch player data from DB by playerId)

### Character Switching

`POST /auth/switch-player` updates `Account.activePlayerId` and returns a **new JWT** with the switched player's `playerId` and `seasonId`. The frontend discards the old token and uses the new one. In-flight requests with the old JWT complete safely against the old player — no race condition.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /auth/register` | Creates Account + permanent Player (same UX as today) |
| `POST /auth/login` | Returns JWT with accountId, plus active player info |
| `GET /auth/characters` | Lists all Players for this account |
| `POST /auth/switch-player` | Sets `activePlayerId` on Account |
| `POST /auth/join-season` | Creates new seasonal Player for the active season |

### Token Changes

Refresh tokens move from Player to Account — sessions are account-scoped. Cascade delete moves from Player to Account (deleting a seasonal Player does not invalidate the session).

### Activity Tracking

`lastActiveAt` exists on both Account (overall activity) and Player (per-character activity). Account-level is updated on token refresh. Player-level is updated on authenticated requests (existing behavior).

### Migration

No data migration needed — no existing player base. Wipe database and re-seed with new schema.

## Merge Pipeline

When a season transitions `active → ended`, a freeze-then-merge process runs:

1. **Freeze** — season status set to `ended`. All turn-spending actions for seasonal players are blocked immediately (services check `season.status === 'active'` before any action). Players can still view their character but cannot act.
2. **Grace period** — 60-second wait for in-flight requests to complete.
3. **Merge** — merge job runs for each seasonal Player. The job is idempotent (safe to re-run).

### Merge Steps

| Step | Action | Detail |
|---|---|---|
| 1 | Items | Transfer non-`seasonExclusive` items to permanent Player's stash. Delete seasonal-exclusive items. |
| 2 | Gold | Add seasonal gold to permanent Player's gold balance. |
| 3 | Skill XP | Grant raw XP earned during the season (total XP accumulated on seasonal PlayerSkill records) to permanent Player's skills. XP is added through the normal `grantSkillXp` flow, meaning the permanent player's efficiency window applies — this is not a free bypass of the efficiency system. |
| 4 | Character XP | Grant raw character XP earned to permanent Player. |
| 5 | Achievements | Union merge. Keep earlier `unlockedAt` if both have it. |
| 6 | Bestiary | Union merge entries. Sum kill counts for shared entries. |
| 7 | Recipes | Transfer only recipes where `CraftingRecipe.seasonId IS NULL` (exists in permanent). |
| 8 | Zone discoveries | Transfer only for zones with `seasonId IS NULL`. |
| 9 | Titles/rewards | Season reward titles and cosmetic items applied to permanent Player. |

### What Does NOT Merge

- PvP rating and match history
- Guild membership (seasonal guilds dissolve)
- Encounter sites, persisted mobs, activity logs
- Turn bank
- Combat templates
- Skill point allocations (talent tree — depends on seasonal skill levels which may not match permanent)
- Active quests, quest state, quest tokens
- Shop purchases, active buffs
- Expedition tokens (earned from seasonal guild, guild doesn't merge)
- PlayerStats (lifetime totals like `totalCrafts`, `peakGoldHeld` — captured in archive snapshot, not summed into permanent)

### Social Features

`Friendship`, `PlayerBlock`, and `FriendMail` are currently scoped to `playerId`. When a seasonal Player is cascade-deleted, any friendships or mail involving that player would also be deleted — including relationships with permanent players.

**Resolution:** Social features are account-scoped, not player-scoped. Move `Friendship`, `PlayerBlock`, and `FriendMail` FKs from `playerId` to `accountId`. This means your friends list is the same regardless of which character you're playing, and nothing is lost on seasonal deletion.

### Chat Messages

`ChatMessage` stores a denormalized `playerId` and `username` (no FK). Messages from seasonal characters persist after deletion with a dangling `playerId` — this is acceptable. The seasonal username remains visible in chat history as a historical record.

Seasonal and permanent realms use separate chat channels (e.g., `world:permanent` vs `world:season-1`) so messages don't cross realms.

### Orphaned Records (No FK Cascade)

Some tables store player IDs without FK relationships and will have orphaned rows after seasonal Player deletion:
- **PvpCooldown** — stores `attackerId`/`defenderId` as strings, no FK. Cooldowns have `expiresAt` and expire naturally. Orphans are harmless.
- **ChatMessage** — denormalized `playerId`/`username`. Acceptable as historical record.

These are acceptable orphans — no cleanup needed.

### World Events & Boss Encounters

`WorldEvent` and `BossEncounter` inherit seasonal scoping from their zone. A world event spawned in a seasonal zone is implicitly seasonal. The event scheduler and boss spawn logic must filter by zone seasonId to prevent cross-realm visibility.

When a season ends, any active world events or boss encounters in seasonal zones are cancelled as part of the freeze step (before merge). `BossEncounter` records with no remaining participants after seasonal Player deletion are cleaned up by the existing persisted mob cleanup timer or a post-merge sweep.

### Merge Ordering

1. Create archive snapshot (preserves data even if merge partially fails)
2. Run merge transfers
3. Delete seasonal Player (cascade deletes all related records)
4. Mark season `archived` once all players processed

## Season Archive

After merge, each seasonal Player is compressed into a single denormalized row:

```
SeasonArchive
├── id
├── accountId (FK → Account)
├── seasonId (FK → Season)
├── username
├── characterLevel, characterXp
├── attributes (JSON snapshot)
├── skills (JSON snapshot)
├── stats (JSON snapshot from PlayerStats)
├── combatTemplates (JSON snapshot)
├── leaderboardRanks (JSON — { "pvp_rating": 12, "total_kills": 3 })
├── rewardsEarned (JSON — titles, exclusive items, placement rewards)
├── mergeLog (JSON — per-step outcome: { "items": { "transferred": 42 }, "gold": { "amount": 15000 }, ... })
├── createdAt
```

No FKs to live game tables. All bulk data (logs, items, encounter sites) deleted after merge. The `mergeLog` field records what was transferred in each step for auditability — if a merge partially fails, it's clear what succeeded.

## Hall of Fame & Season Rewards

### Hall of Fame

Permanent public record of season winners:

```
HallOfFameEntry
├── id
├── seasonId (FK → Season)
├── category (e.g. 'pvp_rating', 'total_kills', 'legendaries_crafted')
├── rank (1, 2, 3, etc.)
├── accountId (FK → Account)
├── username (snapshot of seasonal character name)
├── value (score/rating achieved)
├── createdAt
```

### Reward Tiers

Defined per season, awarded based on leaderboard placement:

```
SeasonRewardTier
├── id
├── seasonId (FK → Season)
├── category (which leaderboard)
├── minRank, maxRank (e.g. 1-1 for first, 2-10 for top 10)
├── rewards (JSON — { "title": "S1 Champion", "exclusiveItemTemplateId": "..." })
```

### Reward Flow

1. Season ends → leaderboards frozen
2. Evaluate each player's final rank per category against SeasonRewardTier
3. Write rewards to SeasonArchive.rewardsEarned and apply to permanent Player
4. Create HallOfFameEntry for top placements

### Reward Types

- **Titles** — permanent, displayable. "Season 1 PvP Champion"
- **Exclusive cosmetic items** — untradeable, transferred to permanent stash
- **Achievement unlocks** — "Participated in Season 1", "Top 10 Crafter S1"

## Leaderboard Namespacing

The current leaderboard service uses Redis keys like `leaderboard:${category}`. With seasons, leaderboards are scoped per realm:

- **Redis key format:** `leaderboard:${seasonId ?? 'permanent'}:${category}`
- **Refresh queries** add `WHERE player.seasonId = :seasonId` (or `IS NULL` for permanent)
- **API endpoint** gains a `seasonId` query parameter: `GET /leaderboard/:category?seasonId=3`
- Default (no param) returns the leaderboard for the player's current realm
- When a season ends, its leaderboard Redis keys are frozen (no more refreshes). Final standings are captured in `HallOfFameEntry` and `SeasonArchive.leaderboardRanks`.

### Bot Handling

If seasonal realms include bots (for PvP matchmaking and leaderboard population early in a season), bots need seasonal Player records. Decision deferred to implementation — bots can be seeded as part of the season setup or omitted for a pure player-only competition.

## Frontend Changes

### Character Picker

Not a full screen. Shown when the account has multiple characters (permanent + seasonal):
- Permanent character: name, level, "Permanent Realm"
- Seasonal character: name, level, "Season 1 — 23 days remaining"
- Switch triggers `POST /auth/switch-player` → game state reloads

If only one character exists (day one), skip straight to game.

### Join Season

When a season is `active` and the player has no seasonal character:
- Banner/prompt: "Season 1 is live — create a character to compete"
- Character creation form (username)
- `POST /auth/join-season` → creates Player → switches to it

### Realm Indicator

Header shows which realm you're in — "Permanent" or "Season 1".

### New Screens

- Hall of Fame (tab on leaderboards or standalone)
- Season Archive (view past seasonal characters — stats, ranks, rewards)
- Leaderboard season filter toggle

### No Changes

Every game screen, component, and hook operates on `req.player`. They don't know or care about seasons.

## Season Highlights (Future Enhancement)

Notable matches and moments preserved per season:

```
SeasonHighlight
├── seasonId
├── type: 'pvp_final' | 'pvp_upset' | 'boss_kill' | 'first_max_level'
├── data (JSON — combat log, participants, context)
├── createdAt
```

Not part of the core seasonal architecture — can be added when there's demand.

## Release Strategy

### Day One (Initial Release)

- Account + Player schema in place
- Auth uses accountId in JWT
- Season table exists but is empty
- `seasonId` nullable FK on Player and content templates — always null
- Constants resolver exists, always returns base constants
- No character picker, no hall of fame, no season archive
- Zero behavioral difference from current game

### When Season 1 is Announced

- Admin creates Season record with dates, overrides, features
- Seed seasonal-exclusive content (mobs, zones, items, recipes)
- "Join Season" banner appears
- Character picker activates
- Seasonal leaderboards appear

### When Season 1 Ends

- Merge pipeline runs
- Hall of fame populated
- Season archives created
- Seasonal content deactivated
- Players return to one character until Season 2
