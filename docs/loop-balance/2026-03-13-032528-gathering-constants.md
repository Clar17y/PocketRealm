# GATHERING_CONSTANTS + GEM_CRIT_CONSTANTS Analysis

## Current Values

### GATHERING_CONSTANTS
| Constant | Value | Description |
|---|---|---|
| BASE_TURN_COST | 30 | Turns per gathering action |
| BASE_YIELD | 1 | Minimum resource yield per action |
| YIELD_MULTIPLIER_PER_LEVEL | 0.10 | +10% yield per skill level above node requirement |
| XP_PER_ACTION_BASE | 5 | Base XP per gathering action |
| XP_LEVEL_SCALING_DIVISOR | 4 | Bonus XP = floor(nodeLevel / 4) |

### GEM_CRIT_CONSTANTS
| Constant | Value | Description |
|---|---|---|
| BASE_CHANCE | 0.03 | 3% base gem crit chance |
| LEVEL_BONUS | 0.005 | +0.5% per skill level above node |
| LUCK_BONUS | 0.003 | +0.3% per luck point |
| MAX_CHANCE | 0.25 | 25% cap |

### Related: EXPLORATION_CONSTANTS
| Constant | Value | Description |
|---|---|---|
| RESOURCE_NODE_CHANCE | 0.0005 | Per-turn discovery probability |
| RESOURCE_NODE_DECAY_RATE_PER_HOUR | 0.65 | Capacity lost per hour |

### Seed Data: Node Tiers
| Zone | Node Level | Min Capacity | Max Capacity | Avg Capacity |
|---|---|---|---|---|
| Forest Edge | 1 | 15 | 80 | 47 |
| Deep Forest / Cave | 5 | 20 | 100 | 60 |
| Ancient Grove / Plains | 12 | 25 | 120 | 72 |
| Haunted Marsh / Crystal | 20 | 30 | 150 | 90 |
| Sunken Ruins | 30 | 40 | 200 | 120 |

## Analysis

### 1. Yield Scaling: Linear with Severe Floor() Quantization

The yield formula is:
```
yield = floor(baseYield * (1 + levelsAbove * 0.1))
```

Since `baseYield = 1` for all seed nodes, the effective formula is `floor(1 + levelsAbove * 0.1)`. The `floor()` creates 10-level dead zones where yield does not change:

| Levels Above Node | Raw Multiplier | Floored Yield | Increase Event |
|---|---|---|---|
| +0 to +9 | 1.0 - 1.9 | 1 | No increase for 10 levels |
| +10 to +19 | 2.0 - 2.9 | 2 | Doubles at +10 |
| +20 to +29 | 3.0 - 3.9 | 3 | +50% at +20 |
| +30 to +39 | 4.0 - 4.9 | 4 | +33% at +30 |

This is a staircase function, not a smooth curve. Players leveling from +1 to +9 above a node get zero yield improvement despite 9 levels of progression. The first real payoff arrives suddenly at exactly +10 levels.

### 2. XP Scaling: Flat and Extremely Weak

XP per action:
```
xpPerAction = 5 + floor(nodeLevel / 4)
```

| Node Level | XP/Action | XP/Turn |
|---|---|---|
| 1 | 5 | 0.167 |
| 5 | 6 | 0.200 |
| 12 | 8 | 0.267 |
| 20 | 10 | 0.333 |
| 30 | 12 | 0.400 |

XP does NOT scale with the player's skill level. A level 50 player mining a level 1 node earns the same 5 XP/action as a level 1 player. This is intentional (discourages farming low-tier nodes for XP) but creates an issue: XP per turn is painfully low at all tiers.

**Actions to level up at the highest tier nodes (nodeLevel=30, 12 XP/action):**

| Level Transition | XP Needed | Actions | Turns | Real Hours |
|---|---|---|---|---|
| 30 -> 31 | 2,772 | 231 | 6,930 | 1.9h |
| 40 -> 41 | 3,477 | 290 | 8,700 | 2.4h |
| 50 -> 51 | 4,148 | 346 | 10,380 | 2.9h |
| 75 -> 76 | 5,723 | 477 | 14,310 | 4.0h |
| 99 -> 100 | 7,138 | 595 | 17,850 | 5.0h |

