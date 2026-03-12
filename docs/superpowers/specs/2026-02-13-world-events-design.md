# World Events, News & Shared Boss Encounters

**Status: Implemented (with gaps)**
**Branch**: `feature/world-events-system`

## Overview

A dynamic world system where zone-scoped events create gameplay opportunities surfaced through a chat/message feed. Three event types run concurrently: resource boosts, mob modifiers, and shared boss encounters (async raids). Events have mechanical effects on exploration and combat.

## Event Slots

Maximum active events at any time:

| Slot | Type | Duration | Example |
|------|------|----------|---------|
| 1 | Boss Encounter | Until killed | "Shaman Chief found in Deep Forest" |
| 1 | Resource Event | ~6h | "Rich copper veins in Mountain Pass" |
| 1 | Mob Event | ~6h | "Full moon makes wolves ferocious" |

## Event Sources

- **Scheduled**: Server spawns events on a timer (e.g., when a slot is empty for N minutes, roll a new event)
- **Player-discovered**: Exploration has a small per-turn chance to trigger an event in the current zone

## Resource Events

Modify resource gathering in a specific zone for ~6 hours.

| Effect | Example | Mechanic |
|--------|---------|----------|
| `drop_rate_up` | "Rich copper veins in Mountain Pass" | +50% resource drop rate |
| `yield_up` | "Gem deposits exposed in Crystal Caverns" | +1 bonus per gather |

**Target**: Specific resource type or all resources in zone.

## Mob Events

Modify mob encounters in a specific zone for ~6 hours.

| Effect | Example | Mechanic |
|--------|---------|----------|
| `spawn_rate_up` | "Bandits flooding Cave Entrance" | 2x encounter rate for target mob |
| `spawn_rate_down` | "Dragon sighting clears goblins" | 0.5x encounter rate |
| `damage_up` | "Full moon makes wolves ferocious" | +50% mob damage dealt |
| `damage_down` | "Wild fires damage all treants" | -50% mob damage dealt |
| `hp_up` | "Ancient magic empowers undead" | +50% mob HP |
| `hp_down` | "Plague weakens cave spiders" | -50% mob HP |

**Target**: Specific mob template, mob family, or all mobs in zone.

## Shared Boss Encounters (Async Raids)

### Spawn

Boss mobs are special mob templates flagged as bosses. When a boss event spawns (scheduled or player-discovered), it creates a shared encounter with persisted HP visible to all players in the zone.

### Sign-Up

Players in the boss's zone can sign up for the next round with a role:
- **Attacker**: Commit turns to deal damage using normal combat stats
- **Healer**: Commit turns to heal participants (scales with magic/vitality)

### Round Resolution (every 30 minutes)

1. All attackers deal damage to boss (d20 + mods vs boss defence, same combat engine)
2. Boss AOE hits all participants — **flat damage** (defined per boss, e.g., 40 HP)
3. Healers restore HP to participants — each healer targets the **5 lowest-HP participants**, healing based on magic/vitality stats
4. Players at 0 HP are knocked out for this round — can re-sign-up next round
5. Boss HP persists between rounds

**Healer spread**: Healer 1 heals the 5 lowest HP participants. Healer 2 heals the (new) 5 lowest. Naturally prioritizes the most injured; multiple healers covering the same target stack healing.

### Boss HP Scaling

- Each boss has a `baseHp` and an `expectedParticipants` count
- After round 1, if sign-ups exceed expected: `finalHp = baseHp * (1 + (participants - expected) * scaleFactor)`
- HP locks after round 1 — creates commitment incentive

### Loot Distribution

On boss death, every player who contributed across any round gets a loot roll. Higher total damage/healing dealt = better odds for rare drops.

**Contribution tiers** (percentage of total damage/healing dealt):
- Top contributors get bonus roll weight
- Minimum participation threshold to qualify (at least 1 round of damage/healing)

## Persisted Mob HP

Separate from shared bosses — this is per-player.

- When a player **flees or gets knocked out**, the mob's remaining HP is saved as a per-player instance
- On return to the same zone, chance to re-encounter the damaged mob
- Mobs regenerate **1% max HP per minute** (~100 min to full)
- Adds war-of-attrition gameplay to tough encounters
- Stored per-player with mob template ID, remaining HP, zone, timestamp

## Chat System Integration

