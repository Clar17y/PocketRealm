# Leaderboard Seasonal Crowns Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weekly crown competitions to the leaderboard system with per-category achievement chains and titles.

**Architecture:** New `PlayerCrown` table, weekly cron job (Monday 00:00 UTC) for snapshot+award, delta computation inside existing 15-min refresh, new crown achievement definitions, `resolveCrownStats` in statsService.

**Tech Stack:** Prisma (schema + migration), Redis (snapshots + deltas), Express, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-leaderboard-seasonal-crowns-design.md`

---

### Task 1: Add PlayerCrown Schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add PlayerCrown model**

Add after the `PlayerAchievement` model:

```prisma
model PlayerCrown {
  id        String   @id @default(uuid())
  playerId  String   @map("player_id")
  category  String   @db.VarChar(32)
  rank      Int
  weekStart DateTime @map("week_start")
  awardedAt DateTime @default(now()) @map("awarded_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([playerId, category, weekStart])
  @@index([playerId])
  @@map("player_crowns")
}
```

Add the relation to the `Player` model:

```prisma
crowns PlayerCrown[]
```

- [ ] **Step 2: Generate and run migration**

Run:
```bash
npx prisma migrate dev --name add_player_crowns
```
Expected: Migration created and applied successfully.

- [ ] **Step 3: Generate Prisma client**

Run: `npm run db:generate`
Expected: Client generated with `PlayerCrown` model.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(crowns): add PlayerCrown schema and migration"
```

---

### Task 2: Add Crown Constants and Category Group Mapping

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

- [ ] **Step 1: Add CROWN_CONSTANTS**

Note: `skill_defence` and `skill_vitality` are removed from the `skills` group because those skill types don't have leaderboard sorted sets (they're not in the `SKILL_TYPES` array used by `leaderboardService.ts`).

Note: `CATEGORY_GROUPS` uses `satisfies Record<string, readonly string[]>` instead of `as Record<string, string[]>` to preserve the `as const` literal types while still validating the shape.

```typescript
export const CROWN_CONSTANTS = {
  /** Minimum delta score to qualify for a crown */
  MIN_DELTA: 1,

  /** Maximum crowns per category per week (for tie-breaking) */
  MAX_CROWNS_PER_CATEGORY: 5,

  /** Crown rank values */
  GOLD: 1,
  SILVER: 2,
  BRONZE: 3,

  /** Category group mapping: group name → category slugs */
  CATEGORY_GROUPS: {
    pvp: ['pvp_rating', 'pvp_wins', 'pvp_best_rating', 'pvp_win_streak'],
    combat: ['total_kills', 'boss_damage'],
    skills: ['skill_melee', 'skill_ranged', 'skill_magic', 'skill_evasion', 'skill_mining'],
    crafting: ['skill_weaponsmithing', 'skill_armorsmithing', 'skill_leatherworking', 'skill_tailoring', 'skill_alchemy', 'skill_refining', 'skill_tanning', 'skill_weaving'],
    gathering: ['skill_foraging', 'skill_woodcutting'],
    progression: ['character_level', 'character_xp', 'total_skill_level'],
    casino: ['casino_profit', 'casino_wagered'],
  } satisfies Record<string, readonly string[]>,

  /** Categories where weekly delta must use XP from Postgres, not level from sorted set */
  XP_BASED_CATEGORIES: [
    'skill_melee', 'skill_ranged', 'skill_magic', 'skill_evasion',
    'skill_mining', 'skill_weaponsmithing', 'skill_armorsmithing', 'skill_leatherworking',
    'skill_tailoring', 'skill_alchemy', 'skill_refining', 'skill_tanning', 'skill_weaving',
    'skill_foraging', 'skill_woodcutting',
    'character_level', 'total_skill_level',
  ],
} as const;
```

