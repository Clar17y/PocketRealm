# Inventory & Backpack System Design

## Problem

Players accumulate unlimited items with no management pressure. The inventory `/24` display and grid are cosmetic only. No reason to return to town, no item economy drain, and no meaningful inventory decisions.

## Goals

- Make inventory capacity real and meaningful
- Create a natural explore→return→manage loop
- Introduce gold selling as the primary junk cleanup path
- Add backpacks as a tailoring crafting goal
- Give Champion subscribers a tangible perk (+8 slots)

## Capacity Model

```
capacity = BASE (24)
         + backpackSlots (8/16/24/32/40 by tier + 2 per rarity above common)
         + beltBonus (0–8 from bonus stat roll)
         + championBonus (8 if subscribed)

Max possible: 88 slots (T5 legendary backpack + max belt + champion)
```

### Slot Counting

- Each non-stackable item = 1 slot
- Each unique stackable template = 1 slot (regardless of quantity in stack)
- Equipped items do NOT count toward capacity
- Stashed items do NOT count toward capacity

## Backpack Equipment Slot

New 12th equipment slot: `backpack`. One backpack equipped at a time.

### Backpack Recipes (Tailoring)

| Tier | Name | Req Level | Base Slots |
|------|------|-----------|------------|
| 1 | Cloth Satchel | 5 | +8 |
| 2 | Reinforced Pack | 15 | +16 |
| 3 | Traveller's Rucksack | 25 | +24 |
| 4 | Ranger's Haversack | 35 | +32 |
| 5 | Adventurer's Expedition Pack | 45 | +40 |

Materials: tier-appropriate cloth and leather. Exact quantities tuned during implementation.

### Forge Upgrades

Backpacks are forge-upgradeable. Each rarity adds +2 inventory slots:

| Rarity | Bonus | Example (Tier 3) |
|--------|-------|-------------------|
| Common | +0 | 24 slots |
| Uncommon | +2 | 26 slots |
| Rare | +4 | 28 slots |
| Epic | +6 | 30 slots |
| Legendary | +8 | 32 slots |

- Upgrade works like other equipment (sacrifice items, can fail)
- Reroll not applicable (no random bonus stats)
- No durability (backpacks don't degrade)

### Belt Bonus

`inventorySlots` added to the belt bonus stat pool. Range: +4 to +8, rolled like other bonus stats. Not guaranteed on every belt.

## Town Stash

Single global stash accessible from any town. Unlimited capacity.

### Implementation

Add `inStash: Boolean` (default false) to the `Item` model:
- Backpack query: `WHERE ownerId = ? AND inStash = false`
- Stash query: `WHERE ownerId = ? AND inStash = true`

### Rules

- Equipped items cannot be stashed (unequip first)
- Withdraw checks backpack capacity
- Deposit always succeeds
- Stackable items support partial deposit/withdraw (split/merge stacks)
- Town-only operations

## Sell System

Sell items for gold. Town-only.

### Pricing

- Base price from `ItemTemplate.sellPrice` field (new column)
- Rarity multiplier: common 1x, uncommon 2x, rare 4x, epic 8x, legendary 16x
- Items with `sellPrice = 0` or `null` cannot be sold
- Durability penalty: below 50% durability → proportional price reduction

### Bulk Sell

"Sell All Junk" button sends all common non-equipment items in one request.

## Overflow Handling

When loot is generated and backpack is full:

1. Combat/chest/gathering generates loot normally
2. API checks available space
3. If space: items added as usual
4. If full: loot returned in `pendingLoot` response field (not added to inventory)
5. Client shows loot picker — player selects which items to take (up to remaining space)
6. `POST /inventory/loot/claim` claims selected items, rest discarded
7. Pending loot stored in Redis with TTL (~5 min). Unclaimed = lost.

### Crafting Cap

Before crafting: `usedSlots + resultItemCount <= capacity`. Reject with error if it would exceed. Stackable results that merge into existing stacks don't cost a slot.

## API Changes

### New Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/inventory/sell` | Sell single item (town-only) |
| POST | `/inventory/sell/bulk` | Sell multiple items (town-only) |
| GET | `/inventory/stash` | List stash items |
| POST | `/inventory/stash/deposit` | Backpack → stash (town-only) |
| POST | `/inventory/stash/withdraw` | Stash → backpack (town-only, capacity check) |
| POST | `/inventory/loot/claim` | Claim from pending loot overflow |

### Modified Endpoints

| Route | Change |
|-------|--------|
| `GET /inventory` | Add `capacity`, `usedSlots`, filter by `inStash` |
| `POST /crafting/craft` | Capacity check before crafting |
| `POST /combat/start` | Return `pendingLoot` if full |
| `POST /exploration/start` | Return `pendingLoot` if full |
| `POST /gathering/mine` | Return `pendingLoot` if full |

## Data Model Changes

### Item model
- Add `inStash: Boolean` (default false)

### ItemTemplate model
- Add `sellPrice: Int` (nullable, 0 = unsellable)

### Equipment slot enum
- Add `backpack` as 12th slot

### Belt stat pool
- Add `inventorySlots` to `SLOT_STAT_POOLS.belt`

### Game Constants
```
INVENTORY_CONSTANTS = {
  BASE_CAPACITY: 24,
  BACKPACK_SLOTS_PER_TIER: 8,
  BACKPACK_SLOTS_PER_RARITY: 2,
  BELT_INVENTORY_SLOTS_MIN: 4,
  BELT_INVENTORY_SLOTS_MAX: 8,
  CHAMPION_BONUS_SLOTS: 8,
  PENDING_LOOT_TTL_SECONDS: 300,
}

SELL_CONSTANTS = {
  RARITY_MULTIPLIERS: { common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 16 },
  DURABILITY_PENALTY_THRESHOLD: 0.5,
}
```

## Frontend Changes

- Inventory screen: real `usedSlots / capacity` display, grid reflects actual capacity
- Stash tab: visible in town, transfer buttons between backpack and stash
- Sell button: per-item when in town, "Sell All Junk" bulk action
- Gold display: player gold in header/stats
- Loot picker modal: overflow loot selection screen
- Crafting: disable with "Backpack full" when result wouldn't fit
- Equipment panel: 12th backpack slot
