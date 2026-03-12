# Achievements & Milestones System

## Summary

Player-facing achievement system with 107 achievements across 8 categories plus 19 mob-family kill tiers. Achievements are code-defined constants; DB stores player progress only. Rewards are a mix of cosmetic titles (selectable, shown in PvP/leaderboard) and tangible rewards (XP, items, attribute points) for major milestones. Family-specific achievements at high kill tiers reward unique themed items for all 19 families.

## Design Decisions

| Decision | Choice |
|---|---|
| Rewards | Mix: cosmetic titles + tangible rewards for major milestones |
| Triggering | Event-driven: check immediately after each action |
| Definitions | Code-defined constants, DB stores player progress only |
| Title system | One active title, player picks from unlocked titles |
| Categories | 7: Combat, Exploration, Crafting, Skills, Gathering, Bestiary, General |
| Family achievements | All 19 families, 3 tiers each (100/500/1000 kills) |
| Unique items | All 19 families get unique achievement-only equipment at 1,000 kills |
| Notifications | Toast popup + activity log entry |
| UI | New dedicated Achievements tab in main nav |
| Progress visibility | Mixed: most show progress bars, some are secret/hidden |
| Reward claiming | Manual claim to promote tab interaction |
| Leaderboard tie-in | Active title visible in PvP arena + leaderboard; PlayerStats shared data source |

## Data Model

### New: `PlayerStats` (one per player)

Pre-aggregated counters, incremented alongside existing action logic. Also serves as data source for leaderboard refresh queries.

```
PlayerStats
  playerId         PK, FK → Player
  totalKills
  totalBossKills
  totalBossDamage
  totalPvpWins
  bestPvpWinStreak
  totalCrafts
  totalRaresCrafted
  totalEpicsCrafted
  totalLegendariesCrafted
  totalSalvages
  totalForgeUpgrades
  totalGatheringActions
  totalTurnsSpent
  totalZonesDiscovered
  totalZonesFullyExplored
  totalRecipesLearned
  totalBestiaryCompleted    (mobs with all prefixes mastered)
  totalUniqueMonsterKills
  highestCharacterLevel
  highestSkillLevel
  updatedAt
```

### New: `PlayerFamilyStats` (one per player per family)

```
PlayerFamilyStats
  playerId       PK, FK → Player
  mobFamilyId    PK, FK → MobFamily
  kills
```

### New: `PlayerAchievement` (one per unlocked achievement)

```
PlayerAchievement
  playerId        PK, FK → Player
  achievementId   PK (string, matches code-defined ID)
  unlockedAt
  rewardClaimed   boolean (false until player manually claims)
```

### Modified: `Player`

```
+ activeTitle    nullable string (achievement ID whose titleReward is displayed)
```

## Achievement Definition Structure

Code-defined in constants. Each achievement specifies either a `statKey` (checked against `PlayerStats`) or a `familyKey` (checked against `PlayerFamilyStats`).

```typescript
interface AchievementDef {
  id: string;
  category: AchievementCategory;  // "combat" | "exploration" | "crafting" | "skills" | "gathering" | "bestiary" | "general" | "family"
  title: string;
  description: string;
  titleReward?: string;
  rewards?: AchievementReward[];
  secret?: boolean;
  tier?: number;
  statKey?: keyof PlayerStats;
  familyKey?: string;
  threshold: number;
}

interface AchievementReward {
  type: "xp" | "turns" | "attribute_points" | "item";
  amount: number;
  itemTemplateId?: string;  // required when type is "item"
}

type AchievementCategory = "combat" | "exploration" | "crafting" | "skills" | "gathering" | "bestiary" | "general" | "family";
```

## Achievement Check Flow

```
Player performs action (e.g. kills a mob)
  → existing route logic (XP, loot, bestiary, etc.)
  → statsService.increment(playerId, { totalKills: 1 })
  → familyStatsService.increment(playerId, mobFamilyId, 1)
  → achievementService.check(playerId, { statKeys: ["totalKills"], familyId: mobFamilyId })
      → load PlayerStats + relevant PlayerFamilyStats
      → load PlayerAchievement rows for this player (cached per request)
      → filter code-defined achievements matching changed keys
      → filter out already-unlocked
      → for each where threshold met → insert PlayerAchievement (rewardClaimed: false)
      → return newly unlocked achievement IDs
  → if any unlocked:
      → push activity log entry (type: "achievement")
      → emit socket event for toast notification
```

### Hook Points