- [ ] **Step 2: Build shared**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(crowns): add CROWN_CONSTANTS with category group mapping"
```

---

### Task 3: Add Crown Achievement Definitions

**Files:**
- Modify: `packages/shared/src/constants/achievementDefinitions.ts`
- Modify: `packages/shared/src/types/achievement.types.ts`

- [ ] **Step 1: Add `'crowns'` to the `AchievementCategory` union type**

In `packages/shared/src/types/achievement.types.ts`, add `'crowns'` to the `AchievementCategory` union type:

```typescript
export type AchievementCategory = 'combat' | 'crafting' | 'gathering' | 'exploration' | 'social' | 'progression' | 'crowns';
```

- [ ] **Step 2: Add crown achievement chains**

Add a new `CROWN_ACHIEVEMENTS` array following the existing pattern:

```typescript
const CROWN_ACHIEVEMENTS: AchievementDef[] = [
  // PvP Crowns
  { id: 'crowns_pvp_1', category: 'crowns', title: 'Arena Contender', description: 'Earn 1 weekly PvP crown', statKey: 'crowns_pvp', threshold: 1, titleReward: 'Arena Contender' },
  { id: 'crowns_pvp_3', category: 'crowns', title: 'Arena Veteran', description: 'Earn 3 weekly PvP crowns', statKey: 'crowns_pvp', threshold: 3, tier: 2, titleReward: 'Arena Veteran' },
  { id: 'crowns_pvp_10', category: 'crowns', title: 'Arena King', description: 'Earn 10 weekly PvP crowns', statKey: 'crowns_pvp', threshold: 10, tier: 3, titleReward: 'Arena King', rewards: [{ type: 'attribute_points', amount: 1 }] },

  // Combat Crowns
  { id: 'crowns_combat_1', category: 'crowns', title: 'Weekly Warrior', description: 'Earn 1 weekly combat crown', statKey: 'crowns_combat', threshold: 1, titleReward: 'Weekly Warrior' },
  { id: 'crowns_combat_3', category: 'crowns', title: 'Proven Slayer', description: 'Earn 3 weekly combat crowns', statKey: 'crowns_combat', threshold: 3, tier: 2, titleReward: 'Proven Slayer' },
  { id: 'crowns_combat_10', category: 'crowns', title: 'Warlord', description: 'Earn 10 weekly combat crowns', statKey: 'crowns_combat', threshold: 10, tier: 3, titleReward: 'Warlord', rewards: [{ type: 'attribute_points', amount: 1 }] },

  // Skills Crowns
  { id: 'crowns_skills_1', category: 'crowns', title: 'Dedicated Student', description: 'Earn 1 weekly skills crown', statKey: 'crowns_skills', threshold: 1, titleReward: 'Dedicated Student' },
  { id: 'crowns_skills_3', category: 'crowns', title: 'Skillmaster', description: 'Earn 3 weekly skills crowns', statKey: 'crowns_skills', threshold: 3, tier: 2, titleReward: 'Skillmaster' },
  { id: 'crowns_skills_10', category: 'crowns', title: 'Grandmaster', description: 'Earn 10 weekly skills crowns', statKey: 'crowns_skills', threshold: 10, tier: 3, titleReward: 'Grandmaster', rewards: [{ type: 'attribute_points', amount: 1 }] },

  // Crafting Crowns
  { id: 'crowns_crafting_1', category: 'crowns', title: 'Apprentice Artisan', description: 'Earn 1 weekly crafting crown', statKey: 'crowns_crafting', threshold: 1, titleReward: 'Apprentice Artisan' },
  { id: 'crowns_crafting_3', category: 'crowns', title: 'Master Crafter', description: 'Earn 3 weekly crafting crowns', statKey: 'crowns_crafting', threshold: 3, tier: 2, titleReward: 'Master Crafter' },
  { id: 'crowns_crafting_10', category: 'crowns', title: 'Legendary Artisan', description: 'Earn 10 weekly crafting crowns', statKey: 'crowns_crafting', threshold: 10, tier: 3, titleReward: 'Legendary Artisan', rewards: [{ type: 'attribute_points', amount: 1 }] },

  // Gathering Crowns
  { id: 'crowns_gathering_1', category: 'crowns', title: 'Keen Forager', description: 'Earn 1 weekly gathering crown', statKey: 'crowns_gathering', threshold: 1, titleReward: 'Keen Forager' },
  { id: 'crowns_gathering_3', category: 'crowns', title: 'Resource Baron', description: 'Earn 3 weekly gathering crowns', statKey: 'crowns_gathering', threshold: 3, tier: 2, titleReward: 'Resource Baron' },
  { id: 'crowns_gathering_10', category: 'crowns', title: "Land's Bounty", description: 'Earn 10 weekly gathering crowns', statKey: 'crowns_gathering', threshold: 10, tier: 3, titleReward: "Land's Bounty", rewards: [{ type: 'attribute_points', amount: 1 }] },

  // Progression Crowns
  { id: 'crowns_progression_1', category: 'crowns', title: 'Up and Comer', description: 'Earn 1 weekly progression crown', statKey: 'crowns_progression', threshold: 1, titleReward: 'Up and Comer' },
  { id: 'crowns_progression_3', category: 'crowns', title: 'Ascendant', description: 'Earn 3 weekly progression crowns', statKey: 'crowns_progression', threshold: 3, tier: 2, titleReward: 'Ascendant' },
  { id: 'crowns_progression_10', category: 'crowns', title: 'Transcendent', description: 'Earn 10 weekly progression crowns', statKey: 'crowns_progression', threshold: 10, tier: 3, titleReward: 'Transcendent', rewards: [{ type: 'attribute_points', amount: 1 }] },

  // Casino Crowns
  { id: 'crowns_casino_1', category: 'crowns', title: 'Lucky Streak', description: 'Earn 1 weekly casino crown', statKey: 'crowns_casino', threshold: 1, titleReward: 'Lucky Streak' },
  { id: 'crowns_casino_3', category: 'crowns', title: 'High Roller', description: 'Earn 3 weekly casino crowns', statKey: 'crowns_casino', threshold: 3, tier: 2, titleReward: 'High Roller' },
  { id: 'crowns_casino_10', category: 'crowns', title: 'Casino Mogul', description: 'Earn 10 weekly casino crowns', statKey: 'crowns_casino', threshold: 10, tier: 3, titleReward: 'Casino Mogul', rewards: [{ type: 'attribute_points', amount: 1 }] },
];
```

Add `...CROWN_ACHIEVEMENTS` to the main `ALL_ACHIEVEMENTS` array export.

- [ ] **Step 3: Build shared**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/achievementDefinitions.ts packages/shared/src/types/achievement.types.ts
git commit -m "feat(crowns): add crown achievement chains for 7 category groups"
```

