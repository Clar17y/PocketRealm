# HIDDEN_CACHE_CONSTANTS Balance Analysis

## Raw Values

```
MATERIAL_ROLLS_MIN: 2
MATERIAL_ROLLS_MAX: 4
SOULBOUND_DROP_CHANCE: 0.15
LUCK_RARITY_SCALING: 0.005
RARITY_WEIGHTS:
  common:   50
  uncommon:  30
  rare:      15
  epic:       5
```

Total rarity weight at luck=0: 100. No legendary tier -- caches cannot drop legendary items.

## What This System Does

When a player discovers a hidden cache during exploration (per-turn chance of 0.0001 from EXPLORATION_CONSTANTS), the cache loot service generates two categories of rewards:

1. **Material drops:** 2-4 cut gems rolled from the zone's refining recipe pool (with replacement)
2. **Soulbound item:** 15% chance of a mob-family-specific soulbound equipment piece at a luck-influenced rarity

The system ties cache value to the zone the player is exploring: gem types come from the zone's resource nodes, and soulbound items come from the zone's mob families.

## Material Drop Math

### Gem Roll Distribution

The number of material rolls is `randomIntInclusive(2, 4)`, a uniform distribution over {2, 3, 4}:

| Rolls | Probability | E[rolls] |
|-------|-------------|----------|
| 2     | 33.3%       | 0.667    |
| 3     | 33.3%       | 1.000    |
| 4     | 33.3%       | 1.333    |
| **Total** | 100% | **3.0**  |

Expected material drops per cache: 3.0 cut gems.

### Zone Pool Interaction

Each roll selects randomly (uniform, with replacement) from the zone's cut gem pool. A zone with 1 gem type always produces that gem. A zone with 3 gem types distributes rolls across them. The with-replacement model means duplicates are expected:

**Single gem type:** All rolls produce the same gem. Player gets 2-4 of one gem.

**Two gem types:** Each roll has a 50/50 split. Expected unique gem types per cache:
- At 2 rolls: `2 - 2*(0.5)^2 = 1.5` unique types
- At 3 rolls: `2 - 2*(0.5)^3 = 1.75`
- At 4 rolls: `2 - 2*(0.5)^4 = 1.875`

**Three gem types:** Each roll has a 1/3 chance per type. Expected unique types:
- At 3 rolls: `3 - 3*(2/3)^3 = 3 - 3*0.296 = 2.11`
- At 4 rolls: `3 - 3*(2/3)^4 = 3 - 3*0.198 = 2.41`

Zones with more resource node variety give more diverse cache loot. This is a natural incentive to explore resource-rich zones.

### Empty Cache Edge Case

If a zone has no resource nodes, or its nodes have no matching refining recipes, the material pool is empty and 0 gems are granted. The cache is materials-only when no soulbound drops either -- meaning the player can get a completely empty cache. The exploration route still displays "You found a hidden cache!" even when loot is nil.

## Soulbound Drop System

### Base Drop Rate

At 15% per cache, the soulbound item is a secondary jackpot layered on top of the already-rare cache discovery. The combined probability from exploration start to soulbound drop:

```
P(soulbound) = P(cache) * P(soulbound | cache)
             = 0.0001/turn * 0.15
             = 0.000015/turn
```

At 1000 turns: `P(at least 1 soulbound) = 1 - (1 - 0.000015)^1000 = 1.49%`
At 5000 turns: `P(at least 1 soulbound) = 1 - (1 - 0.000015)^5000 = 7.22%`
At 10000 turns: `P(at least 1 soulbound) = 1 - (1 - 0.000015)^10000 = 13.93%`

Expected turns per soulbound drop: `1 / 0.000015 = 66,667 turns` (~18.5 hours of turn regeneration).

### Soulbound Rarity (Luck = 0)

The rarity is determined by `rollRarityWithLuck()`. At luck=0, the weights map directly to probabilities:

| Rarity   | Weight | P(rarity) |
|----------|--------|-----------|
| common   | 50     | 50.0%     |
| uncommon | 30     | 30.0%     |
| rare     | 15     | 15.0%     |
| epic     | 5      | 5.0%      |

