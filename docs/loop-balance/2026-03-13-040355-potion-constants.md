# POTION_CONSTANTS Analysis

## Current Values

### HP Potions (flat heal)
| Potion | Tier | Heal Amount | Alchemy Req | Materials | Turn Cost |
|---|---|---|---|---|---|
| Minor Health Potion | 1 | 50 HP | 1 | 2x Forest Sage | 5 |
| Health Potion | 2 | 150 HP | 5 | 2x Moonpetal | 8 |
| Greater Health Potion | 3 | 400 HP | 12 | 2x Starbloom | 12 |

### HP Recovery Potions (percent heal) — ORPHANED, no items exist
| Potion | Percent Healed |
|---|---|
| Minor Recovery Potion | 25% max HP |
| Recovery Potion | 50% max HP |
| Greater Recovery Potion | 100% max HP |

### Stamina Potions
| Potion | Tier | Restore Amount | Alchemy Req | Materials | Turn Cost |
|---|---|---|---|---|---|
| Minor Stamina Potion | 1 | 30 | 1 | 2x Forest Sage | 5 |
| Stamina Potion | 2 | 60 | 8 | 3x Moonpetal | 10 |
| Greater Stamina Potion | 3 | 100 | 18 | 3x Starbloom | 15 |

### Mana Potions
| Potion | Tier | Restore Amount | Alchemy Req | Materials | Turn Cost |
|---|---|---|---|---|---|
| Minor Mana Potion | 1 | 20 | 1 | 2x Cave Moss | 5 |
| Mana Potion | 4 | 40 | 20 | 2x Shimmer Fern | 18 |
| Greater Mana Potion | 5 | 70 | 25 | 2x Abyssal Kelp | 20 |

### Buff Potions (BUFF_POTION_CONSTANTS)
| Constant | Value |
|---|---|
| ELIXIR_ATTACK_PERCENT | 0.25 (25% attack buff) |
| ELIXIR_DURATION | 5 rounds |
| RESIST_DEFENCE_BONUS | +15 defence |
| RESIST_MAGIC_DEFENCE_BONUS | +15 magic defence |
| RESIST_DURATION | 5 rounds |

### Combat Mechanics
| Constant | Value | Location |
|---|---|---|
| POTION_SICKNESS_ROUNDS | 4 rounds | COMBAT_ACTION_CONSTANTS |
| AUTO_POTION_SICKNESS_DURATION | 5 rounds | POTION_CONSTANTS (DEAD CODE) |
| USE_POTION_STAMINA | 5 stamina | COMBAT_ACTION_CONSTANTS |

## Analysis

### 1. HP Potion Scaling vs Player HP Pools

Player max HP = `BASE_HP (100) + HP_PER_VITALITY (5) * vitalityLevel`.

| Vitality Level | Max HP | Minor (50) | Health (150) | Greater (400) |
|---|---|---|---|---|
| 1 | 105 | 47.6% | 100%+ | 100%+ |
| 5 | 125 | 40.0% | 100%+ | 100%+ |
| 10 | 150 | 33.3% | 100.0% | 100%+ |
| 15 | 175 | 28.6% | 85.7% | 100%+ |
| 20 | 200 | 25.0% | 75.0% | 100%+ |
| 25 | 225 | 22.2% | 66.7% | 100%+ |
| 30 | 250 | 20.0% | 60.0% | 100%+ |
| 40 | 300 | 16.7% | 50.0% | 100%+ |
| 50 | 350 | 14.3% | 42.9% | 100%+ |

**Scaling curve:** HP potions are flat, so they become proportionally weaker as vitality grows. This is linear decay: effectiveness = `healAmount / (100 + 5*vit)`.

**Key observations:**
- Minor Health Potion falls below 25% pool restore at vitality 20 and below 15% at vitality 50 — effectively useless at higher levels
- Health Potion (150) remains meaningful (40-75% restore) for mid-game (vit 10-20) but drops to ~43% at vit 50
- Greater Health Potion (400) is always a full heal until vit 60+ (HP 400+), making it dominant for the entire current level range
- The tier gap is non-linear: Minor→Health is 3x, Health→Greater is 2.67x. This creates a "cliff" where Greater is the only viable option for combat at higher levels

### 2. Stamina Potion Scaling vs Stamina Pools

Stamina pool = `BASE_POOL (100) + POOL_PER_SKILL_LEVEL (3) * avg(melee, ranged, evasion)`.
Stamina regen/round = `BASE_REGEN_PER_ROUND (10) + REGEN_PER_SKILL_LEVEL (0.2) * avgLevel`.

| Avg Combat Skill Level | Max Stamina | Minor (30) | Standard (60) | Greater (100) | Regen/Round |
|---|---|---|---|---|---|
| 1 | 103 | 29.1% | 58.3% | 97.1% | 10.2 |
| 10 | 130 | 23.1% | 46.2% | 76.9% | 12.0 |
| 20 | 160 | 18.8% | 37.5% | 62.5% | 14.0 |
| 30 | 190 | 15.8% | 31.6% | 52.6% | 16.0 |
| 40 | 220 | 13.6% | 27.3% | 45.5% | 18.0 |
| 50 | 250 | 12.0% | 24.0% | 40.0% | 20.0 |