---

### Task 4: Add Crown Stats Resolution

**Files:**
- Modify: `apps/api/src/services/statsService.ts`
- Test: `apps/api/src/services/statsService.test.ts` (if exists, add crown tests)

- [ ] **Step 1: Add `resolveCrownStats` function**

In `statsService.ts`, add:

```typescript
import { CROWN_CONSTANTS } from '@pocketrealm/shared';

export async function resolveCrownStats(playerId: string): Promise<Record<string, number>> {
  const crowns = await prisma.playerCrown.findMany({
    where: { playerId },
    select: { category: true },
  });

  // Count crowns per group
  const counts: Record<string, number> = {};
  for (const [group, categories] of Object.entries(CROWN_CONSTANTS.CATEGORY_GROUPS)) {
    const key = `crowns_${group}`;
    counts[key] = crowns.filter((c) => (categories as readonly string[]).includes(c.category)).length;
  }

  return counts;
}
```

- [ ] **Step 2: Integrate into `resolveStats`**

In the existing `resolveStats` function, check if any requested `statKeys` start with `crowns_`. If so, call `resolveCrownStats` and merge the results:

```typescript
// Inside resolveStats:
const crownKeys = neededStatKeys.filter((k) => k.startsWith('crowns_'));
if (crownKeys.length > 0) {
  const crownStats = await resolveCrownStats(playerId);
  Object.assign(resolved, crownStats);
}
```

Note: `getPlayerAchievements` will need to call `resolveStats` with crown stat keys so the achievements page can show progress toward crown achievements.

