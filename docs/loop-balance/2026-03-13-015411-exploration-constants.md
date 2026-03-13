# EXPLORATION_CONSTANTS Analysis

## Current Values

| Constant | Value | Unit |
|---|---|---|
| AMBUSH_CHANCE_PER_TURN | 0.005 | per turn |
| ENCOUNTER_SITE_CHANCE_PER_TURN | 0.0008 | per turn |
| RESOURCE_NODE_CHANCE | 0.0005 | per turn |
| HIDDEN_CACHE_CHANCE | 0.0001 | per turn |
| TRAVEL_AMBUSH_CHANCE_PER_TURN | 0.04 | per turn |
| ENCOUNTER_SITE_DECAY_RATE_PER_HOUR | 0.06 | mobs/hour |
| RESOURCE_NODE_DECAY_RATE_PER_HOUR | 0.65 | capacity/hour |
| ENCOUNTER_SIZE_SMALL | {2, 3} | mobs |
| ENCOUNTER_SIZE_MEDIUM | {4, 6} | mobs |
| ENCOUNTER_SIZE_LARGE | {7, 10} | mobs |
| MIN_EXPLORATION_TURNS | 10 | turns |
| MAX_EXPLORATION_TURNS | 10,000 | turns |
| ZONE_EXIT_SCALING_START | 50 | percent |
| ZONE_EXIT_SCALING_MAX_MULTIPLIER | 20 | multiplier |

Related constants consumed in the same flow:

| Constant | Value | Source |
|---|---|---|
| ENCOUNTER_TURN_COST | 50 | COMBAT_CONSTANTS |
| EVENT_DISCOVERY_CHANCE_PER_TURN | 0.0001 | WORLD_EVENT_CONSTANTS |

## Analysis

### 1. Core Probability Model

The system uses a per-turn independent Bernoulli trial model. For each of the `n` turns spent exploring, each outcome type is rolled independently. The cumulative probability of at least one occurrence is:

```
P(at least 1) = 1 - (1 - p)^n
```

**Expected occurrences** (linear): `E[X] = n * p`

This creates a system where outcomes scale linearly in expectation but the *first* occurrence follows a geometric distribution with decreasing marginal value per turn.

### 2. Outcome Frequency at Key Turn Counts

Using `P = 1 - (1-p)^n` for "at least one" and `E = n*p` for expected count:

| Turns | Ambush P | Ambush E | Site P | Site E | Resource P | Cache P |
|---|---|---|---|---|---|---|
| 10 | 4.89% | 0.05 | 0.80% | 0.008 | 0.50% | 0.10% |
| 50 | 22.17% | 0.25 | 3.92% | 0.04 | 2.47% | 0.50% |
| 100 | 39.42% | 0.50 | 7.69% | 0.08 | 4.88% | 0.99% |
| 200 | 63.30% | 1.00 | 14.80% | 0.16 | 9.52% | 1.98% |
| 500 | 91.79% | 2.50 | 33.01% | 0.40 | 22.12% | 4.88% |
| 1000 | 99.33% | 5.00 | 55.12% | 0.80 | 39.35% | 9.52% |
| 2000 | 99.995% | 10.00 | 79.85% | 1.60 | 63.23% | 18.13% |
| 5000 | ~100% | 25.00 | 98.17% | 4.00 | 91.79% | 39.35% |
| 10000 | ~100% | 50.00 | 99.97% | 8.00 | 99.33% | 63.21% |

**Key observations:**
- **Ambush dominance:** At any meaningful turn count, ambushes vastly outnumber other discoveries. At 1000 turns, a player gets ~5 ambushes but only ~0.8 encounter sites and ~0.5 resource nodes.
- **Encounter sites are rare:** Even at max exploration (10,000 turns), the expected site count is only 8. Since sites are the primary source of multi-mob fights and loot, this feels very sparse.
- **Hidden caches are extremely rare:** At 10,000 turns, the expected cache count is only 1, and there's still a 37% chance of getting zero. Given that caches are meant to be exciting surprise discoveries, this rarity may be intentional, but it means many players will never see one during normal play sessions.

### 3. Scaling Curves

**Ambush rate (0.005/turn):** Linear scaling. Every 200 turns adds ~1 expected ambush. This is the workhorse of the exploration system -- the primary source of encounters. The rate is appropriate for the 50-turn combat cost, yielding roughly 1 ambush per 200 turns on average or one combat opportunity per ~250 turns (accounting for the 50-turn encounter cost).

**Encounter site rate (0.0008/turn):** This is 6.25x rarer than ambushes. Since sites contain 2-10 mobs worth of content and loot, the rarity is meant to compensate for their higher value. However, the ratio means a player spending 1000 turns gets ~5 standalone fights but only ~0.8 site discoveries. The content mix is heavily weighted toward single-mob ambushes.

**Resource node rate (0.0005/turn):** 1.6x rarer than encounter sites. Gathering nodes provide crafting materials, so this rate controls the crafting pipeline's input supply. At typical daily play of ~5000 turns, a player finds ~2.5 nodes per exploration session.

