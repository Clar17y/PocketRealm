# Quest System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add daily/weekly quests with a unified progress dispatcher, quest token currency, token shop, and toast notifications.

**Architecture:** Unified `progressService.trackProgress()` replaces all 7 guild contract call sites, fanning out to both guild contracts and personal quests. Quest assignment uses lazy generation (like guild contracts). Toast notifications via `questProgress` field on API responses.

**Tech Stack:** Prisma (schema + migration), Zod (route validation), Vitest (tests), React (quest screen + toast component)

**Design doc:** `docs/superpowers/specs/2026-03-04-quest-system-design.md`

---

## Task 1: Shared Types & Constants

**Files:**
- Create: `packages/shared/src/types/quest.types.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create quest types file**

Create `packages/shared/src/types/quest.types.ts`:

```typescript
export type ProgressType =
  | 'kill_count'
  | 'kill_family'
  | 'kill_prefix'
  | 'boss_rounds'
  | 'craft_items'
  | 'craft_rare'
  | 'gather_actions'
  | 'exploration_turns'
  | 'pvp_wins'
  | 'pvp_damage'
  | 'casino_wagers'
  | 'casino_bets'
  | 'zone_travel'
  | 'chest_open';

export type QuestCategory = 'combat' | 'exploration' | 'crafting' | 'gathering' | 'pvp' | 'casino';
export type QuestCadence = 'daily' | 'weekly';
export type QuestStatus = 'active' | 'completed' | 'claimed';

