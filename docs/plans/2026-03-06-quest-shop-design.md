# Quest Shop Design

## Overview

The quest shop is an exclusive token-only store where players spend Quest Tokens earned from daily/weekly quests. Every item provides something unobtainable through normal gameplay, motivating daily login and quest completion.

## Design Principles

- **Exclusive utility only** -- no items available through other means (no potions, no basic materials)
- **Action-count buffs over time-based** -- respects the async, turn-based nature of the game
- **Weekly purchase limits on powerful items** -- forces meaningful spending choices
- **No buff stacking** -- can't buy a buff you already have active (prevents waste)
- **Database-driven items** -- shop items stored in DB for hot-tuning without deploys

## Token Economy

Weekly token income (approximate):
- Daily quests: ~15-30 tokens/day x 7 = ~105-210
- Daily bonus: ~5-18/day x 7 = ~35-126
- Weekly quest: ~15-30
- **Total: ~155-366 tokens/week** depending on level and completion rate

## Data Model

### ShopItem

Stores all shop items. Seeded via migration, tunable via admin/DB.

| Column | Type | Notes |
|---|---|---|
| id | int (PK) | |
| key | string (unique) | e.g. `forge_protection_scroll` |
| name | string | Display name |
| description | string | Tooltip text |
| cost | int | Quest token price |
| category | enum | `reset`, `upgrade`, `buff`, `utility`, `prestige` |
| weeklyLimit | int? | null = unlimited |
| lifetimeLimit | int? | null = unlimited, 1 = one-time purchase |
| buffType | string? | Only for buff/upgrade items |
| buffValue | float? | e.g. 0.10 for +10% |
| buffUses | int? | Action count before buff expires |
| enabled | boolean | Soft toggle |
| sortOrder | int | Display ordering |

### PlayerShopPurchase

Tracks every purchase for limit enforcement.

| Column | Type | Notes |
|---|---|---|
| id | int (PK) | |
| playerId | int (FK) | |
| shopItemId | int (FK) | |
| purchasedAt | datetime | Used for weekly limit window (Monday UTC reset) |

### PlayerBuff

Active buffs from scroll purchases. Rows deleted when `remainingUses` hits 0.

| Column | Type | Notes |
|---|---|---|
| id | int (PK) | |
| playerId | int (FK) | |
| buffType | string | `xp_boost`, `gathering_yield`, `crafting_crit`, `combat_damage`, `combat_defence`, `durability_shield`, `forge_luck`, `forge_protection` |
| remainingUses | int | Decremented per qualifying action |
| bonusValue | float | Multiplier (e.g. 0.10 = +10%, 2.0 = double chance) |
| shopItemId | int (FK) | Reference back to source item |
| createdAt | datetime | |

### Player Model Addition

| Column | Type | Notes |
|---|---|---|
| homeTownZoneId | int? (FK) | Nullable, defaults to starting town. Can only be set while in a town zone. |

## Item Roster (19 items)

### Reset Scrolls

| Key | Name | Cost | Weekly | Lifetime | Effect |
|---|---|---|---|---|---|
| `attribute_reset_scroll` | Attribute Reset Scroll | 40 | 1 | - | Reset all attribute points |
| `talent_reset_scroll` | Talent Reset Scroll | 40 | 1 | - | Reset all skill point allocations (no turn cost) |
| `efficiency_reset_scroll` | Efficiency Reset Scroll | 35 | 2 | - | Reset all skill XP efficiencies to 100% |

### Upgrade Scrolls

| Key | Name | Cost | Weekly | Lifetime | Effect |
|---|---|---|---|---|---|
| `forge_luck_scroll` | Forge Luck Scroll | 35 | 2 | - | Double forge upgrade chance for next 3 upgrades |
| `forge_protection_scroll` | Forge Protection Scroll | 150 | 1 | - | Guaranteed success on next forge upgrade (item preserved on failure, sacrificial item still consumed) |

### Buff Scrolls (action-count based)

| Key | Name | Cost | Weekly | Lifetime | Uses | Bonus |
|---|---|---|---|---|---|---|
| `xp_boost_scroll` | XP Boost Scroll | 25 | 2 | - | 100 kills | +10% XP |
| `gathering_yield_scroll` | Gathering Yield Scroll | 25 | 2 | - | 50 gathers | +15% yield |
| `crafting_fortune_scroll` | Crafting Fortune Scroll | 30 | 2 | - | 30 crafts | +10% crit chance |
| `combat_power_scroll` | Combat Power Scroll | 30 | 2 | - | 50 combats | +10% damage |
| `iron_skin_scroll` | Iron Skin Scroll | 30 | 2 | - | 50 combats | +10% defence |
| `durability_shield_scroll` | Durability Shield Scroll | 20 | 2 | - | 50 combats | 0 durability loss |

