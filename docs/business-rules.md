# Business Rules & Cross-System Constraints

Living document of implicit rules, state machines, and cross-system dependencies. Update when behavior changes.

## Player State Machine

```
NORMAL ──(HP reaches 0 in combat)──→ KNOCKOUT ──(auto)──→ RECOVERING
                                                              │
RECOVERING ──(spend recovery turns)──→ NORMAL (at recovery HP, in home town)
```

- **RECOVERING blocks**: combat, exploration, gathering, crafting, travel, PvP, boss signup, training
- **Recovery cost**: calculated from maxHp at knockout time
- **Recovery exit HP**: fixed value from `calculateRecoveryExitHp(maxHp)`, not full HP
- **Respawn location**: player moved to home town zone on knockout

### Action Precondition: `assertCanAct()`
All major actions call `assertCanAct()` which checks:
1. Not in recovering state
2. Not over-encumbered (inventory at capacity)

## Zone Constraints

| Action | Town | Wild |
|--------|------|------|
| Crafting/Forge/Salvage | Yes | No |
| PvP Scouting | Yes | No |
| Exploration | No | Yes |
| Combat (encounter sites) | No | Yes |
| Gathering | Yes (if node present) | Yes (if node present) |
| Rest | Yes | Yes |
| Travel | Yes | Yes |

## Turn Economy

Every turn-spending action is validated: positive integer, sufficient balance, guild tax applied atomically.

**Guild tax**: `effectiveTurns = turnsToSpend / (1 + taxRate)`. Difference goes to guild treasury.

### Actions That Cost Turns
| Action | Cost Source |
|--------|------------|
| Combat | `COMBAT_CONSTANTS.ENCOUNTER_TURN_COST` per mob |
| Full clear (pre-charged) | All remaining rooms' mob costs upfront |
| HP Rest | Player-chosen amount (slider) |
| Recovery exit | `recoveryCost` (set at knockout) |
| Exploration | Player-chosen amount (slider, 10–10,000) |
| Gathering/Mining | Resource-specific constant |
| Crafting | `CRAFTING_CONSTANTS.TURN_COST` |
| PvP Scout | `PVP_CONSTANTS.SCOUT_TURN_COST` |
| Boss Signup | `BOSS_ENCOUNTER_CONSTANTS.SIGNUP_TURN_COST` |
| Training | `TRAINING_CONSTANTS.TURN_COST` |
| Stamina/Mana Rest | Variable by amount restored |
| Zone Travel | `ZONE_CONSTANTS.TRAVEL_COST` * terrain multiplier |

## Combat Flow & Cascading Effects

### On Combat Victory
1. Split XP across combat skills (melee/ranged/magic) proportional to damage dealt + resource cost spent per skill type → may trigger skill level ups
2. Skill level up → grant character XP → may trigger character level up
3. Character level up → grant attribute points
4. Record bestiary kill (mob + prefix variant)
5. Degrade equipped weapon/armor durability
6. Roll and grant loot (overflow to pending loot if inventory full)
7. Deduct consumed potions from inventory
8. Track achievement progress
9. If in guild: grant guild XP for mob kill
10. If world event active: modifiers already applied to mob stats pre-combat

### On Combat Defeat
1. Degrade equipped armor durability
2. Calculate flee result → may trigger knockout
3. If knockout: enter recovering state, respawn to home town
4. Deduct consumed potions

### On Boss Victory
1. Distribute loot scaled by damage/healing contribution ratio
2. Grant skill XP per contributor
3. Track achievements
4. Boss state → `defeated`

## Durability System

- Each hit landed degrades weapon by `DURABILITY_CONSTANTS.COMBAT_DEGRADATION`
- Each hit received degrades armor by `DURABILITY_CONSTANTS.COMBAT_DEGRADATION`
- Items at `currentDurability <= 0` are **broken**: contribute zero stats to equipment calculations
- Warning notification fires when durability crosses `maxDurability * WARNING_THRESHOLD`
- Repair costs scale with damage; max durability decays slightly on each repair

## Equipment Constraints

- **Armor**: requires `characterLevel >= item.requiredLevel`
- **Weapons**: requires matching skill level >= `item.requiredLevel` for the weapon's `requiredSkill`
- **Stacked items**: cannot be equipped (must be `quantity === 1`)
- **Broken items**: equipped but contribute zero stats

## Inventory & Loot

- Backpack has capacity limit (`INVENTORY_CONSTANTS`)
- **Stackable items**: combine into existing stack (no extra slot needed if stack exists)
- **Non-stackable items**: one slot per item
- **Over-encumbrance**: blocks all major actions via `assertCanAct()`
- **Loot overflow**: if inventory full at loot time, items go to pending loot session; player claims later via `/inventory/loot/claim`
- **Stash**: separate storage with own capacity; deposit/withdraw including batch operations

## Skill & XP Rules

- Daily XP cap per skill (`SKILL_CONSTANTS.DAILY_XP_CAP`) — excess XP is silently wasted
- XP efficiency decays with skill level (diminishing returns)
- Guild XP bonus multiplier applies to raw XP if player is in guild
- Skill level ups cascade: skill XP → character XP → attribute points
- Skill points earned from skill levels: `(skillLevel - 1) * POINTS_PER_LEVEL` summed across all skills
- Talent tree nodes have prerequisites (other nodes) and skill level gates