- [ ] **Step 3: Build and verify**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/statsService.ts
git commit -m "feat(crowns): add crown stats resolution to statsService"
```

---

### Task 5: Create Crown Service

**Files:**
- Create: `apps/api/src/services/crownService.ts`
- Test: `apps/api/src/services/crownService.test.ts`

- [ ] **Step 1: Write test for crown award logic**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockPrisma = {
  playerCrown: { createMany: vi.fn(), findMany: vi.fn() },
};
vi.mock('@pocketrealm/database', () => ({ prisma: mockPrisma }));

const mockRedis = {
  zrevrangebyscore: vi.fn(),
  zrevrange: vi.fn(),
  hget: vi.fn(),
  pipeline: vi.fn(),
};
vi.mock('../redis', () => ({ redis: mockRedis }));

vi.mock('./achievementService', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
}));

import { computeCrownWinners } from './crownService';

describe('computeCrownWinners', () => {
  it('awards gold/silver/bronze to top 3', () => {
    const deltas = [
      { playerId: 'p1', score: 100, isBot: false },
      { playerId: 'p2', score: 80, isBot: false },
      { playerId: 'p3', score: 60, isBot: false },
      { playerId: 'p4', score: 40, isBot: false },
    ];

    const winners = computeCrownWinners(deltas);
    expect(winners).toEqual([
      { playerId: 'p1', rank: 1 },
      { playerId: 'p2', rank: 2 },
      { playerId: 'p3', rank: 3 },
    ]);
  });

  it('handles ties — same rank for tied players', () => {
    const deltas = [
      { playerId: 'p1', score: 100, isBot: false },
      { playerId: 'p2', score: 100, isBot: false },
      { playerId: 'p3', score: 60, isBot: false },
    ];

    const winners = computeCrownWinners(deltas);
    expect(winners).toEqual([
      { playerId: 'p1', rank: 1 },
      { playerId: 'p2', rank: 1 },
      { playerId: 'p3', rank: 3 },
    ]);
  });

  it('filters bots', () => {
    const deltas = [
      { playerId: 'bot1', score: 200, isBot: true },
      { playerId: 'p1', score: 100, isBot: false },
    ];

    const winners = computeCrownWinners(deltas);
    expect(winners[0].playerId).toBe('p1');
  });

  it('requires delta >= MIN_DELTA', () => {
    const deltas = [
      { playerId: 'p1', score: 0, isBot: false },
    ];

    const winners = computeCrownWinners(deltas);
    expect(winners).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- --run crownService`
Expected: FAIL — module not found

- [ ] **Step 3: Implement crown service**

Create `apps/api/src/services/crownService.ts`:

```typescript
import { CROWN_CONSTANTS } from '@pocketrealm/shared';
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { checkAchievements } from './achievementService';

interface DeltaEntry {
  playerId: string;
  score: number;
  isBot: boolean;
}

interface CrownWinner {
  playerId: string;
  rank: number;
}

export function computeCrownWinners(deltas: DeltaEntry[]): CrownWinner[] {
  const eligible = deltas
    .filter((d) => !d.isBot && d.score >= CROWN_CONSTANTS.MIN_DELTA)
    .sort((a, b) => b.score - a.score);

  const winners: CrownWinner[] = [];
  let currentRank = 0;
  let lastScore = -1;

  for (const entry of eligible) {
    if (winners.length >= CROWN_CONSTANTS.MAX_CROWNS_PER_CATEGORY) break;

    if (entry.score !== lastScore) {
      currentRank = winners.length + 1;
      if (currentRank > 3) break; // Only gold/silver/bronze
    }

    winners.push({ playerId: entry.playerId, rank: currentRank });
    lastScore = entry.score;
  }

  return winners;
}

export async function awardCrownsForCategory(
  category: string,
  weekStart: Date,
): Promise<CrownWinner[]> {
  // Read delta leaderboard using pipeline for batch reads
  const deltaKey = `leaderboard:weekly_delta:${category}`;
  const metaKey = `leaderboard:meta:${category}`;

  const topEntries = await redis.zrevrange(deltaKey, 0, CROWN_CONSTANTS.MAX_CROWNS_PER_CATEGORY + 5, 'WITHSCORES');

  // Parse entries: [member, score, member, score, ...]
  const playerIds: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < topEntries.length; i += 2) {
    playerIds.push(topEntries[i]);
    scores.push(parseFloat(topEntries[i + 1]));
  }

  // Use Redis pipeline for batch meta reads
  const metaPipeline = redis.pipeline();
  for (const playerId of playerIds) {
    metaPipeline.hget(metaKey, playerId);
  }
  const metaResults = await metaPipeline.exec();

  const deltas: DeltaEntry[] = playerIds.map((playerId, idx) => {
    const metaRaw = metaResults?.[idx]?.[1] as string | null;
    const meta = metaRaw ? JSON.parse(metaRaw) : {};
    return { playerId, score: scores[idx], isBot: meta.isBot ?? false };
  });

  const winners = computeCrownWinners(deltas);
  if (winners.length === 0) return [];

  // Insert crowns
  await prisma.playerCrown.createMany({
    data: winners.map((w) => ({
      playerId: w.playerId,
      category,
      rank: w.rank,
      weekStart,
    })),
    skipDuplicates: true,
  });

  // Check crown achievements for each winner
  const group = Object.entries(CROWN_CONSTANTS.CATEGORY_GROUPS)
    .find(([, cats]) => (cats as readonly string[]).includes(category))?.[0];

  if (group) {
    for (const winner of winners) {
      await checkAchievements(winner.playerId, {
        statKeys: [`crowns_${group}`],
      }).catch(() => {});
    }
  }

  return winners;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:api -- --run crownService`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/crownService.ts apps/api/src/services/crownService.test.ts
