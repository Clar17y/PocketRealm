# Quest System Design

Daily and weekly quests that give players a reason to log in every day. Quests reward a unique currency (Quest Tokens) spent at an exclusive shop.

## Core Concepts

- **3 daily quests** (reset UTC midnight) + **1 weekly quest** (reset Monday UTC midnight)
- Randomly assigned from a template pool, level-scaled targets and rewards
- Lazy generation on first access (no cron), consistent with guild contract pattern
- **Quest Tokens** — unique currency, only source is quest completion
- **Daily completion bonus** — extra tokens for claiming all 3 dailies
- **Toast notifications** — every progress increment shown to player in real-time

## Unified Progress Dispatcher

Refactors existing guild contract progress tracking into a shared `trackProgress` function. Both guild contracts and personal quests consume the same progress events.

### ProgressType enum

```typescript
type ProgressType =
  | 'kill_count'        // mob kills (any)
  | 'kill_family'       // mob kills (guild family tracking)
  | 'kill_prefix'       // kill mob with specific prefix
  | 'boss_rounds'       // boss participation
  | 'craft_items'       // items crafted
  | 'craft_rare'        // rare+ items crafted
  | 'gather_actions'    // gathering actions
  | 'exploration_turns' // turns spent exploring
  | 'pvp_wins'          // PvP victories
  | 'pvp_damage'        // PvP damage dealt
  | 'casino_wagers'     // gold wagered
  | 'casino_bets'       // bets placed
  | 'zone_travel'       // zone transitions
  | 'chest_open'        // treasure chests opened
```

Guild contracts use a subset; quests use the full set.

### trackProgress function

```typescript
// progressService.ts
export async function trackProgress(
  playerId: string,
  type: ProgressType,
  amount: number,
  metadata?: { prefix?: string; zoneId?: string; rarity?: string }
): Promise<QuestProgressUpdate[]> {
  if (amount <= 0) return [];

  const guildId = await getPlayerGuildId(playerId);

  const [, questUpdates] = await Promise.allSettled([
    guildId ? incrementContractProgress(guildId, type, amount) : Promise.resolve(),
    incrementQuestProgress(playerId, type, amount, metadata),
  ]);

  return questUpdates; // returned to caller for toast notifications
}
```

### Call site refactor

7 existing guild contract call sites change from:

```typescript
// Before
const guildId = await getPlayerGuildId(playerId);
if (guildId) void incrementContractProgress(guildId, 'kill_count', 1).catch(() => {});

// After — awaited, returns quest progress for toasts
const questProgress = await trackProgress(playerId, 'kill_count', 1);
```

New progress types (casino, zone travel, prefix kills, chests) add one `trackProgress` call at the relevant location.

## Data Model

### PlayerQuest

```
id            UUID PK
playerId      FK → Player
questKey      String          -- references template key
cadence       'daily' | 'weekly'
targetValue   Int             -- computed at assignment from level scaling
currentValue  Int default 0
rewardAmount  Int             -- quest tokens to award
status        'active' | 'completed' | 'claimed'
assignedAt    DateTime
expiresAt     DateTime
completedAt   DateTime?
claimedAt     DateTime?

@@index([playerId, status])
@@index([playerId, cadence, assignedAt])
```

### PlayerQuestState

```
id                  UUID PK
playerId            FK → Player (unique)
lastDailyReset      DateTime
lastWeeklyReset     DateTime
dailyBonusClaimed   Boolean default false
questTokens         Int default 0
```

No separate objectives table — each quest row is one objective.

## Quest Templates

Defined in `gameConstants.ts` as constants (not database rows). Each template:

- `key` — unique identifier
- `name` / `description` — display text (supports `{target}` placeholder)
- `category` — `combat | exploration | crafting | gathering | pvp | casino`
- `cadence` — `daily | weekly`
- `progressType` — maps to `ProgressType`
- `targetScaling` — target values per level bracket (low/mid/high)
- `rewardScaling` — token reward range per bracket
- `filter?` — optional constraint (prefix, rarity, zone)
- `unlockCondition?` — when this quest can be assigned (e.g. PvP unlocked)

### Level brackets

| Bracket | Level Range |
|---------|-------------|
| Low     | 1–10        |
| Mid     | 11–25       |
| High    | 26+         |

### Template pool