A chat system already exists with real-time Socket.IO messaging, world/zone channels, and a floating `ChatPanel` overlay. The frontend already renders system messages (italic gold, sword icon) when `messageType === 'system'`, but the backend never produces them.

### Existing Infrastructure

| Layer | What Exists | File |
|-------|-------------|------|
| DB | `chat_messages` table (no `message_type` column) | `packages/database/prisma/schema.prisma` |
| Types | `ChatMessageType = 'player' \| 'system'`, optional `messageType` on `ChatMessageEvent` | `packages/shared/src/types/chat.types.ts` |
| Socket | `chat:send`, `chat:message`, `chat:switch-zone`, `chat:pin/unpin`, `chat:presence` | `apps/api/src/socket/chatHandlers.ts` |
| REST | `GET /api/v1/chat/history` (returns last 50 messages) | `apps/api/src/routes/chat.ts` |
| Service | `saveMessage`, `getChannelHistory`, `checkRateLimit` | `apps/api/src/services/chatService.ts` |
| Frontend | `ChatPanel` (floating overlay above BottomNav), `useChat` hook | `apps/web/src/components/ChatPanel.tsx`, `apps/web/src/hooks/useChat.ts` |
| Constants | `CHAT_CONSTANTS` (200 char limit, 50 history, rate limits) | `packages/shared/src/constants/gameConstants.ts` |
| Rendering | System messages render in italic gold with ⚔ prefix, no username | `ChatPanel.tsx` lines 169-179 |

### Gaps to Fill for World Events

1. **DB**: Add `message_type` column to `chat_messages` (`VARCHAR(8)`, default `'player'`)
2. **Backend utility**: Create `emitSystemMessage(io, channelType, channelId, message)` that constructs a `ChatMessageEvent` with `messageType: 'system'` and broadcasts via Socket.IO
3. **Persistence**: Update `saveMessage` to accept and store `messageType`; update `getChannelHistory` to return it
4. **Event triggers**: Call `emitSystemMessage` from world event lifecycle (spawn, expiry, boss round results, boss kill)

### System Messages Produced by World Events

| Trigger | Channel | Example Message |
|---------|---------|-----------------|
| Resource event starts | world | "⛏ Prospectors report rich copper veins in Mountain Pass! (6h)" |
| Resource event expires | world | "⛏ The copper veins in Mountain Pass have been depleted." |
| Mob event starts | world | "🐺 A full moon makes wolves ferocious in Deep Forest! (6h)" |
| Mob event expires | world | "🐺 The wolves in Deep Forest have calmed down." |
| Boss spawns | world | "💀 Shaman Chief has been spotted in Deep Forest!" |
| Boss round resolves | zone (boss zone) | "⚔ Round 3: 12 attackers dealt 847 damage. Shaman Chief has 4,153 HP remaining." |
| Boss killed | world | "🏆 Shaman Chief has been slain! PlayerX dealt the final blow." |
| Player discovers event | zone | "🔍 PlayerX discovered something unusual while exploring..." |

## Data Model

### WorldEvent

```
id              UUID
type            "resource" | "mob" | "boss"
zoneId          FK -> Zone
title           String (news headline)
description     String (flavor text)
effectType      String (spawn_rate_up, damage_down, etc.)
effectValue     Float (modifier value, e.g., 1.5 for +50%)
targetMobId     FK -> MobTemplate? (null = all mobs)
targetFamily    String? (mob family name, null = specific mob or all)
targetResource  String? (resource type, null = all resources)
startedAt       DateTime
expiresAt       DateTime? (null for boss — ends on kill)
status          "active" | "completed" | "expired"
createdBy       "system" | "player_discovery"
```

### BossEncounter (extends WorldEvent where type = "boss")

```
id              UUID
eventId         FK -> WorldEvent
mobTemplateId   FK -> MobTemplate
currentHp       Int
maxHp           Int
baseHp          Int
scaledAt        DateTime? (when HP was locked after round 1)
roundNumber     Int (current round)
nextRoundAt     DateTime (when next round resolves)
status          "waiting" | "in_progress" | "completed"
killedBy        FK -> Player? (final blow dealer)
```

### BossParticipant

