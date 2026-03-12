# Guild System & Combat Rework Design

## Overview

Guild system with cooperative progression, per-round tactical combat, and dungeon raids. Guilds are the primary turn sink and social glue — members contribute through a tax on all actions, funding timed boosts, permanent project unlocks, and multi-room expedition raids.

Includes a combat action system rework: all combat (PvE, PvP, boss encounters, guild expeditions) moves from instant resolution to per-round action selection with tactical depth.

## 1. Core Guild Structure

### Guild Entity

| Field | Type | Details |
|-------|------|---------|
| name | string (3-32 chars) | Unique |
| tag | string (2-4 chars) | Unique, displayed as `[TAG]` prefix |
| description | string (max 200) | Public description |
| level | int (1-50) | Earned from guild XP |
| xp | bigint | Accumulated guild XP |
| maxMembers | computed | `10 + floor(level / 2)` → 10-35 members |
| recruitmentMode | enum | `open`, `invite_only`, `closed` |
| minLevelRequirement | int | Character level gate (0 = none) |
| taxRate | int (0-20) | Percentage of member turn spend sent to treasury |
| specialization | enum? | `warfare`, `industry`, `discovery` (nullable until level 10) |
| renown | int | Lifetime reputation score |
| seasonalRenown | int | Resets monthly |
| treasuryTurns | int | Pooled turns from tax |
| treasuryCap | computed | `100,000 + (level * 10,000)` |

### Creation Requirements
- **50,000 turns** deducted from creator
- **Character level 20+** to create
- Creator becomes leader

### Roles

| Role | Permissions |
|------|-------------|
| Leader | All: disband, promote/demote officers, change settings, start projects/expeditions, manage vault, set tax rate |
| Officer | Invite, kick members, activate upgrades, manage contracts |
| Member | Chat, contribute to projects/contracts, join expeditions, deposit items |

### Membership Rules
- Character level 10+ to join any guild
- One guild per player
- Leave: free, immediate. Leader must transfer leadership or disband first
- Kick: officer+ kicks members, leader kicks anyone
- Disband: leader only, vault items returned to leader inventory

### Guild XP Sources

| Source | XP |
|--------|-----|
| Member mob kill | 1 |
| Member craft (non-refining) | 2 |
| Member boss round participation | 10 |
| Contract completion | 100-500 |
| Project completion | 500-2,000 |
| Member joins | 50 (one-time) |

Level curve: `xpRequired = floor(100 * level^1.8)`. Level 10 ~6,310 XP. Level 25 ~30,000 XP. Level 50 ~200,000 XP.

### Guild Activity Log

Logged events visible to all members: member joins/leaves/kicked, upgrade activated, contract completed, project milestone, expedition launched/completed, role changes.

## 2. Guild Chat

Existing `ChatChannelType` already includes `'guild'`. Implementation:

- Channel ID = guild ID
- Only members can send/receive
- System messages for guild events (joins, leaves, upgrades, contract completions, expedition results)
- Same rate limits as existing chat
- Accessible from guild screen tab + main ChatPanel overlay
- Tactical coordination channel during raids/expeditions

## 3. Guild Treasury & Tax

### Guild Tax

Members lose a percentage of turns on every action. Tax funds the guild treasury.

- Leader/officers set tax rate: 0-20% in 1% increments
- When a member spends turns on ANY action, tax % is deducted
- Example: 10% tax, 1,000 turns exploring → 900 turns to exploration, 100 to treasury
- The action uses the post-tax amount
- Tax rate visible in guild info and guild search (transparency)
- Members see weekly tax contribution in guild panel
- Treasury cap: `100,000 + (level * 10,000)` turns

### Anti-Alt Abuse

| Gate | Rule |
|------|------|
| Membership level gate | Character level 10+ to join |
| Creation gate | Character level 20+ and 50,000 turns to create |
| Boost eligibility | Must have gained skill XP in the last 48h |
| Boost scaling | Effect scales with active member count (active = gained XP in 48h): <5 active = 50%, 5-9 = 75%, 10+ = 100% |
| Tax is a real cost | Alts lose turns to tax AND get fewer effective turns for activities |
| Project contribution ratio | Must have spent 5x the turn-equivalent on personal actions that week |
| Per-member daily material contribution cap | 50 items per day toward projects |

