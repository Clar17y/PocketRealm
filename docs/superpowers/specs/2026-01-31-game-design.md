# Async Adventure RPG - Game Design Document

## 1. Core Concept

A persistent, asynchronous adventure RPG where:
- Turns regenerate in real-time (1 per second)
- All actions cost turns
- Power progression is daily-capped via diminishing returns
- Buying turns benefits everyone globally (social spend model)
- Combat resolution is instant/server-side
- Skill expressed through preparation and decisions, not reaction speed

**Design pillars:**
1. Turns buy opportunity, not power
2. Classless progression - your "build" emerges from turn investment
3. Paying increases breadth and efficiency, not ceilings
4. No mandatory resets
5. All outcomes are server-authoritative

**Reference games:** StreetWarz (turn bank, mob bonuses, global sharing), RuneScape (skill-based progression, equipment requirements)

---

## 2. Turn Economy

### Generation
- **Rate:** 1 turn per second (86,400/day passive)
- **Bank cap:** ~64,800 turns (18 hours)
- **Design intent:** Check in slightly more than once per day, not so often it encourages botting

### Daily Progression Limits

| Skill type | Limit mechanism |
|------------|-----------------|
| Combat skills | Hard daily cap on XP/levels |
| All other skills | Diminishing returns curve, eventually hitting 0% |

**Efficiency curve (non-linear):**
- Starts at 100%
- Smooth decay as turns spent increases
- Eventually hits 0% (hard cap)
- First turns very valuable, late turns nearly worthless
- Formula: `efficiency = max(0, 1 - (turns/cap)^n)` (tunable)

**UX requirement:** Clearly display current efficiency % and estimated turns until daily cap per skill.

### Global Turn Sharing (Social Spend)

When a player purchases turns:

| Recipient | Amount |
|-----------|--------|
| All players globally | 25% of purchased turns |
| Buyer's guild members | 30% of purchased turns |

**Constraints:**
- Daily cap on shared turns (~$20 equivalent) to prevent runaway acceleration
- Delivery: Instant to bank
- Visibility: Silent (no public callout to avoid embarrassing buyers)

---

## 3. Character System

### Philosophy
Classless, RuneScape-style. No class selection at creation. Your "class" emerges from how you invest turns. Can't max everything due to turn constraints.

### Skills

**Combat Skills** (leveled via combat, hard daily cap)

| Skill | Purpose |
|-------|---------|
| Melee | Melee weapon requirements, melee damage scaling |
| Ranged | Bow/crossbow requirements, ranged damage scaling |
| Magic | Staff/wand requirements, spell power scaling |
| Defence | Armor requirements, damage reduction |
| Vitality | HP pool, HP regen rate |
| Evasion | Dodge chance |

**Gathering Skills** (leveled via gathering, diminishing returns)

| Skill | Resources |
|-------|-----------|
| Mining | Ore, gems, stone |
| Woodcutting | Logs, sap, bark |
| Herbalism | Herbs, flowers, roots |
| Fishing | Fish, shells, salvage |

**Crafting Skills** (leveled via crafting, diminishing returns)

| Skill | Creates | Also repairs |
|-------|---------|--------------|
| Weaponsmithing | Swords, axes, maces | Same |
| Armorsmithing | Plate armor, shields | Same |
| Leatherworking | Leather armor, bags | Same |
| Tailoring | Cloth armor, capes | Same |
| Bowcraft | Bows, crossbows, arrows | Same |
| Jewelcrafting | Rings, amulets, charms | Same |
| Alchemy | Potions, consumables | N/A |
| Enchanting | Staves, wands, imbuing | Same |

**Utility Skills**

| Skill | Leveled by | Purpose |
|-------|------------|---------|
| Diplomacy | Guild actions | Guild benefits, guild NPC unlocks |

### Skill Leveling
- Exponential turn cost per level (RuneScape-style)
- Higher levels = more turns required
- Creates natural specialization - can't master everything

---

## 4. Equipment System

### Equipment Slots (11 total)