**Hidden cache rate (0.0001/turn):** 5x rarer than resource nodes. Functions as a jackpot mechanic. At 5000 turns/session, expected caches = 0.5. Half of all exploration sessions yield zero caches.

### 4. Zone Exit Scaling

The zone exit system uses quadratic scaling after 50% zone exploration:

```
progress = (explorationPercent - 50) / (100 - 50)    // normalized [0, 1]
multiplier = 1 + (20 - 1) * progress^2               // quadratic from 1x to 20x
```

| Exploration % | Multiplier | Effective Rate (if base=0.0001) |
|---|---|---|
| 0-50% | 1.0x | 0.0001 |
| 60% | 1.76x | 0.000176 |
| 70% | 3.56x | 0.000356 |
| 75% | 5.75x | 0.000575 |
| 80% | 8.56x | 0.000856 |
| 90% | 16.16x | 0.001616 |
| 100% | 20.0x | 0.0020 |

The quadratic curve creates a smooth ramp. At 100% exploration, the 20x multiplier makes zone exits 20x more likely, which is a strong incentive to fully explore before moving on. However, the base rate is zone-dependent (stored in `zone.zoneExitChance`), so the actual impact varies by zone design.

### 5. Decay Systems

**Encounter site mob decay (0.06 mobs/hour):** This means:
- 1 mob decays every ~16.7 hours
- A small site (2-3 mobs) fully decays in 33-50 hours
- A large site (7-10 mobs) fully decays in 117-167 hours

This is extremely slow decay. Sites persist for days. Players have no urgency to engage discovered encounter sites.

**Resource node decay (0.65 capacity/hour):** This is dramatically faster:
- A node with 10 capacity loses 1 unit every ~1.5 hours
- A 10-capacity node is fully decayed in ~15.4 hours

Resource nodes decay ~10.8x faster than encounter sites (in proportional terms). This creates urgency for gathering but not for combat.

### 6. Travel Ambush Rate

At 0.04/turn, travel ambushes are 8x more likely than exploration ambushes. Given that `ZONE_CONSTANTS.BASE_TRAVEL_COST = 100` turns:

```
P(ambush during travel) = 1 - (1 - 0.04)^100 = 98.3%
P(ambush during difficult travel) = 1 - (1 - 0.04)^200 = 99.97%
```

Travel is almost guaranteed to trigger at least one ambush. Expected ambushes per normal travel: `100 * 0.04 = 4.0`. This means every zone transition forces ~4 combat encounters. With a 2x difficult terrain multiplier, that's ~8 forced combats per travel.

### 7. Turn Efficiency Analysis

Cost of engagement by discovery type:

| Discovery | Avg Turns to First | Combat Cost | Total Turns | Reward Type |
|---|---|---|---|---|
| Ambush | 200 | 50 | 250 | Single mob XP/loot |
| Encounter site | 1,250 | 50 * avg_mobs | 1,250 + 200 | Multi-mob XP/loot/chest |
| Resource node | 2,000 | 30 (gathering) | 2,030 | Crafting materials |
| Hidden cache | 10,000 | 0 | 10,000 | Random loot |

For ambushes, the "yield per turn" is roughly 1 combat per 250 turns invested. Since turn regen is 1/second, this is ~4 minutes of real time per combat opportunity.

### 8. spawnRateMultiplier Interaction

World events can modify ambush and encounter site rates via `spawnRateMultiplier`. This multiplier scales both `AMBUSH_CHANCE_PER_TURN` and `ENCOUNTER_SITE_CHANCE_PER_TURN` linearly but does NOT affect resource node or hidden cache rates.

With a 2x spawn rate event: ambush expectation doubles (1 per 100 turns instead of 200). This is a significant power boost during mob events and means world events can meaningfully alter the exploration reward structure.

## Issues Found

### Issue 1: Extreme Ambush Dominance (medium severity)

Ambushes are 6.25x more common than encounter sites. Since ambushes are single-mob fights with modest rewards, the exploration loop is heavily repetitive. A player spending 1000 turns gets ~5 ambushes but fewer than 1 site on average. The gameplay is mostly "walk, fight one mob, walk, fight one mob."

**Math:** At 1000 turns, `E[ambush] = 5.0`, `E[site] = 0.8`. Ratio = 6.25:1. Players experience 6+ ambushes before finding a site.

### Issue 2: Hidden Cache Near-Impossibility at Low Turn Counts (low severity)

At 1000 turns (a typical moderate exploration session), cache probability is only 9.5%. At 500 turns, it's 4.9%. Many players will explore hundreds of times before ever seeing a cache.

This is likely by design (jackpot mechanic), but the rate may be too low for the reward to serve as a motivational carrot. Players who don't know caches exist can't be motivated by them.

### Issue 3: Travel Ambush Rate Creates Punishing Zone Transitions (medium severity)

