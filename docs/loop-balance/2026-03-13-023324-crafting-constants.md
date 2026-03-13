# CRAFTING_CONSTANTS Analysis

## Current Values

| Constant | Value | Purpose |
|---|---|---|
| `BASE_TURN_COST` | 50 | Turns per craft action |
| `DURABILITY_BONUS_PER_10_LEVELS` | 5 | +5% max durability per 10 levels above recipe |
| `BASE_CRIT_CHANCE` | 0.05 (5%) | Crit chance at exact recipe level, 0 luck |
| `CRIT_CHANCE_PER_LEVEL` | 0.01 (+1%/lvl) | Additive crit per level above recipe |
| `LUCK_CRIT_BONUS_PER_POINT` | 0.002 (+0.2%/pt) | Additive crit per luck stat point |
| `MIN_CRIT_CHANCE` | 0.01 (1%) | Floor when underlevel |
| `MAX_CRIT_CHANCE` | 0.50 (50%) | Ceiling |
| `MIN_BONUS_PERCENT` | 0.10 (10%) | Min bonus stat = 10% of base stat |
| `MAX_BONUS_PERCENT` | 0.30 (30%) | Max bonus stat = 30% of base stat |
| `MIN_BONUS_MAGNITUDE` | 1 | Floor for bonus value (guards 0-base stats) |
| `RARE_CRAFT_BASE_CHANCE` | 0.005 (0.5%) | Rare chance at exact level, 0 luck |
| `RARE_CRAFT_CHANCE_PER_LEVEL` | 0.001 (+0.1%/lvl) | Per level above recipe |
| `RARE_CRAFT_LUCK_BONUS_PER_POINT` | 0.0005 (+0.05%/pt) | Per luck point |
| `RARE_CRAFT_MAX_CHANCE` | 0.04 (4%) | Ceiling |
| `EPIC_CRAFT_BASE_CHANCE` | 0.0005 (0.05%) | Epic chance at exact level, 0 luck |
| `EPIC_CRAFT_CHANCE_PER_LEVEL` | 0.0001 (+0.01%/lvl) | Per level above recipe |
| `EPIC_CRAFT_LUCK_BONUS_PER_POINT` | 0.00005 (+0.005%/pt) | Per luck point |
| `EPIC_CRAFT_MAX_CHANCE` | 0.004 (0.4%) | Ceiling |
| `SALVAGE_TURN_COST` | 50 | Turns per salvage action |
| `SALVAGE_BASE_REFUND_RATE` | 0.60 (60%) | Material refund = floor(qty * 0.6) |
| `SALVAGE_MIN_PRIMARY_RETURN` | 1 | Guarantees at least 1 material back |
| `SALVAGE_BATCH_LIMIT` | 50 | Max items per batch salvage |

## Analysis

### 1. Crit Chance Scaling (Linear)

The crit chance formula is:

```
critChance = clamp(0.05 + levelDelta * 0.01 + luck * 0.002, 0.01, 0.50)
```

This is purely linear in both level delta and luck. Key milestones:

| Level Delta | Luck | Crit Chance |
|---|---|---|
| 0 | 0 | 5.0% |
| 0 | 50 | 15.0% |
| 10 | 0 | 15.0% |
| 10 | 50 | 25.0% |
| 20 | 0 | 25.0% |
| 20 | 50 | 35.0% |
| 45 | 0 | 50.0% (cap) |
| 30 | 50 | 45.0% |
| 35 | 50 | 50.0% (cap) |

To reach the 50% cap with 0 luck requires being 45 levels above the recipe. With 50 luck you only need +35 levels. With 100 luck (unlikely but possible with legendary gear stacking), you need only +25 levels.

The level-to-crit ratio is 5:1 with luck (each luck point = 0.2 level equivalents for crit). This means a player with max-level crafting skill (100) crafting a level-1 recipe has guaranteed 50% crit, but this scenario is uninteresting because those items are worthless.

For the meaningful scenario -- crafting the highest-level recipe available near your skill level -- the relevant crit chance is 5% + luck contribution. A typical mid-game player (skill 30, recipe level 25, luck 20) gets: 0.05 + 5*0.01 + 20*0.002 = 0.05 + 0.05 + 0.04 = **14%** crit chance. Reasonable.

### 2. Rarity Tier Determination (Nested Thresholds)

The system uses a single critRoll to determine both whether a crit happens AND which tier:

```
if critRoll < epicCraftChance  -> epic
if critRoll < rareCraftChance  -> rare
if critRoll < critChance       -> uncommon
else                           -> common (no crit)
```

This means epic and rare are strict subsets of the crit window. The effective probabilities are:

```
P(epic)     = epicCraftChance
P(rare)     = rareCraftChance - epicCraftChance
P(uncommon) = critChance - rareCraftChance
P(common)   = 1 - critChance
```

At exact recipe level, 0 luck:
- P(epic) = 0.05% (1 in 2000)
- P(rare) = 0.5% - 0.05% = 0.45% (1 in 222)
- P(uncommon) = 5% - 0.5% = 4.5%
- P(common) = 95%

