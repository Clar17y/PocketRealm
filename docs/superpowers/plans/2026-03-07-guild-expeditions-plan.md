# Guild Expeditions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-room async dungeon raids for guild members with expedition tokens and soulbound gear sets.

**Architecture:** Extends the boss encounter async pattern (5-min timed rounds, template-driven actions, threat-based targeting) to many-vs-many combat across sequential rooms. New raid round resolver in game-engine handles N mobs acting independently per round. Expedition service orchestrates lifecycle (launch → signup → room progression → loot). Token shop provides endgame soulbound gear with set bonuses.

**Tech Stack:** Prisma (schema), game-engine (raid resolver), Express services/routes, React frontend components

**Design doc:** `docs/superpowers/specs/2026-03-07-guild-expeditions-design.md`

---

### Task 1: Shared Types — Expedition Types

**Files:**
- Create: `packages/shared/src/types/expedition.types.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create expedition types file**

```typescript
// packages/shared/src/types/expedition.types.ts

import type { BossActiveEffect, BossTargetMode, CombatantStats } from './combat.types';
import type { BossTemplateAction } from './bossTemplate.types';

// --- Expedition Status ---

export type ExpeditionStatus = 'recruiting' | 'in_progress' | 'completed' | 'failed';
export type ExpeditionRoomType = 'trash' | 'elite' | 'mini_boss' | 'event' | 'final_boss';

// --- Room & Mob Definitions ---

export interface ExpeditionMobState {
  id: string;
  mobTemplateId: string;
  name: string;
  prefix: string | null;
  hp: number;
  maxHp: number;
  stats: CombatantStats;
  actionTemplate: BossTemplateAction[];
  activeEffects: BossActiveEffect[];
}

export interface ExpeditionRoomDefinition {
  roomIndex: number;
  roomType: ExpeditionRoomType;
  mobs: ExpeditionMobState[];
  environmentalDotPercent?: number; // event rooms: % of max HP per round
}

// --- Raid Round Engine Types ---

export interface RaidRoundInput {
  mobs: ExpeditionMobState[];
  participants: RaidParticipant[];
  threatTable: RaidThreatEntry[];
  roundNumber: number;
}

export interface RaidParticipant {
  playerId: string;
  stats: CombatantStats;
  template: { actionId: string; condition?: unknown; thenActionId?: string; sortOrder: number }[];
  actionDefinitions: Record<string, unknown>;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  templateRound: number;
  activeEffects: BossActiveEffect[];
}

export interface RaidThreatEntry {
  playerId: string;
  threat: number;
  tauntRoundsRemaining: number;
}

export interface MobActionResult {
  mobId: string;
  actionId: string;
  targetMode: BossTargetMode;
  targetPlayerIds: string[];
  damageDealt: number;
  healingDone: number;
}

export interface RaidParticipantResult {
  playerId: string;
  actionId: string;
  targetMobId: string | null;
  wasExhausted: boolean;
  damageDealt: number;
  healingDone: number;
  damageTaken: number;
  hpAfter: number;
  staminaAfter: number;
  manaAfter: number;
  templateRoundAfter: number;
  isDead: boolean;
  hit: boolean;
  isCritical: boolean;
  activeEffectsAfter: BossActiveEffect[];
}

export interface RaidRoundResult {
  mobsAfter: ExpeditionMobState[];
  participantResults: RaidParticipantResult[];
  mobActionResults: MobActionResult[];
  threatTableAfter: RaidThreatEntry[];
  roomCleared: boolean;
  allPlayersDead: boolean;
}

// --- Expedition Data (API responses) ---

export interface ExpeditionData {
  id: string;
  guildId: string;
  tier: number;
  status: ExpeditionStatus;
  currentRoom: number;
  totalRooms: number;
  currentRoomType: ExpeditionRoomType | null;
  roundNumber: number;
  nextRoundAt: string | null;
  startedAt: string;
  completedAt: string | null;
  launchedBy: string;
  launchedByUsername?: string;
  participantCount: number;
  mobsRemaining: number;
}

export interface ExpeditionMemberData {
  playerId: string;
  username?: string;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  isKnockedOut: boolean;
  totalDamage: number;
  totalHealing: number;
  roomDamage: number;
  roomHealing: number;
  signedUpAt: string;
}

export interface ExpeditionRoundSummary {
  roundNumber: number;
  roomIndex: number;
  participantResults: RaidParticipantResult[];
  mobActionResults: MobActionResult[];
  roomCleared: boolean;
  allPlayersDead: boolean;
}

// --- Token Shop Types ---

export type ExpeditionSetId = 'vanguard' | 'sharpshooter' | 'arcanist';

export interface ExpeditionShopItem {
  id: string;
  setId: ExpeditionSetId;
  name: string;
  slot: string;
  tokenCost: number;
  stats: Partial<CombatantStats>;
  setBonus2pc: string;
  setBonus4pc: string;
}
```

**Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './types/expedition.types';
```

**Step 3: Build shared package and verify**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/shared/src/types/expedition.types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add expedition types"
```

---

### Task 2: Shared Constants — Expedition Constants & Definitions

**Files:**
- Create: `packages/shared/src/constants/expeditionDefinitions.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Add EXPEDITION_CONSTANTS to gameConstants.ts**

Add after `GUILD_CONSTANTS`:

