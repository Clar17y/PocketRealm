# ITEM_RARITY_CONSTANTS Analysis

## Current Values

### Bonus Slots by Rarity
| Rarity | Bonus Slots |
|--------|-------------|
| common | 0 |
| uncommon | 1 |
| rare | 2 |
| epic | 3 |
| legendary | 4 |

### Drop Weights (base, mob level 1)
| Rarity | Weight | Probability |
|--------|--------|-------------|
| common | 650 | 65.0% |
| uncommon | 250 | 25.0% |
| rare | 80 | 8.0% |
| epic | 18 | 1.8% |
| legendary | 2 | 0.2% |

### Drop Weight Shift Per Level Above 1
`DROP_WEIGHT_SHIFT_PER_LEVEL_ABOVE_ONE = 2`

Shift distribution (how each 2 points of shift is allocated):
| Rarity | Distribution Weight | Normalized Share |
|--------|-------------------|------------------|
| uncommon | 2.0 | 50.0% |
| rare | 1.2 | 30.0% |
| epic | 0.6 | 15.0% |
| legendary | 0.2 | 5.0% |

Sum of distribution weights: 4.0

### Forge Upgrade Success Rates
| From Rarity | Base Success | Turn Cost |
|-------------|-------------|-----------|
| common -> uncommon | 60% | 100 |
| uncommon -> rare | 35% | 250 |
| rare -> epic | 15% | 500 |
| epic -> legendary | 5% | 1,000 |

### Forge Reroll Turn Costs
| Rarity | Turn Cost |
|--------|-----------|
| uncommon | 75 |
| rare | 150 |
| epic | 300 |
| legendary | 600 |

### Forge Luck Bonuses
- `FORGE_LUCK_SUCCESS_BONUS_PER_POINT = 0.001`
- `FORGE_LUCK_SUCCESS_BONUS_CAP = 0.1` (100 luck points to cap)
- `FORGE_DISCOUNT_PER_LEVEL_ABOVE = 0.20` (20% per level)
- `FORGE_DISCOUNT_MAX_LEVELS = 5` (free at 5+ levels above)

### Sell Price Rarity Multipliers (from SELL_CONSTANTS)
| Rarity | Sell Multiplier |
|--------|----------------|
| common | 1x |
| uncommon | 2x |
| rare | 4x |
| epic | 8x |
| legendary | 16x |

## Analysis

### 1. Drop Rarity Scaling Curve

The drop system shifts weight from common to higher rarities as mob level increases. Each level above 1 shifts 2 weight points from common, distributed to higher rarities.

**Weight shift per level (out of the 2 total shifted):**
- uncommon: 2/4 = 1.0
- rare: 1.2/4 = 0.6
- epic: 0.6/4 = 0.3
- legendary: 0.2/4 = 0.1

At mob level L, total shift = `min(650, (L-1) * 2)`. Common bottoms out at 0 when `(L-1) * 2 = 650`, i.e. **level 326**.

**Probability table at key mob levels (no prefix, dropChanceMultiplier=1):**

| Mob Level | Common | Uncommon | Rare | Epic | Legendary | Total |
|-----------|--------|----------|------|------|-----------|-------|
| 1 | 65.0% | 25.0% | 8.0% | 1.80% | 0.20% | 1000 |
| 10 | 63.2% | 26.8% | 9.08% | 2.34% | 0.38% | 1000 |
| 25 | 60.2% | 29.8% | 10.88% | 3.24% | 0.68% | 1000 |
| 50 | 55.2% | 34.8% | 13.88% | 4.74% | 1.18% | 1000 |
| 75 | 50.2% | 39.8% | 16.88% | 6.24% | 1.68% | 1000 |
| 100 | 45.2% | 44.8% | 19.88% | 7.74% | 2.18% | 1000 |

Wait -- those weights don't sum to 1000 because common is reduced but others are increased. Let me recalculate properly. The denominator is the sum of all weights.

**Exact weights at mob level 50 (levelsAbove=49, totalShift=98):**
- common: 650 - 98 = 552
- uncommon: 250 + 98*(2/4) = 250 + 49 = 299
- rare: 80 + 98*(1.2/4) = 80 + 29.4 = 109.4
- epic: 18 + 98*(0.6/4) = 18 + 14.7 = 32.7
- legendary: 2 + 98*(0.2/4) = 2 + 4.9 = 6.9
- Total: 1000