### No Withdrawable Item Vault

Items contributed to projects are consumed permanently. No general-purpose shared storage to prevent item trading exploits. Items go in, become permanent guild progress, never come back to individuals.

## 4. Guild Upgrades (Timed Boosts)

Officer+ activates from guild panel. Costs treasury turns. Applies to all eligible (active) members for duration.

### Available Upgrades

| Upgrade | T1 (Lvl 1) | T2 (Lvl 10) | T3 (Lvl 25) | Duration | Cost (treasury) |
|---------|------------|-------------|-------------|----------|-----------------|
| XP Boost | +5% skill XP | +10% | +15% | 2h | 5,000 / 10,000 / 20,000 |
| Gathering Yield | +10% yield | +20% | +30% | 2h | 5,000 / 10,000 / 20,000 |
| Crafting Fortune | +5% crit chance | +10% | +15% | 2h | 8,000 / 15,000 / 25,000 |
| Warrior's Might | +5% combat dmg | +10% | +15% | 2h | 8,000 / 15,000 / 25,000 |
| Iron Skin | +5% defense | +10% | +15% | 2h | 5,000 / 10,000 / 20,000 |

One of each type active at a time. Integration: check for active guild upgrades in combat, crafting, gathering routes (same pattern as world event modifiers).

## 5. Guild Contracts (Weekly Bounties)

3 contracts per guild per week (Monday reset). Randomly selected, scaled to guild level. Progress aggregated across all active members.

### Contract Types

| Type | Low (Lvl 1-10) | Mid (11-25) | High (26-50) |
|------|----------------|-------------|--------------|
| Kill Count (specific mob) | 2,000 | 5,000 | 15,000 |
| Kill Family | 5,000 | 15,000 | 40,000 |
| Boss Rounds | 500 | 1,500 | 3,750 |
| Craft Items (non-refining) | 5,000 | 20,000 | 50,000 |
| Craft Rare+ | 50 | 150 | 500 |
| Gather Actions | 10,000 | 40,000 | 100,000 |
| Exploration Turns | 500,000 | 2,000,000 | 5,000,000 |
| PvP Wins | 1,000 | 3,000 | 10,000 |

### Rules
- 3 contracts always span at least 2 categories
- Progress bar visible to all members with per-member contribution leaderboard
- Incomplete contracts expire at weekly reset
- Rewards: guild XP (200-800) + bonus treasury turns (500-2,000) + personal XP bonus for top contributors

## 6. Guild Projects (Collaborative Tech Tree)

Long-term goals that permanently unlock guild perks. One active project at a time. Members contribute specific materials (consumed permanently). Turn cost comes from treasury.

### Project Tree

```
Level 1 (available immediately):
├── Guild Forge (crafting)
├── War Room (combat)
└── Scout Network (exploration/gathering)

Level 2 (requires one Level 1):
├── Advanced Forge (requires Guild Forge)
├── Barracks (requires War Room)
├── Cartographer's Lodge (requires Scout Network)
└── Apothecary (requires any Level 1)

Level 3 (requires two Level 2):
├── Master Workshop (requires Advanced Forge + Apothecary)
├── Raid Hall (requires Barracks + War Room)
└── Explorer's Guild (requires Cartographer's Lodge + Scout Network)
```

### Project Details