| Slot | Typical stats | Crafted by |
|------|---------------|------------|
| Head | Armor, Health, Magic | Armorsmithing / Leatherworking / Tailoring |
| Neck | Luck, utility | Jewelcrafting |
| Chest | Armor, Health | Armorsmithing / Leatherworking / Tailoring |
| Gloves | Attack, Evasion | Armorsmithing / Leatherworking / Tailoring |
| Belt | Health, utility | Leatherworking / Tailoring |
| Legs | Armor, Evasion | Armorsmithing / Leatherworking / Tailoring |
| Boots | Evasion, Speed | Leatherworking |
| Main hand | Attack/Magic/Ranged | Weaponsmithing / Bowcraft / Enchanting |
| Off-hand | Armor or damage | Armorsmithing (shields) / Weaponsmithing / Enchanting |
| Ring | Luck, crit, utility | Jewelcrafting |
| Charm | Luck, special effects | Jewelcrafting |

**Two-handed weapons:** Occupy both Main hand and Off-hand, stronger stats.

**Luck is jewelry-focused:** Rings, charms, and neck slots are primary source of Luck stat.

### Skill-Equipment Interaction

| Concept | How it works |
|---------|--------------|
| Requirement | Need X skill level to equip item |
| Scaling | Skill level beyond requirement increases effectiveness |

**Example:** Dragonbone Sword (requires 50 Melee)
- 49 Melee: Can't equip
- 50 Melee: Base damage
- 70 Melee: Base + 20 levels of bonus scaling
- 100 Melee: Base + 50 levels of bonus scaling

### Equipment Stats

**Core (launch):**

| Stat | Effect |
|------|--------|
| Attack | Physical damage bonus |
| Magic Power | Spell damage bonus |
| Ranged Power | Ranged damage bonus |
| Armor | Damage reduction |
| Health | Bonus HP |
| Evasion | Dodge chance bonus |
| Luck | Drop rates, crit, crafting rolls (gear-only, not trainable) |

**Nice-to-have (later):**
- Crit Chance
- Speed / Initiative
- Resistances (Fire, Ice, Poison, etc.)
- Health Regen

### Durability System

| Mechanic | Description |
|----------|-------------|
| Durability | Items have durability (e.g., 100/100). Usage depletes it. |
| Broken | At 0 durability, item unusable until repaired |
| Repair cost | Turns + materials |
| Max durability decay | Each repair reduces max (100 → 95 → 90...) |
| Repair skill | Tied to crafting skill for that item type |
| Specialist bonus | Craftsmen repair with less max decay |
| Eventually destroyed | Gear is long-term consumable |

### Equipment Sources

| Source | Quality |
|--------|---------|
| Dropped (rare) | Best possible |
| Crafted | On par or slightly below best drops |
| Soulbound | Raid/world boss loot (not tradeable) |

---

## 5. World & Zones

### World Structure

| Aspect | Decision |
|--------|----------|
| Structure | Node graph - zones connect to specific neighbors |
| Biome layers | Must traverse outer zones to reach inner (Forest Edge → Deep Forest → Ancient Grove) |
| Multiple paths | Several entry zones might connect to deeper areas |
| Hidden until discovered | Zone names/details unknown until you arrive |
| Open access | Can go anywhere, but high level areas punish low level players |

### Travel & Exploration (Unified)

Travel and exploration are the same mechanic - both cost turns.

| Aspect | Decision |
|--------|----------|
| Travel cost | Distance-based, varies by zone terrain |
| Starter areas | Cheaper to travel to/from |
| Remote zones | Harder to reach (mountains = expensive) |
| No separate travel action | It's all exploration |

### Exploration Probability Model

**Per-turn probability with cumulative calculation:**

| Concept | Formula |
|---------|---------|
| Per-turn chance | Each turn has tiny % for each outcome |
| Cumulative chance | `1 - (1 - p)^n` where p = per-turn %, n = turns |
| Natural diminishing returns | Going from 1000→2000 turns helps less than 100→1100 |
| Never guaranteed | Even massive turn investment can't reach 100% |