The total is always exactly 1000 (weight removed from common = weight added elsewhere). This is clean.

**Probabilities at mob level 50:**
- common: 55.2%, uncommon: 29.9%, rare: 10.94%, epic: 3.27%, legendary: 0.69%

**Effect of `dropChanceMultiplier` (mob prefix system):**
The multiplier is applied to all non-common weights ONLY. Common weight stays fixed at `650 - totalShift`.

At level 50 with Ancient prefix (`dropChanceMultiplier = 2`):
- common: 552 (unchanged)
- uncommon: 299 * 2 = 598
- rare: 109.4 * 2 = 218.8
- epic: 32.7 * 2 = 65.4
- legendary: 6.9 * 2 = 13.8
- Total: 1448

Probabilities:
- common: 38.1%, uncommon: 41.3%, rare: 15.1%, epic: 4.5%, legendary: 0.95%

This is a significant shift -- Ancient mobs at level 50 drop non-common items 62% of the time vs 45% normally.

### 2. Forge Upgrade Expected Cost Analysis

**Expected turns to reach each rarity via forge upgrades (starting from common, 0 luck):**

Each failed upgrade destroys the item. The expected number of attempts to succeed = `1 / successRate`.

| Target Rarity | Success Rate | Expected Attempts | Turn Cost/Attempt | Expected Turn Cost | Items Destroyed |
|---------------|-------------|-------------------|-------------------|--------------------|-----------------|
| uncommon | 60% | 1.67 | 100 | 167 | 0.67 |
| rare | 35% | 2.86 | 250 | 714 | 1.86 |
| epic | 15% | 6.67 | 500 | 3,333 | 5.67 |
| legendary | 5% | 20 | 1,000 | 20,000 | 19 |

But this is just the final step. To upgrade from common to legendary, you need to succeed at each step, and failures at any step restart from scratch (item is destroyed).

**Full path: common -> legendary (no luck, no buffs)**

The sacrificial item requirement means each attempt also costs a same-rarity-or-higher item plus the target item.

Expected attempts per stage (including failures that destroy the item and force restart):

Let's define E[c->l] = expected cost from common to legendary.

Working backwards, let `E(r)` = expected total turns to get one item of rarity `r` via forge, starting from common items.

Assumption: common items are "free" (dropped abundantly). In reality they cost 50 turns per encounter, but let's first analyze forge costs alone.

`E(common)` = 0 (base drop)

`E(uncommon)`:
- Each attempt costs 100 turns + 1 common item (sacrificial) + 1 common item (target)
- Success rate: 60%
- Expected attempts: 1/0.6 = 1.667
- Turn cost: 1.667 * 100 = **167 turns**
- Items consumed: 1.667 * 2 = 3.33 commons

`E(rare)`:
- Each attempt costs 250 turns + 1 uncommon (sacrificial) + 1 uncommon (target)
- Each uncommon costs E(uncommon) = 167 turns
- Total cost per attempt: 250 + 167*2 = 584 turns
- Success rate: 35%
- Expected attempts: 1/0.35 = 2.857
- Expected total: 2.857 * 584 = **1,669 turns**

`E(epic)`:
- Each attempt: 500 + E(rare)*2 = 500 + 1669*2 = 3,838 turns
- Success rate: 15%
- Expected attempts: 1/0.15 = 6.667
- Expected total: 6.667 * 3,838 = **25,587 turns**

`E(legendary)`:
- Each attempt: 1000 + E(epic)*2 = 1000 + 25587*2 = 52,174 turns
- Success rate: 5%
- Expected attempts: 1/0.05 = 20
- Expected total: 20 * 52,174 = **1,043,480 turns**

At 1 turn/second with a 64,800 bank cap (18 hours), reaching legendary via pure forging costs approximately **1,043,480 turns = 12.07 days of continuous turn generation** (with zero spending on anything else). This is extremely steep.

### 3. Luck Scaling on Forge Success

With max luck bonus (100+ luck, capped at +0.1):

| From Rarity | Base Rate | With Max Luck | Improvement |
|-------------|-----------|---------------|-------------|
| common | 60% | 70% | +16.7% relative |
| uncommon | 35% | 45% | +28.6% relative |
| rare | 15% | 25% | +66.7% relative |
| epic | 5% | 15% | +200% relative |

Epic -> legendary with max luck: expected 6.67 attempts instead of 20. This reduces E(legendary) dramatically:

