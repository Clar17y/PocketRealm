# Talent Tree AoE Balance & Consistency Pass

## Problem

Melee dominates guild expeditions at level 15+ because Cleave (tier 2) is the only early AoE. Ranged gets Volley at tier 3 (level 35) and magic gets Chain Lightning at tier 3 (level 35). In 4-mob expedition rooms and boss add phases, this gap is significant.

Secondary issues discovered during design:
- Magic has 5 nodes at tier 2 (others have 4) with two near-identical low-damage debuffs
- Ranged has 15 total nodes vs 16 for melee/magic
- The Crippled debuff (-20 speed) is a no-op — speed only determines 1v1 initiative (rolled once before any debuffs apply) and is unused in raid combat
- The general tree mixes essential combat survivability with weak crafting/gathering passives that nobody would take over combat talents

## Design Goals

1. Every combat tree gets AoE at tier 2 (skill level 15 gate)
2. Consistent node counts: 4 per tier (T1-T4) + 2 at T5 for combat trees
3. Each tree's AoE has a distinct identity beyond raw damage
4. General tree becomes "Survival" — pure combat support, no crafting nodes
5. AoE multipliers scaled down to prevent dominance over single-target builds

## Tree Identities

| Tree | AoE Fantasy | Expedition Role |
|------|------------|-----------------|
| Melee | Cleave through everything | Raw AoE damage, self-sustain |
| Ranged | Suppressing fire | Accuracy debuff on room, pin key targets |
| Magic | Freeze the room | Evasion debuff on room, party setup |
| Survival | — (no damage) | Tankiness, party defence buffs |

## AoE Balance Philosophy

AoE hits all mobs in a raid encounter. In a 4-mob room, even a low-multiplier AoE outputs massive total damage. Per-target multipliers must be meaningfully lower than single-target equivalents, and costs must be higher.

| Tier | AoE Multiplier | AoE Cost | Compare: ST Multiplier | Compare: ST Cost |
|------|---------------|----------|----------------------|-----------------|
| T2 | 0.7-0.8x | 30 | 1.0-1.3x | 15-20 |
| T3 | 0.9-1.0x | 40 | 1.5-2.0x | 35-40 |
| T5 | 1.3x | 50 | 2.0-2.5x | 45-50 |

Normal attack baseline: 1.0x damage, 20 stamina.

## AoE Abilities Summary

| Tree | T2 AoE | T3 AoE |
|------|--------|--------|
| Melee | Cleave — 0.8x melee, 30 stam | Whirlwind — 1.0x melee, 40 stam |
| Ranged | Scatter Shot — 0.7x ranged + Suppressed (-15 acc, 2 rds), 30 stam | Volley — 0.9x ranged + Suppressed (-15 acc, 3 rds), 40 stam |
| Magic | Frost Nova — 0.7x magic + Frozen (-15 eva, 2 rds), 30 mana | Blizzard — 1.0x magic + Frozen (-15 eva, 3 rds), 40 mana |
| Magic T5 | — | Meteor Strike — 1.3x magic, 50 mana, channeling |

## New Debuff Types

### Suppressed
- **Effect:** -15 accuracy for duration
- **Used by:** Scatter Shot (2 rds), Volley (3 rds)
- **Theme:** Suppressing fire forces mobs to keep their heads down

### Pinned
- **Effect:** Target is forced to defend on their next turn
- **Restrictions:** Does not work on bosses or mini-bosses
- **Used by:** Crippling Shot (single-target)
- **Theme:** A well-placed shot pins the target behind cover
- **Implementation note:** Encounter mobs already have a mechanic that forces players to defend; this reverses the direction

## Complete Talent Trees

### Melee Tree (20 nodes)

**Tier 1** (skill level: none, cost: 5 pts)
| Node | Type | Effect |
|------|------|--------|
| Power Strike | Action | 1.3x melee, 15 stam |
| Rending Slash | DoT Action | 1.1x melee + Bleed (4+15%/rd, 3 rds), 25 stam |
| Iron Skin | Passive | +5% defence |
| Endurance Training | Passive | +10% stamina pool |

**Tier 2** (skill level: 15, cost: 10 pts)
| Node | Type | Effect |
|------|------|--------|
| Cleave | AoE Action | 0.8x melee, 30 stam, hits all |
| Battle Cry | Buff | +15 attack for 4 rds, 20 stam |
| Venomous Strike | DoT Action | 0.9x phys + Poison DoT (5+20%/rd, 3 rds), stam+mana |
| Stamina Surge | Passive | +15% stamina regen |

