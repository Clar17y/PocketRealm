# Combat Rework Design

## Overview

Rework combat from auto-attack instant resolution to a template-driven system where players define ordered action rotations that execute round-by-round. Adds stamina and mana as persisted combat resources, a skill point talent tree for unlocking abilities, and a rock/paper/scissors interaction model that rewards strategy over raw stats.

**Goals:**
- PvP becomes a counter-programming puzzle, not a stat check
- Boss encounters and expeditions require learning patterns and crafting counter-rotations
- Template design is a free engagement loop (no turn cost) — players spend time theorycrafting
- Resource management (stamina/mana) across multi-fight encounters adds depth
- Skill point investment creates meaningful build diversity and specialization

## 1. Resource System

Three persisted combat resources: **HP**, **Stamina**, **Mana**. All three follow the same persistence model — they carry across fights within encounter sites/boss raids/expeditions and regen passively out of combat.

### Pool Sizes (Skill-Level Driven)

| Resource | Base Pool | Scaling | In-Combat Regen/Round |
|----------|-----------|---------|----------------------|
| HP | 100 | +5 per vitality level | 0 (heal/potions only) |
| Stamina | 100 | +3 per avg(melee, ranged, evasion) | ~10 base + scaling |
| Mana | 50 | +3 per magic level | ~5 base + scaling |

Exact values are tunable via `gameConstants.ts`. Key constraint: light attack stamina cost = base stamina regen (stamina-neutral, sustainable forever).

### Out-of-Combat Recovery