At +20 levels, 50 luck:
- P(epic) = clamp(0.0005 + 20*0.0001 + 50*0.00005, 0, 0.004) = clamp(0.005, 0, 0.004) = **0.4%**
- P(rare) = clamp(0.005 + 20*0.001 + 50*0.0005, 0, 0.04) = clamp(0.05, 0, 0.04) = **4.0%** - 0.4% = **3.6%**
- P(uncommon) = 35% - 4.0% = **31.0%**
- P(common) = **65%**

At max investment (+45 levels, 100 luck):
- P(epic) = 0.4% (capped)
- P(rare) = 4.0% - 0.4% = 3.6% (capped)
- P(uncommon) = 50% - 4.0% = 46.0%
- P(common) = 50%

### 3. Expected Crafts Per Rare/Epic Item

At typical mid-game (+5 levels, 20 luck):
- Crafts per epic: 1 / 0.0012 = **~833 crafts** (41,650 turns + materials)
- Crafts per rare: 1 / (0.012 - 0.0012) = **~93 crafts** (4,650 turns + materials)
- Crafts per uncommon: 1 / (0.14 - 0.012) = **~8 crafts**

At endgame (+20 levels, 50 luck):
- Crafts per epic: 1 / 0.004 = **~250 crafts** (12,500 turns)
- Crafts per rare: 1 / 0.036 = **~28 crafts** (1,400 turns)
- Crafts per uncommon: 1 / 0.31 = **~3.2 crafts**

### 4. Salvage Economy (Material Sink Analysis)

Salvage returns `floor(qty * 0.6)` for each material. With the guaranteed minimum of 1:

| Recipe Material Qty | Salvage Return | Loss Rate |
|---|---|---|
| 1 | 1 (guaranteed) | 0% |
| 2 | 1 | 50% |
| 3 | 1 | 67% |
| 4 | 2 | 50% |
| 5 | 3 | 40% |
| 10 | 6 | 40% |
| 20 | 12 | 40% |

**Issue: 1-material recipes have 0% loss on salvage.** A recipe requiring exactly 1 of a material always returns that material, making salvage costless in material terms (only costs 50 turns). This is a mild exploit: players who craft-and-salvage single-material recipes only pay turns, never losing materials. The salvage effectively becomes "pay 50 turns, roll for a crit upgrade."

The convergence to 40% material loss at high quantities is healthy. At low quantities (2-3), the floor function creates a harsher 50-67% loss, which may feel punitive for early-game recipes.

### 5. Craft-Salvage Loop Economics

A player can repeatedly craft an item and salvage non-crits. Per cycle:
- **Craft cost:** 50 turns + materials
- **Salvage cost:** 50 turns, returns 60% of materials
- **Net cost per attempt:** 100 turns + 40% of materials

For a recipe requiring 5 Iron Ore to craft a sword:
- Each craft-salvage cycle costs 100 turns + 2 Iron Ore (5 - 3 returned)
- At 14% crit chance (mid-game), expected cycles to get uncommon+: ~7.1
- Total expected cost: **710 turns + 14.2 Iron Ore** for one uncommon item

Compared to just crafting 7 items without salvage:
- 350 turns + 35 Iron Ore, yielding ~1 uncommon among 7 items
- But you keep 6 common items too (for forge sacrifice or selling)

The craft-salvage loop is turn-expensive but material-efficient. This is by design but worth tracking.

### 6. Turn Discount System (from ITEM_RARITY_CONSTANTS)

The `calculateCraftingTurnDiscount` function (in itemRarity.ts) applies:

```
discount = levelsAbove * 0.20 (per level above recipe)
cost = floor(baseCost * (1 - discount))
At +5 levels: cost = 0 (free)
```

This means **any craft or salvage is free in turns if the player is 5+ levels above the recipe requirement.** Combined with the 1-material salvage issue above, a high-level player crafting low-level items enters a **zero-cost craft-salvage loop**: 0 turns, 0 material loss. The only "cost" is time/clicks, and the salvage creates common-rarity items that can be used as forge sacrifice material.

This is a potential **infinite item generation exploit** for forge sacrifices at the low end.

### 7. Durability Bonus Scaling

```
durabilityBonusPct = floor((skillLevel - requiredLevel) / 10) * 5
craftedMax = floor(baseMax * (1 + durabilityBonusPct / 100))
```

| Levels Above | Durability Bonus |
|---|---|
| 0-9 | +0% |
| 10-19 | +5% |
| 20-29 | +10% |
| 30-39 | +15% |
| 40-49 | +20% |
| 50+ | +25%+ |

The step function (every 10 levels) creates unintuitive breakpoints. Being 9 levels above gives 0% bonus while 10 gives 5%. This is a mild UX issue but not a balance problem. The bonus is modest and scales well.

### 8. Bonus Stat Value Distribution

For standard stats: `bonus = max(1, round(baseStat * uniform(0.10, 0.30)))`.

For a weapon with 50 base attack: bonus ranges from 5 to 15, uniformly distributed, average 10 (+20%).

