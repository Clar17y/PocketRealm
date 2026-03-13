# COMBAT_CONSTANTS Analysis

Covers `COMBAT_CONSTANTS`, `HIT_CURVE_CONSTANTS`, `COMBAT_ACTION_CONSTANTS`, and the defence reduction formula. These form the core combat resolution loop.

## Current Values

### COMBAT_CONSTANTS
| Constant | Value |
|---|---|
| BASE_HIT_CHANCE | 0.70 |
| CRIT_CHANCE | 0.05 |
| CRIT_MULTIPLIER | 1.50 |
| MIN_DAMAGE | 1 |
| RESOURCE_XP_WEIGHT | 0.50 |
| ENCOUNTER_TURN_COST | 50 |

### HIT_CURVE_CONSTANTS
| Mode | minHitChance | maxHitChance | bias | exponent |
|---|---|---|---|---|
| pvp | 0.10 | 0.95 | 5 | 2.4 |
| pve_open_world | 0.25 | 0.95 | 10 | 1.5 |
| pve_expedition | 0.20 | 0.95 | 8 | 1.8 |
| pve_boss | 0.35 | 0.98 | 12 | 1.35 |

### COMBAT_ACTION_CONSTANTS (key entries)
| Action | Stamina | Mana |
|---|---|---|
| Light Attack | 10 | 0 |
| Normal Attack | 20 | 0 |
| Heavy Attack | 40 | 0 |
| Defend | 0 | 0 |
| Counter | 35 | 0 |
| Ward | 0 | 30 |
| Use Potion | 5 | 0 |
| Power Strike | 15 | 0 |
| Titan's Wrath | 50 | 0 |
| Meteor Strike | 0 | 50 |

Action damage multipliers (from combatActionDefinitions.ts):
- Light Attack: 0.6x
- Normal Attack: 1.0x
- Heavy Attack: 1.5x (channeling)

### Defence Reduction Formula
```
reduction = defence / (defence + 100)
```

## Analysis

### 1. Hit Curve Mathematics

The hit chance formula is:

```
normalized = 1 / (1 + ((avoidScore + bias) / hitScore) ^ exponent)
hitChance  = clamp(normalized, minHitChance, maxHitChance)
```

This is a sigmoid-like curve with the inflection point at `hitScore = avoidScore + bias`.

**PvE Open World (exponent=1.5, bias=10):**

| hitScore | avoidScore | raw normalized | clamped |
|---|---|---|---|
| 5 | 5 | 0.129 | 0.25 (floor) |
| 10 | 5 | 0.268 | 0.268 |
| 15 | 5 | 0.414 | 0.414 |
| 20 | 5 | 0.540 | 0.540 |
| 30 | 5 | 0.712 | 0.712 |
| 50 | 5 | 0.864 | 0.864 |
| 50 | 30 | 0.460 | 0.460 |
| 50 | 50 | 0.274 | 0.274 |
| 100 | 50 | 0.612 | 0.612 |

The bias of 10 means even at 0 avoidScore, you need hitScore > 10 to break 50% hit chance. This acts as a soft floor on difficulty.

**PvP (exponent=2.4, bias=5):**

The steeper exponent (2.4 vs 1.5) makes accuracy vs evasion much more decisive. Small advantages snowball:

| hitScore | avoidScore | hitChance |
|---|---|---|
| 20 | 20 | 0.296 |
| 25 | 20 | 0.466 |
| 30 | 20 | 0.614 |
| 30 | 30 | 0.286 |
| 40 | 20 | 0.813 |
| 50 | 50 | 0.194 |

Going from 30 accuracy vs 20 evasion to 40 accuracy vs 20 evasion jumps from 61.4% to 81.3%. That +10 accuracy swing is disproportionately powerful.

**PvE Boss (exponent=1.35, bias=12):**