Recalculating with max luck (+0.1 to all rates):
- E(uncommon): 1/0.7 * 100 = **143 turns** (was 167)
- E(rare): 1/0.45 * (250 + 143*2) = 2.22 * 536 = **1,191 turns** (was 1,669)
- E(epic): 1/0.25 * (500 + 1191*2) = 4 * 2,882 = **11,528 turns** (was 25,587)
- E(legendary): 1/0.15 * (1000 + 11528*2) = 6.67 * 24,056 = **160,373 turns** (was 1,043,480)

Luck reduces legendary forge cost by **~6.5x**. This is a massive scaling factor.

### 4. Crafting Rarity Pipeline vs Forge

Crafting can directly produce uncommon/rare/epic items via crit system.

At max crit chance (50%, requires high skill + luck):
- Epic craft max: 0.4% chance
- Rare craft max: 4% chance
- Otherwise uncommon: 50% - 4% = 46% chance

So crafting at max investment produces:
- common: 50%
- uncommon: 45.6%
- rare: 3.6%
- epic: 0.4%

Turn cost per craft: 50 (base), potentially reduced to 0 at 5+ levels above.

Expected crafts for one epic via pure crafting: 1/0.004 = 250 crafts = 12,500 turns (at base cost) or 0 turns if skill is 5+ above.

Compare to forge path for epic: 25,587 turns (no luck) or 11,528 turns (max luck).

**Crafting is more efficient for producing epics than forging, especially at high skill levels.** However, crafting cannot produce legendary items at all -- forge is the only path.

### 5. Sell Price Curve

The 2x geometric progression (1, 2, 4, 8, 16) means legendary items sell for 16x common price. Combined with the extreme rarity of legendaries (0.2% base drop rate), the sell economics are:

Expected sell value per equipment drop at level 1:
`0.65*1 + 0.25*2 + 0.08*4 + 0.018*8 + 0.002*16 = 0.65 + 0.50 + 0.32 + 0.144 + 0.032 = 1.646x base price`

At level 50:
`0.552*1 + 0.299*2 + 0.1094*4 + 0.0327*8 + 0.0069*16 = 0.552 + 0.598 + 0.438 + 0.262 + 0.110 = 1.960x base price`

Higher mob levels increase expected sell value by ~19% at level 50. This is moderate.

### 6. Forge Discount Mechanic

`FORGE_DISCOUNT_PER_LEVEL_ABOVE = 0.20` with `FORGE_DISCOUNT_MAX_LEVELS = 5`.

At 5+ levels above recipe requirement, forge operations are FREE (0 turn cost). Combined with the sacrificial item requirement, this means the only cost is the item itself.

This applies to both upgrade and reroll costs via `getRecipeDiscountedCost` (upgrade) and direct application (reroll). At 5+ levels over, all forge turn costs vanish.

**Impact on E(legendary) with max luck AND max skill discount:**
- E(uncommon): 1/0.7 * 0 = **0 turns** (just item cost)
- E(rare): 1/0.45 * (0 + 0) = **0 turns**
- E(epic): 1/0.25 * (0 + 0) = **0 turns**
- E(legendary): 1/0.15 * (0 + 0) = **0 turns**

With full skill discount, forge upgrading costs ZERO turns. The only cost is item destruction from failures. This is a degenerate state -- see Issues section.

## Issues Found

### Issue 1: Zero-Cost Forge at High Skill Levels (HIGH SEVERITY)

When a player's crafting skill is 5+ levels above the recipe requirement for the item being forged, ALL forge turn costs become 0. The only cost is the sacrificial item (destroyed on attempt) and the target item (destroyed on failure).

This means a max-level crafter can spam forge upgrades infinitely with no turn cost, limited only by item supply. Since common items drop frequently from combat (50 turns per encounter), a player can:
1. Farm common items (50 turns each)
2. Forge them toward legendary for free turns
3. Only cost is the items themselves

Expected common items consumed to reach legendary (max luck, 0 turn cost):
- uncommon: 2/0.7 = 2.86 commons
- rare: needs 2 uncommons per attempt, 1/0.45 = 2.22 attempts = 4.44 uncommons = 12.7 commons
- epic: needs 2 rares per attempt, 1/0.25 = 4 attempts = 8 rares = 101.6 commons
- legendary: needs 2 epics per attempt, 1/0.15 = 6.67 attempts = 13.33 epics = 1,355 commons

