# STAMINA_CONSTANTS & MANA_CONSTANTS Analysis

Covers both secondary combat resources -- stamina and mana -- as a unified resource economy. These constants govern pool sizes, in-combat regen, out-of-combat passive recovery, rest healing, and their downstream effects on action sustainability and XP splitting.

## Current Values

### STAMINA_CONSTANTS

| Constant | Value | Unit |
|---|---|---|
| BASE_POOL | 100 | flat stamina |
| POOL_PER_SKILL_LEVEL | 3 | stamina per avg(melee, ranged, evasion) level |
| BASE_REGEN_PER_ROUND | 10 | stamina/combat round |
| REGEN_PER_SKILL_LEVEL | 0.2 | stamina/round per avg combat skill level |
| PASSIVE_REGEN_PER_SECOND | 1.0 | stamina/second (out of combat) |
| REST_HEAL_PER_TURN | 5 | stamina per turn spent resting |

### MANA_CONSTANTS

| Constant | Value | Unit |
|---|---|---|
| BASE_POOL | 50 | flat mana |
| POOL_PER_MAGIC_LEVEL | 3 | mana per magic level |
| BASE_REGEN_PER_ROUND | 5 | mana/combat round |
| REGEN_PER_MAGIC_LEVEL | 0.15 | mana/round per magic level |
| PASSIVE_REGEN_PER_SECOND | 0.5 | mana/second (out of combat) |
| REST_HEAL_PER_TURN | 3 | mana per turn spent resting |

### Key Related Constants (COMBAT_ACTION_CONSTANTS)

| Action | Stamina | Mana |
|---|---|---|
| Light Attack | 10 | 0 |
| Normal Attack | 20 | 0 |
| Heavy Attack | 40 | 0 |
| Defend | 0 | 0 |
| Counter | 35 | 0 |
| Ward | 0 | 30 |
| Use Potion | 5 | 0 |
| Fire Bolt | 0 | 15 |
| Minor Heal | 0 | 20 |
| Meteor Strike | 0 | 50 |
| Titan's Wrath | 50 | 0 |
| Flame Sword | 25 | 15 |

## Derived Formulas

```
maxStamina = 100 + floor(avg(melee, ranged, evasion)) * 3 + equipmentBonus
maxMana    = 50  + magicLevel * 3 + equipmentBonus

staminaRegenPerRound = 10 + floor(avg(melee, ranged, evasion)) * 0.2
manaRegenPerRound    = 5  + magicLevel * 0.15

passiveStaminaPerSecond = 1.0  (flat, no scaling)
passiveManaPerSecond    = 0.5  (flat, no scaling)

restStaminaPerTurn = 5  (flat, no scaling)
restManaPerTurn    = 3  (flat, no scaling)
```

## Asymmetry by Design

Stamina and mana are intentionally asymmetric. Stamina is the "universal" resource (all physical classes need it, and even spells cost `SPELL_BASE_STAMINA = 15`), while mana is the "specialist" resource (only magic users consume it meaningfully). This creates a fundamental split:

| Property | Stamina | Mana | Ratio (Stam:Mana) |
|---|---|---|---|
| Base pool | 100 | 50 | 2:1 |
| Pool scaling | 3/level (3 skills averaged) | 3/level (1 skill) | Equal rate, different inputs |
| Base regen/round | 10 | 5 | 2:1 |
| Regen scaling/level | 0.2 | 0.15 | 1.33:1 |
| Passive regen/sec | 1.0 | 0.5 | 2:1 |
| Rest heal/turn | 5 | 3 | 1.67:1 |

The 2:1 ratio on base pools and passive regen reflects that stamina is consumed by every archetype, while mana is only consumed by magic users. Magic users pay from both pools (spells cost mana + `SPELL_BASE_STAMINA = 15`), making them the most resource-hungry archetype.

## Pool Scaling Curves

### Stamina Pool (no equipment)

Stamina scales with the average of melee, ranged, and evasion. A pure melee player with melee=30, ranged=1, evasion=1 gets `floor((30+1+1)/3) = 10` effective levels.

| Avg Combat Level | Max Stamina | % over base |
|---|---|---|
| 0 | 100 | 0% |
| 5 | 115 | +15% |
| 10 | 130 | +30% |
| 15 | 145 | +45% |
| 20 | 160 | +60% |
| 30 | 190 | +90% |

**Realistic scenarios** (players focus 1-2 combat skills):
- Melee-only (melee=30, ranged=1, evasion=5): avg=12 -> 136 stamina
- Balanced (melee=15, ranged=15, evasion=10): avg=13 -> 139 stamina
- Ranged + evasion (ranged=25, evasion=20, melee=1): avg=15 -> 145 stamina