**Tier 3** (skill level: 35, cost: 20 pts)
| Node | Type | Effect |
|------|------|--------|
| Devastating Blow | Action | 2.0x melee, 35 stam, channeling |
| Whirlwind | AoE Action | 1.0x melee, 40 stam, hits all |
| Berserker Rage | Buff | +30% attack for 5 rds, 30 stam |
| Weapon Mastery | Passive | +10% weapon damage |

**Tier 4** (skill level: 60, cost: 35 pts)
| Node | Type | Effect |
|------|------|--------|
| Execute | Action | 2.5x melee at <30% HP, 40 stam |
| Flame Sword | Action | 1.2x magic + Burn DoT, stam+mana |
| Unbreakable | Passive | +20% max HP |
| Iron Will | Passive | Reduce debuff duration by 1 rd |

**Tier 5** (skill level: 85, cost: 50 pts)
| Node | Type | Effect |
|------|------|--------|
| Titan's Wrath | Action | 2.5x melee, 50 stam, channeling |
| Champion's Resolve | Passive | +25% stamina regen + pool |

### Ranged Tree (20 nodes)

**Tier 1** (skill level: none, cost: 5 pts)
| Node | Type | Effect |
|------|------|--------|
| Aimed Shot | Action | 1.3x ranged, +5 accuracy, 15 stam |
| Barbed Arrow | DoT Action | 0.9x phys + Bleed (4+15%/rd, 3 rds), 20 stam |
| Quick Draw | Passive | +5% crit chance |
| Keen Eye | Passive | +10% accuracy |

**Tier 2** (skill level: 15, cost: 10 pts)
| Node | Type | Effect |
|------|------|--------|
| Scatter Shot | AoE Action | 0.7x ranged + Suppressed (-15 accuracy, 2 rds), 30 stam, hits all |
| Crippling Shot | Action | 0.8x ranged + Pinned (forced defend next turn, no bosses/mini-bosses), 20 stam |
| Eagle Eye | Buff | +30 accuracy for 3 rds, 15 stam |
| Steady Hands | Passive | +15% crit damage |

**Tier 3** (skill level: 35, cost: 20 pts)
| Node | Type | Effect |
|------|------|--------|
| Volley | AoE Action | 0.9x ranged + Suppressed (-15 accuracy, 3 rds), 40 stam, hits all |
| Sniper's Mark | Debuff | -20 evasion for 3 rds, always hits, 25 stam |
| Flame Arrow | DoT Action | 1.1x magic + Burn DoT (6+15%/rd, 2 rds, always applies), stam+mana |
| Evasive Maneuver | Passive | +10% dodge |

**Tier 4** (skill level: 60, cost: 35 pts)
| Node | Type | Effect |
|------|------|--------|
| Piercing Shot | Action | 1.8x ranged, ignores 50% defence, 35 stam |
| Shadow Arrow | Action | 1.2x magic + 25% life leech, stam+mana |
| Quick Reflexes | Passive | Counter costs -10 stamina |
| Fleet Foot | Passive | +15% evasion |

**Tier 5** (skill level: 85, cost: 50 pts)
| Node | Type | Effect |
|------|------|--------|
| Death Mark | Action | 2.5x ranged + Death Mark debuff (-40 def, DoT 5/rd, 4 rds), 45 stam |
| Windwalker | Passive | +25% dodge + evasion |

### Magic Tree (20 nodes)

**Tier 1** (skill level: none, cost: 5 pts)
| Node | Type | Effect |
|------|------|--------|
| Fire Bolt | Action | 1.2x magic, 15 mana |
| Enfeeble | Debuff Action | 0.5x magic + Weakened (-20 attack, 3 rds), 15 mana |
| Minor Heal | Self Heal | 20% max HP, 20 mana, channeling |
| Arcane Focus | Passive | +10% mana pool |

**Tier 2** (skill level: 15, cost: 10 pts)
| Node | Type | Effect |
|------|------|--------|
| Frost Nova | AoE Action | 0.7x magic + Frozen (-15 evasion, 2 rds, always applies), 30 mana, hits all |
| Curse | Debuff Action | 0.8x magic + Cursed (-20 magic defence, 3 rds), 20 mana |
| Enhanced Fortitude | Buff | +20 defence for 4 rds, 25 mana |
| Mana Flow | Passive | +15% mana regen |

**Tier 3** (skill level: 35, cost: 20 pts)
| Node | Type | Effect |
|------|------|--------|
| Blizzard | AoE Action | 1.0x magic + Frozen (-15 evasion, 3 rds), 40 mana, hits all |
| Earth Spikes | Action | 1.3x physical (magic scaling) + Armor Break (-15 def, 3 rds), stam+mana |
| Heal Ally | Ally Heal | 30% max HP to ally, 35 mana, channeling |
| Spell Penetration | Passive | Ignore 15% magic defence |