```typescript
export const EXPEDITION_CONSTANTS = {
  // Treasury costs per tier
  TREASURY_COST_BY_TIER: [200_000, 500_000, 1_000_000] as const,
  // Player level requirements per tier
  LEVEL_REQUIREMENT_BY_TIER: [10, 16, 23] as const,
  // Min participants per tier
  MIN_PARTICIPANTS_BY_TIER: [5, 8, 12] as const,
  // Total rooms per tier
  ROOMS_BY_TIER: [5, 6, 8] as const,
  // Mob count ranges per room type: [min, max]
  MOB_COUNTS: {
    trash: [4, 5] as const,
    elite: [3, 4] as const,
    mini_boss_adds: [2, 3] as const,
    event: [3, 4] as const,
  } as const,
  // Timers (milliseconds)
  SIGNUP_WINDOW_MS: 10 * 60 * 1000,
  ROUND_INTERVAL_MS: 5 * 60 * 1000,
  REST_DURATION_MS: 5 * 60 * 1000,
  // Rest regen percentages (0-1)
  REST_HP_REGEN: 0.20,
  REST_STAMINA_REGEN: 0.30,
  REST_MANA_REGEN: 0.30,
  // Environment DoT for event rooms (% of max HP)
  EVENT_DOT_PERCENT: 0.03,
  // Cooldowns
  WEEKLY_COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
  BETWEEN_EXPEDITION_COOLDOWN_MS: 24 * 60 * 60 * 1000,
  // Turn cost to sign up
  SIGNUP_TURN_COST: 300,
  // Tokens per room by type
  TOKENS_PER_ROOM: {
    trash: 5,
    elite: 8,
    mini_boss: 12,
    event: 8,
    final_boss: 20,
  } as const,
  // Tier multiplier for tokens
  TOKEN_TIER_MULTIPLIER: [1, 2, 4] as const,
  // Completion bonus (multiplier of total room tokens)
  COMPLETION_BONUS_MULTIPLIER: 1.0,
  // Loot multiplier per room type
  LOOT_MULTIPLIER: {
    trash: 1.0,
    elite: 1.5,
    mini_boss: 2.0,
    event: 1.5,
    final_boss: 3.0,
  } as const,
  // Guild XP per room cleared
  GUILD_XP_PER_ROOM: 25,
  GUILD_XP_COMPLETION_BONUS: 100,
  // KO recovery turn cost
  KO_RECOVERY_TURN_COST: 500,
  // Boss phase thresholds (% of max HP)
  BOSS_PHASE_THRESHOLDS: [0.50, 0.25] as const,
  // Soulbound item durability multiplier vs normal
  SOULBOUND_DURABILITY_MULTIPLIER: 2,
} as const;

export const EXPEDITION_TOKEN_CONSTANTS = {
  // Token costs for shop items by slot
  TOKEN_COST_HEAD: 80,
  TOKEN_COST_CHEST: 120,
  TOKEN_COST_GLOVES: 60,
  TOKEN_COST_LEGS: 100,
  TOKEN_COST_BOOTS: 60,
  // Set bonus activation in group content only
  SET_BONUS_GROUP_CONTENT_ONLY: true,
} as const;
```

**Step 2: Create expeditionDefinitions.ts**

