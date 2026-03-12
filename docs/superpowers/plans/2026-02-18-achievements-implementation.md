# Achievements & Milestones Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a player-facing achievement system with ~95 achievements, stat tracking, reward claiming, title display, and a dedicated frontend tab.

**Architecture:** Code-defined achievement definitions in shared constants; DB stores PlayerStats counters (incremented alongside existing actions), PlayerFamilyStats (per-family kill counts), and PlayerAchievement (unlock + claim state). Achievement checks are event-driven — called immediately after each action in existing routes. Frontend gets a new Achievements tab with category filtering, progress bars, manual reward claiming, and toast notifications via socket events.

**Tech Stack:** Prisma 6 (migration + models), Express 4 (routes + services), Vitest (tests), Next.js 16 (React components), Socket.IO (toast events), Tailwind CSS (styling)

**Design doc:** `docs/superpowers/specs/2026-02-18-achievements-design.md`

---

## Task 1: Shared Types

**Files:**
- Create: `packages/shared/src/types/achievement.types.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create achievement types file**

```typescript
// packages/shared/src/types/achievement.types.ts

export type AchievementCategory =
  | 'combat'
  | 'exploration'
  | 'crafting'
  | 'skills'
  | 'gathering'
  | 'bestiary'
  | 'general'
  | 'family';

export interface AchievementReward {
  type: 'xp' | 'turns' | 'attribute_points' | 'item';
  amount: number;
  itemTemplateId?: string;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  titleReward?: string;
  rewards?: AchievementReward[];
  secret?: boolean;
  tier?: number;
  statKey?: string;
  familyKey?: string;
  threshold: number;
}

export interface PlayerAchievementProgress {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  titleReward?: string;
  threshold: number;
  secret?: boolean;
  tier?: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
  rewardClaimed?: boolean;
  rewards?: AchievementReward[];
}

export interface AchievementsResponse {
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
}

export interface ClaimRewardResponse {
  success: boolean;
  rewards: AchievementReward[];
}
```

**Step 2: Export from shared index**

Add to `packages/shared/src/index.ts` after the existing type exports:
```typescript
export * from './types/achievement.types';
```

**Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build, no errors

**Step 4: Commit**

```bash
git add packages/shared/src/types/achievement.types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add achievement type definitions"
```

---

## Task 2: Achievement Definitions Constant

**Files:**
- Create: `packages/shared/src/constants/achievementDefinitions.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create achievement definitions file**

This file contains all ~95 code-defined achievements. The full content is large — reference `docs/superpowers/specs/2026-02-18-achievements-design.md` for the complete achievement tables.