export interface QuestProgressUpdate {
  questId: string;
  questName: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface QuestTemplateDefinition {
  key: string;
  name: string;
  description: string;
  category: QuestCategory;
  cadence: QuestCadence;
  progressType: ProgressType;
  targets: { low: number; mid: number; high: number };
  rewards: { low: [number, number]; mid: [number, number]; high: [number, number] };
  filter?: 'prefix' | 'rare_plus';
  unlockCondition?: 'pvp_unlocked' | 'casino_accessible' | 'multi_zone' | 'has_prefix_kills';
}

export interface PlayerQuestData {
  id: string;
  questKey: string;
  name: string;
  description: string;
  category: QuestCategory;
  cadence: QuestCadence;
  targetValue: number;
  currentValue: number;
  rewardAmount: number;
  status: QuestStatus;
  assignedAt: string;
  expiresAt: string;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface PlayerQuestStateData {
  questTokens: number;
  dailyBonusClaimed: boolean;
  lastDailyReset: string;
  lastWeeklyReset: string;
}
```

**Step 2: Add quest constants to gameConstants.ts**

Add at the end of `packages/shared/src/constants/gameConstants.ts` (before any closing export if applicable):

```typescript
// ---------------------------------------------------------------------------
// Quest System
// ---------------------------------------------------------------------------

export const QUEST_CONSTANTS = {
  DAILY_COUNT: 3,
  WEEKLY_COUNT: 1,
  DAILY_BONUS_BASE: 5,
  DAILY_BONUS_PER_LEVEL: 0.5,
  MIN_DAILY_CATEGORIES: 2,
} as const;

export const QUEST_TEMPLATE_DEFINITIONS: readonly QuestTemplateDefinition[] = [
  // Daily — Combat
  { key: 'kill_mobs',       name: 'Slay Monsters',     description: 'Kill {target} monsters',                    category: 'combat',      cadence: 'daily',  progressType: 'kill_count',        targets: { low: 5, mid: 15, high: 40 },      rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  { key: 'kill_prefix',     name: 'Hunt the {prefix}',  description: 'Kill {target} {prefix} monsters',          category: 'combat',      cadence: 'daily',  progressType: 'kill_prefix',       targets: { low: 1, mid: 2, high: 5 },        rewards: { low: [5, 8], mid: [7, 10], high: [9, 12] }, filter: 'prefix', unlockCondition: 'has_prefix_kills' },
  // Daily — Exploration
  { key: 'explore_turns',   name: 'Explore the Wilds',  description: 'Spend {target} turns exploring',           category: 'exploration', cadence: 'daily',  progressType: 'exploration_turns', targets: { low: 50, mid: 200, high: 500 },    rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  { key: 'open_chests',     name: 'Treasure Seeker',    description: 'Open {target} treasure chests',            category: 'exploration', cadence: 'daily',  progressType: 'chest_open',        targets: { low: 1, mid: 3, high: 5 },        rewards: { low: [4, 6], mid: [5, 8], high: [7, 10] } },
  { key: 'travel_zones',    name: 'Wanderer',           description: 'Travel to {target} different zones',       category: 'exploration', cadence: 'daily',  progressType: 'zone_travel',       targets: { low: 1, mid: 2, high: 3 },        rewards: { low: [3, 4], mid: [4, 5], high: [5, 6] }, unlockCondition: 'multi_zone' },
  // Daily — Gathering
  { key: 'gather_resources', name: 'Resource Run',      description: 'Gather resources {target} times',          category: 'gathering',   cadence: 'daily',  progressType: 'gather_actions',    targets: { low: 5, mid: 15, high: 30 },      rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  // Daily — Crafting
  { key: 'craft_items',     name: 'Busy Hands',         description: 'Craft {target} items',                     category: 'crafting',    cadence: 'daily',  progressType: 'craft_items',       targets: { low: 2, mid: 5, high: 10 },       rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  // Daily — PvP
  { key: 'pvp_wins',        name: 'Arena Victor',       description: 'Win {target} arena fights',                category: 'pvp',         cadence: 'daily',  progressType: 'pvp_wins',          targets: { low: 1, mid: 2, high: 3 },        rewards: { low: [5, 7], mid: [6, 8], high: [8, 10] }, unlockCondition: 'pvp_unlocked' },
  { key: 'pvp_damage',      name: 'Arena Brawler',      description: 'Deal {target} damage in the arena',        category: 'pvp',         cadence: 'daily',  progressType: 'pvp_damage',        targets: { low: 100, mid: 400, high: 1500 }, rewards: { low: [4, 6], mid: [5, 7], high: [6, 8] }, unlockCondition: 'pvp_unlocked' },
  // Daily — Casino
  { key: 'casino_wager',    name: 'High Roller',        description: 'Wager {target} gold at the casino',        category: 'casino',      cadence: 'daily',  progressType: 'casino_wagers',     targets: { low: 50, mid: 200, high: 1000 },  rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] }, unlockCondition: 'casino_accessible' },
  { key: 'casino_bets',     name: 'Gambler',            description: 'Place {target} bets at the casino',        category: 'casino',      cadence: 'daily',  progressType: 'casino_bets',       targets: { low: 3, mid: 8, high: 15 },       rewards: { low: [3, 4], mid: [4, 5], high: [5, 6] }, unlockCondition: 'casino_accessible' },
  // Weekly
  { key: 'weekly_kills',    name: 'Weekly Bounty',      description: 'Kill {target} monsters this week',         category: 'combat',      cadence: 'weekly', progressType: 'kill_count',        targets: { low: 30, mid: 100, high: 300 },   rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
  { key: 'weekly_gather',   name: 'Stockpile',          description: 'Gather resources {target} times this week', category: 'gathering',   cadence: 'weekly', progressType: 'gather_actions',    targets: { low: 30, mid: 100, high: 250 },   rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
  { key: 'weekly_explore',  name: 'Cartographer',       description: 'Spend {target} turns exploring this week', category: 'exploration', cadence: 'weekly', progressType: 'exploration_turns', targets: { low: 300, mid: 1000, high: 3000 }, rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
  { key: 'weekly_craft',    name: 'Quality Crafter',    description: 'Craft {target} rare+ items this week',     category: 'crafting',    cadence: 'weekly', progressType: 'craft_rare',        targets: { low: 1, mid: 3, high: 5 },        rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
] as const;
```

The `QuestTemplateDefinition` type must be imported at the top of gameConstants.ts:
```typescript
import type { QuestTemplateDefinition } from '../types/quest.types';
```

**Step 3: Update shared index.ts**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './types/quest.types';
```

**Step 4: Build shared package and verify**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors

**Step 5: Commit**

```
feat(shared): add quest system types and constants
```

---

## Task 2: Database Schema & Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: migration file (auto-generated)

**Step 1: Add Prisma models**

Add to `packages/database/prisma/schema.prisma`:

```prisma
model PlayerQuest {
  id           String    @id @default(uuid())
  playerId     String    @map("player_id")
  questKey     String    @map("quest_key") @db.VarChar(64)
  cadence      String    @db.VarChar(8)
  targetValue  Int       @map("target_value")
  currentValue Int       @default(0) @map("current_value")
  rewardAmount Int       @map("reward_amount")
  status       String    @default("active") @db.VarChar(16)
  filterValue  String?   @map("filter_value") @db.VarChar(64)
  assignedAt   DateTime  @default(now()) @map("assigned_at")
  expiresAt    DateTime  @map("expires_at")
  completedAt  DateTime? @map("completed_at")
  claimedAt    DateTime? @map("claimed_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([playerId, status])
  @@index([playerId, cadence, assignedAt])
  @@map("player_quests")
}

model PlayerQuestState {
  id                String   @id @default(uuid())
  playerId          String   @unique @map("player_id")
  lastDailyReset    DateTime @default(now()) @map("last_daily_reset")
  lastWeeklyReset   DateTime @default(now()) @map("last_weekly_reset")
  dailyBonusClaimed Boolean  @default(false) @map("daily_bonus_claimed")
  questTokens       Int      @default(0) @map("quest_tokens")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@map("player_quest_state")
}
```

Also add the reverse relations to the `Player` model:
```prisma
  quests          PlayerQuest[]
  questState      PlayerQuestState?
```

**Step 2: Generate migration**

Run: `cd packages/database && npx prisma migrate dev --name add-quest-system`
Expected: Migration created successfully, Prisma client generated

**Step 3: Verify Prisma client generation**

Run: `npm run db:generate`
Expected: Prisma client generated

**Step 4: Commit**

```
feat(db): add PlayerQuest and PlayerQuestState models
```

---

## Task 3: Quest Service — Core Logic

**Files:**
- Create: `apps/api/src/services/questService.ts`
- Create: `apps/api/src/services/questService.test.ts`

**Step 1: Write failing tests for questService**

Create `apps/api/src/services/questService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../__test__/setup';
import { mockPrisma } from '../__test__/setup';
import {
  getOrCreateQuestState,
  generateDailyQuests,
  generateWeeklyQuest,
  getActiveQuests,
  incrementQuestProgress,
  claimQuestReward,
  claimDailyBonus,
} from './questService';

vi.mock('./guildService', () => ({
  getPlayerGuildId: vi.fn().mockResolvedValue(null),
}));

const PLAYER_ID = 'player-1';

function utcMidnight(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return utcMidnight(d);
}

describe('getOrCreateQuestState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns existing state if found', async () => {
    const state = { id: 's1', playerId: PLAYER_ID, questTokens: 10, dailyBonusClaimed: false, lastDailyReset: new Date(), lastWeeklyReset: new Date() };
    mockPrisma.playerQuestState.findUnique.mockResolvedValue(state);
    const result = await getOrCreateQuestState(PLAYER_ID);
    expect(result.questTokens).toBe(10);
  });

  it('creates new state if not found', async () => {
    mockPrisma.playerQuestState.findUnique.mockResolvedValue(null);
    const created = { id: 's2', playerId: PLAYER_ID, questTokens: 0, dailyBonusClaimed: false, lastDailyReset: new Date(), lastWeeklyReset: new Date() };
    mockPrisma.playerQuestState.create.mockResolvedValue(created);
    const result = await getOrCreateQuestState(PLAYER_ID);
    expect(result.questTokens).toBe(0);
    expect(mockPrisma.playerQuestState.create).toHaveBeenCalled();
  });
});

describe('incrementQuestProgress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments matching active quest and returns progress update', async () => {
    const quest = { id: 'q1', questKey: 'kill_mobs', currentValue: 2, targetValue: 5, status: 'active', cadence: 'daily' };
    mockPrisma.playerQuest.findMany.mockResolvedValue([quest]);
    mockPrisma.playerQuest.update.mockResolvedValue({ ...quest, currentValue: 3 });

    const updates = await incrementQuestProgress(PLAYER_ID, 'kill_count', 1);
    expect(updates).toHaveLength(1);
    expect(updates[0].current).toBe(3);
    expect(updates[0].completed).toBe(false);
  });

  it('marks quest completed when target reached', async () => {
    const quest = { id: 'q1', questKey: 'kill_mobs', currentValue: 4, targetValue: 5, status: 'active', cadence: 'daily' };
    mockPrisma.playerQuest.findMany.mockResolvedValue([quest]);
    mockPrisma.playerQuest.update.mockResolvedValue({ ...quest, currentValue: 5, status: 'completed' });

    const updates = await incrementQuestProgress(PLAYER_ID, 'kill_count', 1);
    expect(updates).toHaveLength(1);
    expect(updates[0].completed).toBe(true);
  });

  it('returns empty array when no matching quests', async () => {
    mockPrisma.playerQuest.findMany.mockResolvedValue([]);
    const updates = await incrementQuestProgress(PLAYER_ID, 'kill_count', 1);
    expect(updates).toHaveLength(0);
  });

  it('skips already completed quests', async () => {
    const quest = { id: 'q1', questKey: 'kill_mobs', currentValue: 5, targetValue: 5, status: 'completed', cadence: 'daily' };
    mockPrisma.playerQuest.findMany.mockResolvedValue([quest]);
    const updates = await incrementQuestProgress(PLAYER_ID, 'kill_count', 1);
    expect(updates).toHaveLength(0);
  });

  it('filters by prefix metadata for kill_prefix quests', async () => {
    const quest = { id: 'q1', questKey: 'kill_prefix', currentValue: 0, targetValue: 2, status: 'active', cadence: 'daily', filterValue: 'ancient' };
    mockPrisma.playerQuest.findMany.mockResolvedValue([quest]);
    mockPrisma.playerQuest.update.mockResolvedValue({ ...quest, currentValue: 1 });

    // Matching prefix
    const updates = await incrementQuestProgress(PLAYER_ID, 'kill_prefix', 1, { prefix: 'ancient' });
    expect(updates).toHaveLength(1);
  });

  it('ignores non-matching prefix metadata', async () => {
    const quest = { id: 'q1', questKey: 'kill_prefix', currentValue: 0, targetValue: 2, status: 'active', cadence: 'daily', filterValue: 'ancient' };
    mockPrisma.playerQuest.findMany.mockResolvedValue([quest]);

    const updates = await incrementQuestProgress(PLAYER_ID, 'kill_prefix', 1, { prefix: 'swift' });
    expect(updates).toHaveLength(0);
  });
});

describe('claimQuestReward', () => {
  beforeEach(() => vi.clearAllMocks());

  it('awards quest tokens and marks quest claimed', async () => {
    const quest = { id: 'q1', playerId: PLAYER_ID, status: 'completed', rewardAmount: 5 };
    mockPrisma.playerQuest.findFirst.mockResolvedValue(quest);
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.playerQuest.update.mockResolvedValue({ ...quest, status: 'claimed' });
    mockPrisma.playerQuestState.upsert.mockResolvedValue({});

    const result = await claimQuestReward(PLAYER_ID, 'q1');
    expect(result.tokensAwarded).toBe(5);
  });

  it('rejects claim for non-completed quest', async () => {
    mockPrisma.playerQuest.findFirst.mockResolvedValue({ id: 'q1', playerId: PLAYER_ID, status: 'active' });
    await expect(claimQuestReward(PLAYER_ID, 'q1')).rejects.toThrow();
  });

  it('rejects claim for wrong player', async () => {
    mockPrisma.playerQuest.findFirst.mockResolvedValue(null);
    await expect(claimQuestReward(PLAYER_ID, 'q1')).rejects.toThrow();
  });
});

describe('claimDailyBonus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('awards bonus tokens when all dailies are claimed', async () => {
    const state = { id: 's1', playerId: PLAYER_ID, dailyBonusClaimed: false, questTokens: 10, lastDailyReset: new Date(), lastWeeklyReset: new Date() };
    mockPrisma.playerQuestState.findUnique.mockResolvedValue(state);
    // All 3 dailies claimed
    mockPrisma.playerQuest.count.mockResolvedValueOnce(3); // total dailies
    mockPrisma.playerQuest.count.mockResolvedValueOnce(3); // claimed dailies
    mockPrisma.player.findUnique.mockResolvedValue({ characterLevel: 10 });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.playerQuestState.update.mockResolvedValue({});

    const result = await claimDailyBonus(PLAYER_ID);
    expect(result.tokensAwarded).toBeGreaterThan(0);
  });

  it('rejects if bonus already claimed', async () => {
    const state = { id: 's1', playerId: PLAYER_ID, dailyBonusClaimed: true, questTokens: 10, lastDailyReset: new Date(), lastWeeklyReset: new Date() };
    mockPrisma.playerQuestState.findUnique.mockResolvedValue(state);
    await expect(claimDailyBonus(PLAYER_ID)).rejects.toThrow();
  });

  it('rejects if not all dailies claimed', async () => {
    const state = { id: 's1', playerId: PLAYER_ID, dailyBonusClaimed: false, questTokens: 10, lastDailyReset: new Date(), lastWeeklyReset: new Date() };
    mockPrisma.playerQuestState.findUnique.mockResolvedValue(state);
    mockPrisma.playerQuest.count.mockResolvedValueOnce(3); // total
    mockPrisma.playerQuest.count.mockResolvedValueOnce(2); // only 2 claimed
    await expect(claimDailyBonus(PLAYER_ID)).rejects.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run questService`
Expected: All tests FAIL (module not found)

**Step 3: Implement questService.ts**

Create `apps/api/src/services/questService.ts`. Key functions:

- `getOrCreateQuestState(playerId)` — upsert pattern for PlayerQuestState
- `getLevelBracket(level)` — returns `'low' | 'mid' | 'high'`
- `getDayStart(now)` / `getWeekStart(now)` — UTC boundary helpers
- `shouldResetDaily(state, now)` / `shouldResetWeekly(state, now)` — check if reset needed
- `generateDailyQuests(playerId, level, now)` — pick 3 random daily templates, create PlayerQuest rows
- `generateWeeklyQuest(playerId, level, now)` — pick 1 random weekly template
- `getActiveQuests(playerId, now)` — lazy generation, returns `PlayerQuestData[]`
- `incrementQuestProgress(playerId, type, amount, metadata?)` — find matching active quests, increment, return `QuestProgressUpdate[]`
- `claimQuestReward(playerId, questId)` — validate completed status, award tokens in transaction
- `claimDailyBonus(playerId)` — validate all dailies claimed, award bonus tokens

Implementation notes:
- `incrementQuestProgress` must match quests by `progressType`: look up the quest template definition by `questKey`, check if its `progressType` matches the given `type`
- For `kill_prefix` quests, compare `quest.filterValue` against `metadata.prefix`
- For `craft_rare` quests, no filter needed (the progress type itself handles it)
- Use `QUEST_TEMPLATE_DEFINITIONS` from shared to look up template by `questKey`
- Optimistic locking not strictly needed (single-player quests, no concurrent completion risk like guild contracts), but cap `currentValue` at `targetValue`
- Template pool filtering: check unlock conditions against player state (zone discoveries, bestiary prefixes, etc.) during generation

**Step 4: Run tests to verify they pass**

Run: `npm run test:api -- --run questService`
Expected: All tests PASS

**Step 5: Commit**

```
feat(api): add quest service with assignment, progress, and claiming
```

---

## Task 4: Progress Service — Unified Dispatcher

**Files:**
- Create: `apps/api/src/services/progressService.ts`
- Create: `apps/api/src/services/progressService.test.ts`

**Step 1: Write failing tests**

Create `apps/api/src/services/progressService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../__test__/setup';
import { trackProgress } from './progressService';

const mockGetPlayerGuildId = vi.fn();
const mockIncrementContractProgress = vi.fn();
const mockIncrementQuestProgress = vi.fn();

vi.mock('./guildService', () => ({
  getPlayerGuildId: (...args: any[]) => mockGetPlayerGuildId(...args),
}));

vi.mock('./guildContractService', () => ({
  incrementContractProgress: (...args: any[]) => mockIncrementContractProgress(...args),
}));

vi.mock('./questService', () => ({
  incrementQuestProgress: (...args: any[]) => mockIncrementQuestProgress(...args),
}));

describe('trackProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncrementQuestProgress.mockResolvedValue([]);
  });

  it('calls both guild contract and quest progress when player is in guild', async () => {
    mockGetPlayerGuildId.mockResolvedValue('guild-1');
    mockIncrementContractProgress.mockResolvedValue(undefined);

    await trackProgress('player-1', 'kill_count', 1);

    expect(mockGetPlayerGuildId).toHaveBeenCalledWith('player-1');
    expect(mockIncrementContractProgress).toHaveBeenCalledWith('guild-1', 'kill_count', 1);
    expect(mockIncrementQuestProgress).toHaveBeenCalledWith('player-1', 'kill_count', 1, undefined);
  });

  it('skips guild contract when player has no guild', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);

    await trackProgress('player-1', 'kill_count', 1);

    expect(mockIncrementContractProgress).not.toHaveBeenCalled();
    expect(mockIncrementQuestProgress).toHaveBeenCalled();
  });

  it('returns quest progress updates', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);
    mockIncrementQuestProgress.mockResolvedValue([
      { questId: 'q1', questName: 'Slay Monsters', current: 3, target: 15, completed: false },
    ]);

    const result = await trackProgress('player-1', 'kill_count', 1);
    expect(result).toHaveLength(1);
    expect(result[0].questName).toBe('Slay Monsters');
  });

  it('passes metadata to quest progress', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);

    await trackProgress('player-1', 'kill_prefix', 1, { prefix: 'ancient' });

    expect(mockIncrementQuestProgress).toHaveBeenCalledWith('player-1', 'kill_prefix', 1, { prefix: 'ancient' });
  });

  it('returns empty array when amount is 0', async () => {
    const result = await trackProgress('player-1', 'kill_count', 0);
    expect(result).toEqual([]);
    expect(mockGetPlayerGuildId).not.toHaveBeenCalled();
  });

  it('still returns quest updates even if guild contract fails', async () => {
    mockGetPlayerGuildId.mockResolvedValue('guild-1');
    mockIncrementContractProgress.mockRejectedValue(new Error('DB error'));
    mockIncrementQuestProgress.mockResolvedValue([
      { questId: 'q1', questName: 'Test', current: 1, target: 5, completed: false },
    ]);

    const result = await trackProgress('player-1', 'kill_count', 1);
    expect(result).toHaveLength(1);
  });

  it('handles quest types not in guild contract type (casino_wagers)', async () => {
    mockGetPlayerGuildId.mockResolvedValue('guild-1');

    await trackProgress('player-1', 'casino_wagers', 100);

    // casino_wagers is not a GuildContractType, should not call incrementContractProgress
    expect(mockIncrementContractProgress).not.toHaveBeenCalled();
    expect(mockIncrementQuestProgress).toHaveBeenCalledWith('player-1', 'casino_wagers', 100, undefined);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run progressService`
Expected: All tests FAIL

**Step 3: Implement progressService.ts**

Create `apps/api/src/services/progressService.ts`:

```typescript
import type { ProgressType, QuestProgressUpdate } from '@adventure/shared';
import type { GuildContractType } from '@adventure/shared';
import { getPlayerGuildId } from './guildService';
import { incrementContractProgress } from './guildContractService';
import { incrementQuestProgress } from './questService';

// Guild contract types are a subset of all progress types
const GUILD_CONTRACT_TYPES = new Set<string>([
  'kill_count', 'kill_family', 'boss_rounds', 'craft_items',
  'craft_rare', 'gather_actions', 'exploration_turns', 'pvp_wins',
]);

export async function trackProgress(
  playerId: string,
  type: ProgressType,
  amount: number,
  metadata?: { prefix?: string; zoneId?: string; rarity?: string },
): Promise<QuestProgressUpdate[]> {
  if (amount <= 0) return [];

  const guildId = await getPlayerGuildId(playerId);

  // Fan out to guild contracts (if applicable) and personal quests
  const contractPromise = (guildId && GUILD_CONTRACT_TYPES.has(type))
    ? incrementContractProgress(guildId, type as GuildContractType, amount).catch(() => {})
    : Promise.resolve();

  const [, questResult] = await Promise.allSettled([
    contractPromise,
    incrementQuestProgress(playerId, type, amount, metadata),
  ]);

  return questResult.status === 'fulfilled' ? questResult.value : [];
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test:api -- --run progressService`
Expected: All tests PASS

**Step 5: Commit**

```
feat(api): add unified progress dispatcher (trackProgress)
```

---

## Task 5: Refactor Call Sites to Use trackProgress

**Files:**
- Modify: `apps/api/src/services/combatOrchestrationService.ts` (lines 118-124)
- Modify: `apps/api/src/routes/gathering.ts` (lines 397-399)
- Modify: `apps/api/src/routes/exploration/start.ts` (lines 1007-1009)
- Modify: `apps/api/src/routes/crafting/craft.ts` (lines 242-252)
- Modify: `apps/api/src/routes/pvp.ts` (lines 101-102)
- Modify: `apps/api/src/routes/boss.ts` (lines 182-184)
- Modify: `apps/api/src/routes/casino.ts` (lines 59-63)

Each refactored call site follows this pattern:

**Before (example — combatOrchestrationService.ts):**
```typescript
import { addGuildXp, getPlayerGuildId } from './guildService';
import { incrementContractProgress } from './guildContractService';
// ...
if (params.includeGuildCredit) {
  const guildId = await getPlayerGuildId(playerId);
  if (guildId) {
    await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
    void incrementContractProgress(guildId, 'kill_count', 1).catch(() => {});
    void incrementContractProgress(guildId, 'kill_family', 1).catch(() => {});
  }
}
```

**After:**
```typescript
import { addGuildXp, getPlayerGuildId } from './guildService';
import { trackProgress } from './progressService';
// ...
if (params.includeGuildCredit) {
  const guildId = await getPlayerGuildId(playerId);
  if (guildId) {
    await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_MOB_KILL);
  }
  void trackProgress(playerId, 'kill_count', 1).catch(() => {});
  void trackProgress(playerId, 'kill_family', 1).catch(() => {});
}
```

Note: `trackProgress` takes `playerId` not `guildId` — it handles guild lookup internally. Guild XP (`addGuildXp`) stays separate since it's not a progress tracking concern.

**Step 1: Refactor combatOrchestrationService.ts**

Replace the guild contract block. Remove `incrementContractProgress` import, add `trackProgress` import. Move `trackProgress` calls outside the `if (guildId)` block since trackProgress handles guild lookup. Keep `addGuildXp` inside the guild block.

Note: for combat, also pass mob prefix via metadata: `trackProgress(playerId, 'kill_prefix', 1, { prefix: mob.mobPrefix })` if `mob.mobPrefix` exists. This is a NEW call (not replacing an existing one) — guild contracts don't track prefix kills.

**Step 2: Refactor gathering.ts**

Replace:
```typescript
const guildId = await getPlayerGuildId(playerId);
if (guildId) void incrementContractProgress(guildId, 'gather_actions', actions).catch(() => {});
```
With:
```typescript
void trackProgress(playerId, 'gather_actions', actions).catch(() => {});
```

Remove `getPlayerGuildId` and `incrementContractProgress` imports (if no other uses remain), add `trackProgress` import.

**Step 3: Refactor exploration/start.ts**

Replace:
```typescript
const guildId = taxResult.guildId ?? await getPlayerGuildId(playerId);
if (guildId) void incrementContractProgress(guildId, 'exploration_turns', spentTurns).catch(() => {});
```
With:
```typescript
void trackProgress(playerId, 'exploration_turns', spentTurns).catch(() => {});
```

Also add new trackProgress calls for any chest_open or zone_travel events if they occur in the exploration result. Look for where chests are opened in the exploration flow and add:
```typescript
void trackProgress(playerId, 'chest_open', chestCount).catch(() => {});
```

**Step 4: Refactor crafting/craft.ts**

Replace:
```typescript
const guildId = await getPlayerGuildId(playerId);
if (guildId) {
  await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_CRAFT * quantity);
  await incrementContractProgress(guildId, 'craft_items', quantity);
  const rareCount = ...
  if (rareCount > 0) {
    await incrementContractProgress(guildId, 'craft_rare', rareCount);
  }
}
```
With:
```typescript
const guildId = await getPlayerGuildId(playerId);
if (guildId) {
  await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_CRAFT * quantity);
}
void trackProgress(playerId, 'craft_items', quantity).catch(() => {});
const rareCount = craftedItemDetails.filter(
  (d) => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary',
).length;
if (rareCount > 0) {
  void trackProgress(playerId, 'craft_rare', rareCount).catch(() => {});
}
```

**Step 5: Refactor pvp.ts**

Replace:
```typescript
const winnerGuildId = await getPlayerGuildId(result.winnerId);
if (winnerGuildId) void incrementContractProgress(winnerGuildId, 'pvp_wins', 1).catch(() => {});
```
With:
```typescript
void trackProgress(result.winnerId, 'pvp_wins', 1).catch(() => {});
```

Also add PvP damage tracking (NEW):
```typescript
void trackProgress(result.winnerId, 'pvp_damage', result.winnerDamageDealt).catch(() => {});
```
Check the PvP result shape to find the damage field name.

**Step 6: Refactor boss.ts**

Replace:
```typescript
const guildId = await getPlayerGuildId(playerId);
if (guildId) void incrementContractProgress(guildId, 'boss_rounds', 1).catch(() => {});
```
With:
```typescript
void trackProgress(playerId, 'boss_rounds', 1).catch(() => {});
```

**Step 7: Add casino tracking (NEW call site)**

In `apps/api/src/routes/casino.ts`, after the `placeBet` call in the POST `/roulette/bet` handler, add:
```typescript
void trackProgress(playerId, 'casino_bets', 1).catch(() => {});
void trackProgress(playerId, 'casino_wagers', amount).catch(() => {});
```

**Step 8: Add zone travel tracking (NEW call site)**

Find the zone travel handler in `apps/api/src/routes/zones.ts` and add after successful travel:
```typescript
void trackProgress(playerId, 'zone_travel', 1).catch(() => {});
```

**Step 9: Run existing tests to verify no regressions**

Run: `npm run test:api`
Expected: All existing tests still pass. Some mocks may need updating in test files that mock `guildContractService` — those tests should now mock `progressService` instead, or mock both.

**Step 10: Commit**

```
refactor(api): replace guild contract calls with unified trackProgress
```

---

## Task 6: Quest API Routes

**Files:**
- Create: `apps/api/src/routes/quests.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create quest routes**

Create `apps/api/src/routes/quests.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getActiveQuests, claimQuestReward, claimDailyBonus, getQuestState } from '../services/questService';

export const questsRouter = Router();
questsRouter.use(authenticate);

// GET /api/v1/quests — active quests + progress (triggers lazy reset)
questsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const quests = await getActiveQuests(playerId);
  const state = await getQuestState(playerId);
  res.json({ quests, state });
}));

// POST /api/v1/quests/:id/claim — claim completed quest reward
const claimSchema = z.object({ id: z.string().uuid() });

questsRouter.post('/:id/claim', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = claimSchema.parse(req.params);
  const result = await claimQuestReward(playerId, id);
  res.json(result);
}));

// POST /api/v1/quests/bonus — claim daily completion bonus
questsRouter.post('/bonus', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await claimDailyBonus(playerId);
  res.json(result);
}));
```

**Step 2: Register route in index.ts**

Add import:
```typescript
import { questsRouter } from './routes/quests';
```

Add route registration (near the other `app.use` lines):
```typescript
app.use('/api/v1/quests', questsRouter);
```

**Step 3: Run full test suite**

Run: `npm run test:api`
Expected: All tests pass

**Step 4: Commit**

```
feat(api): add quest API routes
```

---

## Task 7: Quest Progress in API Responses (Toast Support)

**Files:**
- Modify: Various route files that call `trackProgress`

For toast notifications, each route that calls `trackProgress` needs to capture the return value and include it in the response. However, since most call sites use fire-and-forget (`void trackProgress(...).catch(() => {})`), we need to decide which routes should return quest progress.

**Approach:** The simplest approach is to make the quest screen poll-based (progress updates when you visit the quest screen), and add quest progress to a few key response types where it provides the most value:

- Combat result response (most impactful — "killed a mob" is the most common quest action)
- Crafting result response
- Gathering result response
- Exploration result response

For these routes, change `void trackProgress(...)` to `const questProgress = await trackProgress(...)` and include `questProgress` in the response JSON.

**Step 1: Update combat response**

In `combatOrchestrationService.ts`, add `questProgress` to `VictoryRewardResult` interface and capture `trackProgress` return values.

**Step 2: Update crafting response**

In `crafting/craft.ts`, capture `trackProgress` results and add to response.

**Step 3: Update gathering response**

In `gathering.ts`, capture `trackProgress` result and add to response.

**Step 4: Update exploration response**

In `exploration/start.ts`, capture `trackProgress` result and add to response.

**Step 5: Keep PvP, boss, casino as fire-and-forget**

These are lower-frequency actions; the quest screen will show updated progress when visited.

**Step 6: Commit**

```
feat(api): include quest progress updates in combat/craft/gather/explore responses
```

---

## Task 8: Frontend — API Layer

**Files:**
- Create: `apps/web/src/lib/api/quests.ts`
- Modify: `apps/web/src/lib/api/index.ts`

**Step 1: Create quest API functions**

Create `apps/web/src/lib/api/quests.ts`:

```typescript
import { fetchApi } from './core';
import type { PlayerQuestData, PlayerQuestStateData, QuestProgressUpdate } from '@adventure/shared';