```typescript
// packages/shared/src/constants/expeditionDefinitions.ts

import type { ExpeditionRoomType, ExpeditionSetId, ExpeditionShopItem } from '../types/expedition.types';

// Room composition per tier: [roomType, count]
export const EXPEDITION_ROOM_COMPOSITIONS: Record<number, { type: ExpeditionRoomType; count: number }[]> = {
  1: [
    { type: 'trash', count: 3 },
    { type: 'elite', count: 1 },
    { type: 'final_boss', count: 1 },
  ],
  2: [
    { type: 'trash', count: 3 },
    { type: 'elite', count: 1 },
    { type: 'mini_boss', count: 1 },
    { type: 'final_boss', count: 1 },
  ],
  3: [
    { type: 'trash', count: 3 },
    { type: 'elite', count: 2 },
    { type: 'mini_boss', count: 1 },
    { type: 'event', count: 1 },
    { type: 'final_boss', count: 1 },
  ],
};

// Mob action templates by room type
// Trash: simple attack loop
export const TRASH_MOB_TEMPLATE = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
];

// Elite: 4-round rotation with telegraphed AoE
export const ELITE_MOB_TEMPLATE = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_magic_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_earthquake', targetMode: 'aoe' as const, isTelegraphed: true, label: 'EARTHQUAKE' },
];

// Mini-boss: 6-round rotation with heal, enrage, and telegraphed AoE
export const MINI_BOSS_TEMPLATE = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_magic_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_enrage', targetMode: 'single_target' as const },
  { actionId: 'boss_earthquake', targetMode: 'aoe' as const, isTelegraphed: true, label: 'EARTHQUAKE' },
  { actionId: 'boss_heal_self', targetMode: 'single_target' as const },
  { actionId: 'boss_arcane_storm', targetMode: 'aoe' as const, isTelegraphed: true, label: 'ARCANE STORM' },
];

// Mini-boss adds: buff the boss
export const MINI_BOSS_ADD_TEMPLATE = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_enrage', targetMode: 'single_target' as const },
];

// Final boss phase 1 (100-50% HP)
export const FINAL_BOSS_PHASE1_TEMPLATE = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_magic_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_earthquake', targetMode: 'aoe' as const, isTelegraphed: true, label: 'EARTHQUAKE' },
  { actionId: 'boss_enrage', targetMode: 'single_target' as const },
  { actionId: 'boss_magic_attack', targetMode: 'single_target' as const },
];

// Final boss phase 2 (50-25% HP) — more aggressive
export const FINAL_BOSS_PHASE2_TEMPLATE = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' as const },
  { actionId: 'boss_arcane_storm', targetMode: 'aoe' as const, isTelegraphed: true, label: 'ARCANE STORM' },
  { actionId: 'boss_enrage', targetMode: 'single_target' as const },
  { actionId: 'boss_earthquake', targetMode: 'aoe' as const, isTelegraphed: true, label: 'EARTHQUAKE' },
];

// Final boss phase 3 (below 25% HP) — enraged, frequent AoE
export const FINAL_BOSS_PHASE3_TEMPLATE = [
  { actionId: 'boss_arcane_storm', targetMode: 'aoe' as const, isTelegraphed: true, label: 'ARCANE STORM' },
  { actionId: 'boss_enrage', targetMode: 'single_target' as const },
  { actionId: 'boss_earthquake', targetMode: 'aoe' as const, isTelegraphed: true, label: 'EARTHQUAKE' },
];

// --- Expedition Shop Gear Sets ---

export const EXPEDITION_SHOP_ITEMS: ExpeditionShopItem[] = [
  // Vanguard Set (Melee/Tank)
  {
    id: 'vanguard_helm',
    setId: 'vanguard',
    name: "Vanguard's Helm",
    slot: 'head',
    tokenCost: 80,
    stats: { defence: 35, maxHp: 50 },
    setBonus2pc: '+10% max HP',
    setBonus4pc: 'Counter triggers AoE taunt (2 rounds)',
  },
  {
    id: 'vanguard_plate',
    setId: 'vanguard',
    name: "Vanguard's Plate",
    slot: 'chest',
    tokenCost: 120,
    stats: { defence: 50, maxHp: 80 },
    setBonus2pc: '+10% max HP',
    setBonus4pc: 'Counter triggers AoE taunt (2 rounds)',
  },
  {
    id: 'vanguard_gauntlets',
    setId: 'vanguard',
    name: "Vanguard's Gauntlets",
    slot: 'gloves',
    tokenCost: 60,
    stats: { defence: 25, attack: 15 },
    setBonus2pc: '+10% max HP',
    setBonus4pc: 'Counter triggers AoE taunt (2 rounds)',
  },
  {
    id: 'vanguard_greaves',
    setId: 'vanguard',
    name: "Vanguard's Greaves",
    slot: 'legs',
    tokenCost: 100,
    stats: { defence: 40, maxHp: 60 },
    setBonus2pc: '+10% max HP',
    setBonus4pc: 'Counter triggers AoE taunt (2 rounds)',
  },
  {
    id: 'vanguard_sabatons',
    setId: 'vanguard',
    name: "Vanguard's Sabatons",
    slot: 'boots',
    tokenCost: 60,
    stats: { defence: 20, dodge: 10 },
    setBonus2pc: '+10% max HP',
    setBonus4pc: 'Counter triggers AoE taunt (2 rounds)',
  },

  // Sharpshooter Set (Ranged/DPS)
  {
    id: 'sharpshooter_hood',
    setId: 'sharpshooter',
    name: "Sharpshooter's Hood",
    slot: 'head',
    tokenCost: 80,
    stats: { accuracy: 20, critChance: 5 },
    setBonus2pc: '+10% crit chance',
    setBonus4pc: '15% chance to double-hit on attacks',
  },
  {
    id: 'sharpshooter_vest',
    setId: 'sharpshooter',
    name: "Sharpshooter's Vest",
    slot: 'chest',
    tokenCost: 120,
    stats: { accuracy: 25, critDamage: 20, dodge: 15 },
    setBonus2pc: '+10% crit chance',
    setBonus4pc: '15% chance to double-hit on attacks',
  },
  {
    id: 'sharpshooter_bracers',
    setId: 'sharpshooter',
    name: "Sharpshooter's Bracers",
    slot: 'gloves',
    tokenCost: 60,
    stats: { accuracy: 15, critChance: 3, attack: 10 },
    setBonus2pc: '+10% crit chance',
    setBonus4pc: '15% chance to double-hit on attacks',
  },
  {
    id: 'sharpshooter_leggings',
    setId: 'sharpshooter',
    name: "Sharpshooter's Leggings",
    slot: 'legs',
    tokenCost: 100,
    stats: { accuracy: 20, dodge: 15, speed: 10 },
    setBonus2pc: '+10% crit chance',
    setBonus4pc: '15% chance to double-hit on attacks',
  },
  {
    id: 'sharpshooter_treads',
    setId: 'sharpshooter',
    name: "Sharpshooter's Treads",
    slot: 'boots',
    tokenCost: 60,
    stats: { dodge: 15, speed: 10 },
    setBonus2pc: '+10% crit chance',
    setBonus4pc: '15% chance to double-hit on attacks',
  },

  // Arcanist Set (Magic/Healer)
  {
    id: 'arcanist_circlet',
    setId: 'arcanist',
    name: "Arcanist's Circlet",
    slot: 'head',
    tokenCost: 80,
    stats: { magicDefence: 25, attack: 15 },
    setBonus2pc: '+15% mana regen per round',
    setBonus4pc: 'Heals splash 30% to lowest HP ally',
  },
  {
    id: 'arcanist_robe',
    setId: 'arcanist',
    name: "Arcanist's Robe",
    slot: 'chest',
    tokenCost: 120,
    stats: { magicDefence: 35, attack: 25, maxHp: 40 },
    setBonus2pc: '+15% mana regen per round',
    setBonus4pc: 'Heals splash 30% to lowest HP ally',
  },
  {
    id: 'arcanist_gloves',
    setId: 'arcanist',
    name: "Arcanist's Gloves",
    slot: 'gloves',
    tokenCost: 60,
    stats: { magicDefence: 15, attack: 10 },
    setBonus2pc: '+15% mana regen per round',
    setBonus4pc: 'Heals splash 30% to lowest HP ally',
  },
  {
    id: 'arcanist_pants',
    setId: 'arcanist',
    name: "Arcanist's Pants",
    slot: 'legs',
    tokenCost: 100,
    stats: { magicDefence: 25, maxHp: 30, dodge: 10 },
    setBonus2pc: '+15% mana regen per round',
    setBonus4pc: 'Heals splash 30% to lowest HP ally',
  },
  {
    id: 'arcanist_slippers',
    setId: 'arcanist',
    name: "Arcanist's Slippers",
    slot: 'boots',
    tokenCost: 60,
    stats: { magicDefence: 15, speed: 10, dodge: 10 },
    setBonus2pc: '+15% mana regen per round',
    setBonus4pc: 'Heals splash 30% to lowest HP ally',
  },
];

// Helper to get set pieces count
export function getSetPieceCount(equippedSetIds: string[]): Map<ExpeditionSetId, number> {
  const counts = new Map<ExpeditionSetId, number>();
  for (const item of EXPEDITION_SHOP_ITEMS) {
    if (equippedSetIds.includes(item.id)) {
      counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
    }
  }
  return counts;
}
```

