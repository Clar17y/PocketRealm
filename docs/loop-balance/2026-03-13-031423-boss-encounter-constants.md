# BOSS_ENCOUNTER_CONSTANTS Analysis

## Current Values

| Constant | Value | Purpose |
|---|---|---|
| `THREAT_PER_DAMAGE` | 1 | Threat generated per point of damage dealt |
| `THREAT_PER_HEAL` | 0.5 | Threat generated per point of healing done |
| `TAUNT_THREAT_BONUS` | 500 | Flat threat added when taunt is activated |
| `TAUNT_DEFAULT_DURATION` | 2 | Taunt duration in rounds |
| `CONTRIBUTION_DAMAGE_WEIGHT` | 1.0 | Loot contribution score weight for damage |
| `CONTRIBUTION_HEALING_WEIGHT` | 1.0 | Loot contribution score weight for healing |
| `CONTRIBUTION_ABSORB_WEIGHT` | 0.9 | Loot contribution score weight for damage absorbed |
| `CONTRIBUTION_SURVIVAL_FLAT_BONUS` | 10 | Flat contribution score per round survived |

**Related constants from WORLD_EVENT_CONSTANTS (boss-specific):**

| Constant | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| `BOSS_HP_PER_PLAYER_BY_TIER` | 200 | 500 | 1,000 | 2,000 | 4,000 |
| `BOSS_SINGLE_TARGET_DAMAGE_BY_TIER` | 30 | 60 | 100 | 160 | 250 |
| `BOSS_AOE_PER_PLAYER_BY_TIER` | 15 | 30 | 50 | 80 | 120 |
| `BOSS_DEFENCE_BY_TIER` | 5 | 12 | 20 | 35 | 50 |
| `BOSS_SIGNUP_TURN_COST` | 200 | - | - | - | - |
| `BOSS_ROUND_INTERVAL_MINUTES` | 5 | - | - | - | - |
| `BOSS_INITIAL_WAIT_MINUTES` | 15 | - | - | - | - |

## Analysis

### 1. Threat System Scaling

The threat model is linear: `threat = damage * 1 + healing * 0.5`.

**Taunt breakpoint analysis:**

Taunt adds a flat +500 threat bonus. This creates a hard question: how much damage must a DPS deal before they *rip aggro* from a taunting tank?

If the tank taunts on round 1, their threat = 500. A DPS needs >500 cumulative damage to overtake. But while taunt is active (2 rounds), the `getSingleTarget` function *always* prefers taunters regardless of threat ranking (among taunters, highest threat wins). So aggro rip during taunt is impossible -- only after taunt expires (and -500 threat is subtracted) can the DPS pull.

After taunt expires, the tank's base threat is whatever damage they dealt. Typical tank damage is low (they use taunt/defend actions), so the window for DPS pulling aggro is *immediately* after taunt drops.

**Healer threat problem:**

At `THREAT_PER_HEAL = 0.5`, a healer healing 200 HP/round generates 100 threat/round. After 5 rounds that is 500 threat. Meanwhile a DPS dealing 150 damage/round accumulates 750 threat. The healer will never naturally pull aggro from a DPS, which is correct behavior -- but a healer could exceed a tank who only taunts and defends.

Consider: a tank who taunts every other round (taunt, defend, taunt, defend...) gets +500 on taunt rounds, then -500 when it expires. Their *base* threat comes only from rounds where they deal damage. If the tank deals 0 damage (pure taunt/defend rotation), their persistent threat stays at 0. A healer healing 200/round accumulates 100/round of persistent threat. After 6 rounds the healer has 600 persistent threat. The next time taunt expires, the healer has more base threat than the tank.

This is a potential issue: **pure-tank players who never deal damage will lose aggro to healers over long fights**.

### 2. Boss HP Scaling Curve

Boss HP per player by tier: 200, 500, 1000, 2000, 4000.

The growth rate between tiers:
- T1 -> T2: 2.5x
- T2 -> T3: 2.0x
- T3 -> T4: 2.0x
- T4 -> T5: 2.0x

This is approximately exponential: `HP = 200 * 2^(tier-1)` with the T1->T2 jump being steeper. More precisely the curve is roughly `200 * 2.5^(tier-1)` for tier 1, then `500 * 2^(tier-2)` for tiers 2-5.

Boss HP is rescaled each round based on current participant count. With 5 players at tier 5, total boss HP = 20,000. With 10 players, it is 40,000.

**How many rounds to kill a boss?**

Player damage per round depends on skill level and gear. Consider a mid-game player (level 30 skills, ~20 damage min, ~30 damage max, so average 25 raw). After boss defence reduction:

Defence reduction formula: `reduction = defence / (defence + 100)`

| Tier | Boss Defence | Reduction % | Net Damage (from 25 raw) |
|---|---|---|---|
| 1 | 5 | 4.8% | 23 |
| 2 | 12 | 10.7% | 22 |
| 3 | 20 | 16.7% | 20 |
| 4 | 35 | 25.9% | 18 |
| 5 | 50 | 33.3% | 16 |

