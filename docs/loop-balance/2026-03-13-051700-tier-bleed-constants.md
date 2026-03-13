# TIER_BLEED_CONSTANTS Balance Analysis

## Raw Values

```
TWO_BELOW: 0.10
ONE_BELOW: 0.15
SELECTED:  0.50
ONE_ABOVE: 0.15
TWO_ABOVE: 0.10
```

Weights sum to exactly 1.0. Symmetric bell curve centered on the selected tier.

## What This System Does

When a player explores or fights in a zone, they target a specific mob tier (determined by zone exploration progress). Tier bleedthrough adds variance: instead of always spawning mobs at exactly the selected tier, the system rolls against a probability distribution spanning +/-2 tiers from the target. This prevents combat from feeling repetitive once a player settles into a tier.

## Probability Distribution (Ideal Case)

With all 5 tiers available and tier 3 selected:

| Roll Range     | Outcome  | Probability |
|----------------|----------|-------------|
| [0.00, 0.10)   | Tier 1   | 10%         |
| [0.10, 0.25)   | Tier 2   | 15%         |
| [0.25, 0.75)   | Tier 3   | 50%         |
| [0.75, 0.90)   | Tier 4   | 15%         |
| [0.90, 1.00)   | Tier 5   | 10%         |

Half the time the player fights at their selected tier. The other half is distributed symmetrically: 25% chance of easier mobs, 25% chance of harder mobs.

## Overflow Redistribution (Edge Tiers)

Tiers that fall outside the zone's valid range are redistributed asymmetrically:
- **Below-range overflow** (tier < minTier) --> collapses to the **selected** tier
- **Above-range overflow** (tier > maxTier) --> collapses to the **highest available** tier

This creates dramatically different effective distributions at boundary tiers.

### Default 4-tier zone (tiers 1-4)

**Tier 1 selected** (both below slots overflow to selected):

| Tier | Base Slot(s) | Effective % |
|------|-------------|-------------|
| 1    | SELECTED + TWO_BELOW + ONE_BELOW | **75%** |
| 2    | ONE_ABOVE   | 15% |
| 3    | TWO_ABOVE   | 10% |
| 4    | --          | 0%  |

Player overwhelmingly fights tier 1 mobs. A 25% chance of fighting something harder provides occasional challenge without punishing new zone entrants.

**Tier 2 selected** (TWO_BELOW = tier 0 overflows to selected):

| Tier | Base Slot(s) | Effective % |
|------|-------------|-------------|
| 1    | ONE_BELOW   | 15% |
| 2    | SELECTED + TWO_BELOW | **60%** |
| 3    | ONE_ABOVE   | 15% |
| 4    | TWO_ABOVE   | 10% |

Nearly symmetric. The absorbed TWO_BELOW boosts selected tier from 50% to 60%.

**Tier 3 selected** (TWO_ABOVE = tier 5 overflows to highest = tier 4):

| Tier | Base Slot(s) | Effective % |
|------|-------------|-------------|
| 1    | TWO_BELOW   | 10% |
| 2    | ONE_BELOW   | 15% |
| 3    | SELECTED    | 50% |
| 4    | ONE_ABOVE + TWO_ABOVE | **25%** |

Above-overflow stacks onto tier 4 rather than tier 3, creating a slight upward skew. Player gets harder mobs more often than easier ones (25% vs 10%).

**Tier 4 selected** (both above slots overflow to highest = tier 4):

| Tier | Base Slot(s) | Effective % |
|------|-------------|-------------|
| 1    | --          | 0%  |
| 2    | TWO_BELOW   | 10% |
| 3    | ONE_BELOW   | 15% |
| 4    | SELECTED + ONE_ABOVE + TWO_ABOVE | **75%** |

Mirror of tier 1. Endgame players fight mostly apex mobs. The 25% chance of easier mobs provides relief encounters that make the hard ones feel more impactful.

## Interaction with Zone Exploration Progression

Tier bleed operates on top of `ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS`:

```
Tier 1: unlocked at 0% exploration
Tier 2: unlocked at 25%
Tier 3: unlocked at 50%
Tier 4: unlocked at 75%
```