- Passive real-time regen (like HP's current 0.4/sec, rates differ per resource)
- "Rest" action spends turns for faster recovery
- HP, Stamina, and Mana potions (craftable)

### Potion Sickness

One shared cooldown across all potion types (HP/Stamina/Mana). Using any potion triggers 4-round sickness preventing all potion use. Choose wisely which resource to replenish mid-fight.

### Design Implications

- Melee-focused: huge stamina pool/regen, low mana. Sustains physical rotations, struggles with Ward (magical defence)
- Magic-focused: huge mana pool/regen, moderate stamina. Can cast often but stamina is the bottleneck (all actions cost stamina)
- Encounter sites: resources carry between fights. Blow everything on room 1 → Defending through room 3

## 2. Action System

Every action costs stamina (universal). Spells additionally cost mana. Three categories: Offensive, Supportive, Defensive.

### Offensive Actions

| Action | Stamina | Mana | Effect | Source |
|--------|---------|------|--------|--------|
| Light Attack | ~10 | 0 | Low damage, stamina-neutral | Everyone (default) |
| Normal Attack | ~20 | 0 | Medium damage | Everyone |
| Heavy Attack | ~40 | 0 | High damage, high accuracy | Skill tree |
| Skill Attack | 25-35 | 0-30 | Enhanced physical/ranged, varies | Skill tree |
| Damage Spell | ~15 | 40-80 | Magic damage, may apply debuff | Magic tree / equipment |
| Debuff Spell | ~10 | 30-60 | Apply stat reduction / DoT | Skill tree |

### Supportive Actions

| Action | Stamina | Mana | Effect | Source |
|--------|---------|------|--------|--------|
| Buff | ~10 | 20-40 | Increase own stats for N rounds | Skill tree |
| Heal (self) | ~10 | 30-50 | Restore HP | Magic tree |
| Heal (ally) | ~10 | 40-60 | Restore aggro-holder's HP (raid only) | Magic tree |
| Taunt | ~20 | 0 | Force boss to target you next round (raid only) | General/Melee tree |
| Use Potion | ~5 | 0 | Consume HP/Stam/Mana potion, triggers sickness | Everyone |

### Defensive Actions

| Action | Stamina | Mana | Effect |
|--------|---------|------|--------|
| Defend | 0 | 0 | ~30-40% damage reduction to all incoming. Free fallback |
| Counter | 30-40 | 0 | Evade physical attacks + physical debuffs |
| Ward | 0 | 25-35 | Resist spells + magical debuffs |

Counter/Ward costs are intentionally high relative to regen to prevent spamming.

### Action Interactions (RPS Core)

```
Your Action        vs Their Phys Attack    vs Their Spell/Magic    vs Their Buff/Heal
──────────────────────────────────────────────────────────────────────────────────────
Counter            AVOID damage            Still hit (wasted stam)  Wasted stamina
Ward               Still hit (wasted mana) RESIST spell             Wasted mana
Defend             REDUCED (~35%)          REDUCED (~35%)           Safe but idle
Any Attack         TRADE (both deal dmg)   TRADE (both deal dmg)    BONUS dmg (open)
Buff/Heal          GET HIT (vulnerable)    GET HIT (vulnerable)     Both succeed
```

### Resource Exhaustion

When you can't afford the next action in your template, you automatically Defend (free). Your rotation "breaks" — opponents/bosses can exploit predictable Defend rounds from an exhausted player.

### Buff Rules

- Max 3 active buffs simultaneously
- Buffs expire after N rounds (typically 3-5, varies by buff)
- Reapplying refreshes duration, doesn't stack the effect

## 3. Skill Point System

### Skill Points

Every skill level-up across all 14 skills grants 1 skill point. Shared pool spent across talent trees.

- 14 skills × 99 max level = **1,386 total skill points** at max
- Total cost to max all trees exceeds 1,386 — forces specialization

### Four Talent Trees

| Tree | Theme | Abilities |
|------|-------|-----------|
| **Melee** | Physical damage, sustain, self-buffs | Heavy Attack, Power Strike, Cleave, Battle Cry, Devastating Blow... |
| **Ranged** | Precision, crits, debuffs, kiting | Aimed Shot, Crippling Shot, Volley, Eagle Eye, Sniper's Mark... |
| **Magic** | Spells, DoTs, heals, wards | Fire Bolt, Frost Nova, Heal, Enhanced Fortitude, Arcane Blast... |
| **General** | Defence, utility, raid support | Improved Defend, Counter, Ward, Taunt, Quick Recovery, Potion Mastery... |

### Tree Structure

~5 tiers per tree, 3-4 abilities per tier. Must unlock at least 2 abilities in tier N to access tier N+1.

| Tier | Point Cost Per Ability | Skill Level Gate |
|------|----------------------|------------------|
| 1 | 5-10 | None |
| 2 | 10-15 | Level 15+ |
| 3 | 20-30 | Level 35+ |
| 4 | 35-50 | Level 60+ |
| 5 | 50-75 | Level 85+ |

~15 abilities per tree × ~30 avg cost = ~450 points per tree. Four trees = ~1,800 total. With 1,386 max points, players must specialize.

### Non-Combat Passives

Trees also include passive bonuses competing for the same point pool: +mining yield, -repair cost, +crafting crit chance, etc. Combat power vs economic efficiency is a real trade-off.

### Equipment-Granted Abilities

Specific equipment grants bonus abilities usable in templates:
- Lich Staff → "Lifeleech" spell
- Flame Sword → "Ignite" (fire DoT)
- Tower Shield → "Fortress" (enhanced Defend, 50% reduction)

Available only while equipped. Unequipping causes those template rounds to fall back to Defend.

### Respec

Skill points can be reallocated for a turn cost (expensive but not prohibitive).

## 4. Combat Templates

### Structure

Ordered list of actions that loops. Defines what a combatant does each round.

```
Template: "Boss Killer v2"
 Round 1: Heavy Attack       (40 stam)
 Round 2: Buff - Battle Cry  (10 stam, 30 mana)
 Round 3: Skill - Power Strike (35 stam)
 Round 4: Counter             (35 stam)
 Round 5: Normal Attack       (20 stam)
 Round 6: Ward                (30 mana)
 → loops back to Round 1
```

### Rules

- Multiple saved templates (5-10 slots)
- One marked "active" — used for ALL combat
- Switching is free and instant (but must be done before combat starts)
- Default for new players: `[Light Attack]` — 1 action, loops, identical to current auto-attack
- Editor validates actions against unlocked abilities
- Editor shows estimated stamina/mana drain per cycle vs regen for sustainability analysis
- No minimum or maximum template length

### Resolution

Game engine reads `template[roundNumber % templateLength]` each round. If the player can't afford the action, they Defend instead.

### Equipment Dependency

If you unequip an item that grants a template ability, those rounds fall back to Defend until you re-equip or edit the template.

## 5. PvE Combat

### Flow (Unchanged)

Click fight → server resolves all rounds instantly using player template vs mob template → returns full log → client plays it back. Same instant resolution, but now templates drive the actions.

### Mob Complexity Tiers

| Mob Type | Rotation |
|----------|----------|
| Trash (no prefix) | Auto-attack every round |
| Prefixed (weak/tough/etc) | Short pattern (2-4 rounds), loops |
| Shaman/Spectral/Venomous | Spell pattern converted to template format |
| Encounter site elites | Medium pattern (4-8 rounds) |
| Boss mobs | Full complex template (8-15+ rounds) |

### Mob Resources

Mobs don't manage stamina/mana — their template always executes. Keeps them predictable. The puzzle is learning their pattern, not guessing resource state.

### Encounter Sites

HP, stamina, and mana carry between fights within a site. Template loops fresh per mob but resources don't reset. Strategy: can your rotation sustain across the full dungeon?

## 6. PvP Combat

### Flow

Still async, still ghost-based. Attacker clicks Challenge → server resolves both templates against each other round-by-round → instant result. Defender doesn't need to be online.

### Balance Target

Stats ~60% of outcome, template strategy ~40%. A well-crafted counter-rotation from a slightly weaker player can win. Pure stat advantage is not guaranteed victory.

### Scouting (Reworked)

Existing scout mechanic (100 turns) now reveals partial rotation info:
- Template length (e.g., "6-round rotation")
- Action categories used (e.g., "uses heavy attacks, buffs, and wards")
- Rough resource profile ("stamina-heavy" / "balanced" / "mana-heavy")
- Does NOT reveal exact sequence or specific abilities

**Scouting triggers a "You've been scouted by [player]" notification** to the target. Creates a mind game: they know you're coming, they don't know when. They might swap templates preemptively.

### Post-Fight Transparency

Full round-by-round combat log visible to both players after any PvP fight, including all actions taken. Your exact rotation is revealed through fighting.

**Metagame loop:** Scout → craft counter → challenge → they see your log → they adapt → arms race.

## 7. Boss Encounters (Reworked)

### Individual HP Model

Replaces shared raid pool. Each player manages their own HP, stamina, and mana. Boss targets individual players.

### Boss Templates

Bosses have their own combat template defining their full rotation:

```
Example: Stone Colossus (12-round loop)
 Round  1: Attack (physical, single-target)
 Round  2: Attack (physical, single-target)
 Round  3: Debuff - Weaken (magical, AoE)
 Round  4: Attack (physical, single-target)
 Round  5: ★ EARTHQUAKE (physical, AoE, massive — Counter or huge damage)
 Round  6: Attack (physical, single-target, weakened post-nuke)
 Round  7: Heal self
 Round  8: Attack (magical, single-target)
 Round  9: Buff - Enrage (+damage for 3 rounds)
 Round 10: Attack (physical, single-target)
 Round 11: ★ ARCANE STORM (magical, AoE, massive — Ward or huge damage)
 Round 12: Rest (does nothing, recovering)
 → loops
```

### Threat / Aggro

- Players generate threat from damage dealt and Taunt abilities
- Single-target boss actions hit the highest-threat player
- Taunt forces boss to target you for N rounds
- If the tank dies, boss switches to next highest threat

### Raid Roles (Emerge from Templates)

No explicit role selection — your template IS your role:
- **Tank:** Taunt + Counter/Ward/Defend heavy. High stamina/HP build
- **DPS:** Attack/skill heavy. Counter/Ward on telegraphed nuke rounds only
- **Healer:** Heal actions auto-target the aggro holder. Needs mana for healing + Ward on magic AoE rounds

### Progressive Bestiary Reveal

- Each round survived reveals that round's boss action permanently in the bestiary
- Wipe on round 5 → rounds 1-4 known forever
- Subsequent attempts start with more knowledge
- Full rotation eventually known — challenge becomes execution

### Loot Distribution

Contribution score weighted by three factors:

| Contribution | Weight | Why |
|---|---|---|
| Damage dealt | 1x | DPS contribution |
| Healing done | 1x | Keeps group alive |
| Damage absorbed while tanking (holding aggro) | 0.8-1x | Rewards tank role specifically |
| Rounds survived | Small flat bonus | Staying alive matters |

Ensures tanks get fair loot despite dealing less damage.

### Death

- Player reaches 0 HP → out for the rest of the encounter (or current room for expeditions)
- Must spend turns to recover (existing knockout mechanic)
- Can rejoin after recovery (world bosses only — see below)

## 8. World Boss vs Guild Raid

Two distinct encounter contexts with different rules:

| Aspect | World Boss | Guild Raid / Expedition |
|--------|-----------|----------------------|
| Join | Anyone in zone, any round | Sign up before launch, locked roster |
| Rejoin after death | Yes — recover, rejoin next round | No — out until encounter ends |
| Wipe | No wipe state, boss persists until killed/despawns | Wipe = reset encounter (or room) |
| Round interval | Fixed default (~60s) | Configurable by raid leader (30s - 5min) |
| Boss HP scaling | Scales with active participants per round | Fixed at launch based on roster size |
| Boss damage | Fixed per boss tier, does NOT scale with players | Fixed per encounter definition |
| Template swapping | Between rounds freely | Between rounds freely |

### World Boss Scaling

- Boss HP scales dynamically with active participant count (preserving HP percentage on rescale)
- Boss damage is fixed — more players doesn't mean harder hits
- More players = faster kill, but each individual must survive independently
- Single-target damage tuned so a well-geared tank with Counter/Defend survives multiple rounds

## 9. Expedition / Encounter Site Integration

### Encounter Sites (Existing, Reworked)

- Multiple rooms, each with 1+ mobs
- HP, stamina, mana carry between fights
- Template loops fresh per mob, resources don't reset
- Resource management across the full site is the core challenge
- Players can swap active template between rooms (encounter sites are solo, but relevant for planning)
- Chest rewards on completion (unchanged)

### Guild Expeditions (Phase 5)

- Multi-room group dungeon
- Same round-based model as boss encounters (configurable interval)
- Each room has mob pack (elites or mini-boss)
- Boss rooms use full threat/AoE/telegraph model
- Death = out for remainder of current room, can rejoin next room after recovery
- Full party wipe on a room = room resets, retry
- Template swapping between rooms for tactical flexibility

## 10. Round Resolution Order

For all round-based combat (PvE instant, PvP instant, boss async, expedition async):

1. All combatants' templates advance one round
2. Resource check — can each combatant afford their action? If not, Defend
3. Taunt effects applied (update threat table)
4. Defensive actions resolve (Counter/Ward/Defend stance set)
5. Offensive actions resolve against targets (d20 + stats, modified by action interactions)
6. Supportive actions resolve (buffs applied, heals land)
7. Boss/mob action resolves against target(s) (modified by defenders' stances)
8. End-of-round: buff/debuff tick, effects expire, resource regen, death checks

Defensive actions resolve BEFORE attacks so that Counter/Ward is active when the hit lands.

## 11. Implementation Notes

### Clean Break

No migration path needed — no active player base to preserve. Fresh schema, rewrite combat engine, new seed data for mob templates.

### What Stays

- d20 hit/damage math (roll + accuracy vs dodge + evasion, defence reduction curve)
- Mob definitions, zones, encounter sites, loot tables
- Turn costs for combat
- Equipment stats, skill levels, attributes
- Post-combat rewards (XP, loot, durability, guild tax/XP)
- Flee/knockout mechanics on death
- Potion sickness mechanic (extended to all potion types)

### What's New

- Stamina + Mana as persisted resources (DB columns, regen logic, rest integration)
- Combat template model (CRUD, editor, validation)
- Skill point system (talent trees, unlock gates, respec)
- Ability definitions (per tree, per tier, with costs and effects)
- Template-driven `runCombat()` replacing auto-attack loop
- Boss individual HP model replacing shared raid pool
- Threat/aggro system for boss targeting
- Three potion types (HP, Stamina, Mana)
- Scout notification ("you've been scouted")
- Progressive boss bestiary reveal
- Contribution-weighted boss loot (damage + healing + absorption)
- Equipment-granted abilities