| Key | Name | Category | Cadence | Low | Mid | High | Tokens |
|-----|------|----------|---------|-----|-----|------|--------|
| `kill_mobs` | Slay Monsters | combat | daily | 5 | 15 | 40 | 3–8 |
| `kill_prefix` | Hunt the [Prefix] | combat | daily | 1 | 2 | 5 | 5–12 |
| `deal_damage` | Deal X Damage | combat | daily | 200 | 800 | 3000 | 3–8 |
| `explore_turns` | Explore the Wilds | exploration | daily | 50 | 200 | 500 | 3–8 |
| `open_chests` | Treasure Seeker | exploration | daily | 1 | 3 | 5 | 4–10 |
| `travel_zones` | Wanderer | exploration | daily | 1 | 2 | 3 | 3–6 |
| `gather_resources` | Resource Run | gathering | daily | 5 | 15 | 30 | 3–8 |
| `craft_items` | Busy Hands | crafting | daily | 2 | 5 | 10 | 3–8 |
| `craft_rare` | Quality Crafter | crafting | weekly | 1 | 3 | 5 | 15–30 |
| `pvp_wins` | Arena Victor | pvp | daily | 1 | 2 | 3 | 5–10 |
| `pvp_damage` | Arena Brawler | pvp | daily | 100 | 400 | 1500 | 4–8 |
| `casino_wager` | High Roller | casino | daily | 50 | 200 | 1000 | 3–8 |
| `casino_bets` | Gambler | casino | daily | 3 | 8 | 15 | 3–6 |
| `weekly_kills` | Weekly Bounty | combat | weekly | 30 | 100 | 300 | 15–30 |
| `weekly_gather` | Stockpile | gathering | weekly | 30 | 100 | 250 | 15–30 |
| `weekly_explore` | Cartographer | exploration | weekly | 300 | 1000 | 3000 | 15–30 |

Token rewards randomized within range at assignment time.

### Template pool filtering

- PvP quests: only if player has unlocked PvP
- Casino quests: only if casino is accessible
- Zone travel: only if player has discovered 2+ zones
- Prefix kill: random prefix from player's `PlayerBestiaryPrefix` (must have encountered at least one)

## Quest Lifecycle

### Daily reset (lazy, on GET /quests)

1. Check `PlayerQuestState.lastDailyReset` < today's UTC midnight
2. Expire any unclaimed active daily quests
3. Pick 3 random daily templates (filtered by unlock conditions)
4. Compute `targetValue` and `rewardAmount` from player level bracket
5. Insert 3 `PlayerQuest` rows, `expiresAt` = next UTC midnight
6. Reset `dailyBonusClaimed = false`, update `lastDailyReset`

### Weekly reset (lazy, on GET /quests)

Same pattern, 1 weekly quest, `expiresAt` = next Monday UTC midnight.

### Completion flow

1. `trackProgress` increments `currentValue` on matching active quests
2. When `currentValue >= targetValue` → status = `completed`, set `completedAt`
3. Player manually claims via `POST /quests/:id/claim`
4. On claim: add `rewardAmount` to `questTokens`, status = `claimed`, set `claimedAt`

### Daily bonus

When all 3 daily quests are `claimed`, player can claim bonus via `POST /quests/bonus`. Awards `DAILY_BONUS_BASE + (level * DAILY_BONUS_PER_LEVEL)` tokens. Sets `dailyBonusClaimed = true`.

## Toast Notifications

`trackProgress` is awaited (not fire-and-forget) and returns progress updates:

```typescript
interface QuestProgressUpdate {
  questName: string;
  current: number;
  target: number;
  completed: boolean;
}
```

Every API response that calls `trackProgress` includes a `questProgress` field:

```json
{
  "combat": { },
  "questProgress": [
    { "questName": "Slay Monsters", "current": 3, "target": 15, "completed": false }
  ]
}
```

Frontend renders toasts: `⚔ Slay Monsters 3/15` on increment, `✓ Quest Complete: Slay Monsters!` on completion.

## API Routes

```
GET    /api/v1/quests              — Active quests + progress (triggers lazy reset)
POST   /api/v1/quests/:id/claim    — Claim completed quest reward
POST   /api/v1/quests/bonus        — Claim daily completion bonus
GET    /api/v1/quests/shop         — Shop inventory + token balance
POST   /api/v1/quests/shop/buy     — Purchase shop item
```

## Quest Token Shop

### Permanent items

- Potions and consumables: 5–20 tokens
- Rare crafting materials: 10–30 tokens
- Repair kits (restore durability, no gold cost): 8–15 tokens

### Rotating stock (refreshes weekly Monday UTC)

- 3–5 items from a pool
- Exclusive recipes: 50–100 tokens
- Unique equipment (different stat combos, not strictly better): 75–150 tokens
- Stat reset scrolls: 40 tokens
- XP boost scrolls (temporary): 25 tokens

### Economy targets

- Completing all dailies + bonus ≈ 20–30 tokens/day
- Weekly quest ≈ 15–30 tokens
- Consistent full week ≈ 50–60 tokens/week
- Big-ticket items (150 tokens) ≈ 3 weeks of play

Shop inventory defined as constants in code. Purchases decrement `questTokens` and call existing item/recipe granting services. Specific shop items designed separately once core system is built.

## Frontend

New `QuestScreen` component:

- 3 daily quest cards with progress bars and claim buttons
- 1 weekly quest card (visually distinct)
- Daily bonus indicator (activates when all dailies claimed)
- Token balance display
- Tab/link to quest shop
- Toast notification component for real-time progress feedback
