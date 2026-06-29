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
| Expedition Signup | `EXPEDITION_CONSTANTS.SIGNUP_TURN_COST` per player |
| Expedition KO Recovery | 500 turns (between rooms) |

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

## Exploration Targeting

- Players can select an unlocked exploration tier for wild-zone exploration.
- Mob family tracking targets the highest member tier in that family that is unlocked and at or below the selected tier.
- If tracking falls back below the selected tier, zone exploration progress is paused for that run and the response includes a user-facing pause reason.
- Tracking still lowers broad combat/site yield and does not remove non-family outcomes such as resources, caches, and exits.

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
- **War Room guild-bank funding**: guild treasury turns can fund War Room project turn progress without counting against any individual member's per-project turn cap

## World Events

- Zone-scoped or world-wide (`zoneId = null`)
- Can target specific mob family or resource type
- Effect types: `damage_up/down`, `hp_up/down`, `spawn_rate_up/down`, `drop_rate_up/down`, `yield_up/down`
- Multiple events in same zone **stack multiplicatively**
- Only `status = 'active'` events apply

## Item Special Properties

- **Soulbound**: certain boss/cache recipes marked `soulbound: true` — cannot be sold/traded
- **Consumables**: items with `consumableEffect` (heal_flat, heal_percent, restore_stamina, restore_mana, cleanse_magic_dot, buff_attack, buff_defence)
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

## Combat Templates

Ordered action slot lists defining a player's combat rotation for auto-resolved combat (encounters, expeditions, bosses).

- Max 10 templates per player
- Must have at least one slot; first created template is auto-activated
- Active template cannot be deleted
- Each slot references an action ID (must be in `ALWAYS_AVAILABLE_ACTION_IDS` or unlocked via skill points)
- Default action when no template exists: `light_attack`
- **Cycling**: round counter increments each round; resolver picks slot at `templateRound % slots.length`

### Conditional Slots
- Each slot has a default `actionId` plus an optional `condition` + `thenActionId`
- Condition types: `resource_below`, `resource_above`, `has_buff`, `has_debuff`, `no_buff`, `no_debuff`, `any_debuff`, `any_magic_dot`
- Resource conditions specify `resource` (hp/stamina/mana) and `threshold` (0–100%)
- Buff/debuff conditions specify `effectName`
- When condition is true, `thenActionId` executes instead of the default

## Hit Resolution (Mode-Aware)

Hit chance uses a sigmoid curve: `1 / (1 + ((avoidScore + bias) / hitScore) ^ exponent)`, clamped between min/max.

| Mode | Min Hit | Max Hit | Bias | Exponent |
|---|---|---|---|---|
| `pvp` | 10% | 95% | 5 | 2.4 |
| `pve_open_world` | 25% | 95% | 10 | 1.5 |
| `pve_expedition` | 20% | 95% | 8 | 1.8 |
| `pve_boss` | 35% | 98% | 12 | 1.35 |

- PvP: most punishing (lowest floor, steepest curve) — evasion matters most
- Boss: most forgiving (35% floor, 98% cap) — few total misses
- Used for both player-vs-mob and mob-vs-player unless action has `alwaysHits: true`

## Threat System

Applies to boss encounters and guild expeditions (raid round resolver).

- Each player has a threat value, initialized to 0 at room/encounter start
- Damage adds threat: `damage * BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_DAMAGE`
- Healing adds threat: `healAmount * BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_HEAL`
- Taunt action: adds `TAUNT_THREAT_BONUS` flat threat, sets taunt timer to action's duration
- **Single-target** mob attacks choose highest-threat alive player; taunters evaluated first
- **AoE** mob attacks hit all alive players regardless of threat
- Taunt timers tick down by 1 each round after mob actions
- Threat persists across rounds within a room but **resets to 0** between rooms

## Potion System (Cleanse & Buff)

Six potion types: `hp`, `stamina`, `mana`, `cleanse`, `buff_attack`, `buff_defence`