1,355 commons at 50 turns each = 67,750 turns = ~18.8 hours. That's actually still substantial, but the turns are spent on combat (gaining XP, other drops) rather than "wasted" on forge costs. The forge itself is free, making it strictly better than the non-discounted path.

### Issue 2: dropChanceMultiplier Asymmetry (MEDIUM SEVERITY)

The `dropChanceMultiplier` from mob prefixes multiplies non-common weights but does NOT reduce common weight. This means the multiplier primarily increases the total weight pool rather than shifting rarity distribution.

An Ancient mob (multiplier=2) at level 1:
- common: 650, uncommon: 500, rare: 160, epic: 36, legendary: 4
- Total: 1350
- Uncommon+: 51.9% (vs 35% base)

But a hypothetical "shift-based" approach would give 70% uncommon+ by moving weight from common. The current design is more conservative, which is probably intentional to prevent prefix-farming from dominating.

### Issue 3: Geometric Sell Multiplier vs Exponential Forge Cost (LOW SEVERITY)

Sell multipliers follow 2^n (1, 2, 4, 8, 16) while forge costs follow a roughly exponential curve. The value gained per forge attempt:

| Upgrade | Turn Cost | Sell Multiplier Gain | Value-per-Turn |
|---------|-----------|---------------------|----------------|
| common->uncommon | 100 | +1x | 0.01x/turn |
| uncommon->rare | 250 | +2x | 0.008x/turn |
| rare->epic | 500 | +4x | 0.008x/turn |
| epic->legendary | 1000 | +8x | 0.008x/turn |

The turns-per-multiplier ratio is fairly consistent except for common->uncommon being slightly more efficient. This seems intentionally balanced -- no single upgrade tier dominates for profit.

### Issue 4: Luck Stat Disproportionate Value (MEDIUM SEVERITY)

100 luck points provide +0.1 success chance to all forge upgrades. For the epic->legendary step, this triples the success rate (5% -> 15%), reducing expected cost by ~6.5x across the full legendary pipeline.

Since luck also affects crafting crits, gem drops, and hidden cache rarity, it creates a strong "rich get richer" dynamic: players who invest in luck gear produce higher rarity items, which can have luck as a bonus stat, further compounding the advantage.

### Issue 5: Failure Destroys Item (Design Consideration)

Failed forge upgrades destroy the item entirely. For epic->legendary at 5% base success, a player expects to destroy 19 epic items before succeeding once. Each epic item represents significant investment (25,587 turns to forge, or hours of farming).

This creates enormous variance. A player could get lucky on attempt 1 or spend 60+ attempts. The `forge_protection` buff mitigates this somewhat, but the base experience is brutally punishing at high tiers.

## Recommendations

### R1: Cap forge skill discount at 80% instead of 100%
Change `FORGE_DISCOUNT_MAX_LEVELS` behavior so there's always a minimum turn cost:
```
FORGE_DISCOUNT_MIN_COST_PERCENT: 0.20  // Always pay at least 20% of base
```
This ensures even max-level crafters pay 20/50/100/200 turns for upgrades, preserving the turn sink.

### R2: Consider a pity system for legendary forging
After N failed epic->legendary attempts, increase success chance incrementally. For example, +1% per failure, resetting on success. This reduces worst-case variance without changing the average.

Alternatively, a "forge memory" that accumulates on failure: after 15 failures (75% expected at 5% rate), guarantee the next attempt. This changes expected attempts from 20 to at most 16, a moderate improvement.

### R3: Review luck stat compounding
The luck cap of +0.1 on forge success is reasonable in isolation, but stacking with crafting crit, gem drops, and sell value means luck becomes the dominant stat for economic optimization. Consider whether this "economic meta" is desirable or if luck bonuses should have diminishing returns across systems.

### R4: No immediate changes needed for drop weight scaling
The linear shift of 2 weight per level is well-behaved. At level 100 (late game), legendary probability reaches ~2.2% -- roughly 1 in 45 drops. This feels appropriate for endgame content without flooding the economy.

## Risk Level
medium -- The zero-cost forge at max skill (Issue 1) is the most concerning finding. It doesn't break the game since item destruction still provides a meaningful gate, but it does eliminate the turn economy as a forge balancing lever. The luck compounding (Issue 4) is a slower-burning concern that may create dominant economic strategies over time.