| Project | Level | Treasury Cost | Material Cost | Permanent Perk |
|---------|-------|---------------|---------------|----------------|
| Guild Forge | 1 | 500,000 | 2,000 ore, 1,000 ingots | +5% crafting crit |
| War Room | 1 | 500,000 | 1,500 leather, 1,000 wood | +5% combat XP |
| Scout Network | 1 | 500,000 | 1,000 herbs, 1,500 wood | +10% resource node capacity, -10% travel cost |
| Advanced Forge | 2 | 2,000,000 | 5,000 ore, 2,000 ingots, 1,000 gems | +10% crafting crit (replaces L1) |
| Barracks | 2 | 2,000,000 | 3,000 leather, 2,000 ingots | +10% combat XP (replaces L1) |
| Cartographer's Lodge | 2 | 2,000,000 | 2,500 wood, 2,000 herbs | +20% node capacity, -15% travel cost (replaces L1) |
| Apothecary | 2 | 1,500,000 | 2,000 herbs, 1,500 mushrooms | Guild-exclusive potion recipes |
| Master Workshop | 3 | 5,000,000 | 10,000 mixed | +15% crafting crit + guild-exclusive recipes |
| Raid Hall | 3 | 5,000,000 | 8,000 mixed | Guild expeditions unlocked |
| Explorer's Guild | 3 | 5,000,000 | 8,000 mixed | -25% travel cost, +40% node capacity, guild-exclusive rich nodes |

Timeline estimates (20 members, 10% tax, ~50k turns/day each = 100k treasury/day):
- Level 1: ~5 days
- Level 2: ~3 weeks
- Level 3: ~7 weeks

## 7. Guild Specialization

At guild level 10, leader chooses a focus path. Permanent (respec costs 2,000,000 treasury turns). Passive bonuses always active for eligible members.

### Warfare (combat-focused)

| Tier | Level | Bonus |
|------|-------|-------|
| 1 | 10 | +5% combat XP, +5% boss damage |
| 2 | 25 | +10% combat XP, +10% boss damage, +5% PvP rating gain |
| 3 | 40 | +15% combat XP, +15% boss damage, +10% PvP rating, +5% damage when in same zone as guildmate |

### Industry (crafting/gathering-focused)

| Tier | Level | Bonus |
|------|-------|-------|
| 1 | 10 | +5% crafting crit, +10% gathering yield |
| 2 | 25 | +10% crafting crit, +20% gathering yield, -10% repair costs |
| 3 | 40 | +15% crafting crit, +30% gathering yield, -20% repair costs, guild-exclusive legendary recipe |

### Discovery (exploration/resource-focused)

| Tier | Level | Bonus |
|------|-------|-------|
| 1 | 10 | -10% travel cost, +15% resource node capacity |
| 2 | 25 | -20% travel cost, +30% resource node capacity, +10% chest find rate |
| 3 | 40 | -30% travel cost, +50% resource node capacity, +20% chest find rate, hidden guild-exclusive zones |

## 8. Guild Expeditions (Dungeon Raids)

Guild-exclusive multi-room dungeons. Requires Raid Hall project (Level 3).

### Structure

An expedition is a **dungeon** with 5-8 rooms. Each room contains a **mob pack** — a group of monsters that fight simultaneously with a shared HP pool.

```
Example: Goblin Stronghold (Tier 1, 5 rooms)
  Room 1: Goblin Patrol (5 goblins) — trash
  Room 2: Goblin Barracks (3 orc warriors + 1 orc shaman) — elite
  Room 3: Armory Trap (4 goblins + fire trap environment) — event
  Room 4: Warchief's Guard (1 elite + 2 guards) — mini-boss
  Room 5: Goblin King (1 boss, phases at 50%/25%) — final boss
```

### Group vs Group Combat

Both sides use shared HP pools with individual actors:

**Raid side:**
- Shared raid HP pool = sum of participants' max HP
- Each attacker independently attacks mob pack pool
- Each healer restores raid pool HP

**Mob pack side:**
- Shared mob pack HP pool = sum of individual mob HPs
- Each mob acts independently per round (7 mobs = 7 attacks/spells per round)
- Mob healers heal mob pack pool
- Mob buffers buff other mobs

### Mob Pack Actions

| Action | Effect |
|--------|--------|
| `attack` | Damage to raid pool (d20 + stats vs averaged raid defense) |
| `spell` | Cast spell (fire, ice, poison) against raid pool |
| `heal` | Restore mob pack HP |
| `buff_damage` | +20% mob damage for 3 rounds |
| `buff_defense` | +20% mob defense for 3 rounds |
| `enrage` | Below 25% mob pool HP: all mob damage doubles (auto-trigger) |