For a weapon with 10 base attack: bonus ranges from 1 to 3, average 2 (+20%).

For critChance/critDamage, fixed ranges bypass this: critChance +0.03 to +0.05, critDamage +0.10 to +0.20.

With `rollBonusStatsForRarity`, higher rarities get more bonus slots (uncommon=1, rare=2, epic=3, legendary=4), and slots can stack on the same stat. A legendary weapon could theoretically roll attack 4 times, giving +20 to +60 bonus on a 50-attack weapon (40-120% increase). This is high variance but expected value is still moderate.

### 9. Cross-System Interaction: Crit Buff Stacking

The craft route converts guild crafting crit modifier + shop crit buff into equivalent luck:

```
effectiveLuck = equipStats.luck + floor(combinedCritBonus / LUCK_CRIT_BONUS_PER_POINT)
```

With `LUCK_CRIT_BONUS_PER_POINT = 0.002`, a +5% crit buff translates to +25 equivalent luck. This is a significant boost: at 0 base luck and +0 levels, a 5% crit buff turns 5% crit into 10% crit (doubling it). The conversion factor means small percentage buffs have outsized impact when luck is low.

## Issues Found

### Issue 1: Zero-Cost Craft-Salvage Loop (Medium Severity)

When a player is 5+ levels above a recipe, both craft and salvage have 0 turn cost. Recipes with single-material ingredients return 100% materials. This creates an infinite loop of free item generation. While the items are low-level commons, they serve as forge sacrifice material.

**Impact:** Players can generate unlimited common items for forge upgrades without spending any resources. The forge still costs turns and has failure risk, so the exploit is bounded -- but the intent of the material economy is undermined.

### Issue 2: Epic Craft Chance Cap Is Very Low (Low Severity)

At 0.4% max, even fully optimized players need ~250 crafts for one epic. Since epic items have 3 bonus slots and can be further upgraded via forge, this may be intentionally aspirational. However, compare with the forge upgrade path: upgrading rare->epic costs 500 turns with 15% base success (failing destroys the item). Expected turns to forge-upgrade one rare to epic: 500 / 0.15 = **~3,333 turns** plus material for 6.67 sacrificial rares on average. Crafting 250 times at 50 turns = 12,500 turns but produces many uncommons and rares as byproduct. The craft-spam path is arguably more rewarding per turn if you can sustain materials.

### Issue 3: Salvage Harshness at Low Material Quantities (Low Severity)

Recipes requiring 2-3 materials lose 50-67% on salvage, while 5+ material recipes lose only 40%. Early-game recipes tend to be simpler (fewer materials), so new players experience harsher salvage penalties despite having fewer resources.

### Issue 4: Luck Stat Dominance in Crafting

Luck affects: crit chance, rare chance, epic chance, forge success chance, forge luck bonus cap, and drop rarity. A player stacking luck via equipment (ring, charm, gloves all have luck in their pools) gets compounding benefits across all crafting activities. At 100 luck: +20% crit, +5% rare, +0.5% epic. Combined with level advantage, this makes luck the single most impactful stat for crafting progression.

## Recommendations

### R1: Add minimum turn cost to prevent zero-cost loops

Add a constant `MIN_CRAFT_TURN_COST: 5` and `MIN_SALVAGE_TURN_COST: 5`. Modify `calculateCraftingTurnDiscount` to floor at this value instead of 0. This preserves the discount incentive while preventing infinite free loops.

```
return Math.max(MIN_TURN_COST, Math.floor(baseCost * (1 - discount) + 1e-9));
```

### R2: Guarantee salvage material loss for 1-quantity materials

Change salvage logic so `SALVAGE_MIN_PRIMARY_RETURN` only applies when all materials would be 0, and only fires if the original quantity was >= 2. For qty=1 materials, always return 0 (the item is destroyed with no return for that specific material). This prevents the costless recycle of single-material recipes.

Alternatively, reduce `SALVAGE_BASE_REFUND_RATE` from 0.60 to 0.50 -- this makes qty=1 return 0 naturally via `floor(1 * 0.5) = 0`.

### R3: No immediate changes needed for epic cap

The 0.4% cap is aspirational but intentional. Monitor whether players feel epic crafting is achievable or if they rely exclusively on forge upgrades. If forge becomes the dominant path, consider raising `EPIC_CRAFT_MAX_CHANCE` to 0.008 (0.8%).

### R4: Consider diminishing returns on luck for crafting

Replace linear luck scaling with sqrt or log scaling to prevent extreme luck stacking:

```
luckBonus = sqrt(luck) * 0.01  // 100 luck = 10% instead of 20%
```

This keeps low-luck gains similar but compresses the high end.

## Risk Level

**medium** -- The zero-cost craft-salvage loop (Issue 1) is an exploitable economy leak that could be used to generate unlimited forge sacrifice material. The salvage material guarantee for 1-quantity recipes compounds this. Neither issue is game-breaking (the items produced are low-tier commons, and forge still has real costs), but they undermine the intended material sink and could accelerate gear progression for savvy players. The remaining issues are minor tuning concerns.