export interface QuestsResponse {
  quests: PlayerQuestData[];
  state: PlayerQuestStateData;
}

export interface ClaimRewardResponse {
  tokensAwarded: number;
  newBalance: number;
}

export interface ClaimBonusResponse {
  tokensAwarded: number;
  newBalance: number;
}

export async function getQuests() {
  return fetchApi<QuestsResponse>('/api/v1/quests');
}

export async function claimQuestReward(questId: string) {
  return fetchApi<ClaimRewardResponse>(`/api/v1/quests/${questId}/claim`, { method: 'POST' });
}

export async function claimDailyBonus() {
  return fetchApi<ClaimBonusResponse>('/api/v1/quests/bonus', { method: 'POST' });
}
```

**Step 2: Export from index.ts**

Add to `apps/web/src/lib/api/index.ts`:
```typescript
export { getQuests, claimQuestReward, claimDailyBonus } from './quests';
export type { QuestsResponse, ClaimRewardResponse, ClaimBonusResponse } from './quests';
```

**Step 3: Commit**

```
feat(web): add quest API functions
```

---

## Task 9: Frontend — Quest Screen

**Files:**
- Create: `apps/web/src/components/screens/Quests.tsx`
- Modify: `apps/web/src/app/game/gameController.types.ts` (add `'quests'` to Screen union)
- Modify: `apps/web/src/app/game/useGameController.ts` (add quest screen handling)
- Modify: Navigation component (add quest tab/button)

**Step 1: Add 'quests' to Screen type**

In `apps/web/src/app/game/gameController.types.ts`, add `'quests'` to the `Screen` union type.

**Step 2: Create QuestsScreen component**

Create `apps/web/src/components/screens/Quests.tsx` following existing screen patterns (PixelCard, RPG theme variables, lucide-react icons, LoadingCard for loading state):

- Header with quest token balance display
- 3 daily quest cards, each showing:
  - Quest name + description
  - Progress bar (`currentValue / targetValue`)
  - Category icon
  - "Claim" button when status is `completed`
  - Checkmark when status is `claimed`
- 1 weekly quest card (visually distinct — different border color or PixelCard variant)
- Daily bonus section at the bottom:
  - Shows "Complete all daily quests" message
  - Activates when all 3 dailies are `claimed`
  - "Claim Bonus" button
- Auto-refresh on screen focus (call `getQuests()` on mount)

Use existing patterns from other screens like `Casino.tsx` for layout reference.

**Step 3: Wire up in useGameController**

Add quest screen handling in `useGameController.ts` — just set `activeScreen` to `'quests'`.

**Step 4: Add navigation entry**

Find the navigation/sidebar component and add a "Quests" entry pointing to the quest screen. Use a suitable lucide-react icon (e.g., `ScrollText` or `ClipboardList`).

**Step 5: Commit**

```
feat(web): add quest screen with progress display and claiming
```

---

## Task 10: Frontend — Quest Toast Notifications

**Files:**
- Create: `apps/web/src/components/QuestToast.tsx`
- Modify: `apps/web/src/app/game/useGameController.ts` or a shared response handler

**Step 1: Create QuestToast component**

Create `apps/web/src/components/QuestToast.tsx` following the `AchievementToast.tsx` pattern:

- Fixed position (bottom-right to not conflict with achievement toasts in top-right)
- Auto-dismiss after 3 seconds
- Stack up to 3 visible toasts
- Normal progress: `⚔ Slay Monsters 3/15` (small, subtle)
- Quest complete: `✓ Quest Complete: Slay Monsters!` (bigger, gold border)
- Slide-in animation

**Step 2: Create global trigger function**

Similar to achievement toasts, expose a `window.__showQuestToast` function or use a React context. The function accepts `QuestProgressUpdate` and renders the toast.

**Step 3: Wire up API response handling**

In the game controller or a shared response interceptor, check if any API response contains a `questProgress` array and trigger toasts for each update.

Option A: Add to individual handler callbacks (e.g., `handleStartCombat`, `handleCraft`, etc.)
Option B: Create a wrapper around `fetchApi` that checks for `questProgress` in responses

Option A is simpler and more explicit. After each combat/craft/gather/explore API call, check the response for `questProgress` and call the toast function.

**Step 4: Commit**

```
feat(web): add quest progress toast notifications
```

---

## Task 11: Quest Token Shop (Basic)

**Files:**
- Create: `apps/api/src/services/questShopService.ts`
- Modify: `apps/api/src/routes/quests.ts` (add shop endpoints)
- Modify: `apps/web/src/components/screens/Quests.tsx` (add shop tab)
- Modify: `apps/web/src/lib/api/quests.ts` (add shop API functions)

**Step 1: Define shop items as constants**

Add shop item definitions to `packages/shared/src/constants/gameConstants.ts`:

```typescript
export interface QuestShopItem {
  key: string;
  name: string;
  description: string;
  cost: number;
  category: 'consumable' | 'material' | 'recipe' | 'utility';
  permanent: boolean; // always available vs rotating
  itemTemplateId?: string; // references ItemTemplate for granting
  quantity?: number;
}