### Room Types

| Type | Composition | Mechanics |
|------|-------------|-----------|
| Trash | 5-7 regular mobs | Straightforward warm-up |
| Elite | 3-5 mobs with healers/buffers | Must out-DPS healing |
| Mini-Boss | 1 strong mob + 2-3 adds | Boss has spell pattern, adds buff it |
| Event | 3-4 mobs + environmental damage | Environmental DoT to raid pool until cleared — speed check |
| Final Boss | 1 boss with HP-threshold phases | Changes behavior at 50%/25% HP (new spells, summons adds, enrages) |

### Dungeon Flow

```
Expedition launched (costs treasury) → Members sign up (once for entire dungeon)
  → Room 1: rounds resolve on timer until mob pack or raid pool hits 0
  → Rest period (raid pool regenerates 20% of max, 5-min window)
  → Room 2 resolves → Rest → ... → All rooms cleared or wipe
```

- Signup once per expedition, auto-progresses through rooms
- Wipe (raid pool = 0): expedition fails, can retry from failed room within weekly window
- Rounds per room: 5-min interval (same as boss encounters), typically 2-5 rounds per room

### Expedition Tiers

| Tier | Rooms | Mobs/Room | Mob Level | Treasury Cost | Min Active Members |
|------|-------|-----------|-----------|---------------|--------------------|
| 1 | 5 | 4-5 | 10-15 | 200,000 | 5 |
| 2 | 6 | 5-6 | 16-22 | 500,000 | 8 |
| 3 | 8 | 6-7 | 23-30+ | 1,000,000 | 12 |

### Rewards
- Expedition-exclusive loot (guild-themed equipment, unique materials)
- Guild XP (2,000-5,000 per tier)
- Partial treasury turn refund based on performance
- Guild renown points
- Personal XP + contribution-based loot per participant

## 9. Guild Leaderboard & Achievements

### Guild Leaderboard Categories

| Category | Source |
|----------|--------|
| `guild_level` | Guild level |
| `guild_renown` | Lifetime renown |
| `guild_seasonal_renown` | Monthly renown (resets) |
| `guild_total_kills` | Sum of member kills |
| `guild_boss_kills` | Boss encounters completed by members |
| `guild_contracts_completed` | Lifetime contracts completed |
| `guild_projects_completed` | Projects completed |

Same Redis-cached approach as player leaderboards.

### Guild Renown

Public reputation earned from: contract completions, project completions, expedition completions, member boss kills, member PvP wins. Seasonal renown resets monthly.

High renown unlocks: unique guild tag colors, title prefix ("[Legendary] GuildName"), guild banner in chat.

### Guild Achievements

| Achievement | Condition | Reward |
|-------------|-----------|--------|
| Guild Founded | Create a guild | — |
| First Contract | Complete 1 contract | 500 guild XP |
| Contract Streak | Complete 10 contracts | Guild title |
| First Project | Complete 1 project | 1,000 guild XP |
| Master Builders | Complete all L1 projects | Guild title |
| Architects | Complete all L2 projects | Guild title + treasury bonus |
| Guild Legends | Complete all L3 projects | Legendary guild title |
| Raid Ready | Complete first expedition | 2,000 guild XP |
| Expedition Masters | Complete 10 expeditions | Guild title |
| Social Butterfly | Reach 20 members | — |
| Full House | Reach max members | Guild title |

## 10. Combat Action System (Per-Round Tactical Combat)

### Overview

All combat moves from instant resolution to per-round action selection. Players choose what to do each round. Creates prediction-based PvP and learnable boss rotations.

### Action Types