**Comparing potion restore to action costs:**
- Heavy Attack costs 40 stamina. A Minor Stamina Potion (30) can't even fund one Heavy Attack.
- Greater Stamina Potion (100) funds: 2.5 Heavy Attacks, or 5 Normal Attacks, or 10 Light Attacks.
- At level 30, regen is 16/round. A potion round sacrifices 16 regen + 5 stamina cost = 21 opportunity cost for 100 restore = net 79. That's ~4 rounds of regen.
- Potion sickness (4 rounds) prevents another potion for 4 rounds, during which you regen 4*16 = 64 stamina passively.

**Net value calculation at level 30 (Greater Stamina Potion):**
- Potion delivers: 100 stamina
- Opportunity cost: 1 round of regen (16) + stamina to use (5) = 21
- Net immediate gain: 79 stamina
- Sickness window: 4 rounds * 16 regen = 64 stamina passive recovery anyway
- Break-even: If you'd run out of stamina and be forced to Defend for even 1 round, the potion is worth it (saves the dead round)

### 3. Mana Potion Scaling vs Mana Pools

Mana pool = `BASE_POOL (50) + POOL_PER_MAGIC_LEVEL (3) * magicLevel`.
Mana regen/round = `BASE_REGEN_PER_ROUND (5) + REGEN_PER_MAGIC_LEVEL (0.15) * magicLevel`.

| Magic Level | Max Mana | Minor (20) | Standard (40) | Greater (70) | Regen/Round |
|---|---|---|---|---|---|
| 1 | 53 | 37.7% | 75.5% | 100%+ | 5.15 |
| 10 | 80 | 25.0% | 50.0% | 87.5% | 6.5 |
| 20 | 110 | 18.2% | 36.4% | 63.6% | 8.0 |
| 30 | 140 | 14.3% | 28.6% | 50.0% | 9.5 |
| 40 | 170 | 11.8% | 23.5% | 41.2% | 11.0 |
| 50 | 200 | 10.0% | 20.0% | 35.0% | 12.5 |

**Key problem: massive tier gap in mana potions.**
- Minor Mana Potion: Tier 1, alchemy 1
- Mana Potion: Tier **4**, alchemy **20**
- Greater Mana Potion: Tier **5**, alchemy **25**

There's no Tier 2 or Tier 3 mana potion at all. A magic user at alchemy 5-19 has access only to the Minor Mana Potion (20 restore), which is severely inadequate. Compare: HP has T1/T2/T3 coverage. Stamina has T1/T2/T3 coverage. Mana jumps from T1 straight to T4.

**Mana potion restore values are also lower than stamina equivalents:**
- Minor: 20 mana vs 30 stamina (33% less)
- Standard: 40 mana vs 60 stamina (33% less)
- Greater: 70 mana vs 100 stamina (30% less)

This is partially justified because mana pools are smaller (base 50 vs 100), but the ratios don't track proportionally. At level 30: stamina pool is 190, mana pool is 140 (mana = 73.7% of stamina). But Greater Mana restores only 70% of Greater Stamina (70 vs 100). The restore-to-pool ratio slightly penalizes mana users.

### 4. Potion Sickness Economy

Potion Sickness lasts 4 rounds (POTION_SICKNESS_ROUNDS). In a template combat system where fights last up to 100 rounds, a player can use at most `floor(100 / 5) = 20` potions (1 use round + 4 sick rounds = 5-round cycle).

In practice, fights are much shorter (typically 5-20 rounds). This means:
- 5-round fight: 1 potion max
- 10-round fight: 2 potions max
- 15-round fight: 3 potions max
- 20-round fight: 4 potions max

The sickness duration of 4 rounds means ~80% of rounds are "sick" in the optimal pattern. This is a strong gating mechanism.

**Critical: Sickness is shared across potion types.** Drinking an HP potion prevents drinking a stamina or mana potion for 4 rounds and vice versa. This creates a meaningful strategic choice but heavily penalizes multi-resource builds.

### 5. Potion Action Cost

Using a potion costs only 5 stamina (USE_POTION_STAMINA). This is the cheapest action in the game — cheaper than even Light Attack (10 stamina). Since potions consume your entire action for the round, the 5 stamina cost is essentially irrelevant and could be 0 without changing anything. The real cost is the lost attack round.

### 6. Cross-system Interaction: Buff Potions

Elixir of Power gives +25% attack for 5 rounds. With potion sickness of 4 rounds, you can rebuff on round 6 (buff expires on round 5, 1 round gap).

Resist Potion gives +15 defence AND +15 magic defence for 5 rounds. This is extremely powerful against boss encounters where mobs might deal 20-40 damage. +15 defence reduces damage by 15 per hit, potentially halving incoming damage.

**The buff cap (MAX_ACTIVE_BUFFS = 3) prevents stacking multiple buff types, but since buff duration (5) > sickness (4), you can maintain near-permanent uptime of a single buff type.**

### 7. Percentage-Based HP Potions (Dead Constants)