**Tier 4** (skill level: 60, cost: 35 pts)
| Node | Type | Effect |
|------|------|--------|
| Arcane Blast | Action | 2.0x magic + Arcane Burn (-15 magic def, 3 rds), 40 mana |
| Life Drain | Action | 1.0x magic + 25% life leech, 35 mana |
| Regeneration | HoT | 5% max HP/rd for 4 rds, 30 mana |
| Mind Shield | Passive | Ward costs -10 mana |

**Tier 5** (skill level: 85, cost: 50 pts)
| Node | Type | Effect |
|------|------|--------|
| Meteor Strike | AoE Action | 1.3x magic, 50 mana, channeling, hits all |
| Archmage | Passive | +25% mana regen + pool |

### Survival Tree (15 nodes, formerly "General")

**Tier 1** (skill level: none, cost: 5 pts)
| Node | Type | Effect |
|------|------|--------|
| Improved Defend | Passive | Defend reduces 45% instead of 35% |
| First Aid | Passive | +10% potion effectiveness |
| Toughness | Passive | +5% max HP |

**Tier 2** (skill level: 15, cost: 10 pts)
| Node | Type | Effect |
|------|------|--------|
| Taunt | Action | Force boss to target you for 2 rds (raid only), 20 stam |
| Quick Recovery | Passive | Reduce potion sickness by 1 rd |
| Resourceful | Passive | +10% stamina + mana regen |

**Tier 3** (skill level: 35, cost: 20 pts)
| Node | Type | Effect |
|------|------|--------|
| Fortify | Buff | +30 defence for 3 rds, 15 stam + 10 mana |
| Brace | Passive | +10% physical damage reduction |
| Second Wind | Passive | Regen 3% max HP/rd when below 40% HP |

**Tier 4** (skill level: 60, cost: 35 pts)
| Node | Type | Effect |
|------|------|--------|
| Last Stand | Passive | +30% defence at <20% HP once per fight |
| Rally | Buff | +15 defence to all allies for 3 rds (raid only), 25 stam + 15 mana |
| Thick Skin | Passive | +10% magic damage reduction |

**Tier 5** (skill level: 85, cost: 50 pts)
| Node | Type | Effect |
|------|------|--------|
| Undying | Passive | Survive lethal hit once per fight at 1 HP |
| Bulwark | Passive | +15% max HP, +10% defence |

## Changes from Current Implementation

### Node Movements
| Node | From | To | Reason |
|------|------|----|--------|
| Rending Slash | Melee T3 | Melee T1 | Early DoT option for all combat trees |
| Barbed Arrow | Ranged T2 | Ranged T1 | Early DoT option for all combat trees |
| Enfeeble | Magic T2 | Magic T1 | Early utility debuff, reduces magic T2 from 5→4 nodes |

### Reworked Abilities
| Ability | Before | After |
|---------|--------|-------|
| Cleave | 1.1x, 25 stam, AoE | 0.8x, 30 stam, AoE |
| Frost Nova | 0.9x, 20 mana, single-target + Frozen | 0.7x, 30 mana, AoE + Frozen |
| Chain Lightning | 1.5x, 30 mana, AoE | Renamed Blizzard, 1.0x, 40 mana, AoE + Frozen 3 rds |
| Meteor Strike | 2.5x, 50 mana, AoE, channeling | 1.3x, 50 mana, AoE, channeling |
| Crippling Shot | 0.8x + Crippled (-20 speed, useless) | 0.8x + Pinned (forced defend, no bosses/mini-bosses) |
| Curse | 0.5x + -20 magic def, 15 mana | 0.8x + -20 magic def, 20 mana |
| Volley | 0.7x, 30 stam, AoE | 0.9x + Suppressed (-15 acc, 3 rds), 40 stam, AoE |

### New Abilities
| Ability | Tree | Tier | Effect |
|---------|------|------|--------|
| Whirlwind | Melee | T3 | 1.0x melee AoE, 40 stam |
| Scatter Shot | Ranged | T2 | 0.7x ranged AoE + Suppressed (-15 acc, 2 rds), 30 stam |
| Brace | Survival | T3 | +10% physical damage reduction |
| Second Wind | Survival | T3 | 3% HP regen/rd below 40% HP |
| Rally | Survival | T4 | +15 def to all allies 3 rds (raid only), 25 stam + 15 mana |
| Thick Skin | Survival | T4 | +10% magic damage reduction |
| Bulwark | Survival | T5 | +15% max HP, +10% defence |