With `TRAVEL_AMBUSH_CHANCE_PER_TURN = 0.04` and `BASE_TRAVEL_COST = 100`, every zone transition triggers ~4 forced combats. This is a significant deterrent to exploration:

```
Expected ambushes per travel = 100 * 0.04 = 4.0
Expected ambushes per difficult travel = 200 * 0.04 = 8.0
```

Each ambush costs 50 encounter turns + HP/resource attrition. Players traveling through multiple zones face cascading combat fatigue, potentially arriving at their destination too damaged to explore.

**Degenerate strategy:** Players may avoid zone travel entirely, farming a single zone indefinitely because the travel cost (turns + ambush damage) is too high relative to the benefit of moving.

### Issue 4: Encounter Site Decay Rate Misaligned with Discovery Rate (low severity)

At 0.06 mobs/hour decay, a large site (10 mobs) takes ~167 hours to fully decay. But the expected time to discover a new site at continuous play is: `1 / (0.0008 * 1 turn/sec) = 1,250 seconds = ~20.8 minutes`.

Players will discover new sites far faster than old ones decay. This means encounter sites accumulate without limit for active players. This isn't necessarily a bug, but it means the decay mechanic is essentially irrelevant during active play -- it only matters for sites discovered then left idle for days.

### Issue 5: Min Exploration (10 turns) is Nearly Valueless (low severity)

At 10 turns: ambush chance = 4.89%, site chance = 0.80%. The expected outcome of a 10-turn exploration is almost always "nothing happened." Since the UI still requires a full exploration flow (API call, animation, etc.), this creates negative UX for players who accidentally or experimentally explore with low turns.

### Issue 6: Potential Exploit with spawnRateMultiplier Stacking

If world events can stack spawn rate multipliers (e.g., two `spawn_rate_up` events in one zone), the ambush rate could become very high. At a 3x multiplier, `AMBUSH_CHANCE_PER_TURN = 0.015`, yielding 15 ambushes per 1000 turns. Combined with combat template automation, this could be an XP/loot farming exploit during stacked events.

The code shows `MAX_ZONE_EVENTS = 2`, so two events CAN overlap. If both are `spawn_rate_up`, the multiplier compounds multiplicatively: `1.3 * 1.3 = 1.69x` for moderate events or higher for strong ones.

## Recommendations

### R1: Increase Encounter Site Rate
**Change:** `ENCOUNTER_SITE_CHANCE_PER_TURN: 0.0008` -> `0.0015`
**Rationale:** Narrows the ambush-to-site ratio from 6.25:1 to 3.33:1. At 1000 turns, expected sites increase from 0.8 to 1.5, giving players a meaningful chance of finding one site per exploration session. Sites are the more engaging content (multi-room, multi-mob, chest rewards), so increasing their frequency improves gameplay variety without inflating overall reward rates dramatically since sites still require turn investment to clear.

### R2: Increase Hidden Cache Rate
**Change:** `HIDDEN_CACHE_CHANCE: 0.0001` -> `0.0003`
**Rationale:** At 1000 turns, probability rises from 9.5% to 25.9%. Players will see caches roughly once per 4 moderate sessions instead of once per 10+. Still rare enough to feel special, but common enough that players learn the mechanic exists and can anticipate it.

### R3: Reduce Travel Ambush Rate
**Change:** `TRAVEL_AMBUSH_CHANCE_PER_TURN: 0.04` -> `0.02`
**Rationale:** Halves expected travel ambushes from 4.0 to 2.0 per zone transition. Travel remains dangerous (86.7% chance of at least 1 ambush at 100 turns) but no longer punishing enough to discourage zone exploration entirely. Difficult terrain travel drops from ~8 to ~4 expected ambushes.

### R4: Increase Encounter Site Decay Rate
**Change:** `ENCOUNTER_SITE_DECAY_RATE_PER_HOUR: 0.06` -> `0.25`
**Rationale:** At 0.25/hour, a large site (10 mobs) decays in 40 hours instead of 167 hours. Small sites (2-3 mobs) decay in 8-12 hours. This creates meaningful urgency to engage discovered sites within a play session or two, rather than letting them sit for a week. Still generous enough that sites don't vanish during normal play gaps.

### R5: Raise Minimum Exploration Turns
**Change:** `MIN_EXPLORATION_TURNS: 10` -> `50`
**Rationale:** At 50 turns, ambush chance is 22.2% and site chance is 3.9%. This is still low but meaningfully better than the 4.9%/0.8% at 10 turns. Prevents the "nothing happened" frustration of extremely short explorations. Cost to the player is minimal (50 turns = 50 seconds of regen).

## Risk Level

medium -- The exploration probability constants directly control the core gameplay loop's pacing and reward delivery. Changes to ambush/site rates alter XP income, loot flow, and crafting material supply. The recommended changes are modest (1.5-3x adjustments on secondary rates, 0.5x on travel) and preserve the fundamental hierarchy of outcome frequency, but they would noticeably change the feel of exploration sessions and should be playtested to verify the adjusted pacing feels right before shipping.