### Systems That Grant XP
| System | Skill Type |
|--------|-----------|
| Combat victory | Split across melee/ranged/magic by damage dealt + resource cost per action type |
| Boss defeat | Per contributor |
| Crafting | Crafting skill for recipe |
| Gathering | Gathering skill (mining/foraging/woodcutting) |

### Per-Action Scaling
- Each combat action has a `scalingStat` (melee/ranged/magic/weapon)
- `weapon` resolves to equipped weapon's `requiredSkill`; explicit stats ignore weapon type
- Accuracy uses the action's stat: strength (melee), dexterity (ranged), intelligence (magic)
- Damage uses matching weapon power: `attack` (melee), `rangedPower` (ranged), `magicPower` (magic)
- `equipmentAccuracy` is universal — applies to all action types
- Guild `combatDamage` modifier applied via `PerActionScaling.guildDamageMultiplier`

### Combat XP Splitting
- Contribution per skill = damage dealt + (resource cost × `COMBAT_CONSTANTS.RESOURCE_XP_WEIGHT`)
- XP split proportionally by contribution; remainder goes to highest contributor
- Heals, buffs, and missed attacks contribute via resource cost (mana/stamina spent)
- DOT tick damage credits the source action's scaling stat (not the damage type)
- XP rounding uses `Math.round` to minimize loss from splitting

### DOT/HOT Effects
- Actions can apply damage-over-time (DOT) or heal-over-time (HOT) effects
- Damage is snapshotted at application: flat amount + % of initial hit damage
- DOT ticks respect target defence/magic defence based on `dotDamageType`
- Same-name effects refresh duration (don't stack)
- Life leech: some offensive actions heal the attacker for a % of damage dealt (capped at max HP)

## Encounter Site Lifecycle

```
Exploration discovers site → Site created (rooms + mobs)
    │
    ├── Player sets strategy (full_clear / room_by_room)
    ├── Player fights room by room
    ├── Rooms cleared → chest rewards granted
    │
    └── Site decays over time if not revisited (mobs despawn)
```

- **Full clear**: all rooms' turn costs charged upfront, no refund on defeat
- **Room by room**: pay per room
- **HP carries between rooms** in same session
- **Decay**: if room empties from decay, auto-advances to next room
- **Abandon**: player can abandon site (loses remaining rooms)

## Boss Encounter Lifecycle

```
WAITING ──(scheduled start)──→ ACTIVE ──(all rounds resolved)──→ DEFEATED
                                  │
                                  └──(time expires)──→ EXPIRED
```

- Signup costs turns per round
- Auto-signup if player has `autoSignUp=true` and sufficient turns (silent fail if not)
- Round resolution runs on server timer (every 60s check)
- Loot distributed proportional to damage/healing contribution
- Threat table determines boss targeting priority

## PvP Rules

- Minimum character level gate: `PVP_CONSTANTS.MIN_CHARACTER_LEVEL`
- ELO bracket matching: opponents within `PVP_CONSTANTS.BRACKET_RANGE`
- Cooldown after attacking same opponent
- Scouting requires town zone + turn cost
- Admin role bypasses cooldowns (testing)

## Guild Rules

- **Join requirements**: `characterLevel >= GUILD_CONSTANTS.JOIN_MIN_LEVEL`, not already in a guild
- **Recruitment modes**: `open`, `request_to_join`, `closed`
- **Member cap**: `calculateMaxMembers(guild.level)` — grows with guild level
- **Leader cannot leave**: must transfer leadership first
- **Tax on all turn spending**: applied atomically, credited to guild treasury
- **Specialization**: warfare/crafting/gathering etc., costs treasury to select/respec
- **Contracts**: weekly rotation, expire at deadline, reward treasury on completion
- **Projects**: treasury cost to start, players contribute turns/materials, completion grants rewards

## World Events

- Zone-scoped or world-wide (`zoneId = null`)
- Can target specific mob family or resource type
- Effect types: `damage_up/down`, `hp_up/down`, `spawn_rate_up/down`, `drop_rate_up/down`, `yield_up/down`
- Multiple events in same zone **stack multiplicatively**
- Only `status = 'active'` events apply

## Item Special Properties

- **Soulbound**: certain boss/cache recipes marked `soulbound: true` — cannot be sold/traded
- **Consumables**: items with `consumableEffect` (heal_flat, heal_percent, restore_stamina, restore_mana)
- **Rarity progression**: common → uncommon → rare → epic → legendary
- **Gem crit bonuses**: gems provide crit chance/damage bonuses per `GEM_CRIT_CONSTANTS`

## Resource System (Stamina & Mana)

- Passive regen per second based on skill levels
- Combat rounds provide additional per-round regen
- Combat actions consume stamina or mana
- Can rest (spend turns) to restore via `/resources/rest`
- Lazy calculation from `lastRegenAt` timestamp

## Training System

- Can only train against mobs in player's bestiary
- Prefix variants require having encountered that specific prefix
- Cooldown after each training fight (Redis-stored, `TRAINING_CONSTANTS.COOLDOWN_SECONDS`)
- No loot/XP — practice only

## Casino

- Token exchange: spend turns to get casino tokens
- Roulette: Socket.IO real-time rounds, bet placement, history tracking
- Round lifecycle managed server-side with scheduled resolution