**Step 3: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './constants/expeditionDefinitions';
```

**Step 4: Build and verify**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/shared/src/constants/expeditionDefinitions.ts packages/shared/src/constants/gameConstants.ts packages/shared/src/index.ts
git commit -m "feat(shared): add expedition constants and definitions"
```

---

### Task 3: Database Schema — Expedition Models

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add GuildExpedition and GuildExpeditionMember models**

Add after the `GuildJoinRequest` model:

```prisma
model GuildExpedition {
  id                String    @id @default(uuid())
  guildId           String    @map("guild_id")
  tier              Int
  status            String    @default("recruiting") @db.VarChar(16)
  currentRoom       Int       @default(0) @map("current_room")
  totalRooms        Int       @map("total_rooms")
  roomDefinitions   Json      @map("room_definitions")
  roomStartSnapshot Json?     @map("room_start_snapshot")
  roundNumber       Int       @default(0) @map("round_number")
  roundSummaries    Json?     @map("round_summaries")
  nextRoundAt       DateTime? @map("next_round_at")
  startedAt         DateTime  @default(now()) @map("started_at")
  completedAt       DateTime? @map("completed_at")
  launchedBy        String    @map("launched_by")

  guild   Guild                   @relation(fields: [guildId], references: [id], onDelete: Cascade)
  launcher Player                 @relation("ExpeditionLauncher", fields: [launchedBy], references: [id])
  members GuildExpeditionMember[]

  @@index([guildId, status])
  @@index([guildId, tier, startedAt])
  @@index([status, nextRoundAt])
  @@map("guild_expeditions")
}

model GuildExpeditionMember {
  id             String   @id @default(uuid())
  expeditionId   String   @map("expedition_id")
  playerId       String   @map("player_id")
  currentHp      Int      @map("current_hp")
  currentStamina Int      @map("current_stamina")
  currentMana    Int      @map("current_mana")
  templateRound  Int      @default(1) @map("template_round")
  activeEffects  Json     @default("[]") @map("active_effects")
  threatValue    Float    @default(0) @map("threat_value")
  isKnockedOut   Boolean  @default(false) @map("is_knocked_out")
  totalDamage    BigInt   @default(0) @map("total_damage")
  totalHealing   BigInt   @default(0) @map("total_healing")
  roomDamage     BigInt   @default(0) @map("room_damage")
  roomHealing    BigInt   @default(0) @map("room_healing")
  signedUpAt     DateTime @default(now()) @map("signed_up_at")

  expedition GuildExpedition @relation(fields: [expeditionId], references: [id], onDelete: Cascade)
  player     Player          @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([expeditionId, playerId])
  @@map("guild_expedition_members")
}
```

**Step 2: Add expedition relations to existing models**

Add to the `Guild` model's relations:
```prisma
  expeditions  GuildExpedition[]
```

Add to the `Player` model:
```prisma
  expeditionTokens     Int                    @default(0) @map("expedition_tokens")
  expeditionsLaunched   GuildExpedition[]      @relation("ExpeditionLauncher")
  expeditionMemberships GuildExpeditionMember[]
```

Add to the `Item` model:
```prisma
  isSoulbound Boolean @default(false) @map("is_soulbound")
```

**Step 3: Generate migration**

Run: `npx prisma migrate dev --name add_guild_expeditions`
Expected: Migration created and applied

**Step 4: Build database package**

Run: `npm run build --workspace=packages/database`
Expected: Build succeeds with new types

**Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add guild expedition schema and migration"
```

---

### Task 4: Raid Round Resolver — Game Engine

**Files:**
- Create: `packages/game-engine/src/combat/raidRoundResolver.ts`
- Create: `packages/game-engine/src/combat/raidRoundResolver.test.ts`
- Modify: `packages/game-engine/src/index.ts`

This is the core many-vs-many combat engine. It follows the same pattern as `bossRoundResolver.ts` but handles N mobs, each acting independently.

**Step 1: Write failing tests**

Create `packages/game-engine/src/combat/raidRoundResolver.test.ts` with tests covering:

1. **Basic round resolution**: 2 participants vs 2 mobs, verify all act
2. **Auto-target lowest HP mob**: Participant single-target hits lowest HP mob
3. **AoE hits all mobs**: AoE action damages all surviving mobs
4. **Dead mob removal**: Mob at 0 HP removed from `mobsAfter`
5. **Room cleared**: All mobs dead → `roomCleared: true`
6. **All players dead**: All players KO'd → `allPlayersDead: true`
7. **Threat-based mob targeting**: Mobs attack highest-threat player
8. **Counter avoids physical mob attack**: Player countering takes no physical damage
9. **Ward avoids magic mob attack**: Player warding resists magic damage
10. **Multiple mobs each attack independently**: 5 mobs = 5 separate attacks
11. **Environmental DoT**: When provided, all players take % max HP damage
12. **Resource deduction and regen**: Stamina/mana costs applied, regen ticks

Use deterministic RNG (seeded or mock) for reproducible tests. Reference the existing `bossRoundResolver.test.ts` for test structure patterns.

Run: `npm run test:engine -- --run raidRoundResolver`
Expected: All tests FAIL (module not found)

**Step 2: Implement raid round resolver**

Create `packages/game-engine/src/combat/raidRoundResolver.ts`:

Key function: `resolveRaidRound(input: RaidRoundInput, rng?: RaidRoundRng): RaidRoundResult`

Resolution order:
1. Resolve each participant's action from their template (reuse `resolveAction` from `actionResolver.ts`)
2. Apply taunt effects to shared threat table
3. Build defensive stance map (who is countering/warding/defending)
4. **Player offensive phase**: For each player with an offensive action:
   - Single-target → find mob with lowest HP among surviving mobs → roll hit, damage, apply
   - AoE → hit all surviving mobs → roll per mob
   - Remove dead mobs (HP ≤ 0)
   - Add threat per damage dealt
5. **Player supportive phase**: heal_self restores own HP, heal_ally restores highest-threat player HP
6. **Mob offensive phase**: For each surviving mob:
   - Pick action from mob's template (round-based index)
   - Single-target → `getSingleTarget(threatTable, alivePlayerIds)` → roll hit, damage
   - AoE → all alive players → roll per player
   - Check counter/ward/defend per target
   - Apply damage
7. **Environmental DoT** (if provided): All alive players take `dotPercent * maxHp` damage
8. **Resource management**: Deduct stamina/mana costs, apply regen, tick effect durations
9. **Threat decay**: Tick taunts

Reuse from existing code:
- `resolveAction()` from `actionResolver.ts`
- `getSingleTarget()`, `addDamageThreat()`, `addHealThreat()`, `applyTaunt()`, `tickTaunts()` from `threatSystem.ts`
- `calculateFinalDamage()`, `rollD20()` from `damageCalculator.ts`
- Action definitions from `combatActionDefinitions.ts`

**Step 3: Run tests to verify they pass**

Run: `npm run test:engine -- --run raidRoundResolver`
Expected: All tests PASS

**Step 4: Export from game-engine index**

Add to `packages/game-engine/src/index.ts`:
```typescript
export * from './combat/raidRoundResolver';
```

**Step 5: Build and verify**

Run: `npm run build --workspace=packages/game-engine`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add packages/game-engine/src/combat/raidRoundResolver.ts packages/game-engine/src/combat/raidRoundResolver.test.ts packages/game-engine/src/index.ts
git commit -m "feat(engine): add raid round resolver for expedition combat"
```

---

### Task 5: Room Generation — Game Engine

**Files:**
- Create: `packages/game-engine/src/expedition/roomGenerator.ts`
- Create: `packages/game-engine/src/expedition/roomGenerator.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Write failing tests**

Tests covering:
1. **T1 generates 5 rooms**: 3 trash, 1 elite, 1 final_boss
2. **T2 generates 6 rooms**: 3 trash, 1 elite, 1 mini_boss, 1 final_boss
3. **T3 generates 8 rooms**: 3 trash, 2 elite, 1 mini_boss, 1 event, 1 final_boss
4. **Final boss always last room**
5. **Mob counts within range per room type**
6. **Mobs have valid stats scaled to tier level range**
7. **Event rooms have environmentalDotPercent set**
8. **Mini-boss rooms have 1 strong mob + adds**

Run: `npm run test:engine -- --run roomGenerator`
Expected: FAIL

**Step 2: Implement room generator**

Create `packages/game-engine/src/expedition/roomGenerator.ts`:

Key function: `generateExpeditionRooms(tier: number, mobPool: MobPoolEntry[], rng?: () => number): ExpeditionRoomDefinition[]`

`MobPoolEntry` = `{ mobTemplateId, name, level, stats, prefix? }` — provided by the service layer from DB.

Logic:
1. Get room composition from `EXPEDITION_ROOM_COMPOSITIONS[tier]`
2. Expand to room list (e.g., 3 trash → 3 individual trash rooms)
3. Shuffle non-final-boss rooms, final boss always last
4. For each room, generate mobs:
   - Pick random mobs from pool
   - Scale stats by tier level
   - Assign action templates based on room type
   - Set environmental DoT for event rooms
5. Return array of `ExpeditionRoomDefinition`

**Step 3: Run tests**

Run: `npm run test:engine -- --run roomGenerator`
Expected: PASS

**Step 4: Export and build**

Add to `packages/game-engine/src/index.ts`:
```typescript
export * from './expedition/roomGenerator';
```

Run: `npm run build --workspace=packages/game-engine`

**Step 5: Commit**

```bash
git add packages/game-engine/src/expedition/ packages/game-engine/src/index.ts
git commit -m "feat(engine): add expedition room generator"
```

---

### Task 6: Expedition Service — Launch & Signup

**Files:**
- Create: `apps/api/src/services/expeditionService.ts`
- Create: `apps/api/src/services/expeditionService.test.ts`

**Step 1: Write failing tests**

Tests for launch:
1. **Successful launch**: Officer launches T1, treasury deducted, expedition created with `recruiting` status
2. **Non-officer rejected**: Member cannot launch
3. **Insufficient treasury**: Fails with INSUFFICIENT_TREASURY
4. **Active expedition blocks**: Cannot launch while another is active
5. **Weekly cooldown**: Cannot launch same tier within 7 days
6. **24h between-expedition cooldown**: Cannot launch within 24h of last completion

Tests for signup:
1. **Successful signup**: Member signs up, turn cost deducted, member record created
2. **Non-guild-member rejected**: Player not in guild cannot sign up
3. **Level too low**: Player below tier requirement rejected
4. **Already signed up**: Duplicate signup rejected
5. **Expedition not recruiting**: Cannot sign up to in_progress expedition

Run: `npm run test:api -- --run expeditionService`
Expected: FAIL

**Step 2: Implement expeditionService.ts**

Follow the `bossEncounterService.ts` and `guildService.ts` patterns:

```typescript
// Key functions:
export async function launchExpedition(playerId: string, tier: number): Promise<ExpeditionData>
export async function signUpForExpedition(expeditionId: string, playerId: string): Promise<ExpeditionMemberData>
export async function getActiveExpedition(guildId: string): Promise<ExpeditionData | null>
export async function getExpeditionStatus(expeditionId: string): Promise<{ expedition: ExpeditionData; members: ExpeditionMemberData[] } | null>
```

`launchExpedition`:
1. `requireRole(playerId, 'officer')` — checks guild membership and role
2. Validate tier (1-3), check treasury, check cooldowns
3. Fetch mob pool from DB: `prisma.mobTemplate.findMany()` filtered by level range for tier
4. Call `generateExpeditionRooms(tier, mobPool)` from game-engine
5. Transaction: deduct treasury, create `GuildExpedition`, add guild log
6. Set `nextRoundAt` = now + SIGNUP_WINDOW_MS (10 min)
7. Return `ExpeditionData`

`signUpForExpedition`:
1. Validate expedition exists and is `recruiting`
2. Validate player is in same guild, meets level requirement
3. Check not already signed up
4. Spend turns (with tax) using `spendWithTaxTx`
5. Get player max HP/stamina/mana from existing service functions
6. Create `GuildExpeditionMember` with full resources
7. Return `ExpeditionMemberData`

**Step 3: Run tests**

Run: `npm run test:api -- --run expeditionService`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/services/expeditionService.test.ts
git commit -m "feat(api): add expedition service - launch and signup"
```

