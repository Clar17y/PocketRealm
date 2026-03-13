# DURABILITY_CONSTANTS Analysis

## Current Values

| Constant | Value | Description |
|---|---|---|
| `COMBAT_DEGRADATION` | 0.01 | Durability lost per hit landed (weapon) or received (armor) |
| `REPAIR_TURN_COST` | 100 | Turns to repair a damaged item |
| `BROKEN_REPAIR_TURN_COST` | 150 | Turns to repair a broken (0 durability) item |
| `REPAIR_MAX_DECAY` | 5 | Maximum max-durability lost per repair (random 1-5) |
| `MIN_MAX_DURABILITY` | 10 | Floor for max durability; item cannot decay below this |
| `WARNING_THRESHOLD` | 0.10 | Fraction of max durability that triggers low-durability warning |

Related constants:
- `SELL_CONSTANTS.DURABILITY_PENALTY_THRESHOLD`: 0.5 (sell price penalized below 50% durability)
- `CRAFTING_CONSTANTS.DURABILITY_BONUS_PER_10_LEVELS`: 5 (percent bonus to max durability per 10 crafting levels above recipe requirement)
- Default item template `maxDurability`: 100 (schema default)

## Analysis

### 1. Degradation Rate Per Combat

Degradation is **per hit**, not per round. Each hit that lands (non-evaded, with defined damage) costs 0.01 durability. The key question is: how many hits land per fight?

**Combat structure:** Max 100 rounds. Both combatants act each round. With base hit chance of 0.70 (PvE open world), a typical fight lasting N rounds produces:
- Player hits landed: ~N * 0.70
- Mob hits landed: ~N * 0.70 (mob hit chance varies by level diff but similar order)

**Typical fight lengths by scenario:**

| Scenario | Rounds | Player Hits | Mob Hits | Weapon Loss | Armor Loss (per piece) |
|---|---|---|---|---|---|
| Easy mob (5 rounds) | 5 | ~3.5 | ~3.5 | 0.04 | 0.04 |
| Medium mob (15 rounds) | 15 | ~10.5 | ~10.5 | 0.11 | 0.11 |
| Hard mob (30 rounds) | 30 | ~21 | ~21 | 0.21 | 0.21 |
| Grueling fight (60 rounds) | 60 | ~42 | ~42 | 0.42 | 0.42 |
| Max-length fight (100 rounds) | 100 | ~70 | ~70 | 0.70 | 0.70 |

With maxDurability = 100, a weapon can sustain approximately:
- **100 / 0.11 = ~909 medium fights** before reaching 0 durability
- **100 / 0.21 = ~476 hard fights**
- **100 / 0.04 = ~2,500 easy fights**

### 2. Encounter Site Multi-Mob Scaling

Encounter sites contain 2-10 mobs. Each mob fight independently degrades durability. For a large encounter site (7-10 mobs, each ~15 rounds):

- Weapon degradation per site: 10 * 0.11 = **1.1 durability per large encounter**
- Armor degradation per piece: same **1.1 per large encounter**

This means 100 / 1.1 = ~91 large encounter sites before weapon breaks. At ~50 turns per encounter turn cost, plus exploration turns to find sites, this is still very slow degradation.

### 3. Armor Multiplier Effect

A player equips up to 11 slots, but only weapons and armor degrade. Typical loadout:
- 1 weapon (main_hand)
- 1 off_hand (shield/armor type)
- head, chest, legs, boots, gloves, belt = 6 armor pieces

All 6+ armor pieces degrade by the same amount per combat (mob hits * 0.01). This means the **total repair burden scales linearly with equipped armor count**. With 7 armor pieces damaged:
- 7 * 100 turns = 700 turns to repair all, or
- 7 * 150 turns = 1,050 turns if all broken

### 4. Repair Economics: Max Durability Decay

Each repair reduces maxDurability by random(1, 5), average = 3. The floor is MIN_MAX_DURABILITY = 10.