**Example: Hidden Cache (0.01% per turn)**

| Turns spent | Chance to find |
|-------------|----------------|
| 100 | ~1% |
| 1,000 | ~9.5% |
| 5,000 | ~39% |
| 10,000 | ~63% |

**Player control:**
- Slider from minimum (traverse zone) to max (all your turns)
- See estimated odds update as you adjust
- Small batches = more control (stop when you find what you want)
- Large batches = less babysitting, walk away
- Log playback reveals results narratively for immersion

### Exploration Outcomes

| Discovery type | Description |
|----------------|-------------|
| Resource nodes | Gathering spots for materials |
| Mob encounters | Combat, loot, XP |
| Hidden caches | Treasure, rare items |
| Path to new zone | Discover connections, unlock travel |
| Rare events | Mini-events, special encounters |
| Zone secrets | Lore, bestiary info, shortcuts |

### Bestiary

| Feature | How it works |
|---------|--------------|
| Discovery | First encounter with mob unlocks entry |
| Hidden info | Starts as "???" |
| Revealed over time | More kills = more info unlocked |
| Contents | Zones found in, weaknesses, strengths, drop table |
| Strategic value | Know what gear to bring, where to farm |

### Example Zone Structure (MVP: 5-8 zones)

**Forest Biome:**

| Zone | Description | Difficulty | Travel cost |
|------|-------------|------------|-------------|
| Forest Edge | Bright, paths, starter mobs | Low | Cheap |
| Deep Forest | Dense, darker, predators | Medium | Moderate |
| Ancient Grove | Magical, rare herbs, spirits | High | Expensive |

**Cave/Mine Biome:**

| Zone | Description | Difficulty | Travel cost |
|------|-------------|------------|-------------|
| Cave Entrance | Basic ore, low danger | Low | Cheap |
| Deep Mines | Better ore, cave-ins, creatures | Medium | Moderate |
| Crystal Caverns | Rare gems, dangerous, magical | High | Expensive |

---

## 6. Activities

### Adventure Types

| Type | Turn cost | Description |
|------|-----------|-------------|
| Single encounter | Low | One monster, quick, high volume. Grind specific loot tables. |
| Multi-node dungeon | Medium | 3-5 nodes (combat, event, choice, boss). Narrative, decisions. |
| Scaling depth | Variable | Spend more to push deeper floors. Fail deeper = partial loss. |
| Zone exploration | Variable | Non-combat rewards, discovery, unlocks. Turn slider for investment. |
| Guild raids | Committed in advance | Pooled turns, scheduled start, shared rewards. |
| World bosses | Pledge turns | Global events, contribution-based rewards. |

### Adventure Flow
1. Spend turns to start (turn cost varies by activity)
2. Select pre-run decisions (loadout, NPC companion, tactics)
3. Server resolves encounter(s) using combat system
4. Results returned as log (narrative playback)
5. Rewards distributed

### Combat Resolution (D&D-Style)

**Per-round flow:**
1. Roll initiative (d20 + Speed + gear) - determines turn order
2. Each combatant acts in order
3. Attacker rolls to hit (d20 + skill + gear) vs defender's defense
4. Evasion check - chance to dodge entirely
5. If hit lands, roll damage (weapon min-max range) minus armor
6. Apply effects (spells, conditions, buffs, debuffs)
7. Check for death/conditions
8. Next round until one side wins

**Damage system:**

| Aspect | How it works |
|--------|--------------|
| Weapon damage | Min-max range (e.g., 4-12), not dice notation |
| Low variance | Tight range (8-10) - consistent, reliable |
| High variance | Wide range (2-18) - swingy, high risk/reward |
| Backend | Dice rolls hidden, player sees simple numbers |

**Hit/Miss/Defense layers:**

| Layer | How it works |
|-------|--------------|
| Attack roll | d20 + skill + gear vs target's defense rating |
| Evasion | Separate roll - chance to dodge entirely |
| Armor | If hit lands, reduces damage taken |
| Miss | Evaded = 0 damage |
| Hit | Damage minus armor reduction |