The three-skill average means specialists gain less stamina than generalists. A player who dumps 30 levels into melee alone only gets avg=10 (if others are at 1), while a balanced player at 15/15/15 gets avg=15. This incentivizes some investment breadth.

### Mana Pool (no equipment)

Mana scales with magic level only. A pure magic user gets the full benefit; a melee player with magic=1 gets almost nothing.

| Magic Level | Max Mana | % over base |
|---|---|---|
| 0 | 50 | 0% |
| 5 | 65 | +30% |
| 10 | 80 | +60% |
| 20 | 110 | +120% |
| 30 | 140 | +180% |

A non-magic player (magic=1) has 53 mana -- barely enough for a Ward (30 mana) followed by one spell. This is correct: non-magic players shouldn't benefit from mana scaling.

## In-Combat Sustainability Analysis

The critical question: how many rounds of a given action can a player sustain before being forced to Defend (the free fallback)?

### Net Stamina Per Round

For each action, net stamina/round = `staminaRegen - actionCost`. Negative means the player is draining their pool.

At avg combat level 10 (regen = 10 + 10*0.2 = 12/round):

| Action | Cost | Net/Round | Rounds before empty (from 130 pool) |
|---|---|---|---|
| Light Attack | 10 | +2 | Infinite (net positive) |
| Normal Attack | 20 | -8 | 16 rounds |
| Heavy Attack | 40 | -28 | 5 rounds |
| Counter | 35 | -23 | 6 rounds |
| Titan's Wrath | 50 | -38 | 3 rounds |

At avg combat level 20 (regen = 10 + 20*0.2 = 14/round, pool = 160):

| Action | Cost | Net/Round | Rounds before empty |
|---|---|---|---|
| Light Attack | 10 | +4 | Infinite |
| Normal Attack | 20 | -6 | 27 rounds |
| Heavy Attack | 40 | -26 | 6 rounds |
| Titan's Wrath | 50 | -36 | 4 rounds |

**Key insight:** Light Attack is designed to be stamina-neutral or stamina-positive at all levels (base regen 10 = light attack cost 10). This ensures players always have a usable offensive option. The comment in the code confirms this: "Light attack: stamina-neutral (cost = base regen)."

Heavy Attack and Titan's Wrath are "burst windows" lasting only 3-6 rounds. A well-designed combat template would alternate: Heavy/Heavy/Heavy/Light/Light/Light to spend the burst, then regen. The 100-round combat cap means even sustained Normal Attack is viable (16-27 rounds of drain before forced Defend, then Light Attack regen cycles).

### Net Mana Per Round

At magic level 10 (regen = 5 + 10*0.15 = 6.5/round, pool = 80):

| Action | Cost | Net/Round | Rounds before empty |
|---|---|---|---|
| Fire Bolt | 15 | -8.5 | 9 rounds |
| Minor Heal | 20 | -13.5 | 6 rounds |
| Frost Nova | 20 | -13.5 | 6 rounds |
| Chain Lightning | 30 | -23.5 | 3 rounds |
| Meteor Strike | 50 | -43.5 | 2 rounds |
| Ward | 30 | -23.5 | 3 rounds |

At magic level 20 (regen = 5 + 20*0.15 = 8/round, pool = 110):

| Action | Cost | Net/Round | Rounds before empty |
|---|---|---|---|
| Fire Bolt | 15 | -7 | 16 rounds |
| Minor Heal | 20 | -12 | 9 rounds |
| Meteor Strike | 50 | -42 | 3 rounds |

**Mana has no "neutral" spell.** Even the cheapest spell (Fire Bolt at 15 mana) always drains the pool, since base mana regen (5) plus any reasonable skill scaling never reaches 15. At magic level 67, regen would reach `5 + 67*0.15 = 15.05` -- roughly neutral for Fire Bolt. But skill level 67 is extremely high (max skill level depends on `SKILL_CONSTANTS.MAX_LEVEL`).

This means magic users always run out of mana eventually. The design intent is clear: magic is a burst/utility resource, not a sustained DPS resource. After mana depletes, a caster falls back to stamina-based Light Attacks or Defend.

### Dual-Resource Cost for Casters

Spells cost `SPELL_BASE_STAMINA = 15` stamina in addition to their mana cost. A Fire Bolt costs 15 mana + 15 stamina. A caster at avg combat level 10:

- Stamina regen: 12/round, Fire Bolt stamina cost: 15 -> net -3 stamina/round
- Mana regen: 6.5/round (magic 10), Fire Bolt mana cost: 15 -> net -8.5 mana/round