The flattest curve. The high bias (12) and low exponent make hit chance relatively generous and stable. Even at hitScore=30 vs avoidScore=50, you get the floor of 35%. This prevents boss fights from feeling hopeless for undergeared players.

### 2. Defence Reduction Curve

Formula: `reduction = d / (d + 100)`

This is a standard diminishing returns hyperbola:

| Defence | Reduction | Effective HP multiplier |
|---|---|---|
| 0 | 0.00% | 1.00x |
| 10 | 9.09% | 1.10x |
| 25 | 20.00% | 1.25x |
| 50 | 33.33% | 1.50x |
| 100 | 50.00% | 2.00x |
| 200 | 66.67% | 3.00x |
| 300 | 75.00% | 4.00x |
| 500 | 83.33% | 6.00x |

The effective HP multiplier is `1 / (1 - reduction) = (d + 100) / 100`.

Each point of defence is worth: `100 / (d + 100)^2` additional reduction. At 0 defence, each point gives 0.01 (1%) reduction. At 100 defence, each additional point gives 0.0025 (0.25%).

**The constant 100 in the denominator is the single most important hidden constant in the combat system.** It is hardcoded in `damageCalculator.ts` line 155, not exposed in `gameConstants.ts`.

### 3. Damage Scaling Curve

Player damage formula:
```
totalAttack = skillLevel + weaponPower + attributeBonus
damageMin = 1 + floor(totalAttack / 5)
damageMax = 5 + floor(totalAttack / 2)
```

Average damage (before multipliers): `(damageMin + damageMax) / 2 = 3 + 0.35 * totalAttack`

For a mid-game player (skill 30, weapon 20, attribute 15 => totalAttack = 65):
- damageMin = 14, damageMax = 37, avg = 25.5
- With Normal Attack (1.0x): 25.5 avg
- With Heavy Attack (1.5x): 38.25 avg

For a late-game player (skill 80, weapon 50, attribute 40 => totalAttack = 170):
- damageMin = 35, damageMax = 90, avg = 62.5
- With Normal Attack: 62.5 avg
- With Heavy Attack: 93.75 avg

Damage scales linearly with totalAttack (slope 0.35 on average). This is clean and predictable.

### 4. Crit System

Total crit chance = `CRIT_CHANCE (0.05) + equipment bonusCritChance`

Equipment crit ranges from `CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS`:
- critChance: 0.03 to 0.05 per piece
- critDamage: 0.10 to 0.20 per piece

Slots that can roll critChance: gloves (primary), ring (primary), charm (primary). That's 3 slots.

Maximum possible critChance from equipment: 3 * 0.05 = 0.15
Total with base: 0.05 + 0.15 = 0.20 (20%)

Maximum possible critDamage from equipment: 3 * 0.20 = 0.60
Total multiplier: 1.50 + 0.60 = 2.10x

Expected damage increase from max crit: `0.20 * 2.10 + 0.80 * 1.0 = 1.22x` (22% increase)
Expected damage increase from base crit: `0.05 * 1.50 + 0.95 * 1.0 = 1.025x` (2.5% increase)

The jump from base (2.5%) to max-geared (22%) is large. Crit stacking is the strongest single multiplicative scaling factor available.

### 5. Resource Economy in Combat (Stamina/Mana)

Stamina pool: `100 + avg(melee, ranged, evasion) * 3`
Stamina regen/round: `10 + avg * 0.2`

For a level-50 player (avg 50): pool = 250, regen = 20/round
For a level-100 player (avg 100): pool = 400, regen = 30/round

**Rounds until exhaustion by action type (level 50, pool=250, regen=20):**

Net cost per round = action cost - regen per round.

| Action | Cost | Net Cost | Rounds to exhaust |
|---|---|---|---|
| Light Attack | 10 | -10 (net gain) | never |
| Normal Attack | 20 | 0 (neutral) | never |
| Heavy Attack | 40 | 20 | 12.5 |
| Counter | 35 | 15 | 16.7 |
| Titan's Wrath | 50 | 30 | 8.3 |