**NPC predictability (learnable patterns):**

| Aspect | How it works |
|--------|--------------|
| Spell order | NPCs cast in set pattern (revealed in bestiary) |
| Tells | "Goblin Shaman always fireballs on round 3" |
| Counterplay | Equip fire resist, time your abilities |
| Boss mechanics | Multi-phase, predictable rotations |

**Weapon situational value:**

| Weapon type | Good for | Bad for |
|-------------|----------|---------|
| Cleave/AoE | Packs of small mobs | Single target bosses |
| Single target | Bosses, tough elites | Getting swarmed |
| Magic AoE | Groups, damage over time | Magic-resistant enemies |

### Training Skills (Late-Game Optimization)

**Philosophy:**
- Side stats, not core progression
- Not needed early game
- Required for world bosses, hard content, PvP optimization
- Turn sink for veterans

**Training skills:**

| Training skill | Improves | Location type |
|----------------|----------|---------------|
| Accuracy | Hit chance | Archery ranges, target grounds |
| Reflexes | Initiative, turn order | Sparring arenas, dojos |
| Focus | Spell power, magic crit | Temples, meditation groves |
| Agility | Evasion, dodge | Obstacle courses, ruins |
| Fortitude | Health, damage resistance | Harsh environments, mountains |
| Blocking | Armor effectiveness, parry | Barracks, forts |

**Training locations:**
- Specific locations for each training type
- Discovered via exploration (hidden at first)
- Quality tiers (basic anywhere, best facilities hidden/remote)
- Creates travel incentive and zone identity
- Social hubs where players gather

### Skill Expression
Skill lives in:
- Build composition
- Risk assessment
- Pre-run decisions
- Knowledge of encounter pools
- Gear optimization between raid stages

NOT in:
- Click speed
- Being online at specific time

---

## 7. PvP System

### Core Model

| Aspect | Decision |
|--------|----------|
| Style | Async ghost-based (snapshot of opponent) |
| Rating | Competitive leaderboard, seasonal incentive |
| Rating bracket | ±25% - can only attack within range |
| Turn cost | Costs turns to attack |
| Shield | Spend X turns = 2X turns of protection |
| Shield breaks | Any power-gaining action removes shield |

### Stakes

| What's at risk | Details |
|----------------|---------|
| Gold | Loser loses 15%, winner gains 10% (5% sink) |
| Rating | Loser loses rating points |
| Durability | Both sides lose durability on gear used |
| NPC companion | Attacker consumes theirs |

### Defense

| Aspect | How it works |
|--------|--------------|
| Ghost defense | Fights with your last loadout + NPC if set |
| Offline attacks | Your snapshot fights, you see log when you return |
| Revenge | 50% reduced turn cost to attack back |

### Protection Mechanics

| Protection type | How it works |
|-----------------|--------------|
| Shield | Spend turns to become unattackable |
| Guild vault | Protected gold storage, capacity scales with guild level |
| Personal protected | Limited safe storage (guild perk) |
| Unprotected gold | At risk when attacked |

### Anti-Griefing

| Measure | Purpose |
|---------|---------|
| Rating bracket (±25%) | Can't attack vastly weaker/stronger players |
| Bot accounts for launch | Seed game with fake players at each rating tier |
| Shield system | Can protect yourself by spending turns |

---

## 8. World Events & News System

### Dynamic News (inspired by StreetWarz)

| Aspect | How it works |
|--------|--------------|
| Random events | News items trigger world state changes |
| Effects | Bonuses or penalties on specific activities |
| Timing | Semi-random, weighted toward certain times of week |
| Duration | Each event lasts X hours/days |
| Multiple active | Several news items can be active at once |
| Negative events | Yes - creates urgency to use turns, not hoard |

### Example News Events

| News | Effect |
|------|--------|
| "Heavy rains boost crop growth" | +25% herbalism yields |
| "Goblin raiders spotted near Millbrook" | +50% XP in that zone |
| "Iron shortage hits smiths" | Weaponsmithing costs +20% materials |
| "Festival of Lights begins" | Jewelcrafting +30% XP |
| "Dragon sighted in the mountains" | World boss spawns |
| "Fire threatens Oakdale village" | Resource donation event |
| "Trade routes reopened" | Market fees reduced |

