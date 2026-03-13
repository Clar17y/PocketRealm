# INVENTORY_CONSTANTS & SELL_CONSTANTS Balance Analysis

## Raw Values

```
INVENTORY_CONSTANTS:
  BASE_CAPACITY: 24
  BACKPACK_SLOTS_PER_TIER: 8
  BACKPACK_SLOTS_PER_RARITY: 2
  BELT_INVENTORY_SLOTS_MIN: 4
  BELT_INVENTORY_SLOTS_MAX: 8
  CHAMPION_BONUS_SLOTS: 8
  PENDING_LOOT_TTL_SECONDS: 600

SELL_CONSTANTS:
  RARITY_MULTIPLIERS:
    common:    1
    uncommon:  2
    rare:      4
    epic:      8
    legendary: 16
  DURABILITY_PENALTY_THRESHOLD: 0.5
```

## What These Systems Do

**Inventory capacity** determines how many distinct item stacks a player can carry in their backpack at once. It is the primary bottleneck that forces players to engage with selling, salvaging, stashing, and loot triage. Capacity is computed as:

```
capacity = BASE_CAPACITY
         + backpackTier * BACKPACK_SLOTS_PER_TIER
         + rarityIndex * BACKPACK_SLOTS_PER_RARITY
         + beltSlotBonus
         + (isChampion ? CHAMPION_BONUS_SLOTS : 0)
```

Where `rarityIndex` is the 0-indexed position in {common=0, uncommon=1, rare=2, epic=3, legendary=4}.

**Sell pricing** determines gold yield when vendors buy items. The formula:

```
price = baseSellPrice * RARITY_MULTIPLIERS[rarity]
if (currentDurability / maxDurability < 0.5):
    price = floor(price * (currentDurability / maxDurability))
return max(1, price)
```

Together these systems define the inventory pressure loop: how quickly a player fills up, and how much gold they extract when they empty out.

## Capacity Progression

### Backpack Tier Scaling

With 5 equipment tiers and 5 rarity levels, the backpack slot matrix:

| Backpack | Common | Uncommon | Rare | Epic | Legendary |
|----------|--------|----------|------|------|-----------|
| None     | 0      | 0        | 0    | 0    | 0         |
| Tier 1   | 8      | 10       | 12   | 14   | 16        |
| Tier 2   | 16     | 18       | 20   | 22   | 24        |
| Tier 3   | 24     | 26       | 28   | 30   | 32        |
| Tier 4   | 32     | 34       | 36   | 38   | 40        |
| Tier 5   | 40     | 42       | 44   | 46   | 48        |

### Total Capacity Scenarios

Adding BASE_CAPACITY (24) and potential belt bonus (4-8):

| Stage | Backpack | Belt Bonus | Total Capacity |
|-------|----------|------------|----------------|
| New player (no gear) | 0 | 0 | 24 |
| Early game (T1 common) | 8 | 0 | 32 |
| Early-mid (T1 common + belt) | 8 | 4 | 36 |
| Mid game (T3 common + belt) | 24 | 6 | 54 |
| Late game (T5 rare + belt) | 44 | 8 | 76 |
| Theoretical max (T5 legendary + belt + champion) | 48 | 8 | 88 |

The capacity range spans 24 to 88 -- a 3.67x increase from start to endgame. This is a wide progression range that gives consistent power-feeling upgrades throughout the game.

### Growth Curve Shape

The backpack provides the dominant scaling. Each tier adds 8 slots (a fixed linear step), but as a percentage of total capacity, each tier's contribution shrinks:

| Tier Upgrade | Slots Added | Cumulative Total (common, no belt) | % Increase |
|--------------|-------------|-----------------------------------|-|
| 0 -> 1 | 8 | 32 | +33.3% |
| 1 -> 2 | 8 | 40 | +25.0% |
| 2 -> 3 | 8 | 48 | +20.0% |
| 3 -> 4 | 8 | 56 | +16.7% |
| 4 -> 5 | 8 | 64 | +14.3% |