Key interaction: players can only **select** tiers they have unlocked. A player at 30% exploration can select tier 1 or 2. If they select tier 2:
- Bleedthrough can roll tier 4 (TWO_ABOVE), but filterAndWeightMobsByTier already removed tier 3+ mobs (not yet unlocked)
- The fallback loop in exploration/start.ts walks down from the rolled tier until finding available mobs
- So the effective pool is constrained to unlocked tiers even when bleed rolls higher

This means bleedthrough at low exploration mainly just downgrades you (rolling tier 0/negative collapses to selected), while upward rolls bounce off the unlock ceiling. Early exploration is slightly easier than the raw numbers suggest.

## Interaction with Newest Tier Weight Multiplier

`ZONE_EXPLORATION_CONSTANTS.NEWEST_TIER_WEIGHT_MULTIPLIER = 2` doubles encounter weight for mobs at the highest unlocked tier. This works independently of bleedthrough:

1. Bleedthrough selects a target tier
2. Candidates are filtered to that tier (with downward fallback)
3. Within the candidate pool, pickWeighted uses encounter weights (already boosted for newest tier mobs)

So if bleedthrough rolls the newest tier, those mobs get 2x selection weight within their pool. If bleedthrough rolls a lower tier, the weight multiplier has no effect (those mobs aren't in the candidate set). The two systems complement each other: bleedthrough controls tier-level distribution, weight multiplier controls intra-tier mob selection.

## Expected Tier per 100 Encounters

Using the effective distributions above for a 4-tier zone:

| Selected | E[tier] | Std Dev |
|----------|---------|---------|
| 1        | 1.35    | 0.65    |
| 2        | 2.20    | 0.89    |
| 3        | 2.90    | 0.89    |
| 4        | 3.65    | 0.65    |

At tier 3 selected, the expected tier (2.90) is slightly below 3 due to the asymmetric overflow. The player is marginally more likely to fight downward than upward. At tier 4, the expected tier (3.65) is well below 4 because of the 25% downward bleed, ensuring endgame still has variety.

## Difficulty Variance Impact

Mob stats scale significantly by tier (TIER_NAME_CONSTANTS: Outskirts/Interior/Depths/Apex). A 2-tier bleed means a player targeting tier 3 (Depths) can face tier 1 (Outskirts) mobs -- a large difficulty drop that should feel like a breather -- or tier 4 (Apex) mobs that feel like a spike. The 10% probability for 2-tier jumps keeps these surprise encounters rare enough to be memorable.

## Potential Concerns

1. **Asymmetric overflow favors safety.** Below-overflow collapses to *selected* tier (safe), while above-overflow collapses to *max available* (not selected). At tier 4, this means you never get pushed below tier 2 even though at tier 1 you can be pushed up to tier 3. Players at max tier have a safety floor; players at min tier have a challenge ceiling. This is good game design but means the system is not truly symmetric despite the symmetric weights.

2. **Single-tier zones collapse entirely.** A zone with only tier 1 (like a starting zone) returns tier 1 regardless of roll. The bleed system becomes a no-op, which is fine but worth noting -- it means starter zones feel more uniform.

3. **Two-tier zones have high selected concentration.** With tiers 1-2, selecting tier 1 gives 75%/25% and selecting tier 2 gives 25%/75%. Only ONE_ABOVE/ONE_BELOW actually bleed; both TWO_ slots overflow. The variance window narrows considerably.

4. **No upward bleed gating.** Bleedthrough can roll a tier the player hasn't "unlocked" via exploration. The fallback cascade in both combat and exploration routes handles this gracefully (walks down to find available mobs), but it means the bleed probabilities don't cleanly map to outcomes at low exploration percentages. The player just gets more selected-tier encounters than the weights suggest.

## Verdict

The 50/25/25 split (center/below/above) is well-tuned. It provides meaningful encounter variety without undermining tier selection. The asymmetric overflow rules create an implicit difficulty gradient: boundary tiers are more focused, mid tiers are more varied. This matches player psychology -- early-zone players want consistency, endgame players also want consistency (at the hard tier), and mid-progression players benefit from the widest variety. The symmetric weight definition keeping the constant simple while the overflow rules handle edge cases is clean design.