Mana depletes first (after ~9 rounds), then stamina is likely still above zero. The caster can switch to Light Attacks (stamina only) and regen both pools. This dual-drain makes casters the most template-dependent archetype -- they need careful action sequencing.

## Out-of-Combat Recovery Analysis

### Passive Regen (Waiting)

| Resource | Regen/sec | Time to full (from 0, base pool) |
|---|---|---|
| Stamina (100 base) | 1.0 | 100s (1.7 min) |
| Mana (50 base) | 0.5 | 100s (1.7 min) |

Both resources take the same time to passively refill from empty at base stats. At higher levels:

| Avg Level | Max Stam | Time to full (stam) | Magic Lv | Max Mana | Time to full (mana) |
|---|---|---|---|---|---|
| 10 | 130 | 130s (2.2 min) | 10 | 80 | 160s (2.7 min) |
| 20 | 160 | 160s (2.7 min) | 20 | 110 | 220s (3.7 min) |
| 30 | 190 | 190s (3.2 min) | 30 | 140 | 280s (4.7 min) |

**Passive regen does NOT scale with skill level.** Both rates are flat constants (1.0 and 0.5). As pools grow, passive refill time grows linearly. A high-level magic user waits nearly 5 minutes for passive mana refill. This contrasts with HP, where passive regen scales with vitality.

This is an intentional design choice that pushes players toward using Rest (turn-spending) for resource recovery rather than AFK waiting. For HP, the 5x rest-vs-passive ratio is maintained at all levels. For stamina/mana, the ratio worsens as levels increase because rest healing is also flat.

### Rest Efficiency

Rest healing per turn is flat (5 stamina, 3 mana) regardless of skill level.

**Rest vs. passive for stamina:**
```
rest_vs_passive = REST_HEAL_PER_TURN / PASSIVE_REGEN_PER_SECOND
                = 5 / 1.0 = 5x
```

**Rest vs. passive for mana:**
```
rest_vs_passive = REST_HEAL_PER_TURN / PASSIVE_REGEN_PER_SECOND
                = 3 / 0.5 = 6x
```

Stamina rest is 5x passive (same ratio as HP). Mana rest is 6x passive. This means mana rest is slightly more efficient relative to waiting, which compensates for the smaller mana pool.

### Turns to Full Rest

| Avg Level | Max Stam | Turns to full stam | Magic Lv | Max Mana | Turns to full mana |
|---|---|---|---|---|---|
| 0 | 100 | 20 | 0 | 50 | 17 |
| 10 | 130 | 26 | 10 | 80 | 27 |
| 20 | 160 | 32 | 20 | 110 | 37 |
| 30 | 190 | 38 | 30 | 140 | 47 |

These are small relative to encounter turn costs (50 turns per combat). A full stamina + mana rest from empty at mid-level costs ~26 + 27 = 53 turns, roughly one encounter's worth. Combined with HP rest (34 turns at vitality 20 from the HP analysis), a full three-resource rest costs ~90 turns total, less than two encounters.

## XP Splitting Interaction

Resource costs feed into XP distribution via `COMBAT_CONSTANTS.RESOURCE_XP_WEIGHT = 0.5`. Per skill, XP contribution = `damageDealt + resourceCost * 0.5`.

For a melee player spending 20 stamina/round (Normal Attack) and dealing 30 damage/round over 10 rounds:
- Damage contribution: 300
- Resource contribution: 200 * 0.5 = 100
- Total: 400 (25% from resource costs)

For a caster spending 15 mana + 15 stamina/round (Fire Bolt) and dealing 25 magic damage/round over 9 rounds:
- Damage contribution: 225
- Resource contribution: (135 + 135) * 0.5 = 135
- Total: 360 (37.5% from resource costs)

The 0.5 weight ensures resource-hungry actions get XP credit beyond just their damage, preventing magic from being XP-penalized despite potentially lower per-round damage. The caster's higher total resource expenditure partially compensates for lower sustained damage output.

## Cross-Encounter Resource State

Resources persist between fights within a session. After combat, the remaining stamina/mana are stored via `setStamina`/`setMana`/`setAllResources`. A player who exits combat with 30/130 stamina and enters another fight immediately starts at 30 stamina (plus any passive regen during the interval).

This creates a meaningful strategic layer: players must decide whether to rest between encounters (spending turns) or push into the next fight resource-depleted. The flat passive regen rates make quick back-to-back fights viable for stamina (1 stamina/sec, so a 50-second gap gives +50 stamina) but painful for mana (0.5/sec, so the same gap gives only +25 mana).