```typescript
// packages/shared/src/constants/achievementDefinitions.ts
import type { AchievementDef } from '../types/achievement.types';

// --- Combat achievements ---
const COMBAT_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'combat_kills_100',
    category: 'combat',
    title: 'Monster Hunter',
    description: 'Kill 100 monsters',
    statKey: 'totalKills',
    threshold: 100,
  },
  {
    id: 'combat_kills_500',
    category: 'combat',
    title: 'Warrior',
    description: 'Kill 500 monsters',
    titleReward: 'The Warrior',
    statKey: 'totalKills',
    threshold: 500,
    tier: 2,
  },
  {
    id: 'combat_kills_1000',
    category: 'combat',
    title: 'Slayer',
    description: 'Kill 1,000 monsters',
    titleReward: 'The Slayer',
    statKey: 'totalKills',
    threshold: 1000,
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 1 }],
  },
  {
    id: 'combat_kills_5000',
    category: 'combat',
    title: 'Annihilator',
    description: 'Kill 5,000 monsters',
    titleReward: 'The Annihilator',
    statKey: 'totalKills',
    threshold: 5000,
    tier: 4,
    rewards: [{ type: 'attribute_points', amount: 2 }],
  },
  {
    id: 'combat_kills_10000',
    category: 'combat',
    title: 'Extinction Event',
    description: 'Kill 10,000 monsters',
    titleReward: 'Extinction Event',
    statKey: 'totalKills',
    threshold: 10000,
    tier: 5,
    rewards: [{ type: 'attribute_points', amount: 3 }],
  },
  {
    id: 'combat_boss_1',
    category: 'combat',
    title: 'Boss Hunter',
    description: 'Defeat 1 boss',
    statKey: 'totalBossKills',
    threshold: 1,
  },
  {
    id: 'combat_boss_10',
    category: 'combat',
    title: 'Boss Crusher',
    description: 'Defeat 10 bosses',
    titleReward: 'Bane of Bosses',
    statKey: 'totalBossKills',
    threshold: 10,
    tier: 2,
    rewards: [{ type: 'attribute_points', amount: 1 }],
  },
  {
    id: 'combat_boss_25',
    category: 'combat',
    title: 'Raid Leader',
    description: 'Defeat 25 bosses',
    titleReward: 'Raid Leader',
    statKey: 'totalBossKills',
    threshold: 25,
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 2 }],
  },
  {
    id: 'combat_pvp_1',
    category: 'combat',
    title: 'Gladiator',
    description: 'Win 1 PvP match',
    statKey: 'totalPvpWins',
    threshold: 1,
  },
  {
    id: 'combat_pvp_25',
    category: 'combat',
    title: 'Pit Fighter',
    description: 'Win 25 PvP matches',
    titleReward: 'Pit Fighter',
    statKey: 'totalPvpWins',
    threshold: 25,
    tier: 2,
  },
  {
    id: 'combat_pvp_100',
    category: 'combat',
    title: 'Arena Champion',
    description: 'Win 100 PvP matches',
    titleReward: 'Champion',
    statKey: 'totalPvpWins',
    threshold: 100,
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 2 }],
  },
  {
    id: 'combat_streak_5',
    category: 'combat',
    title: 'On A Roll',
    description: 'Achieve a 5 PvP win streak',
    statKey: 'bestPvpWinStreak',
    threshold: 5,
  },
  {
    id: 'combat_streak_10',
    category: 'combat',
    title: 'Unstoppable',
    description: 'Achieve a 10 PvP win streak',
    titleReward: 'The Unstoppable',
    statKey: 'bestPvpWinStreak',
    threshold: 10,
    secret: true,
  },
];

// --- Exploration achievements ---
const EXPLORATION_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'explore_zones_3',
    category: 'exploration',
    title: 'Wanderer',
    description: 'Discover 3 zones',
    statKey: 'totalZonesDiscovered',
    threshold: 3,
    rewards: [{ type: 'turns', amount: 1000 }],
  },
  {
    id: 'explore_zones_5',
    category: 'exploration',
    title: 'Pathfinder',
    description: 'Discover 5 zones',
    titleReward: 'The Pathfinder',
    statKey: 'totalZonesDiscovered',
    threshold: 5,
    tier: 2,
  },
  {
    id: 'explore_zones_all',
    category: 'exploration',
    title: 'Cartographer',
    description: 'Discover all zones',
    titleReward: 'The Cartographer',
    statKey: 'totalZonesDiscovered',
    threshold: 11, // total zone count in game
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 2 }],
  },
  {
    id: 'explore_full_1',
    category: 'exploration',
    title: 'Thorough',
    description: 'Fully explore 1 zone',
    statKey: 'totalZonesFullyExplored',
    threshold: 1,
  },
  {
    id: 'explore_full_3',
    category: 'exploration',
    title: 'Surveyor',
    description: 'Fully explore 3 zones',
    titleReward: 'The Surveyor',
    statKey: 'totalZonesFullyExplored',
    threshold: 3,
    tier: 2,
  },
  {
    id: 'explore_full_all',
    category: 'exploration',
    title: 'World Walker',
    description: 'Fully explore all zones',
    titleReward: 'World Walker',
    statKey: 'totalZonesFullyExplored',
    threshold: 9, // wild zones only (excluding towns)
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 3 }],
  },
];

// --- Crafting achievements ---
const CRAFTING_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'craft_total_1',
    category: 'crafting',
    title: 'Apprentice',
    description: 'Craft 1 item',
    statKey: 'totalCrafts',
    threshold: 1,
  },
  {
    id: 'craft_total_50',
    category: 'crafting',
    title: 'Artisan',
    description: 'Craft 50 items',
    titleReward: 'The Artisan',
    statKey: 'totalCrafts',
    threshold: 50,
    tier: 2,
  },
  {
    id: 'craft_total_500',
    category: 'crafting',
    title: 'Master Crafter',
    description: 'Craft 500 items',
    titleReward: 'Master Crafter',
    statKey: 'totalCrafts',
    threshold: 500,
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 2 }],
  },
  {
    id: 'craft_rare_1',
    category: 'crafting',
    title: 'Lucky Break',
    description: 'Craft a rare item',
    statKey: 'totalRaresCrafted',
    threshold: 1,
  },
  {
    id: 'craft_epic_1',
    category: 'crafting',
    title: 'Epic Forger',
    description: 'Craft an epic item',
    titleReward: 'The Forger',
    statKey: 'totalEpicsCrafted',
    threshold: 1,
  },
  {
    id: 'craft_legendary_1',
    category: 'crafting',
    title: 'Legendary Smith',
    description: 'Craft a legendary item',
    titleReward: 'Legendsmith',
    statKey: 'totalLegendariesCrafted',
    threshold: 1,
    rewards: [{ type: 'attribute_points', amount: 1 }],
  },
  {
    id: 'craft_salvage_50',
    category: 'crafting',
    title: 'Scrapper',
    description: 'Salvage 50 items',
    statKey: 'totalSalvages',
    threshold: 50,
  },
  {
    id: 'craft_salvage_500',
    category: 'crafting',
    title: 'Recycler',
    description: 'Salvage 500 items',
    titleReward: 'The Recycler',
    statKey: 'totalSalvages',
    threshold: 500,
    tier: 2,
  },
  {
    id: 'craft_forge_25',
    category: 'crafting',
    title: 'Tinkerer',
    description: 'Forge upgrade 25 times',
    statKey: 'totalForgeUpgrades',
    threshold: 25,
  },
];

// --- Skills achievements ---
const SKILLS_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'skill_any_10',
    category: 'skills',
    title: 'Dedicated',
    description: 'Reach level 10 in any skill',
    statKey: 'highestSkillLevel',
    threshold: 10,
  },
  {
    id: 'skill_any_25',
    category: 'skills',
    title: 'Specialist',
    description: 'Reach level 25 in any skill',
    titleReward: 'The Specialist',
    statKey: 'highestSkillLevel',
    threshold: 25,
    tier: 2,
  },
  {
    id: 'skill_any_50',
    category: 'skills',
    title: 'Master',
    description: 'Reach level 50 in any skill',
    titleReward: 'The Master',
    statKey: 'highestSkillLevel',
    threshold: 50,
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 2 }],
  },
  {
    id: 'level_10',
    category: 'skills',
    title: 'Rising Star',
    description: 'Reach character level 10',
    statKey: 'highestCharacterLevel',
    threshold: 10,
  },
  {
    id: 'level_25',
    category: 'skills',
    title: 'Veteran',
    description: 'Reach character level 25',
    titleReward: 'Veteran',
    statKey: 'highestCharacterLevel',
    threshold: 25,
    tier: 2,
    rewards: [{ type: 'attribute_points', amount: 1 }],
  },
  {
    id: 'level_50',
    category: 'skills',
    title: 'Legend',
    description: 'Reach character level 50',
    titleReward: 'The Legend',
    statKey: 'highestCharacterLevel',
    threshold: 50,
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 3 }],
  },
];

// --- Gathering achievements ---
const GATHERING_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'gather_total_10',
    category: 'gathering',
    title: 'Prospector',
    description: 'Gather 10 times',
    statKey: 'totalGatheringActions',
    threshold: 10,
  },
  {
    id: 'gather_total_100',
    category: 'gathering',
    title: 'Harvester',
    description: 'Gather 100 times',
    statKey: 'totalGatheringActions',
    threshold: 100,
    tier: 2,
  },
  {
    id: 'gather_total_500',
    category: 'gathering',
    title: 'Resource Baron',
    description: 'Gather 500 times',
    titleReward: 'The Harvester',
    statKey: 'totalGatheringActions',
    threshold: 500,
    tier: 3,
  },
  {
    id: 'gather_total_1000',
    category: 'gathering',
    title: 'Strip Miner',
    description: 'Gather 1,000 times',
    titleReward: 'Strip Miner',
    statKey: 'totalGatheringActions',
    threshold: 1000,
    tier: 4,
    rewards: [{ type: 'attribute_points', amount: 1 }],
  },
];

// --- Bestiary achievements ---
const BESTIARY_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'bestiary_unique_10',
    category: 'bestiary',
    title: 'Naturalist',
    description: 'Encounter 10 unique monsters',
    statKey: 'totalUniqueMonsterKills',
    threshold: 10,
  },
  {
    id: 'bestiary_unique_25',
    category: 'bestiary',
    title: 'Monster Scholar',
    description: 'Encounter 25 unique monsters',
    titleReward: 'The Scholar',
    statKey: 'totalUniqueMonsterKills',
    threshold: 25,
    tier: 2,
  },
  {
    id: 'bestiary_complete_1',
    category: 'bestiary',
    title: 'Completionist',
    description: 'Master all prefixes for 1 mob',
    statKey: 'totalBestiaryCompleted',
    threshold: 1,
  },
  {
    id: 'bestiary_complete_5',
    category: 'bestiary',
    title: 'Zoologist',
    description: 'Master 5 mob bestiary entries',
    titleReward: 'The Zoologist',
    statKey: 'totalBestiaryCompleted',
    threshold: 5,
    tier: 2,
    rewards: [{ type: 'attribute_points', amount: 1 }],
  },
  {
    id: 'bestiary_complete_all',
    category: 'bestiary',
    title: 'Encyclopedist',
    description: 'Master all mob bestiary entries',
    titleReward: 'The Encyclopedist',
    statKey: 'totalBestiaryCompleted',
    threshold: 50, // approximate total mob templates
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 3 }],
  },
];

// --- General achievements ---
const GENERAL_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'turns_10000',
    category: 'general',
    title: 'Time Invested',
    description: 'Spend 10,000 turns',
    statKey: 'totalTurnsSpent',
    threshold: 10000,
  },
  {
    id: 'turns_100000',
    category: 'general',
    title: 'Dedicated Adventurer',
    description: 'Spend 100,000 turns',
    titleReward: 'The Dedicated',
    statKey: 'totalTurnsSpent',
    threshold: 100000,
    tier: 2,
  },
  {
    id: 'turns_1000000',
    category: 'general',
    title: 'No-Lifer',
    description: 'Spend 1,000,000 turns',
    titleReward: 'The No-Lifer',
    statKey: 'totalTurnsSpent',
    threshold: 1000000,
    tier: 3,
    rewards: [{ type: 'attribute_points', amount: 2 }],
  },
  {
    id: 'recipe_10',
    category: 'general',
    title: 'Cookbook',
    description: 'Learn 10 recipes',
    statKey: 'totalRecipesLearned',
    threshold: 10,
  },
  {
    id: 'recipe_25',
    category: 'general',
    title: 'Recipe Collector',
    description: 'Learn 25 recipes',
    titleReward: 'The Collector',
    statKey: 'totalRecipesLearned',
    threshold: 25,
    tier: 2,
    rewards: [{ type: 'attribute_points', amount: 1 }],
  },
  // Secret achievements
  {
    id: 'secret_first_death',
    category: 'general',
    title: 'Humbling Experience',
    description: 'Get knocked out for the first time',
    statKey: 'totalDeaths',
    threshold: 1,
    secret: true,
  },
];

// --- Family achievements (generated for all 19 families) ---
const FAMILY_KEYS = [
  'vermin', 'spiders', 'boars', 'wolves', 'bandits',
  'treants', 'spirits', 'fae', 'bats', 'goblins',
  'golems', 'crawlers', 'harpies', 'undead', 'swampBeasts',
  'witches', 'elementals', 'serpents', 'abominations',
] as const;

const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  vermin: 'Vermin',
  spiders: 'Spider',
  boars: 'Boar',
  wolves: 'Wolf',
  bandits: 'Bandit',
  treants: 'Treant',
  spirits: 'Spirit',
  fae: 'Fae',
  bats: 'Bat',
  goblins: 'Goblin',
  golems: 'Golem',
  crawlers: 'Crawler',
  harpies: 'Harpy',
  undead: 'Undead',
  swampBeasts: 'Swamp Beast',
  witches: 'Witch',
  elementals: 'Elemental',
  serpents: 'Serpent',
  abominations: 'Abomination',
};

// Maps family key to the unique item template ID awarded at 1,000 kills
// These IDs must match ItemTemplate records created in seed data
export const FAMILY_REWARD_ITEMS: Record<string, string> = {
  vermin: 'achievement_vermin_gloves',
  spiders: 'achievement_spiders_boots',
  boars: 'achievement_boars_chest',
  wolves: 'achievement_wolves_chest',
  bandits: 'achievement_bandits_weapon',
  treants: 'achievement_treants_shield',
  spirits: 'achievement_spirits_charm',
  fae: 'achievement_fae_ring',
  bats: 'achievement_bats_helm',
  goblins: 'achievement_goblins_helm',
  golems: 'achievement_golems_charm',
  crawlers: 'achievement_crawlers_legs',
  harpies: 'achievement_harpies_boots',
  undead: 'achievement_undead_gloves',
  swampBeasts: 'achievement_swampBeasts_belt',
  witches: 'achievement_witches_helm',
  elementals: 'achievement_elementals_neck',
  serpents: 'achievement_serpents_ring',
  abominations: 'achievement_abominations_chest',
};

const FAMILY_ACHIEVEMENTS: AchievementDef[] = FAMILY_KEYS.flatMap((key) => {
  const name = FAMILY_DISPLAY_NAMES[key];
  return [
    {
      id: `family_${key}_100`,
      category: 'family' as const,
      title: `${name} Hunter`,
      description: `Kill 100 ${FAMILY_DISPLAY_NAMES[key]}s`,
      familyKey: key,
      threshold: 100,
      tier: 1,
    },
    {
      id: `family_${key}_500`,
      category: 'family' as const,
      title: `${name} Slayer`,
      description: `Kill 500 ${FAMILY_DISPLAY_NAMES[key]}s`,
      titleReward: `${name} Slayer`,
      familyKey: key,
      threshold: 500,
      tier: 2,
    },
    {
      id: `family_${key}_1000`,
      category: 'family' as const,
      title: `${name}'s Bane`,
      description: `Kill 1,000 ${FAMILY_DISPLAY_NAMES[key]}s`,
      titleReward: `${name}'s Bane`,
      familyKey: key,
      threshold: 1000,
      tier: 3,
      rewards: [{ type: 'item', amount: 1, itemTemplateId: FAMILY_REWARD_ITEMS[key] }],
    },
  ];
});