Starting at maxDurability = 100, reaching the floor:
- (100 - 10) / 3 = **30 repairs** on average before item is at minimum max durability

But at the minimum (maxDurability = 10), the item breaks in:
- 10 / 0.11 = ~91 medium fights

Then requires another repair (100 turns), loses 1-5 max durability but is already at the floor of 10, so maxDurability stays at 10.

**This creates an indefinite item lifecycle.** Once maxDurability hits 10, the item:
1. Has 10 durability after repair
2. Fights ~91 medium fights (each ~50 turns = ~4,550 turns of combat)
3. Costs 100 turns to repair
4. Repeat forever

The item effectively has infinite lifespan once at the floor, with 100/4650 = **2.1% turn overhead for maintenance**.

### 5. Broken Item Penalty

Broken items (currentDurability <= 0) contribute zero stats to equipment calculations (confirmed in `equipmentService.ts` line 64-66). This is a binary cliff: at 0.01 durability the item gives full stats; at 0 it gives nothing.

The warning threshold (10% of max) provides some notice, but with degradation of 0.01 per hit, crossing from "warned" to "broken" takes:
- At max 100: warning at 10 durability, ~1000 more hits to break
- At max 10: warning at 1 durability, ~100 more hits to break

### 6. Sell Price Interaction

`SELL_CONSTANTS.DURABILITY_PENALTY_THRESHOLD = 0.5` means items below 50% durability ratio sell for `price * ratio`. At 0% durability the formula yields `price * 0 = 0`, but there's a floor of 1 gold.

For a player selling damaged gear:
- 50%+ durability: no penalty
- 25% durability: 75% price reduction
- 0% durability: minimum 1 gold

This is mostly fair but creates a soft incentive to repair before selling, which conflicts with the repair turn cost. Repairing costs 100 turns but destroys max durability -- there's no way to restore durability for selling purposes without permanent item degradation.

### 7. Crafting Durability Bonus

`DURABILITY_BONUS_PER_10_LEVELS = 5` grants +5% max durability per 10 crafting levels above recipe requirement. With max crafting level 100 and a level 1 recipe:
- 99 levels above / 10 = 9 buckets * 5% = +45% durability
- Max durability: 100 * 1.45 = 145

This extends the initial item lifetime by 45% but also means 45% more max durability to decay through. Number of repairs to reach floor: (145 - 10) / 3 = 45 repairs (vs 30 for base).

### 8. PvP Dual Degradation

In PvP, **both players** lose durability. The attacker's weapon degrades from their hits, and the defender's armor from received hits. The defender's weapon degrades from their hits, attacker's armor from received hits. With high-level PvP fights potentially lasting 50+ rounds, this creates a significant gold/turn sink for both players. At 500 turns per challenge, plus ~700-1050 turns in repair costs for a full loadout, PvP effective cost is 1200-1550 turns per match.

### 9. Durability Shield Buff

The `durabilityShield` from the buff system completely negates durability loss for N fights. This binary bypass means players with this buff can chain encounters with zero maintenance cost. If the buff duration is generous, it undermines the durability system entirely for that window.

## Issues Found

### Issue 1: Degradation rate is too low for meaningful resource sink (LOW SEVERITY)

At 0.01 per hit, a typical 15-round fight costs ~0.11 durability out of 100. This means ~909 fights before a weapon breaks. With each fight costing 50 turns, that's 45,450 turns of combat before a single repair is needed. At 1 turn/second, that's 12.6 hours of pure combat. For an async game with 18 hours of turn banking, this means a very active player repairs roughly once per day.

The durability system barely registers as a constraint. It's a minor annoyance rather than a meaningful economic decision.

### Issue 2: Infinite item lifespan at MIN_MAX_DURABILITY floor (MEDIUM SEVERITY)

Once maxDurability reaches the floor of 10, items persist indefinitely. The repair cycle becomes:
1. Repair for 100 turns (max stays at 10)
2. Fight ~91 medium encounters (4,550 turns)
3. Goto 1