```
id              UUID
encounterId     FK -> BossEncounter
playerId        FK -> Player
role            "attacker" | "healer"
roundNumber     Int (which round they signed up for)
turnsCommitted  Int
totalDamage     Int (cumulative across all rounds)
totalHealing    Int (cumulative across all rounds)
currentHp       Int (participant's HP in the raid context)
status          "signed_up" | "fighting" | "knocked_out"
```

### PersistedMob (per-player damaged mob instances)

```
id              UUID
playerId        FK -> Player
mobTemplateId   FK -> MobTemplate
zoneId          FK -> Zone
currentHp       Int
maxHp           Int
damagedAt       DateTime (for regen calculation)
```

## Constants (gameConstants.ts)

```typescript
export const WORLD_EVENT_CONSTANTS = {
  RESOURCE_EVENT_DURATION_HOURS: 6,
  MOB_EVENT_DURATION_HOURS: 6,
  EVENT_RESPAWN_DELAY_MINUTES: 30,    // min delay before new event after one expires
  EVENT_DISCOVERY_CHANCE_PER_TURN: 0.0001,

  BOSS_ROUND_INTERVAL_MINUTES: 30,
  BOSS_AOE_DAMAGE: 40,               // flat, per boss override possible
  BOSS_EXPECTED_PARTICIPANTS: 10,
  BOSS_HP_SCALE_FACTOR: 0.05,        // +5% HP per extra participant
  HEALER_MAX_TARGETS: 5,

  PERSISTED_MOB_REGEN_PERCENT_PER_MINUTE: 1,  // 1% max HP per minute
  PERSISTED_MOB_REENCOUNTER_CHANCE: 0.3,       // 30% chance to find your damaged mob
};
```

## Integration Points

### Exploration

`simulateExploration()` checks active zone events:
- Mob events modify encounter weights and mob stats before combat
- Resource events modify drop rates
- Boss events can appear as encounter outcomes
- New outcome type: `event_discovery` (triggers a new world event)

### Combat

`runCombat()` receives modified mob stats when a mob event is active:
- `damage_up/down`: scale `damageMin`/`damageMax`
- `hp_up/down`: scale `hp`

### Boss Round Resolution

Server-side process (cron or lazy check on API call):
1. Check if `nextRoundAt` has passed for any active boss
2. Load all signed-up participants for that round
3. Run attack phase (each attacker vs boss)
4. Run AOE phase (flat damage to all participants)
5. Run heal phase (each healer targets 5 lowest HP)
6. Update boss HP, participant HP, knock out 0-HP players
7. Generate chat messages for results
8. If boss HP <= 0: distribute loot, complete event, announce in chat

### Chat System

Existing `ChatPanel` overlay + Socket.IO infrastructure. Needs:
- `message_type` column added to `chat_messages` table
- Server-side `emitSystemMessage()` utility for broadcasting system messages
- `getChannelHistory` updated to include `messageType` in response
- World event lifecycle hooks call `emitSystemMessage` on spawn/expiry/round resolve/kill
- Boss sign-up UI may be a separate interaction (chat command like `/join attacker` or a dedicated panel triggered from a system message link)

---

## Implementation Status

### What's Fully Working (End-to-End)

**Resource Events — `yield_up`**: Templates exist → scheduler spawns them on wild zones → gathering route applies `resourceYieldMultiplier` via `applyResourceEventModifiers()` → players get increased yield when mining during active events.

**Mob Events — `damage_up`, `hp_down`, `hp_up`, `spawn_rate_up`**: Templates exist → scheduler spawns them → both combat route AND exploration route call `getActiveZoneModifiers()` and apply `applyMobEventModifiers()` to scale mob damage/HP before combat resolution. Works for direct combat and exploration ambushes.

**Event Discovery**: `simulateExploration()` produces `event_discovery` outcomes (0.01% per turn) → exploration route handles it → picks eligible template → calls `spawnWorldEvent()` with `createdBy: 'player_discovery'` → emits system chat message.

**Persisted Mob HP — Save on Defeat**: Combat route persists mob HP when player flees or is defeated (`persistMobHp()`). Exploration route persists mob HP on ambush defeat. Cleanup timer runs every 5 minutes to delete records older than `PERSISTED_MOB_MAX_AGE_MINUTES`.

**Event Scheduler**: Runs lazily on every `GET /events` or exploration start. Expires stale events. Spawns new resource/mob events on wild zones respecting slot limits (1 per type per zone, capped at ~1 event per 3 zones globally).