| Route / Action | Stats incremented | Family stat |
|---|---|---|
| Combat kill | totalKills, totalUniqueMonsterKills | familyId +1 |
| Boss kill | totalBossKills, totalBossDamage | familyId +1 |
| PvP win | totalPvpWins, bestPvpWinStreak | — |
| Craft item | totalCrafts + rarity counters | — |
| Salvage | totalSalvages | — |
| Forge upgrade | totalForgeUpgrades | — |
| Gather resource | totalGatheringActions | — |
| Discover zone | totalZonesDiscovered | — |
| Fully explore zone | totalZonesFullyExplored | — |
| Learn recipe | totalRecipesLearned | — |
| Level up (character) | highestCharacterLevel | — |
| Level up (skill) | highestSkillLevel | — |
| Complete bestiary entry | totalBestiaryCompleted | — |
| Spend turns | totalTurnsSpent | — |

## API Endpoints

All under `/api/v1/achievements`, auth required.

```
GET  /achievements           → all definitions + player progress + stats
POST /achievements/:id/claim → claim rewards for unlocked achievement
GET  /achievements/title     → player's active title
PUT  /achievements/title     → set active title { achievementId: string | null }
```

### GET /achievements response

```typescript
{
  achievements: [{
    id, category, title, description, titleReward,
    threshold, secret, tier,
    progress: number,        // current stat or family kill value
    unlocked: boolean,
    unlockedAt?: string,
    rewardClaimed?: boolean,
    rewards?: AchievementReward[]
  }],
  stats: PlayerStats,
  unclaimedCount: number
}
```

Secret achievements return `title: "???"`, `description: "???"` when not unlocked.

### Existing endpoints to extend

- `GET /player` → add `activeTitle: string | null` to response
- PvP opponent data → add `activeTitle` to opponent info in arena matchups
- Leaderboard entries → add `activeTitle` to meta stored in Redis

## Starter Achievements (50 general + 57 family = 107 total)

### Combat

| ID | Name | Condition | Title | Reward |
|---|---|---|---|---|
| combat_kills_100 | Monster Hunter | Kill 100 monsters | | |
| combat_kills_500 | Warrior | Kill 500 monsters | "The Warrior" | |
| combat_kills_1000 | Slayer | Kill 1,000 monsters | "The Slayer" | 1 attr pt |
| combat_kills_5000 | Annihilator | Kill 5,000 monsters | "The Annihilator" | 2 attr pts |
| combat_kills_10000 | Extinction Event | Kill 10,000 monsters | "Extinction Event" | 3 attr pts |
| combat_boss_1 | Boss Hunter | Defeat 1 boss | | materials |
| combat_boss_10 | Boss Crusher | Defeat 10 bosses | "Bane of Bosses" | 1 attr pt |
| combat_boss_25 | Raid Leader | Defeat 25 bosses | "Raid Leader" | 2 attr pts |
| combat_pvp_1 | Gladiator | Win 1 PvP match | | |
| combat_pvp_25 | Pit Fighter | Win 25 PvP matches | "Pit Fighter" | |
| combat_pvp_100 | Arena Champion | Win 100 PvP matches | "Champion" | 2 attr pts |
| combat_streak_5 | On A Roll | 5 PvP win streak | | |
| combat_streak_10 | Unstoppable (secret) | 10 PvP win streak | "The Unstoppable" | |

### Exploration

| ID | Name | Condition | Title | Reward |
|---|---|---|---|---|
| explore_zones_3 | Wanderer | Discover 3 zones | | turns |
| explore_zones_5 | Pathfinder | Discover 5 zones | "The Pathfinder" | |
| explore_zones_all | Cartographer | Discover all zones | "The Cartographer" | 2 attr pts |
| explore_full_1 | Thorough | Fully explore 1 zone | | |
| explore_full_3 | Surveyor | Fully explore 3 zones | "The Surveyor" | |
| explore_full_all | World Walker | Fully explore all zones | "World Walker" | 3 attr pts |

### Crafting

| ID | Name | Condition | Title | Reward |
|---|---|---|---|---|
| craft_total_1 | Apprentice | Craft 1 item | | materials (tutorial) |
| craft_total_50 | Artisan | Craft 50 items | "The Artisan" | |
| craft_total_500 | Master Crafter | Craft 500 items | "Master Crafter" | 2 attr pts |
| craft_rare_1 | Lucky Break | Craft a rare item | | |
| craft_epic_1 | Epic Forger | Craft an epic item | "The Forger" | |
| craft_legendary_1 | Legendary Smith | Craft a legendary | "Legendsmith" | 1 attr pt |
| craft_salvage_50 | Scrapper | Salvage 50 items | | |
| craft_salvage_500 | Recycler | Salvage 500 items | "The Recycler" | |
| craft_forge_25 | Tinkerer | Forge upgrade 25 times | | |

### Skills

| ID | Name | Condition | Title | Reward |
|---|---|---|---|---|
| skill_any_10 | Dedicated | Any skill to level 10 | | |
| skill_any_25 | Specialist | Any skill to level 25 | "The Specialist" | |
| skill_any_50 | Master | Any skill to level 50 | "The Master" | 2 attr pts |
| level_10 | Rising Star | Character level 10 | | |
| level_25 | Veteran | Character level 25 | "Veteran" | 1 attr pt |
| level_50 | Legend | Character level 50 | "The Legend" | 3 attr pts |