git commit -m "feat(crowns): add crown award logic and service"
```

---

### Task 6: Add Delta Computation to Leaderboard Refresh

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts`

- [ ] **Step 1: Add delta computation inside existing refresh functions**

After each `writeToZset` call, compute deltas using the in-memory `rows` data. Use a Redis pipeline for reading snapshot scores in batch (as required by the spec):

```typescript
async function computeWeeklyDelta(
  category: string,
  rows: Array<{ playerId: string; score: number }>,
  useXpSource?: Map<string, number>, // For XP-based categories
) {
  const snapshotKey = useXpSource
    ? `leaderboard:weekly_start_xp:${category}`
    : `leaderboard:weekly_start:${category}`;

  // Check if snapshot exists (no snapshot = first week, skip)
  const exists = await redis.exists(snapshotKey);
  if (!exists) return;

  const deltaKey = `leaderboard:weekly_delta:${category}`;

  // Use pipeline for batch reads of snapshot scores
  const readPipeline = redis.pipeline();
  for (const row of rows) {
    readPipeline.zscore(snapshotKey, row.playerId);
  }
  const snapshotResults = await readPipeline.exec();

  // Use pipeline for batch writes of delta scores
  const writePipeline = redis.pipeline();
  writePipeline.del(deltaKey);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const source = useXpSource ? useXpSource.get(row.playerId) : row.score;
    if (source == null) continue;

    const snapshotScore = snapshotResults?.[i]?.[1] as string | null;
    const delta = source - (snapshotScore ? parseFloat(snapshotScore) : 0);

    if (delta > 0) {
      writePipeline.zadd(deltaKey, delta, row.playerId);
    }
  }

  await writePipeline.exec();
}
```

Note: For XP-based categories (skills, character_level), the `useXpSource` map provides XP values from Postgres rather than the level-based scores in the sorted set. Build this map inside `refreshSkills` from the `PlayerSkill.xp` field (already queried but currently only `level` is used).

- [ ] **Step 2: Hook delta computation into `refreshSkills` and other refresh functions**

After each `writeToZset` call, add `computeWeeklyDelta(category, rows)`.

For `refreshSkills`:
```typescript
// After writeToZset for each skill:
const xpMap = new Map(filtered.map((s) => [s.playerId, Number(s.xp)]));
await computeWeeklyDelta(`skill_${skillType}`, filtered.map(s => ({ playerId: s.playerId, score: s.level })), xpMap);
```

Note: Check that `xp` is included in the `select` clause of the Prisma query in `refreshSkills`. If not, add it.

- [ ] **Step 3: Build and verify**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts
git commit -m "feat(crowns): compute weekly deltas during leaderboard refresh"
```

---

### Task 7: Create Weekly Cron Job

**Files:**
- Create: `apps/api/src/jobs/weeklyLeaderboardJob.ts`
- Modify: `apps/api/src/index.ts` (register the interval)

- [ ] **Step 1: Implement the weekly job**

Create `apps/api/src/jobs/weeklyLeaderboardJob.ts`:

```typescript
import { redis } from '../redis';
import { awardCrownsForCategory } from '../services/crownService';
import { emitSystemMessage } from '../services/systemMessageService';
import { getIo } from '../socket';
import { LEADERBOARD_CONSTANTS, CROWN_CONSTANTS } from '@pocketrealm/shared';

const ALL_CATEGORIES: string[] = [
  // Flatten all categories from CROWN_CONSTANTS.CATEGORY_GROUPS
  ...Object.values(CROWN_CONSTANTS.CATEGORY_GROUPS).flat(),
];