These are raw values before efficiency decay. After the decay curve (power=2 against a 15,000 per-window cap), the actual XP earned degrades significantly in long sessions.

### 3. Efficiency Decay Interaction

The gathering daily XP cap is 30,000 (15,000 per 12h window). Efficiency formula:
```
efficiency = max(0, 1 - (windowXpGained / 15000)^2)
```

At nodeLevel=30 (12 XP/action), hitting the window cap requires 1,250 actions = 37,500 turns = 10.4 hours of turn generation. With a turn bank cap of 64,800, a player can technically supply enough turns, but the quadratic decay means practical XP gain plateaus well before the cap:

| Actions | Turns | Raw XP | Effective XP | Efficiency |
|---|---|---|---|---|
| 100 | 3,000 | 1,200 | 1,197 | 99.4% |
| 500 | 15,000 | 6,000 | 5,700 | 85.6% |
| 1,000 | 30,000 | 12,000 | 9,963 | 55.9% |
| 1,500 | 45,000 | 18,000 | 12,507 | 30.5% |

**The gathering XP cap is never practically reached.** At nodeLevel=30, after 1,500 actions (45,000 turns, ~12.5h), a player has earned 12,507 effective XP out of a 15,000 cap. The remaining 2,493 XP would require increasingly many near-zero-efficiency actions. This is fine -- the decay curve is working as intended.

### 4. Over-leveling Exploit: Low-Tier Node Farming

A high-level player farming low-tier nodes gets dramatically better resource and gem rates:

**Level 50 player, level 1 nodes vs level 30 nodes:**

| Metric | Level 1 Nodes | Level 30 Nodes | Ratio |
|---|---|---|---|
| Yield/action | 5 | 3 | 1.67x |
| XP/action | 5 | 12 | 0.42x |
| Gem crit chance | 25.0% | 13.0% | 1.92x |
| Resources per 1,000 turns | 165 | 99 | 1.67x |

Low-tier node farming produces **67% more resources** and **92% more gems** per turn, at the cost of 58% less XP. For a max-level player who doesn't need XP, low-tier farming is strictly dominant for resource and gem acquisition.

This is a significant degenerate strategy: endgame players should be incentivized to use high-tier nodes, but the math strongly favors the opposite for pure material farming.

### 5. Node Discovery and Decay Race

Resource node discovery probability is 0.05% per exploration turn. Expected turns to find a node: ~1,386 (median) to 2,000 (mean). At 1 turn/second, that's 23-33 minutes of exploration to find one node.

Node decay rate is 0.65 capacity/hour:

| Avg Capacity | Time to Full Decay | Turns to Deplete (at-level) |
|---|---|---|
| 47 (tier 1) | 3.0 days | 1,410 (0.4h) |
| 60 (tier 2) | 3.8 days | 1,800 (0.5h) |
| 72 (tier 3) | 4.6 days | 2,160 (0.6h) |
| 90 (tier 4) | 5.8 days | 2,700 (0.75h) |
| 120 (tier 5) | 7.7 days | 3,600 (1.0h) |

Depletion time at-level (0.4-1.0h) is always much shorter than decay time (3-8 days). The decay mechanic functions as a "use it or lose it" timer that creates urgency but rarely actually destroys capacity before a player can mine. An active player discovering a node will deplete it within the same session. Decay primarily punishes inactive accounts with stockpiled nodes.

### 6. Full Economic Loop: Resource Generation Rate

Including exploration discovery time:
```
Total turns per resource = discovery_turns + mining_turns_per_resource
                        = 2000 + 30
                        ≈ 2030 turns/resource (at-level, single node)
```

But players accumulate multiple nodes across multiple explorations and mine them in batches. The effective rate when mining a pre-discovered node is simply:
```
30 turns/resource (at-level)
15 turns/resource (+10 levels over)
```

For comparison, combat costs 50 turns/encounter. Gathering is 40% cheaper per action than combat, which seems reasonable given that gathering yields raw materials (requiring further crafting) while combat yields finished items and direct XP.

### 7. Guild Tax Interaction

The gathering route applies guild tax via `calculateEffectiveTurns(turns, taxRate)` and `calculateInflatedCost(baseCost, taxRate)`. The inflated cost formula:
```
actualCost = ceil(baseCost / (1 - taxRate/100))
```