Light Attack is stamina-positive: you can sustain it indefinitely while regenerating stamina. Normal Attack is exactly stamina-neutral at level 50 (cost 20 = regen 20).

At level 100 (regen=30), Normal Attack becomes stamina-positive by +10/round. Heavy Attack is only net -10/round => 40 rounds to exhaust. This means high-level players can spam Heavy Attack almost indefinitely.

**Mana pool (level 50 magic):** `50 + 50 * 3 = 200`, regen = `5 + 50 * 0.15 = 12.5`

| Spell | Cost | Net Cost | Rounds to exhaust |
|---|---|---|---|
| Fire Bolt | 15 mana | 2.5 | 80 |
| Frost Nova | 20 mana | 7.5 | 26.7 |
| Chain Lightning | 30 mana | 17.5 | 11.4 |
| Meteor Strike | 50 mana | 37.5 | 5.3 |

Magic users exhaust mana faster than physical users exhaust stamina because mana regen scales more slowly (0.15/level vs 0.20/level) and the base regen is half (5 vs 10).

### 6. Action Economy: Damage per Stamina

This determines the optimal action choice:

| Action | Damage Mult | Stamina Cost | Damage/Stamina |
|---|---|---|---|
| Light Attack | 0.6x | 10 | 0.060 per stamina |
| Normal Attack | 1.0x | 20 | 0.050 per stamina |
| Heavy Attack | 1.5x | 40 | 0.0375 per stamina |

**Light Attack is the most stamina-efficient by a significant margin** (20% more efficient than Normal Attack, 60% more than Heavy Attack). However, it deals less total damage per round.

In a sustained fight where you won't exhaust stamina, damage per round matters more than damage per stamina. But in fights that drain resources, Light Attack spam becomes optimal.

### 7. ENCOUNTER_TURN_COST Analysis

50 turns per encounter. The turn bank cap is 64,800 (18 hours of regen). This means:
- Maximum encounters from a full bank: 1,296
- Encounters per hour of regen: 72

Combined with exploration (10-10,000 turns to find encounters), the actual combat rate depends heavily on exploration investment. At minimum exploration (10 turns), each combat cycle costs 60 turns => 1,080 combats/full bank. At typical exploration (100 turns), each cycle costs 150 turns => 432 combats.

### 8. XP Splitting (RESOURCE_XP_WEIGHT)

The contribution formula: `contribution[skill] = damage[skill] + resourceCost[skill] * 0.5`

This means a player using mixed attacks gets XP split proportionally. The 0.5 weight on resources means damage dealt matters twice as much as resources spent for determining XP distribution. This seems reasonable -- it prevents a player from gaming XP by using expensive but weak off-stat abilities.

## Issues Found

### Issue 1: Defence Constant Hardcoded (Medium Severity)

The defence formula constant `100` is hardcoded at `damageCalculator.ts:155`:
```ts
return safeDefence / (safeDefence + 100);
```

This should be a named constant in `COMBAT_CONSTANTS` (e.g., `DEFENCE_SCALING_FACTOR: 100`) for consistency with the project's centralized-constants philosophy.

### Issue 2: Heavy Attack is Strictly Dominated in Long Fights (Low Severity)

Heavy Attack (1.5x, 40 stamina, channeling) is worse than Normal Attack (1.0x, 20 stamina) in sustained DPS if you factor in the channeling vulnerability (opponent gets 1.5x bonus). The opponent's bonus on Heavy Attack is the same magnitude as your own damage increase but applies to THEIR damage, which could be much higher than yours.

Against a mob using normal attacks dealing avg 25 damage:
- You use Heavy Attack: you deal 1.5x your damage, mob deals 1.5x * 25 = 37.5
- You use Normal Attack: you deal 1.0x your damage, mob deals 1.0x * 25 = 25