### Removed Nodes
| Node | Tree | Tier | Reason |
|------|------|------|--------|
| Efficient Mining | General | T3 | Non-combat; future tradeskill system |
| Cheaper Repairs | General | T3 | Non-combat; future tradeskill system |
| Salvage Expert | General | T4 | Non-combat; future tradeskill system |
| Master Crafter | General | T4 | Non-combat; future tradeskill system |
| Grandmaster | General | T5 | Non-combat; future tradeskill system |

### AOE_ACTION_IDS Update
Current: `cleave`, `volley`, `chain_lightning`, `meteor_strike`
New: `cleave`, `scatter_shot`, `volley`, `frost_nova`, `blizzard`, `whirlwind`, `meteor_strike`

### Prerequisite Chain Updates
Talent tree prerequisite chains need updating to reflect node movements. Key changes:
- Melee: Rending Slash moves to T1, so it no longer requires a T2 prereq
- Ranged: Barbed Arrow moves to T1, Scatter Shot and Crippling Shot at T2 require T1 nodes
- Magic: Enfeeble moves to T1, Blizzard (T3) requires Frost Nova (T2) instead of Chain Lightning requiring Frost Nova
- Survival: new nodes need prerequisite wiring

## Implementation Notes

### Survival Tree Skill Level Gate
The survival tree currently uses no skill level gate (general tree had none). Since it's no longer tied to a specific combat skill, the tier gates should use the player's **highest** combat skill level, or remain ungated. Recommend keeping it ungated — survival is supplementary and shouldn't lock out players who spread points across multiple skills.

### Pinned Mechanic
The forced-defend mechanic already exists for mobs applying it to players. Implementation needs to reverse the direction — player applies Pinned to mob, mob is forced to use its defend action on its next turn. Must check for boss/mini-boss flag before applying.

### Suppressed Debuff
New debuff type. Follows existing debuff pattern (stat modifier on `accuracy` for duration). No special handling needed beyond adding the debuff definition and wiring it into Scatter Shot and Volley action definitions.

## Future Work: Tradeskill Turn-Sink System

The crafting/gathering talent nodes (Efficient Mining, Cheaper Repairs, Salvage Expert, Master Crafter, Grandmaster) are being removed from the talent tree. The replacement is a dedicated tradeskill specialization system that uses the game's core turn economy.

### Concept

Instead of spending talent points (a static one-time choice), players invest turns into "honing" specific tradeskills. This creates an ongoing meaningful decision in the turn economy: explore, fight, rest, or invest in your craft.

### Core Mechanics

**Turn Investment:** Players spend turns actively training a tradeskill to unlock and level up perks. This is a deliberate action — you go to a crafting station (town zone) and choose to invest turns into honing.

**Daily Cap:** A maximum number of turns can be spent on honing per day (real-time day). This prevents players from dumping their entire turn bank into maxing a tradeskill instantly and creates a reason to return regularly. The cap forces long-term commitment over burst investment.

**Passive Progression:** Players also gain passive tradeskill training progress from performing the activity itself (crafting, mining, etc.), but at a slower rate than active turn investment. A player who never actively hones will still progress, just much more slowly than someone who dedicates turns to it.

**Perk Selection:** When honing, players choose which specific perk to invest turns into. This isn't a linear track — you pick what matters to your playstyle. A weaponsmith might prioritize crit chance, while another prioritizes material efficiency.

### Potential Perk Categories

Per tradeskill (weaponsmithing, mining, etc.):
- **Efficiency:** Reduced turn cost for the activity
- **Yield:** Bonus output (extra ore, extra items)
- **Quality:** Higher chance of rare/better outcomes (crit chance, rarity upgrades)
- **Specialization:** Unlock ability to craft specific item types or access rare recipes
- **Cost Reduction:** Lower material costs for crafting

### Design Considerations

- **Meaningful choice:** Since talent points are a finite combat resource, removing crafting from the talent tree means players no longer sacrifice combat power for crafting ability. The turn-sink system creates a *different* meaningful trade-off — time spent honing is time not spent exploring or fighting. Both are real costs, but they don't compete in the same resource pool.
- **Guild specialization:** In a guild context, this encourages role differentiation. Some players become dedicated crafters who invest turns daily into honing, while others focus turns on combat content. The guild benefits from having specialists.
- **Progression feel:** Passive progress from activity + active investment creates a dual-track system. Players feel like they're getting better at something just by doing it, but can accelerate meaningfully by choosing to invest.
- **Anti-whale:** The daily cap prevents turn-banking from trivializing the system. A player who logs in daily and spends their cap will progress at the same rate regardless of how many banked turns they have. This rewards consistency over stockpiling.

### Scope

This system is explicitly out of scope for the current talent tree work. It is documented here for future reference when the tradeskill system is designed and implemented.