export const QUEST_SHOP_ITEMS: readonly QuestShopItem[] = [
  // Permanent items — define specifics based on existing ItemTemplate IDs
  // Rotating items — defined but filtered by week
];
```

**Step 2: Create questShopService.ts**

- `getShopInventory(now)` — returns permanent items + current week's rotating items
- `purchaseShopItem(playerId, itemKey)` — validate token balance, deduct tokens, grant item via existing inventory service

**Step 3: Add shop routes**

Add to `apps/api/src/routes/quests.ts`:
```typescript
// GET /api/v1/quests/shop
// POST /api/v1/quests/shop/buy
```

**Step 4: Add shop tab to QuestsScreen**

Use SubNav component to add "Quests" and "Shop" tabs within the quest screen.

**Step 5: Commit**

```
feat: add quest token shop with permanent and rotating items
```

---

## Task 12: Seed Data & Manual Testing

**Files:**
- Modify: `packages/database/prisma/seed.ts` (optional — add quest state for test player)

**Step 1: Run full build**

Run: `npm run build`
Expected: Clean build

**Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 3: Manual testing checklist**

1. Start dev server: `npm run dev`
2. Log in as test player
3. Navigate to quest screen — verify 3 dailies + 1 weekly generated
4. Perform a combat action — verify quest progress toast appears
5. Complete a quest — verify "completed" state and claim button works
6. Claim reward — verify token balance increases
7. Complete all dailies — verify daily bonus is claimable
8. Visit quest shop — verify items display and purchase works
9. Wait for (or simulate) UTC midnight — verify daily reset generates new quests

**Step 4: Final commit**

```
chore: quest system integration testing and cleanup
```

---

## Implementation Order Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Shared types & constants | None |
| 2 | Database schema & migration | Task 1 |
| 3 | Quest service (core logic) | Tasks 1, 2 |
| 4 | Progress service (unified dispatcher) | Task 3 |
| 5 | Refactor call sites | Task 4 |
| 6 | Quest API routes | Task 3 |
| 7 | Quest progress in API responses | Tasks 5, 6 |
| 8 | Frontend API layer | Task 6 |
| 9 | Frontend quest screen | Task 8 |
| 10 | Frontend toast notifications | Tasks 7, 9 |
| 11 | Quest token shop | Tasks 6, 9 |
| 12 | Seed data & manual testing | All |

Tasks 3-4 can be done in parallel with Task 6.
Tasks 8-9 can start once Task 6 is done.
Task 11 (shop) can be deferred to a separate PR if scope is too large.