### World Boss Events

| Aspect | Decision |
|--------|----------|
| Trigger | News events spawn world bosses |
| Contribution types | Varies by event (damage, resources, crafted items) |
| Metric | Actual output matters (damage dealt, resources donated), not turns spent |
| Minimum threshold | Must contribute X to qualify for rewards |

### World Event Rewards

| Component | How it works |
|-----------|--------------|
| Guaranteed gold | Scales with contribution amount |
| Loot lottery | All qualifiers enter, RNG determines drops |
| Rare drops | Epic/legendary possible but very low % |
| Best loot | Only available if event completed successfully |

---

## 9. Tavern Casino (Loot Boxes)

### Regular Boxes

| Aspect | Decision |
|--------|----------|
| Currency | Gold only |
| Turn cost | Yes - "spending time at the casino" |
| Contents | Gear, materials, consumables, cosmetics |
| Rates | Published and transparent |
| Pity system | Guaranteed after X attempts |
| Theme | Tavern casino, gambling flavor |

### Event Boxes

| Aspect | Decision |
|--------|----------|
| Availability | During world events only |
| Contents | Themed, exclusive items not obtainable elsewhere |
| Cost | More expensive (gold), no turn cost (already spent on event) |
| Rarity | Same published rates, exclusive item pool |

---

## 10. Guilds

### Core Benefits
- Access to guild NPCs
- Guild upgrades (time-based boosts)
- Diplomacy skill leveling
- Coordinated raids
- Protected storage (scales with level)
- Bonus turn sharing from whale purchases (30% vs 25%)

### Guild Upgrades
Members collectively spend turns/resources to unlock:

| Upgrade | Effect |
|---------|--------|
| XP Boost | +X% XP for 1 hour (guild-wide) |
| Turn Efficiency | -X% turn cost for 1 hour |
| Gathering Bonus | +X% materials for 1 hour |
| Luck Aura | +X luck for 1 hour |
| Raid Tier | Unlocks harder raid content |
| NPC Slots | More NPC types available |
| Vault Capacity | More protected storage |

### Guild NPCs

**Roles:**

| Role | Function |
|------|----------|
| Tank | Absorbs damage, protects party |
| Healer | Restores HP during/after encounters |
| Melee DPS | Physical damage dealer |
| Ranged DPS | Ranged damage dealer |
| Mage DPS | Magic damage dealer |
| Support | Buffs, debuffs, turn cost reduction |
| Scout | Better loot, trap detection, exploration bonuses |
| Gatherer | Bonus materials from gathering activities |

**NPC Economy:**

| Layer | Who pays | What's spent | Effect |
|-------|----------|--------------|--------|
| Template level | Guild collectively | Turns | Better base stats for NPC type |
| Summon | You personally | Turns | Bring NPC on adventure |
| Equipment | You personally | Actual gear items (consumed) | NPC power boost |

**Rules:**
- 1 NPC per player per adventure (regardless of content)
- Guild raids: group coordinates who brings what role
- NPCs weaker than players but useful
- Consumable: NPC disappears after adventure regardless of outcome
- Choice: bring one or not (save for when you need them)
- Equipment given to NPCs is consumed (gear sink)

### Guild Raids

**Structure:**

| Aspect | Decision |
|--------|----------|
| Turn pooling | Minimum total to start, one whale or collective |
| Participation | Minimum turns to join, everyone contributes |
| Weekly limit | One raid per dungeon per week |
| Multi-level | Dungeon has stages, each stage = "go" moment |
| No branching | Not "X or Y" choices, just "ready for next level" |

**Timing:**

| Phase | How it works |
|-------|--------------|
| Scheduled start | Leader sets time, raid begins then |
| Round timer | 5-10 minutes between rounds |
| Between rounds | Review logs, swap gear, prep NPCs, apply buffs |
| Auto-progress | Next round starts when timer ends |