The damage you take increases by 12.5, while your damage increases by 0.5x your average. If your average damage is < 25, Heavy Attack is a net loss in HP terms. This is working as intended (risk/reward tradeoff), but could trap uninformed players.

### Issue 3: PvP Hit Curve Extreme Sensitivity (Medium Severity)

The PvP exponent of 2.4 creates a very steep accuracy-vs-evasion curve. A 10-point accuracy advantage against a 20-evasion opponent swings hit chance from ~47% to ~81%. This means PvP matchups are heavily determined by the accuracy/evasion stat spread rather than tactical template choices.

Concrete example at equal gear level:
- Player A (accuracy 30 vs evasion 20): 61.4% hit, 28.6% to be hit => net 32.8% advantage
- Player B (accuracy 30 vs evasion 30): 28.6% hit both ways => coin flip
- A small stat investment in evasion creates outsized defensive value.

### Issue 4: Light Attack as Infinite Sustain (Low Severity)

Light Attack costs 10 stamina, and at level 50 regen is 20/round. This means Light Attack is always stamina-positive. A player with a "Light Attack + Counter" rotation can sustain indefinitely:
- Round 1: Light Attack (cost 10, regen 20, net +10)
- Round 2: Counter (cost 35, regen 20, net -15)
- Net per 2 rounds: -5 stamina from pool of 250 => 100 rounds before exhaustion

With this rotation, you deal 0.6x damage every other round (avg 0.3x per round) while being immune to physical attacks 50% of rounds. Against pure-physical mobs, this is an extremely safe but slow grind. The MAX_ROUNDS cap of 100 prevents this from being infinite, but 50 rounds of Light Attack + 50 rounds of Counter could time out many fights.

### Issue 5: Crit Stacking Creates Gear Gap (Low Severity)

A fully crit-stacked player (20% chance, 2.1x multiplier) deals 22% more damage on average than base. Combined with accuracy advantages from the same gear, this creates a compounding gap. However, the crit slots (gloves, ring, charm) compete with other valuable stats (accuracy, dodge, luck), so there is an opportunity cost. This is likely balanced in practice.

### Issue 6: Boss Hit Floor Too Generous? (Low Severity)

The pve_boss minHitChance of 35% combined with the flat exponent (1.35) means even severely underleveled players maintain a high hit rate against bosses. Since bosses are group content with contribution-based loot, this may incentivize undergeared leeching. However, the contribution system (damage-weighted) naturally mitigates this since low-hit players deal less total damage.

## Recommendations

### R1: Extract Defence Scaling Constant
Move the hardcoded `100` in `calculateDefenceReduction` to `COMBAT_CONSTANTS.DEFENCE_SCALING_FACTOR`. No gameplay change; purely a maintainability improvement.

### R2: No Changes to Hit Curves
The hit curves are well-designed with distinct personalities per mode. The PvP steepness (Issue 3) is a design choice that rewards stat investment. If PvP feels too stat-determined in practice, reducing the exponent from 2.4 to 2.0 would soften the curve without fundamentally changing it.

### R3: No Changes to Action Costs
The Light Attack sustain (Issue 4) is a valid slow-and-safe strategy that's naturally penalized by the 100-round cap and low DPS. The action economy creates real tradeoffs: efficiency vs throughput, safety vs speed.

### R4: Consider Channeling Bonus Reduction (Optional)
The `CHANNELING_BONUS_DAMAGE: 1.5` multiplier for attacking channeling targets makes Heavy Attack risky against smart opponents. If data shows Heavy Attack is underused, reducing this to 1.3 would make it less punishing while preserving the counterplay. No strong recommendation here -- 1.5 creates interesting tactical decisions.

## Risk Level

**low** -- The combat constants are well-balanced with clear design intent. The hit curve system is elegant with good separation between modes. The main finding (Issue 1) is a code quality concern, not a balance issue. The potential PvP steepness concern (Issue 3) needs player data to evaluate but the floor/ceiling clamps prevent degenerate outcomes.