- Auto-used during combat via template actions (`use_cleanse_potion`, `use_resist_potion`, `use_elixir_of_power`)
- Each costs 5 stamina
- **Potion sickness**: after using any potion, a `potionSickness` debuff applies for N rounds; while active, potion actions fail
- On failure (no potion, sickness, nothing to cleanse): falls back to the slot's `thenActionId`
- **Cleanse**: removes all stat debuffs plus up to N worst magic DoT groups (ranked by total damage); N = potion's `buffValue` (0 = all)
- **Buff attack**: 25% attack boost for 5 rounds
- **Buff defence**: +15 defence and +15 magic defence for 5 rounds
- Potions consumed from inventory after each round

## Guild Expeditions

### State Machine

```
recruiting ──(signup window ends + min players)──→ in_progress ──(all rooms cleared)──→ completed
    │                                                  │
    │                                                  ├──(all players dead)──→ wipe
    │                                                  │                         │
    │                                                  │    (wipeCount < 3)──→ recruiting (re-open)
    │                                                  │    (wipeCount >= 3)──→ failed
    │                                                  │
    │                                                  └──(officer abandons)──→ failed
    └──(not enough players)──→ failed
```

### Lifecycle
- Officers/leaders launch expedition (tier 1–3), deducts treasury cost
- 10-minute signup window; guild members spend 300 turns to join
- Level requirements: tier 1 = 10, tier 2 = 16, tier 3 = 23; min players: 5/8/12
- Officers can force-start early
- Room-by-room dungeon: 5/6/8 rooms by tier; types: `trash`, `elite`, `mini_boss`, `event`, `final_boss`
- Rounds resolve on background timer (2–3 min intervals by room type)
- Each round: players act via combat template, mobs act via scripted template, damage/healing/threat tracked

### Room Transitions
- On room clear: 5-min rest phase; HP/stamina/mana regen (20%/30%/30% of max); KO'd players un-KO; all active effects cleared
- On wipe (all dead): increment wipe count; if < 3, reset to `recruiting` with regenerated rooms (same theme); if >= 3, auto-fail

### Cross-System Lockouts
- Active expedition blocks: combat (encounter sites), exploration, zone travel
- Cannot sign up while in recovery state
- KO'd members can recover between rooms (500 turns, 30% max HP)

### Economy
- Token currency (`expeditionTokens`); awarded per room (flat, type-based, tier-multiplied)
- Completion bonus = 100% of total room token value
- Loot per room weighted by contribution (damage + healing); loot multiplier varies by room type (1x–3x)
- Guild XP: 25 per room cleared, 100 bonus on completion

### Cooldowns
- Weekly cooldown per tier (7 days from completion)
- Between-expedition cooldown (18 hours from any completion/failure)
- One active expedition per guild at a time

### Themes
- Pre-defined mob rosters per tier; random theme chosen at launch, persists across wipe retries
- Boss has HP threshold phases at 50% and 25%
- Boss can summon adds (up to 8 total); summoned mobs do NOT act the round they spawn

## Tutorial System

Linear 9-step tutorial tracked by `tutorialStep` on Player (default 0).

Steps: 0 Welcome → 1 Explore → 2 Combat → 3 Gather → 4 Travel → 5 Refine → 6 Craft → 7 Equip → 8 Done → 9 Completed

- Active when `0 <= step < 9`; step -1 = skipped
- Each step has a banner, dialog, optional tab pulse, and optional screen navigation
- Advancement via `PATCH /player/tutorial`
- Tutorial is client-driven; no server-side action guards based on step

## Player Preferences

Per-player settings stored as columns on the Player model.

| Setting | Type | Range | Default |
|---|---|---|---|
| `combatLogSpeedMs` | int | 100–1000 (step 100) | 800 |
| `explorationSpeedMs` | int | 100–1000 (step 100) | 800 |
| `autoSkipKnownCombat` | bool | — | false |
| `defaultExploreTurns` | int | 10–10000 (step 10) | 100 |
| `quickRestHealPercent` | int | 25–100 (step 25) | 100 |
| `defaultRefiningMax` | bool | — | false |

- Updated via `PATCH /player/settings` (any subset, at least one field required)
- Validated via Zod at the route layer
- Purely client-side UX hints; no effect on server-side game logic

## Casino

- Token exchange: spend turns to get casino tokens
- Roulette: Socket.IO real-time rounds, bet placement, history tracking
- Round lifecycle managed server-side with scheduled resolution