## Luck Scaling Analysis

The `rollRarityWithLuck` function applies luck as:

```
luckBonus = luck * 0.005
commonWeight   = max(5, 50 - luckBonus * 100)
uncommonWeight = 30 + luckBonus * 30
rareWeight     = 15 + luckBonus * 40
epicWeight     = 5  + luckBonus * 30
```

Substituting `luckBonus = luck * 0.005`:

```
commonWeight   = max(5, 50 - luck * 0.5)
uncommonWeight = 30 + luck * 0.15
rareWeight     = 15 + luck * 0.2
epicWeight     = 5  + luck * 0.15
```

### Weight Progression by Luck

| Luck | Common | Uncommon | Rare | Epic | Total |
|------|--------|----------|------|------|-------|
| 0    | 50.0   | 30.0     | 15.0 | 5.0  | 100.0 |
| 10   | 45.0   | 31.5     | 17.0 | 6.5  | 100.0 |
| 25   | 37.5   | 33.75    | 20.0 | 8.75 | 100.0 |
| 50   | 25.0   | 37.5     | 25.0 | 12.5 | 100.0 |
| 75   | 12.5   | 41.25    | 30.0 | 16.25| 100.0 |
| 90   | 5.0    | 43.5     | 33.0 | 18.5 | 100.0 |
| 100  | 5.0    | 45.0     | 35.0 | 20.0 | 105.0 |
| 200  | 5.0    | 60.0     | 55.0 | 35.0 | 155.0 |

Common floor is reached at luck=90: `50 - 90*0.5 = 5.0`. Beyond luck=90, common is clamped at 5 while other weights keep growing, diluting common's share further.

### Probability Progression by Luck

| Luck | P(common) | P(uncommon) | P(rare) | P(epic) |
|------|-----------|-------------|---------|---------|
| 0    | 50.00%    | 30.00%      | 15.00%  | 5.00%   |
| 10   | 45.00%    | 31.50%      | 17.00%  | 6.50%   |
| 25   | 37.50%    | 33.75%      | 20.00%  | 8.75%   |
| 50   | 25.00%    | 37.50%      | 25.00%  | 12.50%  |
| 75   | 12.50%    | 41.25%      | 30.00%  | 16.25%  |
| 90   | 5.00%     | 43.50%      | 33.00%  | 18.50%  |
| 100  | 4.76%     | 42.86%      | 33.33%  | 19.05%  |
| 200  | 3.23%     | 38.71%      | 35.48%  | 22.58%  |

Key transitions:
- At luck=50, rare overtakes common (both 25%). The rarity curve inverts here.
- At luck=90, common hits its floor. Beyond this point, luck only dilutes common's already-small share.
- At luck=100, epic chance is ~19% -- nearly 4x the base 5%.
- At extreme luck (200+), rare becomes the most common outcome. The distribution flattens toward roughly equal uncommon/rare/epic with a token common floor.

### Diminishing Returns

The common floor at `max(5, ...)` prevents luck from ever eliminating common drops. But since uncommon/rare/epic weights grow linearly while common is clamped, each point of luck above 90 yields diminishing marginal improvement. The "useful" range of luck for cache rarity is roughly 0-100, with the steepest gains in 0-50.

## Expected Value per Cache

### Materials Value

Cut gems are refined crafting materials. Their value depends on the crafting economy, but we can model the quantity:

```
E[gems per cache] = 3.0
```

Since cut gems skip the raw-gather + refine step, each gem from a cache saves the player the gathering turns and crafting turns they would have spent refining manually. This is pure economic value injected without crafting input.

### Soulbound Item Value

Combining the 15% soulbound chance with the rarity distribution (luck=0):

```
E[soulbound per cache] = 0.15
E[common soulbound per cache] = 0.15 * 0.50 = 0.075
E[uncommon soulbound per cache] = 0.15 * 0.30 = 0.045
E[rare soulbound per cache] = 0.15 * 0.15 = 0.0225
E[epic soulbound per cache] = 0.15 * 0.05 = 0.0075
```