### Utility

| Key | Name | Cost | Weekly | Lifetime | Effect |
|---|---|---|---|---|---|
| `teleport_scroll` | Teleport Scroll | 15 | 3 | - | Instantly travel to any discovered zone (no turn cost) |
| `hearthstone` | Hearthstone | 10 | 5 | - | Instantly teleport to home town |
| `bestiary_tome` | Bestiary Tome | 35 | 1 | - | Fully unlock bestiary entry for one chosen mob |
| `recipe_scroll` | Recipe Scroll | 30 | 1 | - | Unlock a random unlearned recipe the player can craft |
| `guild_contract_reroll` | Guild Contract Reroll | 20 | 1 | - | Reroll one guild contract (leader/officer only) |

### Prestige (one-time)

| Key | Name | Cost | Weekly | Lifetime | Effect |
|---|---|---|---|---|---|
| `title_questmaster` | Title: Questmaster | 500 | - | 1 | Exclusive cosmetic title |
| `title_token_hoarder` | Title: Token Hoarder | 1000 | - | 1 | Exclusive cosmetic title |

## API Endpoints

### Shop

```
GET    /api/v1/shop                    -- List all enabled shop items + player's weekly/lifetime purchase counts
POST   /api/v1/shop/purchase/:itemId   -- Purchase an item
```

Purchase request body (only for items needing a target):
```json
{ "targetZoneId?": 1, "targetMobTemplateId?": 5, "targetContractId?": "uuid" }
```

### Player Buffs

```
GET    /api/v1/player/buffs            -- List active buffs (type, remaining uses, bonus value)
```

### Home Town

Uses existing player settings endpoint:
```
PATCH  /api/v1/player/settings         -- Set homeTownZoneId (must be in that town zone)
```

## Purchase Flow

1. Validate player has enough quest tokens
2. Check weekly limit (count purchases for this item since last Monday UTC)
3. Check lifetime limit (count all purchases for this item)
4. For buffs: check player doesn't already have this buff active
5. For utility items: validate target params (zoneId exists and discovered, mob exists, contract exists and player is leader/officer)
6. Execute in transaction:
   a. Deduct tokens from `PlayerQuestState.questTokens`
   b. Insert `PlayerShopPurchase` row
   c. Apply effect (branch by category)

### Effect Application by Category

| Category | Effect |
|---|---|
| **reset (attribute)** | Reset all attribute allocations to 0, refund points |
| **reset (talent)** | Delete all `SkillPointAllocation` rows, no turn cost |
| **reset (efficiency)** | Reset all skill efficiency values to 1.0 |
| **upgrade** | Create `PlayerBuff` row (forge_luck or forge_protection) |
| **buff** | Create `PlayerBuff` row with uses and bonus from ShopItem |
| **utility (teleport)** | Update player's current zone to target zone |
| **utility (hearthstone)** | Update player's current zone to homeTownZoneId |
| **utility (bestiary)** | Mark all bestiary entries for target mob as discovered |
| **utility (recipe)** | Roll random eligible recipe, create `PlayerRecipe` row |
| **utility (guild contract)** | Reroll target contract with new random one |
| **prestige** | Grant title via achievement/title system |

## Buff Consumption Integration

Buffs are consumed inside existing service functions. A shared `consumeBuff(playerId, buffType, tx)` helper decrements `remainingUses` and deletes the row when it hits 0.

| Buff Type | Consumed In | Integration |
|---|---|---|
| `xp_boost` | `xpService.grantSkillXp()` | Multiply XP by `1 + bonusValue` |
| `gathering_yield` | Gathering mine action | Multiply yield by `1 + bonusValue` |
| `crafting_crit` | Crafting crit roll | Add `bonusValue` to crit chance |
| `combat_damage` | Combat engine damage calc | Multiply damage by `1 + bonusValue` |
| `combat_defence` | Combat engine defence calc | Multiply defence by `1 + bonusValue` |
| `durability_shield` | `durabilityService` | Skip durability loss |
| `forge_luck` | Forge upgrade chance calc | Multiply base chance by `bonusValue` (2.0 = double) |
| `forge_protection` | Forge upgrade failure path | Preserve item instead of destroying, consume buff |

## Home Town System

- `homeTownZoneId` added to Player model (nullable FK to Zone)
- Defaults to starting town (zone with `isStartingZone` or first town zone)
- Can only be set while player is physically in a town zone
- Setting is free, changeable anytime from a town
- Uses existing `PATCH /player/settings` endpoint

## Stacking Rules

- Cannot purchase a buff if the same `buffType` is already active on the player
- Multiple different buff types can be active simultaneously (e.g. xp_boost + combat_damage)
- Forge protection and forge luck cannot stack (different buff types, but both affect forge -- forge_protection takes priority if both somehow active)
