# CHARACTER_CONSTANTS Analysis

Covers `CHARACTER_CONSTANTS` and its role as the bridge between character progression (XP, leveling, attribute points) and combat effectiveness (damage, accuracy, initiative).

## Current Values

| Constant | Value | Unit |
|---|---|---|
| XP_RATIO | 0.3 | fraction of skill XP converted to character XP |
| MAX_LEVEL | 100 | character level cap |
| MELEE_DAMAGE_PER_STRENGTH | 1 | damage bonus per strength point |
| RANGED_DAMAGE_PER_DEXTERITY | 1 | damage bonus per dexterity point |
| MAGIC_DAMAGE_PER_INTELLIGENCE | 1 | damage bonus per intelligence point |
| ACCURACY_PER_STRENGTH | 1 | hit score per strength (melee) |
| ACCURACY_PER_DEXTERITY | 1 | hit score per dexterity (ranged) |
| ACCURACY_PER_INTELLIGENCE | 1 | hit score per intelligence (magic) |
| EVASION_TO_SPEED_DIVISOR | 10 | evasion points per 1 speed (initiative) |

## Character XP Pipeline

Character XP is a derivative of skill XP:

```
rawSkillXp -> efficiency filter -> skillXpAfterEfficiency
characterXpGain = floor(skillXpAfterEfficiency * 0.3)
```

Character XP uses the **same level curve** as skills: `xpForLevel(level) = floor(XP_BASE * level^XP_EXPONENT) = floor(100 * level^1.8)`.

### XP Required at Key Levels

| Level | XP Required (cumulative) | Skill XP Needed (at full efficiency) |
|---|---|---|
| 2 | 348 | 1,160 |
| 10 | 6,310 | 21,033 |
| 20 | 21,929 | 73,097 |
| 50 | 111,748 | 372,493 |
| 100 | 398,107 | 1,327,023 |

The "Skill XP Needed" column divides by 0.3 to show how much raw skill XP (after efficiency) must flow through to reach each character level. Since players earn skill XP across multiple skills simultaneously, character XP accumulates from all skill activity. A player training 3 skills equally needs only ~1/3 of the per-skill XP threshold.

### Effective Character XP Rate

With SKILL_CONSTANTS in mind:
- Combat skill window cap: 14,000/day (7,000 per 12h window)
- Gathering/processing/crafting cap: 30,000/day each

At full efficiency across all skill types, a maximally active player earns:
```
maxDailySkillXp = 14,000 * 7 combat skills + 30,000 * 7 non-combat skills
               = 98,000 + 210,000 = 308,000 skill XP/day (theoretical max)

maxDailyCharacterXp = floor(308,000 * 0.3) = 92,400/day
```

In practice, efficiency decays quadratically (`efficiency = max(0, 1 - (xp/cap)^2)`), so actual yield is roughly 60-70% of the theoretical cap. Realistic estimate: ~55,000-65,000 character XP/day for a very active player.

### Days to Character Level (Realistic Active Player)

Using ~60,000 character XP/day:

| Level | Cumulative XP | Days |
|---|---|---|
| 10 | 6,310 | <1 |
| 20 | 21,929 | <1 |
| 50 | 111,748 | ~2 |
| 75 | 237,416 | ~4 |
| 100 | 398,107 | ~7 |

Character level 100 is achievable in roughly a week of very active play. Since character levels gate attribute points (the primary power progression), this means the attribute system matures quickly. The XP_RATIO of 0.3 ensures character leveling outpaces any individual skill, which is correct -- character level represents overall progression.

## Attribute Point Budget

Players start at character level 1 with 0 attribute points. Each level-up grants 1 attribute point. Achievements can grant bonus attribute points via `{ increment: reward.amount }`.

**Base budget:** 99 points (levels 2-100), distributed across 6 attributes:
- **Vitality** -- HP pool and regen (via HP_CONSTANTS)
- **Strength** -- melee damage + melee accuracy
- **Dexterity** -- ranged damage + ranged accuracy
- **Intelligence** -- magic damage + magic accuracy
- **Luck** -- crit chance, crafting crit, gem crit, forge success, rarity
- **Evasion** -- speed (initiative) + dodge component + flee chance

With 99 points across 6 attributes, the average allocation is ~16.5 per attribute if spread evenly. In practice, players specialize: a melee build might run 20 strength / 20 vitality / 15 evasion / 15 luck / remainder elsewhere.

## Damage Scaling Analysis

The core damage formula from `damageCalculator.ts`:

```
totalAttack = skillLevel + weaponPower + (attribute * DAMAGE_PER_ATTRIBUTE)

damageMin = 1 + floor(totalAttack / 5)
damageMax = 5 + floor(totalAttack / 2)
```

Since all three DAMAGE_PER_ATTRIBUTE constants equal 1, each attribute point adds exactly 1 to `totalAttack`, identical to 1 skill level or 1 weapon power point.

### Relative Contribution of Each Source

At different progression stages (assuming melee with strength):