export const ALL_ACHIEVEMENTS: AchievementDef[] = [
  ...COMBAT_ACHIEVEMENTS,
  ...EXPLORATION_ACHIEVEMENTS,
  ...CRAFTING_ACHIEVEMENTS,
  ...SKILLS_ACHIEVEMENTS,
  ...GATHERING_ACHIEVEMENTS,
  ...BESTIARY_ACHIEVEMENTS,
  ...GENERAL_ACHIEVEMENTS,
  ...FAMILY_ACHIEVEMENTS,
];

// Lookup maps for efficient access
export const ACHIEVEMENTS_BY_ID = new Map(ALL_ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENTS_BY_STAT_KEY = new Map<string, AchievementDef[]>();
export const ACHIEVEMENTS_BY_FAMILY_KEY = new Map<string, AchievementDef[]>();

for (const a of ALL_ACHIEVEMENTS) {
  if (a.statKey) {
    const list = ACHIEVEMENTS_BY_STAT_KEY.get(a.statKey) ?? [];
    list.push(a);
    ACHIEVEMENTS_BY_STAT_KEY.set(a.statKey, list);
  }
  if (a.familyKey) {
    const list = ACHIEVEMENTS_BY_FAMILY_KEY.get(a.familyKey) ?? [];
    list.push(a);
    ACHIEVEMENTS_BY_FAMILY_KEY.set(a.familyKey, list);
  }
}
```

**Step 2: Export from shared index**

Add to `packages/shared/src/index.ts`:
```typescript
export * from './constants/achievementDefinitions';
```

**Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

**Step 4: Commit**

```bash
git add packages/shared/src/constants/achievementDefinitions.ts packages/shared/src/index.ts
git commit -m "feat(shared): add all achievement definitions (~95 achievements)"
```

---

## Task 3: Database Schema Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add new models and Player field**

Add to the end of `schema.prisma` (after the last model):

```prisma
model PlayerStats {
  playerId               String   @id
  player                 Player   @relation(fields: [playerId], references: [id])
  totalKills             Int      @default(0)
  totalBossKills         Int      @default(0)
  totalBossDamage        Int      @default(0)
  totalPvpWins           Int      @default(0)
  bestPvpWinStreak       Int      @default(0)
  totalCrafts            Int      @default(0)
  totalRaresCrafted      Int      @default(0)
  totalEpicsCrafted      Int      @default(0)
  totalLegendariesCrafted Int     @default(0)
  totalSalvages          Int      @default(0)
  totalForgeUpgrades     Int      @default(0)
  totalGatheringActions  Int      @default(0)
  totalTurnsSpent        Int      @default(0)
  totalZonesDiscovered   Int      @default(0)
  totalZonesFullyExplored Int     @default(0)
  totalRecipesLearned    Int      @default(0)
  totalBestiaryCompleted Int      @default(0)
  totalUniqueMonsterKills Int     @default(0)
  totalDeaths            Int      @default(0)
  highestCharacterLevel  Int      @default(1)
  highestSkillLevel      Int      @default(1)
  updatedAt              DateTime @updatedAt
}

model PlayerFamilyStats {
  playerId    String
  mobFamilyId String
  kills       Int      @default(0)
  player      Player   @relation(fields: [playerId], references: [id])
  mobFamily   MobFamily @relation(fields: [mobFamilyId], references: [id])

  @@id([playerId, mobFamilyId])
}

model PlayerAchievement {
  playerId      String
  achievementId String
  unlockedAt    DateTime @default(now())
  rewardClaimed Boolean  @default(false)
  player        Player   @relation(fields: [playerId], references: [id])

  @@id([playerId, achievementId])
}
```

Add to the `Player` model (inside the model block, after existing fields):
```prisma
  activeTitle        String?
```

Add relation fields to the `Player` model:
```prisma
  stats              PlayerStats?
  familyStats        PlayerFamilyStats[]
  achievements       PlayerAchievement[]
```

Add relation field to the `MobFamily` model:
```prisma
  familyStats        PlayerFamilyStats[]
```

**Step 2: Generate Prisma client and create migration**

Run:
```bash
npx prisma migrate dev --name add_achievements_system --schema packages/database/prisma/schema.prisma
```
Expected: Migration created and applied successfully

**Step 3: Build database package**

Run: `npm run build --workspace=packages/database`
Expected: Clean build

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add PlayerStats, PlayerFamilyStats, PlayerAchievement models"
```

---

## Task 4: Stats Service

**Files:**
- Create: `apps/api/src/services/statsService.ts`
- Create: `apps/api/src/services/statsService.test.ts`

**Step 1: Write failing tests**

```typescript
// apps/api/src/services/statsService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
import { prisma } from '@adventure/database';
import { incrementStats, incrementFamilyKills, getOrCreateStats } from './statsService';

const mockPrisma = prisma as unknown as Record<string, any>;

describe('statsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateStats', () => {
    it('returns existing stats', async () => {
      const existing = { playerId: 'p1', totalKills: 5 };
      mockPrisma.playerStats.findUnique.mockResolvedValue(existing);

      const result = await getOrCreateStats('p1');
      expect(result).toEqual(existing);
    });

    it('creates stats row if not found', async () => {
      mockPrisma.playerStats.findUnique.mockResolvedValue(null);
      const created = { playerId: 'p1', totalKills: 0 };
      mockPrisma.playerStats.create.mockResolvedValue(created);

      const result = await getOrCreateStats('p1');
      expect(result).toEqual(created);
      expect(mockPrisma.playerStats.create).toHaveBeenCalledWith({
        data: { playerId: 'p1' },
      });
    });
  });

  describe('incrementStats', () => {
    it('upserts stats with increment values', async () => {
      const updated = { playerId: 'p1', totalKills: 6, totalTurnsSpent: 50 };
      mockPrisma.playerStats.upsert.mockResolvedValue(updated);

      const result = await incrementStats('p1', { totalKills: 1, totalTurnsSpent: 50 });
      expect(result).toEqual(updated);
      expect(mockPrisma.playerStats.upsert).toHaveBeenCalledWith({
        where: { playerId: 'p1' },
        create: { playerId: 'p1', totalKills: 1, totalTurnsSpent: 50 },
        update: { totalKills: { increment: 1 }, totalTurnsSpent: { increment: 50 } },
      });
    });
  });

  describe('incrementFamilyKills', () => {
    it('upserts family stats with kill increment', async () => {
      const updated = { playerId: 'p1', mobFamilyId: 'f1', kills: 5 };
      mockPrisma.playerFamilyStats.upsert.mockResolvedValue(updated);

      const result = await incrementFamilyKills('p1', 'f1', 1);
      expect(result).toEqual(updated);
      expect(mockPrisma.playerFamilyStats.upsert).toHaveBeenCalledWith({
        where: { playerId_mobFamilyId: { playerId: 'p1', mobFamilyId: 'f1' } },
        create: { playerId: 'p1', mobFamilyId: 'f1', kills: 1 },
        update: { kills: { increment: 1 } },
      });
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/services/statsService.test.ts`
Expected: FAIL — module not found

**Step 3: Implement stats service**

```typescript
// apps/api/src/services/statsService.ts
import { prisma } from '@adventure/database';

type StatsIncrements = Partial<Record<
  | 'totalKills' | 'totalBossKills' | 'totalBossDamage'
  | 'totalPvpWins' | 'totalCrafts' | 'totalRaresCrafted'
  | 'totalEpicsCrafted' | 'totalLegendariesCrafted'
  | 'totalSalvages' | 'totalForgeUpgrades'
  | 'totalGatheringActions' | 'totalTurnsSpent'
  | 'totalZonesDiscovered' | 'totalZonesFullyExplored'
  | 'totalRecipesLearned' | 'totalBestiaryCompleted'
  | 'totalUniqueMonsterKills' | 'totalDeaths',
  number
>>;

type StatsMaxValues = Partial<Record<
  'highestCharacterLevel' | 'highestSkillLevel' | 'bestPvpWinStreak',
  number
>>;

export async function getOrCreateStats(playerId: string) {
  const existing = await prisma.playerStats.findUnique({ where: { playerId } });
  if (existing) return existing;
  return prisma.playerStats.create({ data: { playerId } });
}

export async function incrementStats(playerId: string, increments: StatsIncrements) {
  const createData: Record<string, number> = {};
  const updateData: Record<string, { increment: number }> = {};

  for (const [key, value] of Object.entries(increments)) {
    if (value && value > 0) {
      createData[key] = value;
      updateData[key] = { increment: value };
    }
  }

  return prisma.playerStats.upsert({
    where: { playerId },
    create: { playerId, ...createData },
    update: updateData,
  });
}

export async function setStatsMax(playerId: string, maxValues: StatsMaxValues) {
  // For "highest" fields, we need to read-then-conditionally-update
  const stats = await getOrCreateStats(playerId);
  const updateData: Record<string, number> = {};

  for (const [key, value] of Object.entries(maxValues)) {
    if (value != null && value > (stats as Record<string, number>)[key]) {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) return stats;

  return prisma.playerStats.update({
    where: { playerId },
    data: updateData,
  });
}

export async function incrementFamilyKills(playerId: string, mobFamilyId: string, count = 1) {
  return prisma.playerFamilyStats.upsert({
    where: { playerId_mobFamilyId: { playerId, mobFamilyId } },
    create: { playerId, mobFamilyId, kills: count },
    update: { kills: { increment: count } },
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/services/statsService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/statsService.ts apps/api/src/services/statsService.test.ts
git commit -m "feat(api): add stats service for player stat tracking"
```

---

## Task 5: Achievement Service

**Files:**
- Create: `apps/api/src/services/achievementService.ts`
- Create: `apps/api/src/services/achievementService.test.ts`

**Step 1: Write failing tests**

```typescript
// apps/api/src/services/achievementService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
import { prisma } from '@adventure/database';
import { checkAchievements, claimReward, setActiveTitle, getPlayerAchievements } from './achievementService';

const mockPrisma = prisma as unknown as Record<string, any>;

describe('achievementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAchievements', () => {
    it('returns empty when no achievements are newly met', async () => {
      mockPrisma.playerStats.findUnique.mockResolvedValue({ playerId: 'p1', totalKills: 5 });
      mockPrisma.playerFamilyStats.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result).toEqual([]);
    });

    it('unlocks achievement when threshold met', async () => {
      mockPrisma.playerStats.findUnique.mockResolvedValue({ playerId: 'p1', totalKills: 100 });
      mockPrisma.playerFamilyStats.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.create.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_100',
        rewardClaimed: false,
      });

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBe('combat_kills_100');
    });

    it('skips already-unlocked achievements', async () => {
      mockPrisma.playerStats.findUnique.mockResolvedValue({ playerId: 'p1', totalKills: 100 });
      mockPrisma.playerFamilyStats.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.findMany.mockResolvedValue([
        { playerId: 'p1', achievementId: 'combat_kills_100', rewardClaimed: false },
      ]);

      const result = await checkAchievements('p1', { statKeys: ['totalKills'] });
      expect(result).toEqual([]);
    });

    it('checks family achievements when familyId provided', async () => {
      mockPrisma.playerStats.findUnique.mockResolvedValue({ playerId: 'p1', totalKills: 1 });
      mockPrisma.playerFamilyStats.findMany.mockResolvedValue([
        { playerId: 'p1', mobFamilyId: 'wolves-id', kills: 100 },
      ]);
      // Mock MobFamily lookup to resolve familyId -> familyKey
      mockPrisma.mobFamily.findUnique.mockResolvedValue({ id: 'wolves-id', name: 'Wolves' });
      mockPrisma.playerAchievement.findMany.mockResolvedValue([]);
      mockPrisma.playerAchievement.create.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'family_wolves_100',
        rewardClaimed: false,
      });

      const result = await checkAchievements('p1', { statKeys: ['totalKills'], familyId: 'wolves-id' });
      expect(result.some((a) => a.id === 'family_wolves_100')).toBe(true);
    });
  });

  describe('claimReward', () => {
    it('marks achievement as claimed and returns rewards', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: false,
      });
      mockPrisma.playerAchievement.update.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: true,
      });
      mockPrisma.player.update.mockResolvedValue({});

      const result = await claimReward('p1', 'combat_kills_1000');
      expect(result.success).toBe(true);
      expect(result.rewards).toBeDefined();
    });

    it('throws if achievement not unlocked', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue(null);

      await expect(claimReward('p1', 'combat_kills_1000')).rejects.toThrow();
    });

    it('throws if reward already claimed', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_1000',
        rewardClaimed: true,
      });

      await expect(claimReward('p1', 'combat_kills_1000')).rejects.toThrow();
    });
  });

  describe('setActiveTitle', () => {
    it('sets active title from unlocked achievement', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue({
        playerId: 'p1',
        achievementId: 'combat_kills_500',
      });
      mockPrisma.player.update.mockResolvedValue({ activeTitle: 'combat_kills_500' });

      const result = await setActiveTitle('p1', 'combat_kills_500');
      expect(result.activeTitle).toBe('combat_kills_500');
    });

    it('clears title when null passed', async () => {
      mockPrisma.player.update.mockResolvedValue({ activeTitle: null });

      const result = await setActiveTitle('p1', null);
      expect(result.activeTitle).toBeNull();
    });

    it('throws if achievement not unlocked', async () => {
      mockPrisma.playerAchievement.findUnique.mockResolvedValue(null);

      await expect(setActiveTitle('p1', 'combat_kills_500')).rejects.toThrow();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/services/achievementService.test.ts`
Expected: FAIL — module not found

**Step 3: Implement achievement service**

```typescript
// apps/api/src/services/achievementService.ts
import { prisma } from '@adventure/database';
import {
  ALL_ACHIEVEMENTS,
  ACHIEVEMENTS_BY_STAT_KEY,
  ACHIEVEMENTS_BY_FAMILY_KEY,
  ACHIEVEMENTS_BY_ID,
} from '@adventure/shared';
import type { AchievementDef, PlayerAchievementProgress } from '@adventure/shared';

// Maps MobFamily DB name to the family key used in achievement definitions
const FAMILY_NAME_TO_KEY: Record<string, string> = {
  'Vermin': 'vermin', 'Spiders': 'spiders', 'Boars': 'boars',
  'Wolves': 'wolves', 'Bandits': 'bandits', 'Treants': 'treants',
  'Spirits': 'spirits', 'Fae': 'fae', 'Bats': 'bats',
  'Goblins': 'goblins', 'Golems': 'golems', 'Crawlers': 'crawlers',
  'Harpies': 'harpies', 'Undead': 'undead', 'Swamp Beasts': 'swampBeasts',
  'Witches': 'witches', 'Elementals': 'elementals', 'Serpents': 'serpents',
  'Abominations': 'abominations',
};

interface CheckOptions {
  statKeys?: string[];
  familyId?: string;
}

export async function checkAchievements(
  playerId: string,
  options: CheckOptions,
): Promise<AchievementDef[]> {
  // Load player state
  const [stats, familyStats, unlocked] = await Promise.all([
    prisma.playerStats.findUnique({ where: { playerId } }),
    prisma.playerFamilyStats.findMany({ where: { playerId } }),
    prisma.playerAchievement.findMany({ where: { playerId }, select: { achievementId: true } }),
  ]);

  if (!stats) return [];

  const unlockedSet = new Set(unlocked.map((u) => u.achievementId));
  const familyKillMap = new Map(familyStats.map((f) => [f.mobFamilyId, f.kills]));

  // Collect candidate achievements to check
  const candidates: AchievementDef[] = [];

  if (options.statKeys) {
    for (const key of options.statKeys) {
      const matching = ACHIEVEMENTS_BY_STAT_KEY.get(key) ?? [];
      candidates.push(...matching);
    }
  }

  if (options.familyId) {
    // Resolve DB family ID to family key
    const family = await prisma.mobFamily.findUnique({ where: { id: options.familyId } });
    if (family) {
      const familyKey = FAMILY_NAME_TO_KEY[family.name];
      if (familyKey) {
        const matching = ACHIEVEMENTS_BY_FAMILY_KEY.get(familyKey) ?? [];
        candidates.push(...matching);
      }
    }
  }

  // Check each candidate
  const newlyUnlocked: AchievementDef[] = [];

  for (const achievement of candidates) {
    if (unlockedSet.has(achievement.id)) continue;

    let progress = 0;
    if (achievement.statKey) {
      progress = (stats as Record<string, number>)[achievement.statKey] ?? 0;
    } else if (achievement.familyKey && options.familyId) {
      progress = familyKillMap.get(options.familyId) ?? 0;
    }

    if (progress >= achievement.threshold) {
      await prisma.playerAchievement.create({
        data: { playerId, achievementId: achievement.id },
      });
      newlyUnlocked.push(achievement);
      unlockedSet.add(achievement.id);
    }
  }

  return newlyUnlocked;
}

export async function getPlayerAchievements(playerId: string): Promise<{
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
}> {
  const [stats, familyStats, unlocked] = await Promise.all([
    prisma.playerStats.findUnique({ where: { playerId } }),
    prisma.playerFamilyStats.findMany({ where: { playerId } }),
    prisma.playerAchievement.findMany({ where: { playerId } }),
  ]);

  // Build family kill map by family key (need to resolve IDs)
  const families = await prisma.mobFamily.findMany({ select: { id: true, name: true } });
  const familyIdToKey = new Map<string, string>();
  for (const f of families) {
    const key = FAMILY_NAME_TO_KEY[f.name];
    if (key) familyIdToKey.set(f.id, key);
  }
  const familyKillsByKey = new Map<string, number>();
  for (const fs of familyStats) {
    const key = familyIdToKey.get(fs.mobFamilyId);
    if (key) familyKillsByKey.set(key, fs.kills);
  }

  const unlockedMap = new Map(unlocked.map((u) => [u.achievementId, u]));
  let unclaimedCount = 0;

  const achievements: PlayerAchievementProgress[] = ALL_ACHIEVEMENTS.map((def) => {
    const playerAch = unlockedMap.get(def.id);
    const isUnlocked = !!playerAch;

    if (isUnlocked && !playerAch.rewardClaimed && def.rewards?.length) {
      unclaimedCount++;
    }

    // Calculate progress
    let progress = 0;
    if (def.statKey && stats) {
      progress = (stats as Record<string, number>)[def.statKey] ?? 0;
    } else if (def.familyKey) {
      progress = familyKillsByKey.get(def.familyKey) ?? 0;
    }

    // Secret achievements hide title/description when not unlocked
    const title = def.secret && !isUnlocked ? '???' : def.title;
    const description = def.secret && !isUnlocked ? '???' : def.description;

    return {
      id: def.id,
      category: def.category,
      title,
      description,
      titleReward: isUnlocked ? def.titleReward : undefined,
      threshold: def.threshold,
      secret: def.secret,
      tier: def.tier,
      progress: Math.min(progress, def.threshold),
      unlocked: isUnlocked,
      unlockedAt: playerAch?.unlockedAt?.toISOString(),
      rewardClaimed: playerAch?.rewardClaimed,
      rewards: def.rewards,
    };
  });

  return { achievements, unclaimedCount };
}

export async function claimReward(playerId: string, achievementId: string) {
  const def = ACHIEVEMENTS_BY_ID.get(achievementId);
  if (!def) throw new Error('Unknown achievement');

  const playerAch = await prisma.playerAchievement.findUnique({
    where: { playerId_achievementId: { playerId, achievementId } },
  });

  if (!playerAch) throw new Error('Achievement not unlocked');
  if (playerAch.rewardClaimed) throw new Error('Reward already claimed');

  // Mark as claimed
  await prisma.playerAchievement.update({
    where: { playerId_achievementId: { playerId, achievementId } },
    data: { rewardClaimed: true },
  });

  // Grant rewards
  const rewards = def.rewards ?? [];
  for (const reward of rewards) {
    switch (reward.type) {
      case 'attribute_points':
        await prisma.player.update({
          where: { id: playerId },
          data: { attributePoints: { increment: reward.amount } },
        });
        break;
      case 'turns':
        // Add turns to turn bank
        await prisma.turnBank.update({
          where: { playerId },
          data: { currentTurns: { increment: reward.amount } },
        });
        break;
      case 'item':
        if (reward.itemTemplateId) {
          // Grant the item to the player's inventory
          const template = await prisma.itemTemplate.findUnique({
            where: { id: reward.itemTemplateId },
          });
          if (template) {
            await prisma.item.create({
              data: {
                playerId,
                templateId: reward.itemTemplateId,
                rarity: 'legendary',
                quantity: reward.amount,
              },
            });
          }
        }
        break;
    }
  }

  return { success: true, rewards };
}

export async function setActiveTitle(playerId: string, achievementId: string | null) {
  if (achievementId) {
    const def = ACHIEVEMENTS_BY_ID.get(achievementId);
    if (!def?.titleReward) throw new Error('Achievement has no title reward');

    const playerAch = await prisma.playerAchievement.findUnique({
      where: { playerId_achievementId: { playerId, achievementId } },
    });
    if (!playerAch) throw new Error('Achievement not unlocked');
  }

  const player = await prisma.player.update({
    where: { id: playerId },
    data: { activeTitle: achievementId },
    select: { activeTitle: true },
  });

  return player;
}

export async function getUnclaimedCount(playerId: string): Promise<number> {
  const unlocked = await prisma.playerAchievement.findMany({
    where: { playerId, rewardClaimed: false },
    select: { achievementId: true },
  });

  // Only count achievements that have rewards
  return unlocked.filter((u) => {
    const def = ACHIEVEMENTS_BY_ID.get(u.achievementId);
    return def?.rewards?.length;
  }).length;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/api/src/services/achievementService.test.ts`
Expected: PASS (adjust mocks as needed for Prisma model names)

**Step 5: Commit**

```bash
git add apps/api/src/services/achievementService.ts apps/api/src/services/achievementService.test.ts
git commit -m "feat(api): add achievement service with check, claim, and title management"
```

---

## Task 6: Achievement Routes

**Files:**
- Create: `apps/api/src/routes/achievements.ts`
- Modify: `apps/api/src/index.ts` (add route registration)

**Step 1: Create achievement routes**

```typescript
// apps/api/src/routes/achievements.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getPlayerAchievements,
  claimReward,
  setActiveTitle,
  getUnclaimedCount,
} from '../services/achievementService';

export const achievementsRouter = Router();
achievementsRouter.use(authenticate);

// GET /achievements — all definitions + player progress
achievementsRouter.get('/', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const result = await getPlayerAchievements(playerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /achievements/unclaimed-count — just the count for badge
achievementsRouter.get('/unclaimed-count', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const count = await getUnclaimedCount(playerId);
    res.json({ unclaimedCount: count });
  } catch (err) {
    next(err);
  }
});

// POST /achievements/:id/claim — claim rewards
achievementsRouter.post('/:id/claim', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const { id } = req.params;
    const result = await claimReward(playerId, id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /achievements/title — get active title
achievementsRouter.get('/title', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const player = await (await import('@adventure/database')).prisma.player.findUnique({
      where: { id: playerId },
      select: { activeTitle: true },
    });
    res.json({ activeTitle: player?.activeTitle ?? null });
  } catch (err) {
    next(err);
  }
});

// PUT /achievements/title — set active title
achievementsRouter.put('/title', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const { achievementId } = req.body;
    const result = await setActiveTitle(playerId, achievementId ?? null);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
```

**Step 2: Register route in API index**

Add import and registration in `apps/api/src/index.ts`:

Import (with existing imports):
```typescript
import { achievementsRouter } from './routes/achievements';
```

Registration (with existing routes):
```typescript
app.use('/api/v1/achievements', achievementsRouter);
```

**Step 3: Build API to verify compilation**

Run: `npm run build:api`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/api/src/routes/achievements.ts apps/api/src/index.ts
git commit -m "feat(api): add achievement REST endpoints"
```

---

## Task 7: Hook Combat Routes

Hook stat tracking and achievement checking into `combat.ts`, `exploration.ts`, and `zones.ts` — the three places where mob kills happen.

**Files:**
- Modify: `apps/api/src/routes/combat.ts`
- Modify: `apps/api/src/routes/exploration.ts`
- Modify: `apps/api/src/routes/zones.ts`

**Step 1: Hook into combat.ts**

Add imports at top of `apps/api/src/routes/combat.ts`:
```typescript
import { incrementStats, incrementFamilyKills, setStatsMax } from '../services/statsService';
import { checkAchievements } from '../services/achievementService';
```

After the bestiary upsert block (after line ~706 in POST /start, where bestiary prefix upsert completes) and before the activity log creation, add:

```typescript
    // --- Achievement stat tracking ---
    const statsToIncrement: Record<string, number> = { totalKills: 1, totalTurnsSpent: turnCost };
    // Check if this was a new unique monster (first kill)
    if (bestiaryEntry?.kills === 1) {
      statsToIncrement.totalUniqueMonsterKills = 1;
    }
    await incrementStats(playerId, statsToIncrement);

    // Increment family kills if mob has a family
    let mobFamilyId: string | undefined;
    if (prefixedMob.familyId) {
      mobFamilyId = prefixedMob.familyId;
      await incrementFamilyKills(playerId, mobFamilyId);
    }

    // Check for skill level achievements
    if (xpGrant.newLevel) {
      await setStatsMax(playerId, { highestSkillLevel: xpGrant.newLevel });
    }
    if (xpGrant.characterLevelAfter) {
      await setStatsMax(playerId, { highestCharacterLevel: xpGrant.characterLevelAfter });
    }

    // Check achievements
    const achievementKeys = ['totalKills', 'totalUniqueMonsterKills'];
    if (xpGrant.newLevel) achievementKeys.push('highestSkillLevel');
    if (xpGrant.characterLeveledUp) achievementKeys.push('highestCharacterLevel');
    const newAchievements = await checkAchievements(playerId, {
      statKeys: achievementKeys,
      familyId: mobFamilyId,
    });
```

For combat defeat (knockout), after the enterRecoveringState call, add:
```typescript
    await incrementStats(playerId, { totalDeaths: 1 });
    const deathAchievements = await checkAchievements(playerId, { statKeys: ['totalDeaths'] });
    newAchievements.push(...deathAchievements);
```

Include `newAchievements` in the activity log result JSON and the response body.

**Step 2: Hook into exploration.ts**

Add same imports. After the persistence transaction (after the exploration event processing), add stat increments for:
- `totalTurnsSpent` (turns spent exploring)
- `totalKills` (for ambush kills)
- `totalUniqueMonsterKills` (for new bestiary entries from ambushes)
- `totalZonesDiscovered` (for zone exits found)
- Zone family kills via `incrementFamilyKills`

Check achievements with the relevant stat keys.

**Step 3: Hook into zones.ts**

Add same imports. After travel processing:
- `totalTurnsSpent` (travel turn cost)
- `totalKills` (for travel ambush kills)
- `totalZonesDiscovered` (for newly discovered zones from towns)
- Family kills for travel ambush kills

Check achievements with the relevant stat keys.

**Step 4: Build API to verify compilation**

Run: `npm run build:api`
Expected: Clean build

**Step 5: Commit**

```bash
git add apps/api/src/routes/combat.ts apps/api/src/routes/exploration.ts apps/api/src/routes/zones.ts
git commit -m "feat(api): hook achievement tracking into combat, exploration, and travel routes"
```

---

## Task 8: Hook Crafting & Gathering Routes

**Files:**
- Modify: `apps/api/src/routes/crafting.ts`
- Modify: `apps/api/src/routes/gathering.ts`

**Step 1: Hook into crafting.ts**

Add imports at top:
```typescript
import { incrementStats, setStatsMax } from '../services/statsService';
import { checkAchievements } from '../services/achievementService';
```

In POST /craft, after XP grant (after line ~536):
```typescript
    const craftStatsIncrement: Record<string, number> = {
      totalCrafts: quantity,
      totalTurnsSpent: totalTurnCost,
    };
    // Count by rarity
    for (const item of craftedItemDetails) {
      if (item.rarity === 'rare') craftStatsIncrement.totalRaresCrafted = (craftStatsIncrement.totalRaresCrafted ?? 0) + 1;
      if (item.rarity === 'epic') craftStatsIncrement.totalEpicsCrafted = (craftStatsIncrement.totalEpicsCrafted ?? 0) + 1;
      if (item.rarity === 'legendary') craftStatsIncrement.totalLegendariesCrafted = (craftStatsIncrement.totalLegendariesCrafted ?? 0) + 1;
    }
    await incrementStats(playerId, craftStatsIncrement);
    if (xpGrant.newLevel) await setStatsMax(playerId, { highestSkillLevel: xpGrant.newLevel });
    if (xpGrant.characterLevelAfter) await setStatsMax(playerId, { highestCharacterLevel: xpGrant.characterLevelAfter });

    const craftAchievementKeys = ['totalCrafts', 'totalRaresCrafted', 'totalEpicsCrafted', 'totalLegendariesCrafted'];
    if (xpGrant.newLevel) craftAchievementKeys.push('highestSkillLevel');
    if (xpGrant.characterLeveledUp) craftAchievementKeys.push('highestCharacterLevel');
    const newAchievements = await checkAchievements(playerId, { statKeys: craftAchievementKeys });
```

In POST /forge/upgrade, after the upgrade/destroy result:
```typescript
    await incrementStats(playerId, { totalForgeUpgrades: 1 });
    const forgeAchievements = await checkAchievements(playerId, { statKeys: ['totalForgeUpgrades'] });
```

In POST /salvage, after the salvage transaction:
```typescript
    await incrementStats(playerId, { totalSalvages: 1 });
    const salvageAchievements = await checkAchievements(playerId, { statKeys: ['totalSalvages'] });
```

**Step 2: Hook into gathering.ts**

Add imports at top:
```typescript
import { incrementStats, setStatsMax } from '../services/statsService';
import { checkAchievements } from '../services/achievementService';
```

In POST /mine, after XP grant (after line ~347):
```typescript
    await incrementStats(playerId, {
      totalGatheringActions: actions,
      totalTurnsSpent: turnsSpent,
    });
    if (xpGrant.newLevel) await setStatsMax(playerId, { highestSkillLevel: xpGrant.newLevel });
    if (xpGrant.characterLevelAfter) await setStatsMax(playerId, { highestCharacterLevel: xpGrant.characterLevelAfter });

    const gatherAchievementKeys = ['totalGatheringActions'];
    if (xpGrant.newLevel) gatherAchievementKeys.push('highestSkillLevel');
    if (xpGrant.characterLeveledUp) gatherAchievementKeys.push('highestCharacterLevel');
    const newAchievements = await checkAchievements(playerId, { statKeys: gatherAchievementKeys });
```

**Step 3: Build API to verify compilation**

Run: `npm run build:api`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/api/src/routes/crafting.ts apps/api/src/routes/gathering.ts
git commit -m "feat(api): hook achievement tracking into crafting and gathering routes"
```

---

## Task 9: Hook PvP, Boss, and Other Routes

**Files:**
- Modify: `apps/api/src/routes/pvp.ts`
- Modify: `apps/api/src/services/bossEncounterService.ts` or `apps/api/src/services/bossLootService.ts`
- Modify: `apps/api/src/services/xpService.ts` (for level-up stat tracking)

**Step 1: Hook into pvp.ts**

After the `challenge()` call returns:
```typescript
    if (result.winnerId === playerId) {
      await incrementStats(playerId, { totalPvpWins: 1 });
      await setStatsMax(playerId, { bestPvpWinStreak: result.winStreak });
      const pvpAchievements = await checkAchievements(playerId, {
        statKeys: ['totalPvpWins', 'bestPvpWinStreak'],
      });
    }
```

**Step 2: Hook into boss loot distribution**

In `bossLootService.ts` `distributeBossLoot()`, after each contributor's loot is granted:
```typescript
    await incrementStats(contributor.playerId, {
      totalBossKills: 1,
      totalBossDamage: contributor.totalDamage,
    });
    const bossAchievements = await checkAchievements(contributor.playerId, {
      statKeys: ['totalBossKills', 'totalBossDamage'],
      familyId: mobFamilyId,
    });
```

**Step 3: Hook recipe learning**

Find where recipes are learned (likely in `crafting.ts` or `exploration.ts` chest rewards). After a recipe is granted:
```typescript
    await incrementStats(playerId, { totalRecipesLearned: 1 });
    await checkAchievements(playerId, { statKeys: ['totalRecipesLearned'] });
```

**Step 4: Hook zone full exploration**

In `zoneExplorationService.ts` or wherever a zone is marked fully explored, add:
```typescript
    await incrementStats(playerId, { totalZonesFullyExplored: 1 });
    await checkAchievements(playerId, { statKeys: ['totalZonesFullyExplored'] });
```

**Step 5: Build API to verify compilation**

Run: `npm run build:api`
Expected: Clean build

**Step 6: Commit**

```bash
git add apps/api/src/routes/pvp.ts apps/api/src/services/bossLootService.ts apps/api/src/services/bossEncounterService.ts
git commit -m "feat(api): hook achievement tracking into PvP, boss, recipe, and exploration routes"
```

---

## Task 10: Frontend API Functions

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Step 1: Add achievement API functions**

Add these functions to `apps/web/src/lib/api.ts`:

```typescript
// --- Achievements ---

export interface AchievementRewardResponse {
  type: 'xp' | 'turns' | 'attribute_points' | 'item';
  amount: number;
  itemTemplateId?: string;
}

export interface PlayerAchievementProgress {
  id: string;
  category: string;
  title: string;
  description: string;
  titleReward?: string;
  threshold: number;
  secret?: boolean;
  tier?: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
  rewardClaimed?: boolean;
  rewards?: AchievementRewardResponse[];
}

export interface AchievementsResponse {
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
}

export async function getAchievements() {
  return fetchApi<AchievementsResponse>('/api/v1/achievements');
}

export async function getAchievementUnclaimedCount() {
  return fetchApi<{ unclaimedCount: number }>('/api/v1/achievements/unclaimed-count');
}

export async function claimAchievementReward(achievementId: string) {
  return fetchApi<{ success: boolean; rewards: AchievementRewardResponse[] }>(
    `/api/v1/achievements/${achievementId}/claim`,
    { method: 'POST' },
  );
}

export async function getActiveTitle() {
  return fetchApi<{ activeTitle: string | null }>('/api/v1/achievements/title');
}

export async function setActiveTitle(achievementId: string | null) {
  return fetchApi<{ activeTitle: string | null }>('/api/v1/achievements/title', {
    method: 'PUT',
    body: JSON.stringify({ achievementId }),
  });
}
```

**Step 2: Build web to verify compilation**

Run: `npm run build:web`
Expected: Clean build

**Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(web): add achievement API client functions"
```

---

## Task 11: AchievementsScreen Component

**Files:**
- Create: `apps/web/src/components/screens/Achievements.tsx`

**Step 1: Create the Achievements screen**

Follow the `Bestiary.tsx` pattern — props-based, category filter tabs, achievement cards with progress bars, claim button, title selector.

```typescript
// apps/web/src/components/screens/Achievements.tsx
'use client';

import { useState } from 'react';
import { PixelCard, PixelButton, StatBar } from '../';
import type { PlayerAchievementProgress, AchievementRewardResponse } from '../../lib/api';

interface AchievementsProps {
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
  activeTitle: string | null;
  onClaim: (achievementId: string) => Promise<void>;
  onSetTitle: (achievementId: string | null) => Promise<void>;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'combat', label: 'Combat' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'skills', label: 'Skills' },
  { id: 'gathering', label: 'Gathering' },
  { id: 'bestiary', label: 'Bestiary' },
  { id: 'general', label: 'General' },
  { id: 'family', label: 'Families' },
];