**Combat Resolution:**

| Mechanic | How it works |
|----------|--------------|
| Player deaths | Killed one by one during round resolution |
| Party weakens | Less damage output as members fall |
| Wipe condition | Total party HP reaches 0 |
| RNG tension | Unlucky crit on key player can doom a run |

**Participation Modes:**

| Mode | Description |
|------|-------------|
| Online | Can optimize gear/NPC between stages |
| Offline | Snapshot used, can't adjust, still participates |

**Loot:**

| Aspect | Decision |
|--------|----------|
| Everyone gets something | Contribution-based minimum |
| Best loot | Only if completed without wipe |
| Distribution method | Gacha with guild tokens |
| Soulbound | Raid loot is soulbound |
| Redistribution | Guild can trade/gift internally if they choose |

---

## 11. Trading & Marketplace

### Market Structure

| Aspect | Decision |
|--------|----------|
| Format | Direct listings (buy now, no bidding) |
| Listing fee | Gold cost to post (sink even if unsold) |
| Sale tax | % taken on successful sale (sink) |
| Tradeable | Everything except soulbound items |
| Soulbound | Raid loot, world boss loot |
| Scope | Global market, cross-guild |
| Price controls | Free market |

### Anti-Bot Measures

| Measure | Implementation |
|---------|----------------|
| Listing limits | Max X listings per day per account |
| Trade velocity | Max gold value bought/sold per day |
| New account gate | Must reach X hours played or Y level before trading |

**Natural limits already in place:**
- Diminishing returns on all skills
- Hard daily caps on combat XP
- Turn bank cap

---

## 12. Monetization

### What Is Sold
- Turn packs (consumable)
- Optional subscriptions (future)
- Cosmetics and prestige items

### What Is Never Sold
- Raw stats
- Power ceilings
- PvP win probability

### Social Spend Model
Purchasing turns benefits everyone:
- 25% to all players globally
- 30% to buyer's guild
- Daily cap (~$20 equivalent) prevents runaway acceleration
- Silent delivery (no public shaming)

---

## 13. Platform & Tech Stack

### Client
- **Primary:** Next.js (TypeScript) PWA
- **Native wrappers:** Capacitor for iOS/Android
- **Rationale:** Web-first for speed, wrap early for push notifications + IAP compliance

### Backend
- Node.js (TypeScript)
- PostgreSQL (persistent state)
- Redis (rate limits, caching, turn regen timing)
- Job runner (BullMQ or similar) for turn accrual, raid resolution, notifications

### Push Notifications
- iOS: APNs (via Capacitor)
- Android: FCM (via Capacitor)
- Web: Web Push (best effort, less reliable on iOS)

### In-App Purchases
- RevenueCat for cross-platform entitlement management
- Store-compliant IAP only

---

## 14. New Player Experience

### Starting State

| Aspect | Decision |
|--------|----------|
| Starting turns | Full day's worth (~86,400) - immediate engagement |
| Starting zone | Single zone for MVP, race/faction zones later |
| Starting gear | Basic equipment for chosen focus (melee/ranged/magic starter kit) |

### Catch-up via Cap Exemption

Daily caps don't apply until you're competitive with top players:

| Skill type | Threshold | Example |
|------------|-----------|---------|
| Combat skills | 80% of top player | Top is 50, cap kicks in at 40 |
| Non-combat skills | 90% of top player | Top is 50, cap kicks in at 45 |
| Per-skill tunable | Yes | Adjust based on balance needs |

**Why this works:**
- First movers keep edge (always at 100%, always capped)
- New players catch up fast (grind freely until competitive)
- Can't pay-to-win past leaders (cap kicks in before overtaking)
- Feels fair (not "behind forever")

### Tutorial (Integrated into Starter Zone)

| Phase | What player learns |
|-------|-------------------|
| Wake up / spawn | Basic UI, turn bank display |
| Training dummy fight | Combat, turn cost, XP gain |
| Explore the area | Exploration slider, turn investment |
| Find resource node | Gathering basics |
| Discover exit path | Triggers real mob encounter |
| Survive first real fight | Stakes are real now |
| Leave starter zone | World opens up, tutorial complete |