---

### Task 7: Expedition Service — Round Resolution & Room Progression

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`
- Modify: `apps/api/src/services/expeditionService.test.ts`

**Step 1: Write failing tests for round resolution**

Tests:
1. **Round resolves**: Participants fight mobs, damage applied, next round scheduled
2. **Room cleared**: All mobs dead → advance to rest phase, schedule next room
3. **Full wipe**: All players KO'd → room resets, mob HP restored from snapshot
4. **Rest phase advances**: After rest timer, advance to next room, regen HP/resources, reset room damage/healing
5. **KO'd players excluded from next room if not recovered**: isKnockedOut && HP still 0 → skip
6. **Expedition completes**: Final room cleared → status = completed, tokens awarded
7. **Recruiting → in_progress**: First round after signup window transitions status

Run: `npm run test:api -- --run expeditionService`
Expected: New tests FAIL

**Step 2: Implement round resolution**

Add to `expeditionService.ts`:

```typescript
export async function checkAndResolveExpeditionRounds(io: SocketServer | null): Promise<void>
async function resolveExpeditionRound(expeditionId: string, io: SocketServer | null): Promise<void>
async function advanceToNextRoom(expeditionId: string): Promise<void>
async function handleRoomCleared(expeditionId: string): Promise<void>
async function handleWipe(expeditionId: string): Promise<void>
async function completeExpedition(expeditionId: string): Promise<void>
```

`checkAndResolveExpeditionRounds`:
- Query `GuildExpedition` where `status IN ('recruiting', 'in_progress') AND nextRoundAt <= now()`
- For `recruiting`: check min participants met → transition to `in_progress`, snapshot state, schedule first round
- For `in_progress`: call `resolveExpeditionRound`

`resolveExpeditionRound`:
1. Fetch expedition with members and their combat templates
2. Get current room definition from `roomDefinitions[currentRoom]`
3. Build `RaidRoundInput` from member data + current mob state
4. Call `resolveRaidRound(input)` from game-engine
5. Update member records (HP, stamina, mana, damage, healing, KO status, template round, effects)
6. Update mob state in `roomDefinitions` JSON
7. Store round summary in `roundSummaries`
8. If `roomCleared` → call `handleRoomCleared`
9. If `allPlayersDead` → call `handleWipe`
10. Otherwise → schedule next round (`nextRoundAt = now + ROUND_INTERVAL_MS`)
11. Use optimistic locking (`updateMany` with `roundNumber` match)

`handleRoomCleared`:
- Distribute per-room loot (contribution-weighted)
- Award tokens (flat per room, scaled by tier)
- Award guild XP
- If last room → `completeExpedition`
- Else → schedule rest phase (`nextRoundAt = now + REST_DURATION_MS`), set rest flag

`handleWipe`:
- Restore mob HP from `roomStartSnapshot`
- Restore all player HP/resources from `roomStartSnapshot`
- Reset KO flags, room damage/healing counters
- Schedule retry (`nextRoundAt = now + REST_DURATION_MS`)

`completeExpedition`:
- Set status = `completed`, completedAt = now
- Award completion bonus tokens to all members
- Award guild XP completion bonus
- Add guild log

**Step 3: Run tests**

Run: `npm run test:api -- --run expeditionService`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/services/expeditionService.test.ts
git commit -m "feat(api): add expedition round resolution and room progression"
```

---

### Task 8: Expedition Service — Loot Distribution

**Files:**
- Create: `apps/api/src/services/expeditionLootService.ts`
- Create: `apps/api/src/services/expeditionLootService.test.ts`

**Step 1: Write failing tests**

Tests:
1. **Contribution-weighted loot**: Higher damage = more/better drops
2. **KO'd players still get loot**: Included with naturally lower contribution
3. **Tier scaling**: Higher tiers give better rarity chances
4. **Room type multiplier**: Boss rooms give more drops than trash
5. **Token distribution**: Flat tokens per room regardless of contribution
6. **Completion bonus tokens**: Extra tokens when all rooms cleared

Run: `npm run test:api -- --run expeditionLootService`
Expected: FAIL

**Step 2: Implement expeditionLootService.ts**