function getMondayDate(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function runWeeklyLeaderboardJob(): Promise<void> {
  const weekKey = `leaderboard:weekly_job_ran:${getMondayDate()}`;

  // Idempotency check
  const alreadyRan = await redis.get(weekKey);
  if (alreadyRan) return;

  console.log('[WeeklyLeaderboard] Starting weekly crown job...');

  // Phase 1: Award crowns from last week
  const lastMonday = new Date();
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const weekStart = new Date(lastMonday.toISOString().slice(0, 10));

  const snapshotExists = await redis.exists('leaderboard:weekly_start:total_kills');

  if (snapshotExists) {
    const allWinners: Array<{ category: string; winners: Array<{ playerId: string; rank: number }> }> = [];

    for (const category of ALL_CATEGORIES) {
      const winners = await awardCrownsForCategory(category, weekStart);
      if (winners.length > 0) {
        allWinners.push({ category, winners });
      }
    }

    // Broadcast crown announcements to world chat
    const io = getIo();
    if (io && allWinners.length > 0) {
      const crownCount = allWinners.reduce((sum, c) => sum + c.winners.length, 0);
      await emitSystemMessage(io, 'world', 'world',
        `Weekly crowns awarded! ${crownCount} crowns earned across ${allWinners.length} categories this week.`
      );
    }

    console.log(`[WeeklyLeaderboard] Awarded crowns for ${allWinners.length} categories`);
  }

  // Phase 2: Clean up old snapshot/delta keys
  for (const category of ALL_CATEGORIES) {
    await redis.del(
      `leaderboard:weekly_start:${category}`,
      `leaderboard:weekly_start_xp:${category}`,
      `leaderboard:weekly_delta:${category}`,
    );
  }

  // Phase 3: Take fresh snapshots
  for (const category of ALL_CATEGORIES) {
    // Copy absolute sorted sets
    try {
      await redis.copy(`leaderboard:${category}`, `leaderboard:weekly_start:${category}`, 'REPLACE');
    } catch {
      // Category may not exist yet (empty leaderboard), skip
    }
  }

  // For XP-based categories, snapshot from Postgres
  // This is handled by a separate function that queries PlayerSkill.xp etc.
  await snapshotXpCategories();

  // Mark job as complete (7-day TTL)
  await redis.set(weekKey, '1', 'EX', 7 * 24 * 60 * 60);

  console.log('[WeeklyLeaderboard] Weekly job complete');
}

async function snapshotXpCategories(): Promise<void> {
  // Import prisma here to avoid circular deps
  const { prisma } = await import('@pocketrealm/database');

  // Snapshot skill XP
  const skills = await prisma.playerSkill.findMany({
    select: { playerId: true, skillType: true, xp: true },
  });

  // Group by skill type and write to snapshot sorted sets
  const bySkill = new Map<string, Array<{ playerId: string; xp: number }>>();
  for (const s of skills) {
    const key = `skill_${s.skillType}`;
    if (!bySkill.has(key)) bySkill.set(key, []);
    bySkill.get(key)!.push({ playerId: s.playerId, xp: Number(s.xp) });
  }

  for (const [category, entries] of bySkill) {
    if (entries.length === 0) continue;
    const args: (string | number)[] = [];
    for (const e of entries) {
      args.push(e.xp, e.playerId);
    }
    await redis.del(`leaderboard:weekly_start_xp:${category}`);
    await redis.zadd(`leaderboard:weekly_start_xp:${category}`, ...args);
  }

  // Snapshot character XP
  const players = await prisma.player.findMany({
    select: { id: true, characterXp: true },
  });
  const charArgs: (string | number)[] = [];
  for (const p of players) {
    charArgs.push(Number(p.characterXp), p.id);
  }
  if (charArgs.length > 0) {
    await redis.del('leaderboard:weekly_start_xp:character_level');
    await redis.zadd('leaderboard:weekly_start_xp:character_level', ...charArgs);
  }

  // Total skill level: sum all XP per player
  const totalXp = new Map<string, number>();
  for (const s of skills) {
    totalXp.set(s.playerId, (totalXp.get(s.playerId) ?? 0) + Number(s.xp));
  }
  const totalArgs: (string | number)[] = [];
  for (const [playerId, xp] of totalXp) {
    totalArgs.push(xp, playerId);
  }
  if (totalArgs.length > 0) {
    await redis.del('leaderboard:weekly_start_xp:total_skill_level');
    await redis.zadd('leaderboard:weekly_start_xp:total_skill_level', ...totalArgs);
  }
}
```

- [ ] **Step 2: Register the interval in index.ts**

In `apps/api/src/index.ts`, add:

```typescript
import { runWeeklyLeaderboardJob } from './jobs/weeklyLeaderboardJob';

// Check every 60 seconds if it's Monday 00:00 UTC
setInterval(async () => {
  const now = new Date();
  if (now.getUTCDay() === 1 && now.getUTCHours() === 0 && now.getUTCMinutes() < 2) {
    await runWeeklyLeaderboardJob().catch(console.error);
  }
}, 60_000);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/jobs/weeklyLeaderboardJob.ts apps/api/src/index.ts
git commit -m "feat(crowns): add weekly cron job for snapshot + award"
```

---

### Task 8: Add Crown Routes

**Files:**
- Modify: `apps/api/src/routes/leaderboard.ts`

- [ ] **Step 1: Add `?period=weekly` support to existing route**

In the `GET /leaderboard/:category` handler, check for `req.query.period`:

```typescript
const period = req.query.period === 'weekly' ? 'weekly' : 'alltime';

if (period === 'weekly') {
  const deltaKey = `leaderboard:weekly_delta:${category}`;
  // Read from delta sorted set instead of absolute
  // ... (same pagination logic, different Redis key)
}

// Add period to response
res.json({ period, entries, ...rest });
```

- [ ] **Step 2: Add crown indicators to leaderboard entry response**

The spec requires `crowns?: { gold: number, silver: number, bronze: number }` on each leaderboard entry. When building the entry response, query `PlayerCrown` counts for each player in the result set:

```typescript
// After fetching leaderboard entries, enrich with crown counts
const playerIds = entries.map((e) => e.playerId);
const crownCounts = await prisma.playerCrown.groupBy({
  by: ['playerId', 'rank'],
  where: { playerId: { in: playerIds }, category },
  _count: { id: true },
});

// Build crown map: playerId -> { gold, silver, bronze }
const crownMap = new Map<string, { gold: number; silver: number; bronze: number }>();
for (const c of crownCounts) {
  const existing = crownMap.get(c.playerId) ?? { gold: 0, silver: 0, bronze: 0 };
  if (c.rank === 1) existing.gold = c._count.id;
  else if (c.rank === 2) existing.silver = c._count.id;
  else if (c.rank === 3) existing.bronze = c._count.id;
  crownMap.set(c.playerId, existing);
}

// Add to each entry
const enrichedEntries = entries.map((e) => ({
  ...e,
  crowns: crownMap.get(e.playerId) ?? undefined,
}));
```

- [ ] **Step 3: Add crown collection route**

**IMPORTANT:** The `/crowns/:playerId` route MUST be registered BEFORE the `/:category` route, otherwise Express will treat "crowns" as a category parameter and never reach this handler.

```typescript
// GET /leaderboard/crowns/:playerId — MUST be before /:category
router.get('/crowns/:playerId', asyncHandler(async (req, res) => {
  const crowns = await prisma.playerCrown.findMany({
    where: { playerId: req.params.playerId },
    orderBy: { weekStart: 'desc' },
  });

  const totalByGroup: Record<string, number> = {};
  for (const [group, categories] of Object.entries(CROWN_CONSTANTS.CATEGORY_GROUPS)) {
    totalByGroup[group] = crowns.filter((c) => (categories as readonly string[]).includes(c.category)).length;
  }

  res.json({
    crowns: crowns.map((c) => ({
      category: c.category,
      rank: c.rank,
      weekStart: c.weekStart.toISOString().slice(0, 10),
    })),
    totalByGroup,
  });
}));

// /:category route AFTER /crowns/:playerId
```

- [ ] **Step 4: Build and verify**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/leaderboard.ts
git commit -m "feat(crowns): add weekly period, crown indicators, and crown collection routes"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Run all API tests**

Run: `npm run test:api`
Expected: All PASS

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 3: Build everything**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Run migration on dev DB**

Run: `npm run db:migrate`
Expected: Migration applied successfully

**Note:** This plan covers backend only. Frontend implementation (UI components, screens) will be a separate follow-up plan.