**Tutorial design principles:**
- Interactive tooltips appear contextually
- Starter zone naturally gates (must explore to find exit)
- Finding exit forces a real battle
- Skip button always available for alts/experienced players
- No "click here, now click here" hand-holding

### Wiki (Full Transparency)

In-game link to external wiki containing:

| Published | Contents |
|-----------|----------|
| Combat formulas | Damage calc, defense, evasion, etc. |
| Drop rates | Every mob's loot table with % |
| Exploration rates | Per-turn probabilities for all discoveries |
| Crafting formulas | Success rates, material costs |
| Skill XP curves | Exact turn costs per level |
| Bestiary data | Full details once discovered in-game |

Players who want to min-max can. No hidden mechanics, no datamining needed.

---

## 15. MVP Scope

### Philosophy
Tiny, playable, test if core loop is fun. No guilds, no complexity.

### MVP Includes

| Feature | Scope |
|---------|-------|
| **Turn economy** | Generation (1/sec), bank (18hr cap), spending |
| **Starter zone only** | 1 zone, tutorial integrated, ~5-8 mobs |
| **Basic exploration** | Slider, probability model, log playback |
| **Single encounters** | Fight mobs, get XP, get loot |
| **Combat skills** | Melee, Ranged, Magic, Defence, Vitality, Evasion |
| **1 gathering skill** | Mining (test the loop) |
| **1 crafting skill** | Weaponsmithing (test the loop) |
| **Basic equipment** | 3-4 tiers, core slots only |
| **Bestiary** | Unlocks on first encounter |
| **Basic inventory** | Manage items, equip gear |
| **Durability** | Simple version, gear degrades |

### MVP Excludes

| Feature | Why defer |
|---------|-----------|
| Guilds | Complex, needs player base |
| Guild NPCs | Depends on guilds |
| Raids | Needs guilds + scheduling |
| World events/news | Needs content breadth |
| Training skills | Late-game optimization |
| Multiple zones | Test one first |
| PvP | Test PvE loop first |
| Marketplace | Needs economy scale |
| IAP/monetization | Test fun first |
| Loot boxes/casino | Needs economy first |

### MVP Asset Requirements

| Category | Count | Items |
|----------|-------|-------|
| Combat skill icons | 6 | Melee, Ranged, Magic, Defence, Vitality, Evasion |
| Gathering/crafting icons | 2 | Mining, Weaponsmithing |
| Equipment slot icons | 11 | All slots |
| Starter weapons | 4-6 | Sword, axe, dagger, staff, bow, shield |
| Starter armor | 6-8 | Basic pieces per slot |
| Resources | 3-4 | Ore, ingots, leather |
| Starter mobs | 5-8 | Training dummy, rats, wolves, goblins, etc. |
| UI elements | 8-10 | Turns, XP, health, gold, buttons |
| Zone art | 1 | Starter zone illustration |

**Estimated total: ~50-60 icons**

---

## 16. Open Questions

### Specific Numbers (All Tunable)
- Turn costs per activity type
- Skill XP curves (exponential formula)
- Efficiency curve formula and thresholds
- Daily caps per skill type
- Equipment stat ranges per tier
- NPC summon costs
- Guild upgrade costs
- Durability decay rates
- Travel costs between zones
- Exploration probability rates
- PvP gold/rating loss amounts
- Shield duration formula
- Market fees (listing + tax %)
- Pity system thresholds

### Content Scope for MVP
- How many zones?
- How many mob types?
- How many equipment tiers?
- How many craftable items?
- Starting news events?

---

## 15. Next Steps

1. **Resolve remaining questions** - New player experience, catch-up mechanics
2. **Define MVP scope** - Exact content counts, feature cut line
3. **Lock specific numbers** - Start with best guesses, plan to tune
4. **Create implementation plan** - Backend first, then UI
5. **Prototype core loop** - Turn bank, exploration, one combat skill, one gathering skill