For a 5-player group, assuming 3 DPS, 1 tank, 1 healer, and DPS each deal ~18 damage (tier 5):

Total DPS per round: 3 * 18 = 54 (assumes all hit -- hit rate at pve_boss curve with minHitChance 0.35 is generous)

Boss HP with 5 players at tier 5: 20,000

Rounds to kill: 20,000 / 54 = **370 rounds**

At 5 minutes per round, that is **30.8 hours of real time**. At 200 turns per signup per round, each player spends 200 * 370 = **74,000 turns** (20.5 hours of turn regen).

This is extremely long. Even with level 50 players dealing double damage (36 net per DPS), that is 108 per round, 185 rounds, 15.4 hours real time, 37,000 turns per player.

**However**, the damage values in the constant `BOSS_SINGLE_TARGET_DAMAGE_BY_TIER` are defined but never directly used by the engine code. The actual boss damage comes from the `mobTemplate` stats stored in the database (`damageMin`, `damageMax`), which are loaded at encounter resolution time. The `BOSS_SINGLE_TARGET_DAMAGE_BY_TIER` array appears to be a *design reference* or unused constant. This should be verified -- it may be intended for future use or as seed-data guidance.

### 3. Boss Damage vs Player Survivability

Player HP formula: `100 + vitality * 5 + equipment_bonus`

| Vitality Level | HP (no gear) | HP (est. +50 gear) |
|---|---|---|
| 1 | 105 | 155 |
| 10 | 150 | 200 |
| 20 | 200 | 250 |
| 30 | 250 | 300 |
| 50 | 350 | 400 |

Boss single-target damage comes from mob template damageMin/damageMax, modified by action multiplier. For the Stone Colossus template, most attacks use 1.0x, the earthquake uses 2.0x, and boss_impale uses 4.0x.

If a tier 5 mob template has damageMin=40, damageMax=60 (average 50), and the player has 30 defence:

- Defence reduction: 30/(30+100) = 23.1%
- Normal attack: 50 * 0.769 = 38 damage. Player with 300 HP survives 7-8 rounds.
- Earthquake (2.0x): 100 * 0.769 = 76 damage. Survivable but painful.
- Impale (4.0x): 200 * 0.769 = 153 damage. Over half a tank's HP in one hit.
- Execution Strike (5.0x): 250 * 0.769 = 192 damage. Can one-shot low-vitality players.

The 5.0x multiplier on Execution Strike with high-tier bosses is potentially a one-shot mechanic. Whether this is intentional depends on design intent, but players *can* counter it using the `counter` action (blocks physical damage entirely).

### 4. Contribution Score and Loot Distribution

The contribution formula:
```
score = damage * 1.0 + healing * 1.0 + absorbed * 0.9 + rounds * 10
```

Loot distribution uses:
```
ratio = playerScore / totalContribution
dropMultiplier = clamp(ratio * numContributors, 0.5, 2.0)
xpMultiplier = clamp(ratio * numContributors, 0.5, 2.0)
```

For an equal 5-player group, each player's ratio = 0.2, so `dropMultiplier = 0.2 * 5 = 1.0` -- fair.

**Degenerate strategy: free-rider problem**

A player who signs up, does nothing (defends every round), and survives for many rounds gets 10 contribution per round from `CONTRIBUTION_SURVIVAL_FLAT_BONUS`. Over a 50-round fight, that is 500 score from survival alone.

Compare to a DPS dealing 150 damage/round for 50 rounds = 7,500 score. The free-rider gets 500/7500 = 6.7% of the DPS player's score. With the 0.5 floor on `dropMultiplier`, this means the free-rider still gets 50% of normal loot drops and 50% of normal XP rewards while contributing nothing meaningful.

With a 5-player group where one is free-riding:
- 3 DPS: ~7,500 each = 22,500 total
- 1 Tank: ~3,000 (low damage, high absorb) = 3,000
- 1 Free-rider: 500

Total = 26,000. Free-rider ratio = 500/26,000 = 1.92%. dropMultiplier = max(0.5, 0.0192 * 5) = max(0.5, 0.096) = **0.5**.

The 0.5 floor means free-riders always get at minimum 50% of standard loot. For a system designed around multi-player coordination, this is generous.

### 5. Taunt Duration Economics

`TAUNT_DEFAULT_DURATION = 2` means taunt lasts for the current round plus 1 additional round (tick at end of round).

Since bosses attack *after* players act, a taunt on round N protects the group for rounds N and N+1 boss attacks. The tank must re-taunt on round N+2 at the latest. This creates a 2-round cycle: taunt, free action, taunt, free action...

The tank's template would optimally be: [taunt, defend/attack, taunt, defend/attack, ...]. This gives the tank every other round to contribute damage or use a defensive ability.

With the current system, a single tank can permanently hold aggro. There is no mechanic for threat decay, so multiple taunters can chain taunts indefinitely. With `TAUNT_DEFAULT_DURATION = 2` and the bonus being removed on expiry, there is no "threat inflation" from repeated taunts -- this is clean.