Expected caches per epic soulbound: `1 / 0.0075 = 133.3 caches`.
Given expected turns per cache (`1 / 0.0001 = 10,000`), that's 1,333,333 turns for one epic soulbound from caches -- about 15.4 days of continuous turn regeneration.

At luck=50: `E[epic soulbound per cache] = 0.15 * 0.125 = 0.01875`, cutting the expected wait to ~5.3 days of regeneration per epic soulbound. Luck roughly triples epic soulbound throughput at moderate investment.

## Inventory Pressure

The cache loot service respects inventory capacity. When `availableSlots` is provided:

- Stackable gems merge into existing stacks for free (no slot cost)
- New gem types consume 1 slot each
- Soulbound items consume 1 slot
- Overflow goes to pending loot (with a TTL of 600 seconds from INVENTORY_CONSTANTS)

A player with a full inventory still discovers caches but may lose loot to overflow if they don't claim pending loot within 10 minutes. Since caches are rare and valuable, this creates a "feel bad" moment when inventory management causes lost soulbound drops.

## Interaction with Other Systems

### Exploration Loop

The exploration constants analysis (see `2026-03-13-015411-exploration-constants.md`) shows that at typical play of 5000 turns, expected caches = 0.5. Half of all exploration sessions yield zero caches. The hidden cache system is a rare event layered on top of an already turn-intensive exploration loop.

### Quest Progress

Hidden caches count toward `chest_open` quest progress. Since the quest targets are 2/4/8 chests, and caches are extremely rare (E[caches] = 0.5 per 5000-turn session), they contribute negligibly to chest quest completion. Players will complete chest quests primarily through treasure chest drops from encounter sites.

### Mob Family Dependency

Soulbound items are filtered by `mobFamilyId`, which is randomly selected from the zone's mob family pool (weighted by `discoveryWeight`). A zone with only one mob family always grants soulbound items from that family. Zones with diverse families create variety in potential soulbound drops. If a mob family has no soulbound recipes, the soulbound roll is wasted even if the 15% chance triggers.

## Potential Concerns

1. **Empty caches in barren zones.** If a zone has no resource nodes with refining recipes AND the soulbound roll fails (85% of the time), the cache yields nothing. The player sees "You found a hidden cache!" with no actual reward. For a 1-in-10,000 event, an empty result feels terrible.

2. **No legendary tier.** The rarity weight table tops out at epic. Given that soulbound caches are already extremely rare (effective rate: 0.000015/turn for any soulbound, orders of magnitude lower for a specific rarity), excluding legendary may be unnecessarily conservative. A player who finds a soulbound in a cache has already beaten long odds.

3. **Luck scaling is unbounded above the common floor.** While common clamps at 5, the other weights grow without limit. At luck=1000 (if achievable), uncommon weight = 180, rare weight = 215, epic weight = 155, common = 5. The distribution becomes rare-dominated. If luck can reach extreme values through equipment stacking, the rarity distribution could become degenerate.

4. **With-replacement gem rolling can feel monotonous.** In a single-gem-type zone, every cache gives 2-4 of the same gem. There's no variety in the loot. Players in these zones may view caches as unexciting once the novelty wears off.

5. **Soulbound recipe dependency is opaque.** The soulbound drop depends on recipes existing with `soulbound: true` AND matching the randomly-selected mob family. If seed data doesn't include soulbound recipes for all mob families, some zones have silently broken soulbound drops. There's no runtime warning when this happens.

## Verdict

The hidden cache system is well-designed as a rare jackpot mechanic. The 2-4 cut gem base reward provides consistent material value, and the 15% soulbound chance adds excitement without making every cache a windfall. The luck scaling curve is smooth and meaningful across the 0-90 range, with appropriate diminishing returns above that.

The main design weakness is the empty-cache risk in zones with sparse resource nodes. Since caches are already a 1-in-10,000 event, finding an empty one undermines the system's purpose as a motivational carrot. A fallback reward (generic materials, gold, or a guaranteed minimum) would solve this without inflating cache value overall. The missing legendary tier is a minor gap -- adding it at weight 1-2 would create a true jackpot-within-a-jackpot without meaningfully shifting the probability curve.