| Stage | Skill Level | Weapon Power | Strength | totalAttack | Attr % |
|---|---|---|---|---|---|
| Early (lv10) | 10 | 5 | 5 | 20 | 25% |
| Mid (lv30) | 30 | 20 | 15 | 65 | 23% |
| Late (lv60) | 60 | 45 | 25 | 130 | 19% |
| Endgame (lv100) | 100 | 80 | 30 | 210 | 14% |

Attribute points contribute a declining share of totalAttack as skill levels and weapon power grow. This is because attributes are capped at ~30 points (realistic endgame allocation), while skill level goes to 100 and weapon power scales with tier. Attributes are meaningful in early-mid game (~25%) and become a secondary modifier in endgame (~14%).

### Damage Per Attribute Point

```
deltaDamageMin per attribute = floor((totalAttack + 1) / 5) - floor(totalAttack / 5)
deltaDamageMax per attribute = floor((totalAttack + 1) / 2) - floor(totalAttack / 2)
```

Due to the floor operations, the marginal damage gain per point is:
- **damageMin:** +1 every 5 attribute points (0.2 avg per point)
- **damageMax:** +1 every 2 attribute points (0.5 avg per point)

Average expected damage per round = `(damageMin + damageMax) / 2`, so marginal average damage per attribute point = `(0.2 + 0.5) / 2 = 0.35` damage per point, before hit chance and crit.

At a typical mid-game hit chance of ~70%, the effective damage per attribute point is about 0.245 per round. This is modest, which is correct -- attributes are one of many scaling vectors.

## Accuracy Scaling Analysis

```
accuracy = floor(skillLevel / 2) + equipmentAccuracy + (attribute * ACCURACY_PER_ATTRIBUTE)
```

Each attribute point adds 1 to the hit score, same as 2 skill levels. At mid-game with skillLevel=30 and 15 attribute points:

```
accuracy = 15 + equipAccuracy + 15
```

The attribute contributes equally to the skill-level component. This means accuracy from attributes is **proportionally more impactful** than damage from attributes, because `floor(skillLevel/2)` halves the skill contribution while attributes contribute 1:1.

### Accuracy vs Damage: Opportunity Cost

A player investing 1 attribute point gets both +1 damage bonus AND +1 accuracy from the same attribute (strength for melee, etc.). There is no split -- the attribute double-dips. This makes the combat attributes (STR/DEX/INT) efficient for their respective style.

However, vitality, luck, and evasion provide **zero** direct damage and **zero** direct accuracy. The opportunity cost of 1 point in vitality is:
- -1 damage bonus to totalAttack
- -1 accuracy
- +5 HP and +0.04 HP/sec regen

This tradeoff is well-balanced: 1 point of raw damage is ~0.35 average damage per round, while 5 HP is ~2.5% of a base 200 HP pool at mid-game. Survival and damage have different value curves depending on content.

## Evasion-to-Speed Conversion

```
speed = floor(evasion / 10)
initiative = d20 + speed
```

Evasion is the most unusual attribute because it serves three purposes:
1. **Speed/initiative** via `floor(evasion / EVASION_TO_SPEED_DIVISOR)` -- determines turn order
2. **Avoid score** via `avoidScore = dodge + evasion` -- reduces enemy hit chance
3. **Flee chance** via `FLEE_CONSTANTS` -- scales escape probability

### Speed Scaling

| Evasion | Speed | Initiative Range (d20 + speed) |
|---|---|---|
| 0 | 0 | 1-20 |
| 10 | 1 | 2-21 |
| 20 | 2 | 3-22 |
| 30 | 3 | 4-23 |
| 50 | 5 | 6-25 |
| 99 | 9 | 10-29 |

The divisor of 10 means evasion provides coarse-grained speed improvements. You need 10 evasion for +1 speed. Going first matters in combat (first strike advantage), but the d20 roll introduces enough variance that speed doesn't guarantee initiative.

**Probability of going first** (player vs mob with speed=0):

| Player Speed | P(player goes first) | P(tie, coin flip) | Effective P(first) |
|---|---|---|---|
| 0 | 47.5% | 5.0% | 50.0% |
| 1 | 52.5% | 5.0% | 55.0% |
| 2 | 57.5% | 5.0% | 60.0% |
| 5 | 72.5% | 5.0% | 75.0% |
| 9 | 90.0% | 5.0% | 92.5% |

At 50 evasion (speed 5), the player goes first ~75% of the time against a speed-0 mob. This is a strong but not overwhelming advantage. Note that mobs have `speed: 0` in `mobToCombatantStats`, so all initiative advantage comes from the player side.

### The Triple-Duty Problem

Evasion uniquely contributes to three different systems (initiative, dodge, flee), making it the highest-value defensive attribute per point. Compare:
- Vitality: +5 HP, +0.04 regen/sec (one system: survivability)
- Evasion: +0.1 speed, +1 avoidScore, +flee chance (three systems)