| Action | Description | Cooldown | Notes |
|--------|-------------|----------|-------|
| Attack | Basic weapon strike | None | Always available |
| Skill Attack | Stronger hit (power strike, aimed shot, magic bolt) | 2-3 rounds | Higher damage/accuracy |
| Shield/Dodge | Defensive stance — greatly reduces/avoids incoming damage | 1 round | Blocks ALL incoming this round including boss nukes |
| Magic Skill | Offensive spell (flame sword, ice blast) | 3-4 rounds | Elemental damage, may apply DoT/debuff |
| Heal | Use potion or healing spell | 1-2 rounds | Consumes potion (solo) or uses magic skill (raid healer) |
| Taunt (raid) | Draw mob attention, absorb damage personally | 2 rounds | Tank role — reduces damage to raid pool |

### Round Resolution Order

1. All combatants submit actions (within timer or default to basic attack)
2. Speed/initiative determines action order (existing d20 + speed)
3. Defensive actions resolve first (shields/dodges apply before attacks)
4. Attacks resolve (attacker rolls vs defense, modified by stance)
5. Spells/skills resolve
6. End-of-round effects (DoTs, buff expiry, cooldown ticks)

### Action Interactions

| Attacker | Defender | Result |
|----------|----------|--------|
| Attack | Attack | Both deal damage normally |
| Attack | Shield/Dodge | Miss or heavily reduced damage |
| Skill Attack | Shield/Dodge | Skill wasted (on cooldown), defender blocks |
| Skill Attack | Attack | Skill hits hard, full damage |
| Magic Skill | Shield/Dodge | Some spells pierce dodge (spell-specific) |
| Attack | Heal | Defender takes damage AND heals (net depends on amounts) |

### PvP Mind Game

Prediction-based combat:
- Think they'll attack → shield (block their damage, waste their cooldown skill)
- Think they'll shield → basic attack (conserve your cooldown)
- Know their skill is off cooldown → preemptive shield
- They just shielded → can't shield next round → use skill attack NOW
- Study opponent patterns from combat logs → adapt strategy

### Boss Telegraphs

Bosses have predictable rotations (existing `spellPattern` field):

```
Round 1: Attack
Round 2: Attack
Round 3: Buff (telegraph — glowing, preparing big hit)
Round 4: DEVASTATING SLAM (100% raid pool damage if not shielded)
Round 5: Attack (weakened after big move)
Round 6: Heal
... repeat
```

Bestiary reveals patterns → players know WHEN to shield → skill expression through counter-rotation execution.

### Async Timing

| Context | Action Window | Default |
|---------|---------------|---------|
| Solo PvE | Pre-programmed rotation OR real-time per round | Basic attack |
| PvP | 5 minutes per round | Basic attack |
| Boss Encounter | 5 minutes per round | Basic attack |
| Guild Expedition | 5 minutes per round | Basic attack |

### Pre-Programmed Rotations (Solo PvE)

Players define saved combat rotations:

```
1. Attack
2. Skill Attack
3. Attack
4. Shield
5. Magic Skill
6. Attack
7. (repeat from 1)
```

Auto-executes in solo PvE. Optional conditional overrides:
- "If HP < 30%, Heal instead"
- "If enemy telegraph detected, Shield instead"

Keeps farming efficient while rewarding thoughtful rotation design.

### Data Model Additions

```
CombatRotation
  id, playerId, name, isDefault
  actions: Json  // ordered action sequence
  conditionals: Json  // override rules

PvP/Boss rounds store per-round actions:
  { roundNumber, playerAction, result }
```

## Data Model

### New Models