**Chat System Messages**: `emitSystemMessage()` utility persists and broadcasts via Socket.IO. `message_type` column added to DB. `saveMessage` and `getChannelHistory` handle messageType. Messages emitted on: event spawn, event expiry, player event discovery, boss kill (world channel with killer name).

**Frontend — WorldEvents Screen**: Fetches active events and boss encounters. Displays event type/title/effect/time remaining. Boss HP bars. `worldEvents` screen accessible from game nav. `BossEncounterPanel` component with signup UI.

**Boss Encounter Infrastructure**: DB models (BossEncounter, BossParticipant, PersistedMob). Pure `resolveBossRoundLogic()` in game-engine. Signup endpoint (deducts turns, checks HP/recovery state). Round resolution timer (every 60s). HP scaling after round 1. Loot distribution weighted by contribution. Boss kill announcement to world chat.

### What's Partially Working (Gaps)

**Resource Events — `drop_rate_up`**: Template exists, scheduler spawns it, `resourceDropRateMultiplier` is calculated in `getActiveZoneModifiers()` — but **lootService never reads it**. Neither combat loot nor gathering loot is affected by this multiplier.

**Mob Events — `spawn_rate_up/down`**: `mobSpawnRateMultiplier` is calculated correctly in `getActiveZoneModifiers()` — but **`simulateExploration()` never receives it**. The multiplier is not passed to the probability model, so encounter rates are unaffected.

**Persisted Mob HP — Reencounter**: `checkPersistedMobReencounter()` exists (30% chance, with regen calculation) and is called from combat route for direct zone combat — but **not called during exploration ambushes**. Players exploring won't reencounter damaged mobs.

**System Chat Messages**: Event spawn/expiry/discovery messages work. Boss round resolution emits round results to zone chat. **Missing**: messages for boss sign-up confirmations; event messages don't include emoji prefixes from design doc.

### What's Not Working Yet

**Boss Spawn Mechanism**: `createBossEncounter()` exists but is never called. The scheduler only spawns `resource` and `mob` events. No boss templates in `WORLD_EVENT_TEMPLATES`. Exploration `event_discovery` explicitly filters out bosses. **Bosses cannot appear through any pathway.**

**Missing Event Templates**: `damage_down` and `spawn_rate_down` have no templates defined (the engine supports them, the scheduler just never rolls them).

**`EVENT_RESPAWN_DELAY_MINUTES`**: Defined (30 min) but never used. Events respawn immediately when a slot empties, with no quiet period.

**Boss Attacker Stats**: `buildPlayerCombatStats()` in boss round resolution hardcodes `attackStyle: 'melee'` and `skillLevel: 1`. Ranged/magic users get incorrect damage calculations. Should read equipped weapon skill like the combat route does.

**Healer Scaling**: Design says scale with magic/vitality. Implementation uses `turnsCommitted / 2` — purely turn-based, ignoring player stats.

### Remaining Work (Priority Order)

1. **Wire `drop_rate_up` to loot**: Pass `resourceDropRateMultiplier` from zone modifiers into `rollAndGrantLoot()` so combat and gathering loot is affected.
2. **Wire `spawn_rate` to exploration**: Pass `mobSpawnRateMultiplier` into `simulateExploration()` or apply it to ambush encounter probability post-hoc.
3. **Wire persisted mob reencounter in exploration**: Call `checkPersistedMobReencounter()` before rolling a fresh ambush mob during exploration.
4. **Add boss spawn mechanism**: Either add boss templates + scheduler support, or create an admin endpoint to manually spawn boss events for testing.
5. **Add missing event templates**: `damage_down`, `spawn_rate_down`.
6. **Use `EVENT_RESPAWN_DELAY_MINUTES`**: Add cooldown after event expiry before spawning a new one.
7. **Fix boss attacker stats**: Read player's equipped weapon to determine attack style and skill level.
8. **Healer scaling**: Factor in magic/vitality attributes instead of pure turn count.
9. **Frontend polish**: Show zone names on events, show player usernames (not UUIDs) in boss participant list, add `baseHp`/`killedBy` to frontend types.
10. **Unit tests**: Add tests for pure functions: `bossRoundResolver`, `persistedMobRegen`, `applyEventModifiers`.