This asymmetry means evasion may be underpriced at 1 point per point. However, the coarse speed granularity (floor division by 10) limits the initiative value, and avoid score has diminishing returns via the hit curve formula. In practice the multi-system benefit is spread thin.

## Cross-System Interactions

### Attributes x Stamina/Mana

Stamina pool scales with average combat skill level (`STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL = 3`), not attributes. Mana pool scales with magic level (`MANA_CONSTANTS.POOL_PER_MAGIC_LEVEL = 3`), not intelligence. This means **attributes have no effect on resource pools**. A high-intelligence mage has the same mana pool as a low-intelligence mage at the same magic skill level.

This is a deliberate simplification that avoids double-dipping (attributes already boost damage + accuracy). But it creates an odd asymmetry: intelligence makes spells hit harder and more accurately, but doesn't let you cast more of them.

### Attributes x Crafting/Gathering

Luck is the only attribute that cross-cuts into non-combat systems:
- Crafting crit: `CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT = 0.002` (+0.2% per luck)
- Gem crit: `GEM_CRIT_CONSTANTS.LUCK_BONUS = 0.003` (+0.3% per luck)
- Forge success: `FORGE_LUCK_SUCCESS_BONUS_PER_POINT = 0.001` (+0.1% per luck)
- Item rarity on drop: `LUCK_RARITY_SCALING = 0.005` in hidden cache

At 20 luck: +4% crafting crit, +6% gem crit, +2% forge success. These are meaningful but not dominant bonuses. Luck is the "utility" attribute.

### The 1:1:1 Symmetry Design

All three combat attribute multipliers (STR/DEX/INT -> damage and accuracy) are set to 1. This creates perfect balance between the three combat styles at the attribute level. A melee player putting 30 points in STR gets the same raw bonus as a mage putting 30 points in INT. Style advantage comes from weapon power and skill levels, not from attribute asymmetry.

This is intentionally boring (in a good way). Asymmetric attribute multipliers across styles would create a meta where one style is mathematically optimal for attribute investment, which would narrow build diversity.

## Issues Found

### 1. Attribute Points Finite and Low-Impact at Endgame (Information Only)

With 99 base attribute points, a player at endgame has ~30 in their primary damage attribute. This contributes ~14% of their totalAttack. Compared to the investment in skill leveling (months) and gear acquisition (ongoing), attributes are a relatively thin layer of customization. This is acceptable if the intent is for attributes to be a meaningful-but-not-dominant power vector.

### 2. XP_RATIO Creates a Leveling Multiplier for Multi-Skill Players (Information Only)

A player who actively trains 8 skills earns character XP from all 8 streams. Since `characterXpGain = floor(skillXpAfterEfficiency * 0.3)` is applied per grant, a multi-skill player levels their character significantly faster than a single-skill specialist. This is probably intended (it rewards diverse play), but it means character level correlates more with breadth of activity than depth.

### 3. Evasion Triple-Duty Underpriced Relative to Other Defensive Attributes (Low)

Evasion affects initiative (speed), avoid score (dodge), and flee chance. Vitality only affects HP and regen. Both cost 1 attribute point. The floor division by 10 for speed and diminishing returns on hit chance mitigate this, but in a min-max analysis, evasion provides more distinct benefits per point than vitality. This could lead to evasion being the dominant defensive attribute in endgame builds.

### 4. Absolute attributePoints Write in XP Service (Known Bug)

`xpService.ts:108` writes `attributePoints: attributePointsAfter` as an absolute value rather than `{ increment: levelUps }`. Two concurrent XP grants that both trigger a level-up could overwrite each other, losing an attribute point. This was already identified in security audits but is noted here for completeness since it directly affects CHARACTER_CONSTANTS consumption.

## Recommendations

### 1. No Change Needed to Damage/Accuracy Multipliers

The 1:1:1 symmetry is clean and correct. Changing these to create style differentiation would be better achieved through action definitions and talent trees, not attribute multipliers.

### 2. Consider Intelligence -> Mana Pool Scaling (Future)

Adding a small mana bonus per intelligence point (e.g., `MANA_PER_INTELLIGENCE = 1`) would give mages a reason to invest in INT beyond damage/accuracy. This mirrors how evasion gives speed beyond dodge. But it risks mages double-dipping harder than melee/ranged builds, so it would need careful balancing.

### 3. Monitor Evasion vs Vitality Preference in Player Data

If analytics show endgame builds heavily favoring evasion over vitality, consider either:
- Reducing the avoid score contribution of evasion (separate from the flee formula)
- Or increasing the EVASION_TO_SPEED_DIVISOR from 10 to 15, making speed gains rarer

**Risk:** Both changes affect combat balance broadly. Only act with data.

## Risk Level

**low** -- The attribute system is deliberately simple with clean 1:1:1 symmetry. The XP_RATIO provides healthy character leveling pacing. Attribute points are a meaningful but bounded power source that correctly sits below skill levels and equipment in the power hierarchy. The evasion triple-duty is the most notable design asymmetry but is mitigated by diminishing returns and granularity. No exploitable degenerate strategies exist.