```prisma
model Guild {
  id                  String   @id @default(uuid())
  name                String   @unique @db.VarChar(32)
  tag                 String   @unique @db.VarChar(4)
  description         String?  @db.VarChar(200)
  leaderId            String   @map("leader_id")
  level               Int      @default(1)
  xp                  BigInt   @default(0)
  recruitmentMode     String   @default("invite_only") @map("recruitment_mode") @db.VarChar(16)
  minLevelRequirement Int      @default(0) @map("min_level_requirement")
  taxRate             Int      @default(5) @map("tax_rate")
  specialization      String?  @db.VarChar(16)
  renown              Int      @default(0)
  seasonalRenown      Int      @default(0) @map("seasonal_renown")
  treasuryTurns       Int      @default(0) @map("treasury_turns")
  createdAt           DateTime @default(now()) @map("created_at")

  members      GuildMember[]
  upgrades     GuildUpgrade[]
  projects     GuildProject[]
  contracts    GuildContract[]
  expeditions  GuildExpedition[]
  logs         GuildLog[]
  achievements GuildAchievement[]

  @@map("guilds")
}

model GuildMember {
  guildId               String   @map("guild_id")
  playerId              String   @unique @map("player_id")
  role                  String   @default("member") @db.VarChar(16)
  joinedAt              DateTime @default(now()) @map("joined_at")
  totalTurnsContributed Int      @default(0) @map("total_turns_contributed")
  weeklyTurnsContributed Int     @default(0) @map("weekly_turns_contributed")
  lastActiveAt          DateTime @default(now()) @map("last_active_at")

  guild  Guild  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@id([guildId, playerId])
  @@map("guild_members")
}

model GuildUpgrade {
  id          String   @id @default(uuid())
  guildId     String   @map("guild_id")
  upgradeType String   @map("upgrade_type") @db.VarChar(32)
  tier        Int      @default(1)
  activatedAt DateTime @default(now()) @map("activated_at")
  expiresAt   DateTime @map("expires_at")
  activatedBy String   @map("activated_by")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@index([guildId, upgradeType, expiresAt])
  @@map("guild_upgrades")
}

model GuildProject {
  id                 String    @id @default(uuid())
  guildId            String    @map("guild_id")
  projectKey         String    @map("project_key") @db.VarChar(64)
  turnsContributed   Int       @default(0) @map("turns_contributed")
  materialsProgress  Json      @default("{}") @map("materials_progress")
  status             String    @default("active") @db.VarChar(16)
  startedAt          DateTime  @default(now()) @map("started_at")
  completedAt        DateTime? @map("completed_at")

  guild         Guild                     @relation(fields: [guildId], references: [id], onDelete: Cascade)
  contributions GuildProjectContribution[]

  @@unique([guildId, projectKey])
  @@map("guild_projects")
}

model GuildProjectContribution {
  id                    String @id @default(uuid())
  projectId             String @map("project_id")
  playerId              String @map("player_id")
  turnsContributed      Int    @default(0) @map("turns_contributed")
  materialsContributed  Json   @default("{}") @map("materials_contributed")

  project GuildProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, playerId])
  @@map("guild_project_contributions")
}

model GuildContract {
  id           String    @id @default(uuid())
  guildId      String    @map("guild_id")
  contractKey  String    @map("contract_key") @db.VarChar(64)
  targetValue  Int       @map("target_value")
  currentValue Int       @default(0) @map("current_value")
  status       String    @default("active") @db.VarChar(16)
  weekStartedAt DateTime @map("week_started_at")
  expiresAt    DateTime  @map("expires_at")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@index([guildId, status])
  @@map("guild_contracts")
}

model GuildExpedition {
  id             String    @id @default(uuid())
  guildId        String    @map("guild_id")
  expeditionKey  String    @map("expedition_key") @db.VarChar(64)
  tier           Int
  currentRoom    Int       @default(0) @map("current_room")
  totalRooms     Int       @map("total_rooms")
  raidPoolHp     Int?      @map("raid_pool_hp")
  raidPoolMax    Int?      @map("raid_pool_max")
  mobPackHp      Int?      @map("mob_pack_hp")
  mobPackMax     Int?      @map("mob_pack_max")
  status         String    @default("preparing") @db.VarChar(16)
  nextRoundAt    DateTime? @map("next_round_at")
  startedAt      DateTime  @default(now()) @map("started_at")
  completedAt    DateTime? @map("completed_at")
  roomData       Json?     @map("room_data")
  roundSummaries Json?     @map("round_summaries")

  guild        Guild                  @relation(fields: [guildId], references: [id], onDelete: Cascade)
  participants GuildExpeditionMember[]

  @@index([guildId, status])
  @@map("guild_expeditions")
}

model GuildExpeditionMember {
  id             String @id @default(uuid())
  expeditionId   String @map("expedition_id")
  playerId       String @map("player_id")
  totalDamage    Int    @default(0) @map("total_damage")
  totalHealing   Int    @default(0) @map("total_healing")
  status         String @default("active") @db.VarChar(16)

  expedition GuildExpedition @relation(fields: [expeditionId], references: [id], onDelete: Cascade)

  @@unique([expeditionId, playerId])
  @@map("guild_expedition_members")
}

model GuildLog {
  id        String   @id @default(uuid())
  guildId   String   @map("guild_id")
  eventType String   @map("event_type") @db.VarChar(32)
  message   String   @db.VarChar(200)
  metadata  Json?
  createdAt DateTime @default(now()) @map("created_at")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@index([guildId, createdAt])
  @@map("guild_logs")
}

model GuildAchievement {
  guildId       String   @map("guild_id")
  achievementId String   @map("achievement_id")
  unlockedAt    DateTime @default(now()) @map("unlocked_at")

  guild Guild @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@id([guildId, achievementId])
  @@map("guild_achievements")
}

model CombatRotation {
  id           String  @id @default(uuid())
  playerId     String  @map("player_id")
  name         String  @db.VarChar(32)
  isDefault    Boolean @default(false) @map("is_default")
  actions      Json
  conditionals Json    @default("[]")

  @@index([playerId])
  @@map("combat_rotations")
}
```