Natural diminishing returns without any special formula. The first backpack is the most impactful upgrade in the game for quality-of-life.

### Rarity Bonus Analysis

At +2 slots per rarity step, upgrading a backpack's rarity (through crafting crits or forging) adds:

- Common -> Uncommon: +2 slots
- Common -> Legendary: +8 slots

The rarity bonus is modest compared to the tier bonus. A T3 legendary backpack (32 slots from backpack) gives 8 fewer backpack slots than a T5 common (40 slots). This keeps tier progression as the primary axis while rarity is a secondary polish.

### Belt Slot Bonus

The `beltSlotBonus` is read from the equipped belt's `bonusStats.inventorySlots` property. The constants define a min/max range of 4-8, though the actual value depends on belt item generation. This range adds 4.5-11% of final capacity depending on the player's other equipment -- a small but noticeable bonus that makes belts feel rewarding beyond their combat stats.

### Champion Bonus

The CHAMPION_BONUS_SLOTS (8) is currently hardcoded to `false` in the inventory service (`isChampion: false`). This is a reserved feature -- likely a future PvP arena reward or achievement unlock. At 8 slots, it equals one full backpack tier, making it a significant progression milestone when activated.

## Slot Counting Mechanics

The `getUsedSlots` function counts occupied inventory slots with an important optimization: **stackable items (materials, consumables) share one slot per template ID**. Non-stackable items (equipment) each consume their own slot.

This means:
- 500 Iron Ore = 1 slot
- 3 different materials = 3 slots
- 5 swords (different rarities/stats) = 5 slots

The practical effect is that materials barely consume inventory space while equipment rapidly fills the backpack. A player returning from a combat session with 8 equipment drops has used 8 slots; a gatherer with 8 different material types has also used 8 slots but may have hundreds of items total.

This asymmetry is intentional: it makes equipment the scarce resource in terms of inventory space, forcing active decisions about which gear to keep, sell, salvage, or stash.

## Sell Price Math

### Rarity Multiplier Curve

The multipliers follow a powers-of-2 progression:

| Rarity | Multiplier | Ratio to Previous |
|--------|------------|-------------------|
| Common | 1x | - |
| Uncommon | 2x | 2.0x |
| Rare | 4x | 2.0x |
| Epic | 8x | 2.0x |
| Legendary | 16x | 2.0x |

This is an exponential curve: `multiplier = 2^rarityIndex`. Clean doubling at each tier makes the math predictable and the value curve steep. A legendary item sells for 16x its common counterpart.

### Gold Yield Examples

Assuming a hypothetical baseSellPrice of 10 gold (typical for mid-tier equipment):

| Rarity | Full Durability | 49% Durability | 25% Durability | 1% Durability |
|--------|----------------|----------------|----------------|---------------|
| Common | 10g | 4g | 2g | 1g |
| Uncommon | 20g | 9g | 5g | 1g |
| Rare | 40g | 19g | 10g | 1g |
| Epic | 80g | 39g | 20g | 1g |
| Legendary | 160g | 78g | 40g | 1g |

### Durability Penalty Mechanics

The threshold at 0.5 (50%) creates a binary behavior:
- Above 50% durability: **no penalty at all**. An item at 51% sells for the same as one at 100%.
- Below 50%: price scales linearly with the durability ratio. `price = floor(base * ratio)`.

This creates a cliff at 50%. An item at 50.1% durability sells for full price; at 49.9% it sells for roughly half. The cliff incentivizes players to repair items before selling if durability has dipped below 50%, or to sell immediately once they notice low durability rather than continuing to use and degrade the item further.

### Durability Decay Interaction

From DURABILITY_CONSTANTS, each combat hit degrades durability by 0.01 (1% of max). An item with 100 max durability hits the 50% sell penalty threshold after taking 50 hits. For equipment with higher max durability (e.g., 200), it takes 100 hits to reach the penalty zone.