function RewardBadge({ reward }: { reward: AchievementRewardResponse }) {
  switch (reward.type) {
    case 'attribute_points': return <span className="text-xs text-[var(--rpg-gold)]">+{reward.amount} attr pt{reward.amount > 1 ? 's' : ''}</span>;
    case 'turns': return <span className="text-xs text-[var(--rpg-blue-light)]">+{reward.amount.toLocaleString()} turns</span>;
    case 'item': return <span className="text-xs text-[var(--rpg-purple)]">Unique item</span>;
    case 'xp': return <span className="text-xs text-[var(--rpg-green-light)]">+{reward.amount} XP</span>;
    default: return null;
  }
}

export function Achievements({ achievements, unclaimedCount, activeTitle, onClaim, onSetTitle }: AchievementsProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const filtered = activeCategory === 'all'
    ? achievements
    : achievements.filter((a) => a.category === activeCategory);

  // Sort: unclaimed first, then in-progress, then locked
  const sorted = [...filtered].sort((a, b) => {
    if (a.unlocked && !a.rewardClaimed && a.rewards?.length) return -1;
    if (b.unlocked && !b.rewardClaimed && b.rewards?.length) return 1;
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    return (b.progress / b.threshold) - (a.progress / a.threshold);
  });

  const handleClaim = async (id: string) => {
    setClaimingId(id);
    try { await onClaim(id); } finally { setClaimingId(null); }
  };

  // Collect unlocked titles for title selector
  const unlockedTitles = achievements.filter((a) => a.unlocked && a.titleReward);

  return (
    <div className="space-y-4">
      {/* Title selector */}
      {unlockedTitles.length > 0 && (
        <PixelCard padding="sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[var(--rpg-text-secondary)]">Active title:</span>
            <button
              onClick={() => onSetTitle(null)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                !activeTitle
                  ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                  : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
              }`}
            >
              None
            </button>
            {unlockedTitles.map((a) => (
              <button
                key={a.id}
                onClick={() => onSetTitle(a.id)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  activeTitle === a.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
                }`}
              >
                {a.titleReward}
              </button>
            ))}
          </div>
        </PixelCard>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Achievement cards */}
      <div className="space-y-2">
        {sorted.map((achievement) => {
          const isClaimable = achievement.unlocked && !achievement.rewardClaimed && (achievement.rewards?.length ?? 0) > 0;
          const isClaiming = claimingId === achievement.id;

          return (
            <PixelCard key={achievement.id} padding="sm">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {achievement.unlocked && (
                        <span className="text-[var(--rpg-green-light)]">✓</span>
                      )}
                      <span className={`font-medium ${
                        achievement.unlocked
                          ? 'text-[var(--rpg-gold)]'
                          : 'text-[var(--rpg-text-primary)]'
                      }`}>
                        {achievement.title}
                      </span>
                      {achievement.titleReward && achievement.unlocked && (
                        <span className="text-xs text-[var(--rpg-purple)] italic">
                          &quot;{achievement.titleReward}&quot;
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--rpg-text-secondary)]">
                      {achievement.description}
                    </p>
                  </div>
                  {isClaimable && (
                    <PixelButton
                      variant="gold"
                      size="sm"
                      onClick={() => handleClaim(achievement.id)}
                      disabled={isClaiming}
                    >
                      {isClaiming ? '...' : 'Claim'}
                    </PixelButton>
                  )}
                </div>

                {/* Progress bar */}
                {!achievement.unlocked && (
                  <StatBar
                    current={achievement.progress}
                    max={achievement.threshold}
                    color="xp"
                    size="sm"
                    showNumbers
                  />
                )}

                {/* Rewards */}
                {achievement.rewards && achievement.rewards.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {achievement.rewards.map((r, i) => (
                      <RewardBadge key={i} reward={r} />
                    ))}
                  </div>
                )}
              </div>
            </PixelCard>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-center text-[var(--rpg-text-secondary)] py-8">
            No achievements in this category
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Export from screens barrel**

Add to `apps/web/src/components/screens/index.ts`:
```typescript
export { Achievements } from './Achievements';
```

**Step 3: Build web to verify compilation**

Run: `npm run build:web`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Achievements.tsx apps/web/src/components/screens/index.ts
git commit -m "feat(web): add AchievementsScreen component with category filters and progress bars"
```

---

## Task 12: Toast Notification Component

**Files:**
- Create: `apps/web/src/components/AchievementToast.tsx`

**Step 1: Create toast component**

```typescript
// apps/web/src/components/AchievementToast.tsx
'use client';

import { useEffect, useState } from 'react';

interface Toast {
  id: string;
  title: string;
  category: string;
}

export function AchievementToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Expose a global function for adding toasts (called by socket handler)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__showAchievementToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__showAchievementToast;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg px-4 py-3 shadow-lg animate-[fadeIn_0.3s_ease-out] min-w-[250px]"
        >
          <div className="flex items-center gap-2">
            <span className="text-[var(--rpg-gold)] text-lg">🏆</span>
            <div>
              <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
                Achievement Unlocked
              </p>
              <p className="text-sm font-medium text-[var(--rpg-gold)]">
                {toast.title}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

Note: The toast is triggered by the socket handler in `useGameController`. When the server emits an `achievement_unlocked` event, the controller calls `window.__showAchievementToast()`.

**Step 2: Build web to verify compilation**

Run: `npm run build:web`
Expected: Clean build

**Step 3: Commit**

```bash
git add apps/web/src/components/AchievementToast.tsx
git commit -m "feat(web): add achievement toast notification component"
```

---

## Task 13: Game Controller & Navigation Integration

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Update Screen type and controller**

In `useGameController.ts`:

1. Add `'achievements'` to the `Screen` type union (line ~34)
2. Add `'achievements'` to the `getActiveTab()` home group (line ~685): `['home', 'skills', 'zones', 'bestiary', 'rest', 'worldEvents', 'achievements']`
3. Add state for achievement data:

```typescript
const [achievementData, setAchievementData] = useState<AchievementsResponse | null>(null);
const [achievementUnclaimedCount, setAchievementUnclaimedCount] = useState(0);
const [activeTitle, setActiveTitleState] = useState<string | null>(null);
```

4. Add load functions:

```typescript
const loadAchievements = async () => {
  const res = await getAchievements();
  if (res.data) {
    setAchievementData(res.data);
    setAchievementUnclaimedCount(res.data.unclaimedCount);
  }
};

const loadAchievementUnclaimedCount = async () => {
  const res = await getAchievementUnclaimedCount();
  if (res.data) setAchievementUnclaimedCount(res.data.unclaimedCount);
};
```

5. Call `loadAchievementUnclaimedCount()` in `loadAll()` and set up polling (60s interval, same pattern as PvP notifications)

6. Add handler functions:

```typescript
const handleClaimAchievement = async (achievementId: string) => {
  const res = await claimAchievementReward(achievementId);
  if (res.data) {
    await loadAchievements();
    await loadAll(); // Refresh player data (attribute points may have changed)
  }
};

const handleSetActiveTitle = async (achievementId: string | null) => {
  const res = await setActiveTitle(achievementId);
  if (res.data) {
    setActiveTitleState(res.data.activeTitle);
  }
};
```

7. Expose in return object: `achievementData`, `achievementUnclaimedCount`, `activeTitle`, `handleClaimAchievement`, `handleSetActiveTitle`, `loadAchievements`

**Step 2: Update page.tsx navigation**

In `page.tsx`:

1. Add Achievements sub-tab in the home tab group (line ~823-843). Add after "Events":
```typescript
{ id: 'achievements', label: 'Achievements', badge: achievementUnclaimedCount },
```

Add badge rendering (same pattern as Arena tab, line ~889-913):
```typescript
{tab.badge > 0 && (
  <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-[var(--rpg-red)] text-white font-bold">
    {tab.badge}
  </span>
)}
```

2. Add `case 'achievements'` to `renderScreen()`:
```typescript
case 'achievements':
  return (
    <Achievements
      achievements={achievementData?.achievements ?? []}
      unclaimedCount={achievementUnclaimedCount}
      activeTitle={activeTitle}
      onClaim={handleClaimAchievement}
      onSetTitle={handleSetActiveTitle}
    />
  );
```

3. Load achievements data when navigating to the tab:
```typescript
// In the screen switching logic or useEffect
if (activeScreen === 'achievements' && !achievementData) {
  loadAchievements();
}
```

4. Add `<AchievementToast />` to the page layout (render once at the top level).

**Step 3: Build web to verify compilation**

Run: `npm run build:web`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx
git commit -m "feat(web): integrate achievements tab into game navigation with badge and toast"
```

---

## Task 14: Socket Events for Real-Time Toast

**Files:**
- Modify: `apps/api/src/routes/combat.ts` (and other hooked routes) — emit socket event on unlock
- Modify: `apps/web/src/app/game/useGameController.ts` — listen for socket events

**Step 1: Server-side socket emission**

In each route where `checkAchievements()` is called, after getting `newAchievements`:
```typescript
if (newAchievements.length > 0) {
  // Activity log entry
  for (const ach of newAchievements) {
    await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'achievement',
        turnsSpent: 0,
        result: { achievementId: ach.id, title: ach.title } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Socket emit for toast (if socket is available)
  const io = req.app.get('io');
  if (io) {
    for (const ach of newAchievements) {
      io.to(playerId).emit('achievement_unlocked', {
        id: ach.id,
        title: ach.title,
        category: ach.category,
      });
    }
  }
}
```

Note: This requires Socket.IO `io` instance to be stored on the Express app via `app.set('io', io)` in the server setup. If Socket.IO is already set up for chat, this should already exist. If not, this can be added to the API index.ts where the server is created.

**Step 2: Client-side socket listener**

In `useGameController.ts`, add a `useEffect` for socket events:
```typescript
useEffect(() => {
  const socket = getSocket();
  if (!socket) return;

  const handleAchievementUnlocked = (data: { id: string; title: string; category: string }) => {
    // Show toast
    const showToast = (window as unknown as Record<string, any>).__showAchievementToast;
    if (showToast) showToast(data);

    // Add to activity log
    pushLog({
      timestamp: new Date().toISOString(),
      message: `Achievement unlocked: ${data.title}!`,
      type: 'success',
    });

    // Refresh unclaimed count
    void loadAchievementUnclaimedCount();
  };

  socket.on('achievement_unlocked', handleAchievementUnlocked);
  return () => { socket.off('achievement_unlocked', handleAchievementUnlocked); };
}, []);
```

**Step 3: Build both**

Run: `npm run build:api && npm run build:web`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/api/src/routes/combat.ts apps/api/src/routes/crafting.ts apps/api/src/routes/gathering.ts apps/api/src/routes/exploration.ts apps/api/src/routes/zones.ts apps/api/src/routes/pvp.ts apps/web/src/app/game/useGameController.ts
git commit -m "feat: add real-time achievement toast via socket events"
```

---

## Task 15: Family Reward Item Templates (Seed Data)

**Files:**
- Create: `packages/database/prisma/seed-data/achievementItems.ts`
- Modify: `packages/database/prisma/seed.ts`

**Step 1: Create achievement item templates**

Create 19 unique item templates for family rewards. These are achievement-exclusive legendary items.

```typescript
// packages/database/prisma/seed-data/achievementItems.ts
export const ACHIEVEMENT_ITEM_TEMPLATES = [
  {
    id: 'achievement_vermin_gloves',
    name: "Ratcatcher's Gloves",
    type: 'gloves',
    description: 'Worn leather gloves stained with the blood of a thousand vermin.',
    levelRequirement: 1,
    baseStats: { attack: 5, speed: 10 },
    rarity: 'legendary',
  },
  {
    id: 'achievement_spiders_boots',
    name: 'Venomweave Boots',
    type: 'boots',
    description: 'Boots woven from spider silk, light as air.',
    levelRequirement: 1,
    baseStats: { evasion: 12, speed: 8 },
    rarity: 'legendary',
  },
  // ... (all 19 items following the design doc table)
  // Each item follows the same pattern with id, name, type, description, levelRequirement, baseStats
];
```

Reference `docs/superpowers/specs/2026-02-18-achievements-design.md` "Unique Family Items" table for all 19 items with their slots and theme stats.

**Step 2: Add to seed script**

In `packages/database/prisma/seed.ts`, import and upsert the achievement item templates alongside existing item template seeding.

**Step 3: Run seed**

Run: `npm run db:seed`
Expected: Seed completes with achievement items created

**Step 4: Commit**

```bash
git add packages/database/prisma/seed-data/achievementItems.ts packages/database/prisma/seed.ts
git commit -m "feat(db): add 19 unique achievement family reward item templates"
```

---

## Task 16: Extend Player Endpoint with Active Title

**Files:**
- Modify: `apps/api/src/routes/player.ts`

**Step 1: Add activeTitle to GET /player response**

In the `GET /player` route handler, ensure the query includes `activeTitle` in the select/response:

```typescript
// In the player query, add to select:
activeTitle: true,
```

Also look up the title text from the achievement definition:
```typescript
import { ACHIEVEMENTS_BY_ID } from '@adventure/shared';

// In the response mapping:
const titleDef = player.activeTitle ? ACHIEVEMENTS_BY_ID.get(player.activeTitle) : null;
// Add to response:
activeTitle: titleDef?.titleReward ?? null,
```

**Step 2: Build API**

Run: `npm run build:api`
Expected: Clean build

**Step 3: Commit**

```bash
git add apps/api/src/routes/player.ts
git commit -m "feat(api): include active title in GET /player response"
```

---

## Task 17: Run All Tests & Final Verification

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass (existing + new achievement tests)

**Step 2: Run type check**

Run: `npm run typecheck`
Expected: No new type errors (pre-existing error in `page.tsx:333` is acceptable)

**Step 3: Run linter**

Run: `npm run lint`
Expected: No lint errors

**Step 4: Manual smoke test**

Run: `npm run dev`

1. Log in, navigate to Home tab → Achievements sub-tab
2. Verify achievement list loads with progress bars
3. Kill a mob → verify stat increments and achievement progress updates
4. Reach 100 kills → verify achievement unlocks, toast appears, activity log entry
5. Claim reward → verify attribute points/items granted
6. Set active title → verify title displays

**Step 5: Final commit**

```bash
git add -A
git commit -m "test: verify all achievement system tests pass"
```

---

## Dependencies Between Tasks

```
Task 1 (Shared Types) ──┐
Task 2 (Definitions)  ──┼── Task 3 (DB Migration) ── Task 4 (Stats Service) ──┐
                         │                                                      │
                         └── Task 5 (Achievement Service) ─────────────────────┤
                                                                               │
Task 6 (Routes) ──────────────────────────────────────────────────────────────┤
Task 7 (Hook Combat) ─────────────────────────────────────────────────────────┤
Task 8 (Hook Crafting) ────────────────────────────────────────────────────────┤
Task 9 (Hook PvP/Boss) ───────────────────────────────────────────────────────┤
                                                                               │
Task 10 (Frontend API) ──── Task 11 (Screen) ──┐                              │
Task 12 (Toast) ────────────────────────────────┼── Task 13 (Integration) ────┤
                                                │                              │
Task 14 (Socket Events) ───────────────────────┘                              │
Task 15 (Seed Data) ──────────────────────────────────────────────────────────┤
Task 16 (Player Title) ───────────────────────────────────────────────────────┤
                                                                               │
Task 17 (Final Verification) ─────────────────────────────────────────────────┘
```

**Parallelizable groups:**
- Tasks 1 + 2 can run in parallel
- Tasks 7 + 8 + 9 can run in parallel (after Tasks 4 + 5)
- Tasks 10 + 12 + 15 can run in parallel (after Task 6)
- Task 11 depends on Task 10
- Task 13 depends on Tasks 11 + 12
- Task 14 depends on Tasks 7-9 + 13