## Issues Found

### 1. Passive Regen Doesn't Scale (Medium)

Unlike HP (where `BASE_PASSIVE_REGEN + vitality * PASSIVE_REGEN_PER_VITALITY` scales with investment), stamina and mana passive regen are flat constants. This means higher-level players wait disproportionately longer for passive recovery.

At magic level 30, passively refilling 140 mana takes 280 seconds (4.7 minutes), while at magic level 0, refilling 50 mana takes 100 seconds. The player who invested more into magic is penalized with longer AFK wait times.

The rest mechanic offsets this (both cost turns), but the asymmetry with the HP system feels inconsistent.

### 2. No Mana-Neutral Spell (Information Only)

Unlike Light Attack (exactly stamina-neutral), no spell achieves mana neutrality at reasonable skill levels. This is likely intentional -- magic is meant to be a burst resource. But it means a pure caster template always degrades into Light Attack spam after mana depletion, which may feel unsatisfying for players who want to "be a mage."

The SPELL_BASE_STAMINA cost (15) compounds this: even if a caster could sustain mana, they'd still drain stamina faster than a melee player using Light Attack (15 vs 10 per round).

### 3. Three-Skill Average for Stamina Creates Specialist Penalty (Low)

A player who maxes melee to 30 but ignores ranged and evasion gets `floor((30+1+1)/3) = 10` effective levels for stamina scaling. A balanced player at 15/15/10 gets `floor(40/3) = 13`. The specialist has 30% more investment in their primary skill but 23% less effective stamina scaling.

This is arguably good design (incentivizes breadth), but it means the melee specialist has a smaller stamina pool than the generalist despite being the archetype that relies on stamina most heavily.

### 4. Rest Heal Rates Don't Scale (Low)

REST_HEAL_PER_TURN is flat (5 for stamina, 3 for mana). Unlike HP rest healing (`2 + 0.2 * vitality`), resource rest healing has no skill-level component. This means higher-level players spend more turns resting for the same percentage of their pool.

For stamina at avg level 30: `190 / 5 = 38 turns` to full rest. At avg level 0: `100 / 5 = 20 turns`. The high-level player pays nearly 2x the turns for a full rest. Combined with the guild tax system (turns are taxed), this compounds into a meaningful hidden cost.

## Recommendations

### 1. Add Passive Regen Scaling (Low Priority)

Add skill-level scaling to passive regen, matching the HP system pattern:

```
passiveStaminaPerSecond = 1.0 + floor(avg(melee, ranged, evasion)) * 0.02
passiveManaPerSecond    = 0.5 + magicLevel * 0.015
```

This would keep the 5x rest-vs-passive ratio approximately intact while reducing the AFK penalty at high levels.

| Avg Level | Current Stam Regen | Proposed | Time to Full (pool 190) |
|---|---|---|---|
| 0 | 1.0 | 1.0 | 190s -> 190s |
| 10 | 1.0 | 1.2 | 130s -> 108s |
| 20 | 1.0 | 1.4 | 160s -> 114s |
| 30 | 1.0 | 1.6 | 190s -> 119s |

**Risk:** Low. Only affects out-of-combat AFK recovery speed. Does not change combat balance at all.

### 2. Consider a Low-Cost Mana Cantrip (Low Priority)

A "cantrip" spell costing 5-8 mana (matching base regen at moderate levels) would give casters a sustained option analogous to Light Attack. This is a game design decision, not a constants change, and may conflict with the intended "burst mage" archetype.

**Risk:** Medium. Could make magic too sustainable if the cantrip's damage is competitive. Would need careful damage tuning to be weaker than Fire Bolt.

### 3. Add Rest Heal Scaling (Low Priority)

Mirror HP's pattern:

```
restStaminaPerTurn = 5 + floor(avg(melee, ranged, evasion)) * 0.3
restManaPerTurn    = 3 + magicLevel * 0.2
```

This keeps early-game rest costs the same but reduces high-level rest turn costs from ~38 to ~29 turns (stamina) and ~47 to ~33 turns (mana) at level 30.

**Risk:** Low. Only reduces post-combat downtime for high-level players.

## Risk Level

**low** -- The stamina/mana system is well-structured with clear asymmetry between universal (stamina) and specialist (mana) resources. The Light Attack = stamina regen design ensures players always have a viable action. The lack of passive regen scaling is the only notable gap, and it's mitigated by the rest mechanic. No exploitable degenerate strategies exist; the issues are about proportional fairness of recovery times at high skill levels.