At a 10% tax rate, the 30-turn base cost becomes `ceil(30 / 0.9) = 34` turns. At 20%, it becomes `ceil(30 / 0.8) = 38`. This is applied correctly and consistently with other systems.

## Issues Found

### Issue 1 (Medium): Floor() Dead Zone — 10 Levels of Zero Yield Progress
The yield formula `floor(1 * (1 + levelsAbove * 0.1))` produces no yield increase from +0 to +9 levels above the node requirement. With `baseYield = 1` on all seed nodes, a player's first 9 levels of over-leveling give zero gathering benefit. This feels unrewarding during a phase where progression should feel impactful.

**Root cause:** `baseYield = 1` combined with `0.1` multiplier means the raw yield only reaches `1.9` at +9 levels, which floors back to 1.

### Issue 2 (Medium): Low-Tier Farming is Strictly Dominant for Resources
High-level players get up to 67% more resources and 92% more gems per turn by farming low-tier nodes compared to high-tier ones. The only penalty is less XP, which is irrelevant at max level. This undermines the purpose of having tiered resource zones.

### Issue 3 (Low): XP Scaling is Too Weak
At the highest node tier (level 30), XP per action is only 12. Leveling from 50->51 requires 346 actions (10,380 turns = 2.9h). From 99->100: 595 actions (17,850 turns = 5.0h). Since the highest node in the game is level 30, players above level 30 must grind these same nodes for 70 more levels with no XP scaling improvement. The XP/turn ratio (0.4 at best) is very low compared to the theoretical daily cap.

### Issue 4 (Low): XP Cap Is Unreachable
The per-window cap of 15,000 requires 37,500 turns at the best node tier, which exceeds the turn bank cap of 64,800 when accounting for efficiency decay. In practice, a full turn bank yields ~12,500 effective XP (83% of cap). The cap exists but never constrains behavior, making it functionally decorative.

## Recommendations

### R1: Increase Seed Node baseYield to 2 (Issue 1)
Changing `baseYield` from 1 to 2 in the seed data halves the dead zone from 10 levels to 5 levels. At +5 levels above the node, yield goes from 2 to 3 (a meaningful 50% increase). This provides smoother progression without changing the formula itself. If baseYield of 2 feels too generous, alternatively increase YIELD_MULTIPLIER_PER_LEVEL from 0.10 to 0.15, which shortens the dead zone from 10 levels to 7.

### R2: Add a Level-Penalty Multiplier to Yield for Low-Tier Farming (Issue 2)
Introduce a penalty when the player's level far exceeds the node level:
```
penaltyMultiplier = 1 - max(0, (levelsAbove - 15) * 0.03)  // clamped to [0.25, 1.0]
effectiveYield = floor(baseYield * yieldMultiplier * penaltyMultiplier)
```
This would reduce yield for players more than 15 levels above a node, with a floor of 25% efficiency. A level 50 player farming level 1 nodes (49 levels above) would get a 0.25x penalty, dropping yield from 5 to 1 -- same as an at-level player. This removes the over-leveling incentive while preserving the yield bonus for modest over-leveling.

### R3: Scale XP with Player-Node Level Proximity (Issue 3)
Add a proximity bonus when the player's level is close to the node's level:
```
proximityBonus = max(0, 5 - abs(level - nodeLevel)) * 0.5
xpPerAction = (5 + floor(nodeLevel / 4)) * (1 + proximityBonus)
```
This gives up to a 2.5x XP multiplier when exactly at the node's level, tapering to 1x at 5 levels away. It would reward players who seek out level-appropriate nodes and help close the XP gap at higher levels.

### R4: No Change Needed to XP Cap (Issue 4)
The unreachable cap is harmless. It provides a theoretical ceiling that prevents extreme edge cases (e.g., XP-boosting buffs stacking) without affecting normal play. Leave as-is.

## Risk Level
**medium** — The over-leveling exploit (Issue 2) creates a clearly unintended incentive for endgame players to farm starter zones for resources and gems. The dead zone in yield progression (Issue 1) creates a 10-level stretch of unrewarding gameplay. Neither issue breaks the game, but both undermine the zone-tiering design.