### Gathering

| ID | Name | Condition | Title | Reward |
|---|---|---|---|---|
| gather_total_10 | Prospector | Gather 10 times | | materials (tutorial) |
| gather_total_100 | Harvester | Gather 100 times | | |
| gather_total_500 | Resource Baron | Gather 500 times | "The Harvester" | |
| gather_total_1000 | Strip Miner | Gather 1,000 times | "Strip Miner" | 1 attr pt |

### Bestiary

| ID | Name | Condition | Title | Reward |
|---|---|---|---|---|
| bestiary_unique_10 | Naturalist | 10 unique monsters encountered | | |
| bestiary_unique_25 | Monster Scholar | 25 unique monsters | "The Scholar" | |
| bestiary_complete_1 | Completionist | Master all prefixes for 1 mob | | |
| bestiary_complete_5 | Zoologist | Master 5 mob entries | "The Zoologist" | 1 attr pt |
| bestiary_complete_all | Encyclopedist | Master all mob entries | "The Encyclopedist" | 3 attr pts |

### General

| ID | Name | Condition | Title | Reward |
|---|---|---|---|---|
| turns_10000 | Time Invested | Spend 10,000 turns | | |
| turns_100000 | Dedicated Adventurer | Spend 100,000 turns | "The Dedicated" | |
| turns_1000000 | No-Lifer | Spend 1,000,000 turns | "The No-Lifer" | 2 attr pts |
| recipe_10 | Cookbook | Learn 10 recipes | | |
| recipe_25 | Recipe Collector | Learn 25 recipes | "The Collector" | 1 attr pt |

### Secret

| ID | Name | Condition | Title |
|---|---|---|---|
| secret_first_death | Humbling Experience | Get knocked out | |
| secret_legendary_crit | Golden Hands | Craft legendary on crit | "Golden Hands" |

### Family Achievements (19 families x 3 tiers = 57)

Per family pattern:

| Tier | Threshold | Name Pattern | Title | Reward |
|---|---|---|---|---|
| 1 | 100 kills | {Family} Hunter | — | — |
| 2 | 500 kills | {Family} Slayer | "{Family} Slayer" | — |
| 3 | 1,000 kills | {Family} Bane | "{Family}'s Bane" | unique item (all 19 families) |

#### Unique Family Items (1,000 kill tier)

All 19 families reward a unique achievement-only equipment piece at the 1,000 kill tier.

| Family | Item | Slot | Theme |
|---|---|---|---|
| Vermin | Ratcatcher's Gloves | gloves | gathering speed |
| Spiders | Venomweave Boots | boots | evasion |
| Boars | Tuskhide Pauldrons | chest | vitality |
| Wolves | Wolf Pelt Cloak | chest | evasion |
| Bandits | Bandit Lord's Blade | main_hand | crit |
| Treants | Ironbark Shield | off_hand | defence |
| Spirits | Spectral Lantern | charm | magic power |
| Fae | Pixie Dust Ring | ring | luck |
| Bats | Echolocation Helm | head | evasion |
| Goblins | Goblin King's Crown | head | luck |
| Golems | Crystal Core Charm | charm | magic defence |
| Crawlers | Chitin Legguards | legs | defence |
| Harpies | Featherstep Boots | boots | speed |
| Undead | Death Knight's Gauntlets | gloves | attack |
| Swamp Beasts | Mire Walker's Belt | belt | vitality |
| Witches | Hexweave Cowl | head | magic power |
| Elementals | Primordial Shard Neck | neck | all elemental |
| Serpents | Naga Queen's Ring | ring | magic defence |
| Abominations | Fleshknit Vest | chest | vitality regen |

## Frontend

### Achievements Tab

New top-level tab in game navigation with unclaimed-count badge (red circle, same pattern as PvP notifications).

**Category filter tabs:** All | Combat | Exploration | Crafting | Skills | Gathering | Bestiary | General | Families

**Achievement card states:**
- Secret/locked: "???" name and description
- In progress: name, description, progress bar with `current/threshold`
- Unlocked, unclaimed: glow highlight, CLAIM button, rewards listed
- Unlocked, claimed: checkmark, title selectable if titleReward exists

**Title selector:** section within Achievements tab, dropdown/list of unlocked titles, pick one or clear.

### Toast Notification (new component)

- Slides in from top-right on achievement unlock
- Shows achievement name + category icon
- Auto-dismisses after ~4 seconds
- Triggered via socket event from server

### Activity Log Integration

Achievement unlocks also push an entry to the existing activity log:
```
{ type: "achievement", message: "Achievement unlocked: Centurion!" }
```

## Migration

No backfill needed — game is still in development with no active real players. Stats tables start at zero for all players.