`MINOR_RECOVERY_PERCENT (0.25)`, `RECOVERY_PERCENT (0.5)`, `GREATER_RECOVERY_PERCENT (1.0)` are defined but:
- No items in seed data use `heal_percent` type
- No recipes produce them
- The `consumableService.ts` does handle `heal_percent` in its logic, so the code path exists but is unused

These were designed but never shipped. If implemented, the Greater Recovery Potion (100% HP) would be strictly superior to Greater Health Potion (400 flat) for any player with >400 max HP (vitality 60+). Currently this isn't reachable, but it would become relevant if the level cap increases.

## Issues Found

### 1. Dead Code: AUTO_POTION_SICKNESS_DURATION
`POTION_CONSTANTS.AUTO_POTION_SICKNESS_DURATION = 5` is defined but never imported or used anywhere in the codebase. The actual sickness duration is `COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS = 4`. This is confusing — two sickness values exist with different numbers (5 vs 4) and only one is used.

### 2. Dead Constants: Recovery Percent Potions
The three `*_RECOVERY_PERCENT` constants have no corresponding items, recipes, or drop sources. They inflate the constant file without providing value.

### 3. Mana Potion Tier Gap (T1 → T4)
Magic users have no mid-game mana potion. The jump from Minor Mana (alchemy 1, 20 restore) to Mana Potion (alchemy 20, 40 restore) skips tiers 2 and 3 entirely. By comparison, HP and stamina both have even T1/T2/T3 coverage. This forces magic users to either:
- Rely on passive mana regen (5-8/round at levels 10-20)
- Carry dozens of Minor Mana Potions
- Accept being mana-starved in mid-game

### 4. Minor Health Potion Obsolescence
At vitality 20+ (mid-game), Minor Health Potion heals 25% HP or less. A single combat round of passive HP regen (0.4 + 0.04*vit) outside combat recovers HP faster per turn than the potion is worth relative to the alchemy materials + turns spent crafting it. In combat, losing an entire attack action to heal 25% HP is rarely worth it when you could kill the mob faster and use passive out-of-combat regen.

### 5. Greater Health Potion is Always a Full Heal
With max practical HP around 250-350 (vitality 30-50), a 400 HP flat heal is always wasted unless the player is at very low HP. There's no situation where you'd want "more than Greater Health" for a long time, making it the only HP potion that matters.

### 6. Mana Potion Values Are Asymmetrically Low
Mana restore values are ~30% lower than stamina equivalents, but the cost of high-tier mana actions (30-50 mana for Chain Lightning, Meteor Strike, etc.) is proportionally higher relative to the mana pool. A Greater Mana Potion (70) barely covers one Meteor Strike (50 mana) plus a Fire Bolt (15 mana) = 65 mana. Meanwhile, a Greater Stamina Potion (100) covers a Devastating Blow (35) + Heavy Attack (40) + Light Attack (10) = 85 stamina with room to spare.

## Recommendations

### High Priority

1. **Remove dead constant `AUTO_POTION_SICKNESS_DURATION`** — it conflicts with the actual value and is never used. If a differentiated auto-potion sickness was intended, it should reference `COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS` instead.

2. **Add a Tier 2-3 Mana Potion to fill the gap.** Suggested:
   - `MINOR_MANA_RESTORE: 20` (keep, tier 1)
   - NEW: `LESSER_MANA_RESTORE: 35` — tier 2, alchemy 8, 2x Cave Moss + 1x Moonpetal
   - `MANA_RESTORE: 50` (increase from 40) — tier 3, alchemy 15
   - `GREATER_MANA_RESTORE: 80` (increase from 70) — tier 5, alchemy 25

3. **Remove or clearly mark the orphaned percent-heal constants** (`MINOR_RECOVERY_PERCENT`, `RECOVERY_PERCENT`, `GREATER_RECOVERY_PERCENT`) as planned/future. They add confusion in the current codebase.

### Medium Priority

4. **Increase Mana Potion restore values** to be proportional to pool size relative to stamina:
   - Current ratio: mana pools are ~74% of stamina pools at equal level. Mana restores are ~67-70% of stamina restores. Align them closer to 74-80%.
   - Suggested: Minor 20→25, Standard 40→50, Greater 70→80

5. **Consider reducing Greater Health Potion heal to 300** and adding a Tier 4/5 percentage-based health potion. This creates a progression:
   - T1: 50 flat (early game full heal)
   - T2: 150 flat (mid game meaningful)
   - T3: 300 flat (late game meaningful)
   - T4/5: 50-75% max HP (scales with vitality)

### Low Priority

6. **USE_POTION_STAMINA (5)** is negligible. Consider making potion use cost 0 stamina since the real cost is the lost action. This would simplify the system and reduce one more thing players need to track. Alternatively, increase it to 15-20 to create a meaningful stamina trade-off for potion use.

## Risk Level
medium — The mana potion tier gap is a real gameplay pain point for magic users in mid-game. Dead constants create maintenance confusion. The core HP/stamina potion balance is functional but has clear obsolescence issues at higher levels. No exploitable degenerate strategies exist due to the potion sickness gating mechanism.
