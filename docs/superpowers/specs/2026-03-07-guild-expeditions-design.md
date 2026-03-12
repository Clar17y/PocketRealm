# Guild Expeditions Design

Multi-room async dungeon runs for guild members. Extends the boss round resolver to many-vs-many combat across sequential rooms with expedition token rewards and soulbound gear sets.

## Core Architecture

Expeditions reuse the boss encounter async pattern (5-min timed rounds, template-driven actions, threat-based targeting) extended to many-vs-many.

| Aspect | Boss Encounter | Expedition |
|--------|---------------|------------|
| Enemies | 1 boss | 4-7 mobs per room, 5-8 rooms |
| Player targeting | Players → boss | Auto-target lowest HP mob, AoE hits all mobs |
| Mob targeting | Boss → threat leader | Shared pack threat table → highest threat player |
| Rooms | 1 | 5-8 sequential with rest between |
| KO handling | Out for encounter | Out for room, recover between rooms |
| Wipe | Encounter fails | Room resets, retry |
| Cooldown | Per-boss spawn | 1/tier/week, 24h after completion, 1 active at a time |
| Launch | Auto-spawned | Officer+ spends treasury |

### Combat Flow Per Round

1. Evaluate each participant's template conditional → resolve action
2. Apply taunts to shared threat table
3. Record defensive stances (counter/ward/defend)
4. **Player offensive phase** — single-target hits lowest HP mob, AoE hits all mobs. Dead mobs removed immediately.
5. **Player supportive phase** — heal_self/heal_ally
6. **Mob offensive phase** — each mob independently resolves its action template. Single-target → threat leader. AoE → all alive players. Counter/ward/defend apply per-player.
7. Resource management — deduct costs, apply regen, tick effects/DoTs
8. Threat decay — tick taunts

N mobs = N independent attacks per round. Telegraphed attacks require counter (physical) or ward (magic) or take massive/lethal damage.

## Data Model

### GuildExpedition

| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| guildId | String | FK → Guild |
| tier | Int | 1/2/3 |
| status | String | recruiting → in_progress → completed / failed |
| currentRoom | Int | 0-indexed |
| totalRooms | Int | 5/6/8 by tier |
| roomDefinitions | Json | Generated at launch — array of room configs |
| roomStartSnapshot | Json | Player HP/resources at room start, for wipe restoration |
| nextRoundAt | DateTime | 5-min async timer |
| roundNumber | Int | Current round within room |
| startedAt | DateTime | |
| completedAt | DateTime? | |
| launchedBy | String | FK → Player |

### GuildExpeditionMember

| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | PK |
| expeditionId | String | FK → GuildExpedition |
| playerId | String | FK → Player |
| currentHp | Int | |
| currentStamina | Int | |
| currentMana | Int | |
| templateRound | Int | Carries forward across rooms |
| activeEffects | Json | |
| threatValue | Float | Resets each room |
| isKnockedOut | Boolean | Reset on room advance |
| totalDamage | BigInt | Expedition lifetime |
| totalHealing | BigInt | Expedition lifetime |
| roomDamage | BigInt | Current room, for per-room loot |
| roomHealing | BigInt | Current room, for per-room loot |
| signedUpAt | DateTime | |

Unique constraint: `(expeditionId, playerId)`.

### Room Definition JSON

```json
{
  "roomIndex": 0,
  "roomType": "trash",
  "mobs": [
    {
      "id": "mob-uuid",
      "mobTemplateId": "forest_spider",
      "prefix": "elite",
      "hp": 500,
      "maxHp": 500,
      "stats": { "attack": 30, "defence": 20, "accuracy": 25, "dodge": 10, "speed": 15, "magicDefence": 15, "critChance": 5, "critDamage": 150, "damageMin": 20, "damageMax": 35 },
      "actionTemplate": [
        { "actionId": "boss_physical_attack", "targetMode": "single_target" },
        { "actionId": "boss_physical_attack", "targetMode": "single_target" }
      ],
      "activeEffects": []
    }
  ]
}
```

### Schema Additions

- `expeditionTokens: Int` on Player (default 0)
- `isSoulbound: Boolean` on Item (default false)
- Indexes: `(guildId, status)`, `(guildId, tier, startedAt)` on GuildExpedition

## Expedition Lifecycle

### Launching

- Officer+ calls launch endpoint with tier
- Validates: guild level, treasury balance, no active expedition, weekly tier cooldown, 24h since last completion
- Deducts treasury cost
- Generates room definitions (random composition based on tier)
- Status = `recruiting`, 10-min signup window

### Signup

- Any guild member meeting tier level requirement
- Costs turns to join
- Creates GuildExpeditionMember with full HP/stamina/mana
- Min participants required: 5/8/12 by tier
- Signup closes when first round begins

### Room Resolution

- Background timer checks `nextRoundAt` (same 60s poll as boss)
- Resolve round via raid combat engine (pure function)
- Dead mobs removed, surviving mobs persist
- All mobs dead → room cleared → rest phase
- All players KO'd → room resets (restore from `roomStartSnapshot`)

### Rest Phase (Between Rooms)

- 5-min window
- HP regens 20%, stamina/mana regen 30%
- KO'd players can spend turns to recover (existing mechanic)
- Players who don't recover excluded from next room
- Threat table resets, room damage/healing counters reset
- After 5 min, snapshot player state, auto-advance to next room

### Completion

- All rooms cleared → status = `completed`
- Per-room loot distributed (contribution-weighted)
- Expedition tokens awarded (flat per room + completion bonus)
- Guild XP awarded

## Cooldowns & Limits

- 1 expedition per tier per week (check last completed/failed T{n} within 7 days)
- 24h cooldown between any expedition completion and next launch
- Only 1 active expedition at a time per guild