### Modified Models

**Player:** Add `guildMember GuildMember?` relation.

## API Routes

### Guild Core (`/api/v1/guild/`)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/` | Create guild |
| GET | `/` | Get player's guild |
| GET | `/search` | Search guilds (name, tag, level, recruitment mode) |
| GET | `/:id` | Get guild details |
| PATCH | `/:id` | Update settings (leader/officer) |
| DELETE | `/:id` | Disband guild (leader) |
| POST | `/:id/join` | Join open guild |
| POST | `/:id/leave` | Leave guild |
| POST | `/:id/invite` | Invite player (officer+) |
| POST | `/:id/kick` | Kick member (officer+) |
| POST | `/:id/promote` | Promote to officer (leader) |
| POST | `/:id/demote` | Demote to member (leader) |
| POST | `/:id/transfer` | Transfer leadership (leader) |
| GET | `/:id/log` | Get activity log |

### Guild Treasury & Upgrades

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/:id/upgrades` | List available + active upgrades |
| POST | `/:id/upgrades/activate` | Activate upgrade (officer+) |

### Guild Contracts

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/:id/contracts` | List active contracts + progress |

### Guild Projects

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/:id/projects` | List all projects (completed + available + active) |
| POST | `/:id/projects/start` | Start a project (leader/officer) |
| POST | `/:id/projects/contribute` | Contribute materials to active project |

### Guild Expeditions

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/:id/expeditions` | List available + active expeditions |
| POST | `/:id/expeditions/launch` | Launch expedition (leader) |
| POST | `/:id/expeditions/:eid/signup` | Sign up for expedition |
| GET | `/:id/expeditions/:eid` | Expedition status + room progress |

### Combat Rotations

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/combat/rotations` | List saved rotations |
| POST | `/combat/rotations` | Create rotation |
| PATCH | `/combat/rotations/:id` | Update rotation |
| DELETE | `/combat/rotations/:id` | Delete rotation |

### Guild Leaderboard

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/leaderboard/guild/:category` | Guild leaderboard by category |

## Constants (`gameConstants.ts`)