### 6. Absorb Weight Imbalance

`CONTRIBUTION_ABSORB_WEIGHT = 0.9` vs `CONTRIBUTION_DAMAGE_WEIGHT = 1.0`.

Damage absorbed only accrues to the *current aggro holder* (the player being targeted by single-target attacks). In AoE rounds, nobody gets absorb credit because the code only credits absorb when `targetId === currentAggroHolder`.

This means tanks only get absorb credit on single-target rounds. If a boss has a rotation like Stone Colossus (7 single-target out of 12 rounds = 58%), the tank only gets absorb credit 58% of the time. On AoE rounds, the tank takes damage but gets no absorb credit.

For a tank taking 50 damage/round across 50 rounds, only ~29 rounds credit absorb:
- Absorb score: 50 * 29 * 0.9 = 1,305
- Survival score: 50 * 10 = 500
- Total tank score: ~1,805

Compare to a DPS with 150 damage/round for 50 rounds: 7,500.

Tank gets 1,805 / 7,500 = 24% of DPS score. With the contribution system, this leads to significantly worse loot for tanks.

### 7. Turn Cost Economy

Boss signup costs 200 turns per round. At 1 turn/second regen rate and 64,800 bank cap:

- One signup = 200 seconds (3.3 minutes) of turn regen
- A 50-round fight = 10,000 turns = 2.78 hours of regen
- Bank cap allows 324 consecutive signups before running out

This seems reasonable. But combined with the 5-minute round interval, a 50-round fight takes 250 minutes (4.17 hours) of real time while only costing 10,000 turns. The turns-to-real-time ratio is very favorable for bosses.

## Issues Found

### Issue 1: Pure tanks lose aggro to healers over long fights (Medium)
A tank using only taunt/defend generates 0 persistent threat. Taunt bonus is temporary. After enough rounds, healer threat from `THREAT_PER_HEAL = 0.5` accumulates past the tank's base. The tank must deal some damage to maintain aggro between taunts.

### Issue 2: Free-rider floor at 50% loot is generous (Low)
The `max(0.5, ratio * N)` floor in `distributeBossLoot` means any participant who merely survives gets at least half of normal loot. For coordinated groups this is rarely an issue, but in open-world boss encounters with strangers, this incentivizes minimal effort.

### Issue 3: Tank contribution score is structurally low (Medium)
Absorb credit is only granted on single-target boss rounds when the player is the aggro holder. AoE damage taken by the tank generates zero absorb credit. Combined with low damage from defensive actions, tanks receive disproportionately worse loot than DPS players.

### Issue 4: BOSS_SINGLE_TARGET_DAMAGE_BY_TIER appears unused (Low)
The constant is defined in BOSS_ENCOUNTER_CONSTANTS but the actual boss damage comes from mob template database stats. This constant may be stale documentation or intended for future scaling -- either way it creates confusion.

### Issue 5: Tier 5 boss fights may be extremely long (Medium)
With 4,000 HP per player and boss defence at 50 (33% reduction), 5-player groups could face 200+ round fights lasting over 16 hours of real time. The per-round scaling is sound, but the absolute numbers at tier 5 may exceed practical play session lengths.

## Recommendations

### R1: Add passive threat generation for tanks
Add a small passive threat bonus (e.g., 20-50) per round for the current aggro holder. This prevents healers from overtaking pure tanks. Alternatively, change `TAUNT_THREAT_BONUS` to leave a residual amount (e.g., 100) on expiry instead of removing the full 500.

### R2: Lower the free-rider floor
Change the minimum `dropMultiplier` from 0.5 to 0.25. This still prevents zero-loot outcomes but reduces the incentive to free-ride:
```
dropMultiplier = max(0.25, ratio * contributors.length)
```

### R3: Credit absorb on all damage taken by aggro holder, including AoE
In `bossRoundResolver.ts`, the absorb credit check `if (targetId === currentAggroHolder)` should apply regardless of target mode. If the aggro holder takes AoE damage, they are still fulfilling their tanking role. This would approximately double tank contribution scores.

### R4: Deprecate or use BOSS_SINGLE_TARGET_DAMAGE_BY_TIER
Either wire it into mob template generation during seeding (so boss damage actually scales by tier via this constant) or remove it to avoid confusion. If kept as a reference, add a comment marking it as such.

### R5: Consider reducing tier 5 HP scaling
Changing `BOSS_HP_PER_PLAYER_BY_TIER[4]` from 4,000 to 3,000 would reduce tier 5 fight lengths by 25%. Alternatively, boss encounters could have a soft-enrage mechanic (boss damage increases after N rounds) to create a natural time pressure rather than relying on raw HP pools.

## Risk Level

**medium** -- The threat system has a structural gap where pure tanks lose aggro to healers, and the contribution scoring systematically undervalues tanks. These issues do not break the system but create fairness problems in group dynamics that could discourage tank/healer play. The tier 5 fight length concern is situational but could create severe player experience problems for endgame content.