## Raid Combat Engine

New file: `packages/game-engine/src/combat/raidRoundResolver.ts`

### Input

```typescript
interface RaidMob {
  id: string;
  mobTemplateId: string;
  prefix: string | null;
  hp: number;
  maxHp: number;
  stats: CombatantStats;
  actionTemplate: BossTemplateAction[];
  activeEffects: BossActiveEffect[];
}

interface RaidRoundInput {
  mobs: RaidMob[];
  participants: BossRoundParticipant[];  // reuse existing type
  threatTable: ThreatEntry[];
  roundNumber: number;
}
```

### Output

```typescript
interface MobActionResult {
  mobId: string;
  actionId: string;
  targetMode: 'single_target' | 'aoe';
  targetPlayerIds: string[];
  damageDealt: number;
  healingDone: number;
}

interface RaidRoundResult {
  mobsAfter: RaidMob[];
  participantResults: BossRoundParticipantResult[];  // reuse existing type
  mobActionResults: MobActionResult[];
  threatTableAfter: ThreatEntry[];
  roomCleared: boolean;
  allPlayersDead: boolean;
}
```

### Resolution Order

1. Resolve player actions (template conditionals)
2. Apply taunts to shared threat table
3. Record defensive stances
4. Player offensive — auto-target lowest HP mob (single), all mobs (AoE)
5. Player supportive — heal_self, heal_ally
6. Mob offensive — each mob resolves independently from its template
7. Resource management — costs, regen, effect ticks
8. Threat decay

## Room Generation

### Composition by Tier

| Tier | Total Rooms | Trash | Elite | Mini-Boss | Event | Final Boss |
|------|-------------|-------|-------|-----------|-------|------------|
| T1 | 5 | 3 | 1 | 0 | 0 | 1 |
| T2 | 6 | 3 | 1 | 1 | 0 | 1 |
| T3 | 8 | 3 | 2 | 1 | 1 | 1 |

Final boss always last. Trash front-loaded, other rooms shuffled in remaining slots.

### Mob Counts per Room Type

- Trash: 4-5 mobs (T1), 5-6 (T2), 6-7 (T3)
- Elite: 3-4 mobs with telegraphed AoE rotations
- Mini-Boss: 1 strong mob + 2-3 adds
- Event: 3-4 mobs + environmental DoT (3% max HP/round to all players)
- Final Boss: 1 boss with phase transitions at 50%/25% HP

### Mob Action Templates by Room Type

- **Trash**: 2-action rotation `[attack, attack]`. No telegraphs.
- **Elite**: 4-action rotation with telegraphed AoE every 4th round. Forces ward/counter.
- **Mini-Boss**: 6-action rotation. Boss has telegraphed one-shots, heal, enrage. Adds buff the boss.
- **Event**: Standard mob rotations + environmental DoT applied automatically each round.
- **Final Boss**: Complex rotation. Phase transitions at 50%/25% HP swap to more aggressive template (more telegraphed AoE, faster enrage, one-shot mechanics).

### Mob Source

Reuse existing `MobTemplate` + prefix system. Mobs scaled to tier level range. Elite+ rooms get boss-style action templates rather than simple attack loops.

## Expedition Tokens & Shop

### Token Economy

- Earned per room cleared — flat amount, same for all participants in that room
- Completion bonus for clearing all rooms (~equal to sum of all room tokens)
- Scaling: T1 base, T2 ~2x, T3 ~4x
- Stored on Player model (`expeditionTokens` field)

### Token Shop

Accessible in town zones. 3 gear sets, 5 pieces each (head, chest, gloves, legs, boots):

| Set | Role | Theme |
|-----|------|-------|
| **Vanguard** | Melee/Tank | Defence, HP, threat generation |
| **Sharpshooter** | Ranged/DPS | Accuracy, crit chance, crit damage |
| **Arcanist** | Magic/Healer | Magic damage, mana regen, healing power |

### Set Bonuses (Active in Group Content Only)

Group content = expeditions + boss encounters.

| Pieces | Vanguard | Sharpshooter | Arcanist |
|--------|----------|-------------|----------|
| 2-piece | +10% max HP | +10% crit chance | +15% mana regen |
| 4-piece | AoE taunt on counter | Chance to double-hit | Heal splash to lowest HP ally |

### Gear Properties

- **Soulbound** — can't trade, sell, or salvage
- **Double durability** — 2x normal crafted item durability, still degrades
- Base stats comparable to top-tier crafted gear
- Set bonuses only in group content — crafted gear stays competitive for solo play

### Pricing

High enough that full set takes multiple weeks. T3 completion pace: ~1 piece per week.

## Constants

### EXPEDITION_CONSTANTS

- Treasury costs: [200_000, 500_000, 1_000_000]
- Level requirements: [10, 16, 23]
- Min participants: [5, 8, 12]
- Room counts: [5, 6, 8]
- Signup window: 10 min
- Round timer: 5 min
- Rest duration: 5 min
- Rest HP regen: 0.20
- Rest stamina regen: 0.30
- Rest mana regen: 0.30
- Weekly cooldown per tier
- 24h cooldown between expeditions
- Environmental DoT: 0.03 (3% max HP)
- Tokens per room by tier and room type
- Completion bonus tokens by tier

### EXPEDITION_SHOP_DEFINITIONS

- 3 sets × 5 pieces = 15 items
- Token costs per piece
- Base stats per piece
- Set bonus definitions (2pc/4pc thresholds, effect descriptions, group-content-only flag)

### EXPEDITION_DEFINITIONS

- Tier configs (level range, mob count ranges)
- Room type weights per tier
- Mob template pool rules (which mob families valid per tier)