```typescript
export const GUILD_CONSTANTS = {
  CREATION_TURN_COST: 50_000,
  CREATION_MIN_LEVEL: 20,
  JOIN_MIN_LEVEL: 10,
  BASE_MAX_MEMBERS: 10,
  MEMBERS_PER_LEVEL: 0.5,         // +1 member per 2 levels
  MAX_TAX_RATE: 20,
  TREASURY_BASE_CAP: 100_000,
  TREASURY_CAP_PER_LEVEL: 10_000,
  SPECIALIZATION_UNLOCK_LEVEL: 10,
  SPECIALIZATION_RESPEC_COST: 2_000_000,
  BOOST_ELIGIBILITY_XP_WINDOW_HOURS: 48,
  BOOST_SCALING_THRESHOLDS: [5, 10],  // <5 active = 50%, 5-9 = 75%, 10+ = 100%
  PROJECT_CONTRIBUTION_RATIO: 5,       // must spend 5x personal turns per week
  PROJECT_DAILY_MATERIAL_CAP: 50,
  XP_PER_LEVEL_EXPONENT: 1.8,
  XP_PER_LEVEL_BASE: 100,
};

export const GUILD_UPGRADE_DEFINITIONS = { /* tier/cost/effect per upgrade type */ };
export const GUILD_CONTRACT_DEFINITIONS = { /* target ranges by guild level tier */ };
export const GUILD_PROJECT_DEFINITIONS = { /* tree structure, costs, perks */ };
export const GUILD_EXPEDITION_DEFINITIONS = { /* tiers, room compositions */ };
export const GUILD_SPECIALIZATION_DEFINITIONS = { /* path bonuses per tier */ };
export const GUILD_ACHIEVEMENT_DEFINITIONS = { /* achievement list */ };

export const COMBAT_ACTION_CONSTANTS = {
  SKILL_ATTACK_COOLDOWN: 3,
  MAGIC_SKILL_COOLDOWN: 4,
  SHIELD_COOLDOWN: 1,
  HEAL_COOLDOWN: 2,
  TAUNT_COOLDOWN: 2,
  PVP_ROUND_WINDOW_SECONDS: 300,     // 5 minutes
  BOSS_ROUND_WINDOW_SECONDS: 300,
  EXPEDITION_ROUND_WINDOW_SECONDS: 300,
  EXPEDITION_REST_REGEN_PERCENT: 20,
  EXPEDITION_REST_DURATION_SECONDS: 300,
};
```

## Implementation Phases

### Phase 1: Core Foundation
- Guild CRUD (create, join, leave, disband, search)
- Roles (leader, officer, member)
- Guild chat (leverage existing chat system)
- Guild tax system (auto-treasury from member actions)
- Guild level/XP
- Guild activity log
- Basic guild screen frontend

### Phase 2: Engagement Features
- Guild upgrades (timed boosts from treasury)
- Guild contracts (weekly bounties)
- Guild leaderboard
- Guild achievements

### Phase 3: Projects & Specialization
- Guild projects (collaborative tech tree)
- Guild specialization (warfare/industry/discovery)
- Project contribution UI

### Phase 4: Combat Rework
- Per-round action system (solo PvE, PvP)
- Pre-programmed rotations
- Combat rotation UI
- PvP round-by-round interaction
- Boss encounter action integration

### Phase 5: Expeditions
- Raid combat engine (group-vs-group, mob packs)
- Expedition dungeon definitions
- Multi-room progression
- Expedition UI
- Expedition rewards and loot

## Frontend

### New Screens/Components

- **GuildScreen** — main guild hub with tabs: Overview, Members, Chat, Upgrades, Contracts, Projects, Expeditions, Achievements
- **GuildSearchScreen** — browse/search available guilds
- **GuildCreateModal** — guild creation form
- **GuildProjectTree** — visual tech tree with progress indicators
- **GuildContractBoard** — weekly contract cards with progress bars
- **ExpeditionDungeon** — room-by-room progress view with mob pack status
- **CombatActionBar** — per-round action selection UI (attack, skill, shield, heal, etc.)
- **CombatRotationEditor** — create/edit pre-programmed rotations
- **GuildLeaderboardTab** — guild rankings in existing leaderboard screen

### Navigation
- New "Guild" button in main nav (visible to all, gated at level 10 for joining / level 20 for creating)
- Guild chat accessible from ChatPanel overlay
- Combat action bar appears during PvP and boss encounters