Follow `bossLootService.ts` pattern:

```typescript
export interface ExpeditionContributor {
  playerId: string;
  roomDamage: number;
  roomHealing: number;
}

export async function distributeRoomLoot(
  contributors: ExpeditionContributor[],
  roomType: ExpeditionRoomType,
  tier: number,
  mobTemplateIds: string[],
): Promise<Record<string, { loot: LootDrop[]; xp: { skillType: string; rawXp: number } }>>

export async function awardRoomTokens(
  members: { playerId: string }[],
  roomType: ExpeditionRoomType,
  tier: number,
): Promise<void>

export async function awardCompletionBonus(
  members: { playerId: string }[],
  tier: number,
  totalRooms: number,
): Promise<void>
```

**Step 3: Run tests**

Run: `npm run test:api -- --run expeditionLootService`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/services/expeditionLootService.ts apps/api/src/services/expeditionLootService.test.ts
git commit -m "feat(api): add expedition loot distribution service"
```

---

### Task 9: Expedition Service — KO Recovery

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`
- Modify: `apps/api/src/services/expeditionService.test.ts`

**Step 1: Write failing tests**

Tests:
1. **Successful recovery**: KO'd player spends turns during rest phase, HP restored, isKnockedOut = false
2. **Cannot recover if not KO'd**: Rejects if player is alive
3. **Cannot recover outside rest phase**: Rejects if expedition is in combat
4. **Turn cost applied**: EXPEDITION_CONSTANTS.KO_RECOVERY_TURN_COST deducted

**Step 2: Implement**

```typescript
export async function recoverFromKO(expeditionId: string, playerId: string): Promise<ExpeditionMemberData>
```

Validates:
1. Expedition exists, player is a member
2. Player is knocked out
3. Expedition is in rest phase (between rooms)
4. Spend turns via `spendWithTaxTx`
5. Restore HP to 30% of max, set `isKnockedOut = false`

**Step 3: Run tests, commit**

```bash
git commit -m "feat(api): add expedition KO recovery"
```

---

### Task 10: Expedition Routes

**Files:**
- Create: `apps/api/src/routes/expedition.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create expedition router**

```typescript
// Routes:
// GET    /api/v1/expedition/active          - Get guild's active expedition
// GET    /api/v1/expedition/:id             - Get expedition status + members
// POST   /api/v1/expedition/launch          - Launch new expedition
// POST   /api/v1/expedition/:id/signup      - Sign up for expedition
// POST   /api/v1/expedition/:id/recover     - Recover from KO during rest
// GET    /api/v1/expedition/history         - Past expeditions (paginated)
// GET    /api/v1/expedition/:id/round/:num  - Get round details
```

Follow `boss.ts` route patterns: Zod validation, `asyncHandler`, `authenticate` middleware.

**Step 2: Register route in index.ts**

Add to `apps/api/src/index.ts`:
```typescript
import { expeditionRouter } from './routes/expedition';
app.use('/api/v1/expedition', expeditionRouter);
```

**Step 3: Register background timer**

Add to the background timers section in `apps/api/src/index.ts`:
```typescript
setInterval(() => {
  checkAndResolveExpeditionRounds(getIo()).catch((err) => {
    console.error('Expedition round resolution error:', err);
  });
}, 60_000);
```

**Step 4: Build and verify**

Run: `npm run build:api`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add apps/api/src/routes/expedition.ts apps/api/src/index.ts
git commit -m "feat(api): add expedition routes and background timer"
```

---

### Task 11: Token Shop Service & Routes

**Files:**
- Create: `apps/api/src/services/expeditionShopService.ts`
- Create: `apps/api/src/services/expeditionShopService.test.ts`
- Modify: `apps/api/src/routes/expedition.ts`

**Step 1: Write failing tests**

Tests:
1. **List shop items**: Returns all 15 items with costs and set info
2. **Purchase item**: Deducts tokens, creates soulbound item in inventory
3. **Insufficient tokens**: Rejects purchase
4. **Item is soulbound**: Created item has `isSoulbound = true`
5. **Item has double durability**: Durability = base * SOULBOUND_DURABILITY_MULTIPLIER
6. **Get player token balance**: Returns current token count

**Step 2: Implement expeditionShopService.ts**

```typescript
export function getShopItems(): ExpeditionShopItem[]
export async function getPlayerTokens(playerId: string): Promise<number>
export async function purchaseShopItem(playerId: string, itemId: string): Promise<{ item: ItemData; tokensRemaining: number }>
```

`purchaseShopItem`:
1. Find item definition from `EXPEDITION_SHOP_ITEMS`
2. Check player has enough tokens
3. Transaction: decrement `expeditionTokens`, create `Item` with soulbound flag and double durability
4. Return created item and remaining tokens

**Step 3: Add routes**

Add to expedition router:
```
GET    /api/v1/expedition/shop              - List shop items + player token balance
POST   /api/v1/expedition/shop/purchase     - Purchase item with tokens
```

**Step 4: Run tests, build, commit**

```bash
git commit -m "feat(api): add expedition token shop"
```

---

### Task 12: Frontend API Functions

**Files:**
- Create: `apps/web/src/lib/api/expedition.ts`
- Modify: `apps/web/src/lib/api/index.ts`

**Step 1: Create expedition API functions**

Follow the pattern from `guild.ts` and `social.ts`:

```typescript
// Read
export async function getActiveExpedition(): Promise<ApiResponse<ExpeditionStatusResponse>>
export async function getExpeditionStatus(id: string): Promise<ApiResponse<ExpeditionStatusResponse>>
export async function getExpeditionHistory(page?: number): Promise<ApiResponse<ExpeditionHistoryResponse>>
export async function getExpeditionShop(): Promise<ApiResponse<ExpeditionShopResponse>>

// Mutations
export async function launchExpedition(tier: number): Promise<ApiResponse<ExpeditionData>>
export async function signUpForExpedition(id: string): Promise<ApiResponse<ExpeditionMemberData>>
export async function recoverFromExpeditionKO(id: string): Promise<ApiResponse<ExpeditionMemberData>>
export async function purchaseExpeditionItem(itemId: string): Promise<ApiResponse<PurchaseResponse>>
```

Define response types inline (following existing pattern).

**Step 2: Export from barrel**

Add to `apps/web/src/lib/api/index.ts`:
```typescript
export * from './expedition';
```

**Step 3: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds (may have pre-existing errors in page.tsx — ignore those)

**Step 4: Commit**

```bash
git add apps/web/src/lib/api/expedition.ts apps/web/src/lib/api/index.ts
git commit -m "feat(web): add expedition API client functions"
```

---

### Task 13: Frontend — Expedition Tab in Guild Screen

**Files:**
- Create: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`

**Step 1: Create GuildExpeditionsTab component**

This component shows:
- **No active expedition**: Launch buttons for available tiers (with treasury cost, level req, cooldown status)
- **Recruiting**: Signup button, member list, countdown timer to first round
- **In progress**: Current room progress bar, round timer, member status (HP bars, KO status), mob pack status, round log
- **Rest phase**: Recovery button for KO'd players, regen countdown, next room preview
- **Completed/Failed**: Results summary, loot earned, tokens earned

Follow existing guild tab component patterns (props receive guildId, myRole, setError, onRefresh).

Use existing RPG theme CSS variables (`--rpg-gold`, `--rpg-green-light`, etc.) and existing common components.

**Step 2: Add expedition tab to GuildScreen**

Add `'expeditions'` to the `GuildTab` type and add the tab button + conditional render.

**Step 3: Build and verify**

Run: `npm run build:web`

**Step 4: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx apps/web/src/components/screens/GuildScreen.tsx
git commit -m "feat(web): add expedition tab to guild screen"
```

---

### Task 14: Frontend — Expedition Token Shop

**Files:**
- Create: `apps/web/src/components/guild/ExpeditionShopTab.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`

**Step 1: Create ExpeditionShopTab component**

Shows:
- Player token balance header
- 3 gear set sections (Vanguard, Sharpshooter, Arcanist)
- Each item card: name, slot, stats, token cost, purchase button
- Set bonus info (2pc/4pc) displayed per set
- "Group content only" badge on set bonuses
- Owned items marked with checkmark, purchase button disabled

**Step 2: Add shop tab to GuildScreen**

Add `'shop'` to tabs.

**Step 3: Build and commit**

```bash
git commit -m "feat(web): add expedition token shop UI"
```

---

### Task 15: Integration — Soulbound & Set Bonus Wiring

**Files:**
- Modify: `apps/api/src/services/inventoryService.ts` — prevent sell/salvage of soulbound items
- Modify: `packages/game-engine/src/combat/bossRoundResolver.ts` — apply set bonuses in group combat
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts` — apply set bonuses in raid combat

**Step 1: Soulbound sell/salvage guard**

In `inventoryService.ts`, find the sell and salvage functions. Add check:
```typescript
if (item.isSoulbound) {
  throw new AppError(400, 'Soulbound items cannot be sold', 'ITEM_SOULBOUND');
}
```

Same for salvage.

**Step 2: Set bonus application in combat**

In the raid round resolver and boss round resolver, before combat resolution:
1. Check each participant's equipped items for set pieces
2. Use `getSetPieceCount()` from expedition definitions
3. Apply stat modifiers for 2pc/4pc bonuses:
   - Vanguard 2pc: multiply maxHp by 1.10
   - Sharpshooter 2pc: add 10 to critChance
   - Arcanist 2pc: multiply manaRegenPerRound by 1.15
4. 4pc proc effects handled during action resolution (separate concern — can be deferred to a follow-up task)

**Step 3: Tests for soulbound guard**

Add tests to inventory service tests:
- Attempting to sell soulbound item throws ITEM_SOULBOUND
- Attempting to salvage soulbound item throws ITEM_SOULBOUND

**Step 4: Commit**

```bash
git commit -m "feat: add soulbound guards and 2pc set bonus stat application"
```

---

### Task 16: Final Integration & Typecheck

**Step 1: Full typecheck**

Run: `npm run typecheck`
Fix any TypeScript errors.

**Step 2: Run all tests**

Run: `npm run test`
Fix any failures.

**Step 3: Manual smoke test**

Run: `npm run dev`
Verify:
- Guild screen shows Expeditions tab
- Shop tab shows gear sets
- Launch expedition (need sufficient treasury)
- Signup flow works

**Step 4: Final commit**

```bash
git commit -m "chore: fix typecheck and test issues"
```

---

## Task Dependency Graph

```
Task 1 (types) ──┐
Task 2 (constants)├──→ Task 4 (raid resolver) ──→ Task 7 (round resolution) ──→ Task 10 (routes) ──→ Task 16 (integration)
Task 3 (schema) ──┤    Task 5 (room gen) ────────→ Task 6 (launch/signup) ──┘                         ↑
                  │                                      ↓                                             │
                  │                               Task 8 (loot) ──────────────────────────────────────┤
                  │                               Task 9 (KO recovery) ──────────────────────────────┤
                  │                               Task 11 (shop service) ──────────────────────────────┤
                  └──→ Task 12 (frontend API) ──→ Task 13 (expedition UI) ──→ Task 14 (shop UI) ──→ Task 15 (soulbound) ──┘
```

Tasks 1-3 can be done in parallel. Tasks 4-5 can be done in parallel. Tasks 6-9 are sequential. Tasks 12-14 can start after Task 3.