The repair system costs 100 turns per repair (150 if broken) and decays max durability by 5 per repair. So a player who repairs at 50% durability to avoid the sell penalty spends 100 turns but preserves full sell value. Whether this is worth it depends on the item's sell price: for a rare item with baseSellPrice=10 (worth 40g), the penalty at 49% would cost them ~20g. At the turn regen rate of 1/second, 100 turns = 100 seconds of regen time. The break-even point is low -- repair is almost always worth it before selling if durability has crossed the 50% line.

### Minimum Price Floor

`max(1, price)` guarantees every sellable item is worth at least 1 gold. This prevents zero-value items from cluttering the inventory with no way to extract value. Even a near-destroyed common item is worth the trip to the vendor.

## Pending Loot System

When inventory is full during loot generation, overflow items are stored in Redis with a TTL of 600 seconds (10 minutes). The player must navigate to the loot claim screen and select which items to pick up before the timer expires.

### TTL Analysis

At 600 seconds (10 minutes), the window is generous for active players but unforgiving for anyone who walks away mid-session. Key scenarios:

- **Active play:** Player finishes a combat encounter, reviews loot, sells/stashes unwanted items, claims overflow. Easily within 10 minutes.
- **AFK between encounters:** If a player queues a long exploration (10,000 turns at 1/sec = 2.8 hours) and an encounter triggers early with overflow, the pending loot expires long before exploration ends. The loot service stores overflow immediately at combat resolution time, not at the end of exploration.
- **Multi-encounter sites:** A 3-room encounter site generates loot per room. If the first room fills inventory, rooms 2-3 overflow. Each overflow gets its own sessionId and TTL, so the player has 10 minutes from each individual room completion.

### Capacity Pressure at Overflow

When a player consistently hits capacity during combat, the gameplay loop becomes:

1. Fight encounter -> inventory full -> overflow generated
2. Claim UI: select which overflow items to keep
3. Must first sell/stash/salvage existing items to make room
4. Claim desired overflow within 10 minutes
5. Repeat

This creates a natural break point in gameplay where inventory management becomes mandatory. The 10-minute TTL adds urgency without being punishing for attentive players.

## Gold Economy Role

Gold has limited sinks in the current economy:
- **Flee penalty:** Gold lost when fleeing combat (variable)
- **Casino wagers:** Gold converted to tokens for roulette
- **Mail costs:** Fixed 25g per mail sent

Notably absent: repairs cost turns (not gold), crafting costs turns and materials (not gold), travel costs turns. This means selling items is the **primary gold source** and the gold economy is relatively closed. Gold accumulates over time with few mandatory drains.

### Sell Rate Estimation

A typical mid-game player (T3 zone, capacity ~50 slots) cycling through encounter sites:
- Each encounter drops 1-3 equipment pieces + materials
- A 3-room medium site yields roughly 6-9 equipment drops
- Assuming half are sold immediately (common/uncommon downgrades): ~4 items sold
- At baseSellPrice=10, average rarity uncommon: `10 * 2 = 20g` each
- Gold per encounter site: ~80g

This is modest. The steep rarity multiplier means most gold comes from rare+ drops, which are infrequent. A single legendary drop (160g at baseSellPrice=10) equals the gold from two full encounter site sell-offs of common/uncommon items.

## Stash Interaction

The stash (via stashService) provides unlimited storage accessed in town zones. Key behaviors:
- Deposit: always succeeds (no stash capacity limit)
- Withdraw: blocked if backpack is at capacity
- Stackable items merge between backpack and stash

The unlimited stash means inventory pressure is about **active carry capacity during exploration/combat**, not total item storage. Players can hoard indefinitely in the stash and only carry what they need. This design keeps the backpack-as-constraint feeling tight while preventing permanent item loss from capacity limits.

## Cross-System Interactions

### With Exploration (EXPLORATION_CONSTANTS)

The exploration loop generates loot continuously. At high turn investments (5000-10000 turns), a player may encounter multiple encounter sites in sequence. Each site can generate 3-12 items. Without selling or stashing between sites, a 50-slot backpack fills after roughly 2-3 full sites. The pending loot TTL of 600 seconds is designed for this cadence -- a player has time to finish one site, manage inventory, then proceed.