There is no item destruction mechanism. Players never need to replace gear. This eliminates the entire crafting demand loop that durability should drive. In most RPGs, durability is the primary item sink that drives crafting demand.

### Issue 3: Binary broken penalty is harsh and unintuitive (LOW SEVERITY)

Going from 0.01 durability (full stats) to 0 durability (zero stats) is a massive cliff. There's no gradual degradation of stats as durability decreases. A player who misses one repair cycle loses their entire equipment bonus instantly. The 10% warning threshold helps, but the actual drop is still binary.

### Issue 4: Repair max-durability decay is uniform across rarities (MEDIUM SEVERITY)

A legendary item and a common item both lose 1-5 max durability per repair. Since legendary items are vastly harder to obtain, this creates disproportionate pain. A legendary item at the durability floor (max 10) performs identically to a common item at max 10 in terms of maintenance, but the legendary has bonus stats and is irreplaceable.

### Issue 5: No scaling of degradation with fight difficulty (LOW SEVERITY)

Fighting a tier 1 mob and a tier 5 mob causes identical per-hit degradation (0.01). Harder mobs presumably deal more damage but the durability cost is the same per hit. Only fight length affects total degradation. This means efficient players farming easy mobs in bulk pay the same durability rate as players pushing hard content.

### Issue 6: Repair cost is flat regardless of item tier/rarity (MEDIUM SEVERITY)

Repairing a common tier 1 item costs the same 100 turns as repairing a legendary tier 5 item. This makes repair feel cheap for high-end gear and expensive for low-end gear. A tier 1 player earning ~50 turns per encounter spends 2 encounters' worth of turns on repair, while a high-level player earning hundreds of turns per action barely notices.

## Recommendations

### R1: Increase COMBAT_DEGRADATION to 0.03 (from 0.01)
**Rationale:** Triples the degradation rate so a typical 15-round fight costs ~0.33 durability instead of 0.11. This means ~303 medium fights to break (from 909), making repair a meaningful part of the gameplay loop every few hundred encounters rather than every thousand. Still very manageable, but now players will actually see the durability bar move.

### R2: Remove or raise MIN_MAX_DURABILITY floor, add item destruction
**Rationale:** Change MIN_MAX_DURABILITY to 0 (or remove the floor) so items eventually break permanently. Alternatively, keep the floor but add a "destroyed" state at maxDurability = MIN_MAX_DURABILITY where the next repair attempt destroys the item. This creates the item sink that drives crafting demand. **Caveat:** this is a significant design change and should be paired with improved crafting accessibility.

### R3: Scale REPAIR_MAX_DECAY inversely with rarity
**Rationale:** Common items: decay 1-5 (current). Uncommon: 1-4. Rare: 1-3. Epic: 1-2. Legendary: always 1. This protects investment in rare items while maintaining the durability sink for common gear. Implementation is straightforward -- add a `REPAIR_MAX_DECAY_BY_RARITY` map.

### R4: Consider gradual stat reduction instead of binary broken penalty
**Rationale:** Items below 25% durability could lose 25% of their stats; below 10% lose 50%. This gives players a warning ramp instead of the cliff at 0. This is a code change in `equipmentService.ts` and purely optional -- the current binary model is simpler and more common in games.

### R5: Scale repair turn cost with item tier
**Rationale:** Tier 1 items: 50 turns. Tier 2: 75. Tier 3: 100 (current). Tier 4: 125. Tier 5: 150. This makes repair proportional to the turn economy at each tier. Broken repair could be 1.5x the tier-scaled cost as it currently is.

## Risk Level

**medium** -- The durability system functions correctly but is tuned too leniently to serve its intended purpose as a gold/turn sink and crafting demand driver. The infinite item lifespan at the durability floor is the most significant design gap, effectively removing item turnover from the economy. Addressing R1 (increase degradation) alone is low risk and high impact. R2 (item destruction) is higher risk and requires careful playtesting.