### With Crafting (CRAFTING_CONSTANTS)

Salvage (at 50 turns each, batch limit 50) converts equipment into materials, freeing slots. Since materials stack, salvaging N equipment items frees N slots while adding at most a few material-type slots. Salvage is the primary "compressor" for inventory: it trades equipment slots for material stacks.

The salvage refund rate of 60% means the player recovers some material value. Combined with sell pricing, the decision is: sell for gold or salvage for materials. For common items, sell (10g) vs salvage (60% of materials worth ~50 turns of gathering). The gold-vs-materials tradeoff depends on what the player needs.

### With Durability (DURABILITY_CONSTANTS)

Equipment degrades at 1% per combat hit. A long encounter site (3-4 rooms, ~10-20 hits per room) can degrade equipment by 30-80%. Items dropping below 50% durability during an extended combat run lose sell value. This creates a natural tension: push deeper into a site for more loot, but existing equipment loses sell value as it degrades.

### With Hidden Caches (HIDDEN_CACHE_CONSTANTS)

Cache loot respects inventory capacity. Stackable gems merge for free; soulbound items need a slot. Since caches are rare (1 in 10,000 turns), a full inventory rarely causes cache loot loss. But when it does happen, the 600-second pending loot TTL applies, giving the player time to manage.

## Potential Concerns

1. **The 50% durability cliff is harsh.** An item at 49% durability sells for ~49% of base price, while one at 51% sells for 100%. This creates a 51% price jump at a single durability percentage point. Players who don't understand the threshold will feel cheated when sell prices suddenly drop. A gradual penalty starting at a higher threshold (e.g., linear scaling from 80% down) would feel fairer.

2. **Gold has few sinks.** With selling as the primary gold source and only flee/casino/mail as drains, gold inflates over time. Late-game players accumulate gold with nothing meaningful to spend it on. Adding gold costs to repairs, crafting, or a vendor shop would create pressure to sell valuable items rather than hoarding.

3. **No backpack, no problem (almost).** The 24 base capacity is generous enough for early-game play. A new player can run 1-2 encounter sites before needing to sell. The first backpack upgrade (+8 to +16 slots) is nice but not urgently needed. This is probably fine for onboarding -- new players shouldn't feel starved for space -- but it means the first backpack is a comfort upgrade rather than a critical progression gate.

4. **Champion bonus is dead code.** `isChampion: false` is hardcoded. The 8 slots are defined but unreachable. If this is planned for a future feature, that's fine, but the constant is misleading in its current state.

5. **Stackable items trivialize material capacity.** Since 1000 iron ore takes 1 slot, a player never needs to worry about material storage in the backpack. This is good for convenience but means inventory pressure is entirely about equipment. If the design intent is to force material management decisions, the current model doesn't achieve that.

6. **Sell multiplier doubles each rarity but drop rates shrink faster.** From ITEM_RARITY_CONSTANTS, drop weights are: common=650, uncommon=250, rare=80, epic=20, legendary=2. The sell multiplier doubles each step (2x) but drop probability drops by roughly 3x per step. This means expected gold per drop actually decreases with rarity when accounting for frequency: common items contribute more total gold than rare ones in aggregate. The sell multiplier rewards the jackpot drop but doesn't overvalue them on average -- a healthy balance design.

## Verdict

The inventory capacity system is well-structured. The linear tier scaling with diminishing percentage returns creates a smooth progression curve. The backpack-as-equipment approach ties inventory growth to the broader gear system, making capacity feel earned rather than arbitrary. The sell pricing uses a clean exponential curve with a simple durability penalty that, despite the cliff, effectively incentivizes gear maintenance.

The main gap is the gold economy's lack of sinks. Selling is satisfying when it has purpose, but without meaningful gold drains, the entire sell pricing system becomes moot at endgame -- players accumulate gold indefinitely with nothing to spend it on. Introducing gold costs for existing turn-gated activities (repair, crafting, travel) or adding a gold-based vendor/auction system would give the sell constants real economic weight.
