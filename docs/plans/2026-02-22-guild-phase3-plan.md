# Guild System Phase 3: Projects & Specialization — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add guild projects (collaborative tech tree with material contributions and permanent perks) and guild specialization (three paths with tiered passive bonuses) to the existing guild system.

**Architecture:** Guild projects use a 9-project tech tree across 3 levels with prerequisites. Members contribute materials from inventory (consumed permanently) toward project goals. Completed projects grant permanent stat modifiers via the existing `PlayerGuildModifiers` system. Guild specialization adds a leader-chosen path (warfare/industry/discovery) at guild level 10, granting tiered passive bonuses to all active members. Both features integrate into the existing `getPlayerGuildModifiers()` function.

**Tech Stack:** Prisma (existing GuildProject/GuildProjectContribution models), Express routes with Zod, vitest with mocked Prisma, existing `consumeItemsByTemplateTx` for material consumption.

**Design Doc:** `docs/plans/2026-02-21-guild-system-design.md`

**Worktree:** `D:\Code\Adventure\.worktrees\adventure-guild-system` (branch: `feature/guild-system`)

---

## Task 1: Shared Types & Project/Specialization Definitions

**Files:**
- Modify: `packages/shared/src/types/guild.types.ts`
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Add project and specialization types to `guild.types.ts`**

Add after existing guild types:

```typescript
// --- Guild Projects ---

export type GuildProjectStatus = 'active' | 'completed';

export interface GuildProjectPerk {
  effectType: string; // matches PlayerGuildModifiers field name
  value: number;      // e.g. 0.05 = 5%
}

export interface GuildProjectMaterialCost {
  category: string;   // key from GUILD_MATERIAL_CATEGORIES
  quantity: number;
}

export interface GuildProjectDefinition {
  key: string;
  name: string;
  description: string;
  level: number;                        // 1, 2, or 3
  prerequisites: string[];              // project keys required
  treasuryCost: number;                 // turns deducted from treasury on start
  materialCosts: GuildProjectMaterialCost[];
  memberTurnGoal: number;               // total member-contributed turns to complete
  perks: GuildProjectPerk[];
  guildXpReward: number;
}

export interface GuildProjectData {
  id: string;
  projectKey: string;
  name: string;
  description: string;
  level: number;
  status: GuildProjectStatus;
  treasuryCost: number;
  materialCosts: GuildProjectMaterialCost[];
  materialsProgress: Record<string, number>; // category → contributed qty
  memberTurnGoal: number;
  turnsContributed: number;
  perks: GuildProjectPerk[];
  startedAt: string;
  completedAt: string | null;
}

export interface GuildProjectContributionData {
  playerId: string;
  username: string;
  turnsContributed: number;
  materialsContributed: Record<string, number>;
}

// --- Guild Specialization ---

export type GuildSpecializationPath = 'warfare' | 'industry' | 'discovery';

export interface SpecializationTierBonus {
  effectType: string; // matches PlayerGuildModifiers field name
  value: number;
}

export interface SpecializationTier {
  tier: number;         // 1, 2, or 3
  guildLevelGate: number;
  bonuses: SpecializationTierBonus[];
}

export interface GuildSpecializationDefinition {
  path: GuildSpecializationPath;
  name: string;
  description: string;
  tiers: SpecializationTier[];
}
```

**Step 2: Add project and specialization constants to `gameConstants.ts`**

Add after `GUILD_CONTRACT_CONSTANTS`:

```typescript
// =============================================================================
// GUILD PROJECTS
// =============================================================================

/** Maps material category keys to accepted ItemTemplate names */
export const GUILD_MATERIAL_CATEGORIES: Record<string, readonly string[]> = {
  ore: ['Copper Ore', 'Tin Ore', 'Iron Ore', 'Sandstone', 'Dark Iron Ore', 'Mithril Ore', 'Ancient Ore'],
  ingot: ['Copper Ingot', 'Tin Ingot', 'Iron Ingot', 'Cut Stone', 'Dark Iron Ingot', 'Mithril Ingot', 'Ancient Ingot'],
  log: ['Oak Log', 'Maple Log', 'Fungal Wood', 'Elderwood Log', 'Willow Log', 'Bogwood Log', 'Crystal Wood', 'Petrified Wood'],
  plank: ['Oak Plank', 'Maple Plank', 'Fungal Plank', 'Elderwood Plank', 'Willow Plank', 'Bogwood Plank', 'Crystal Plank', 'Petrified Plank'],
  herb: ['Forest Sage', 'Moonpetal', 'Cave Moss', 'Starbloom', 'Glowcap Mushroom', 'Windbloom', 'Gravemoss', 'Shimmer Fern', 'Abyssal Kelp'],
  leather: ['Rat Leather', 'Boar Leather', 'Wolf Leather', 'Bat Leather', 'Warg Leather', 'Croc Leather', 'Naga Leather'],
  cloth: ['Silk Cloth', 'Woven Cloth', 'Fae Fabric', 'Cursed Fabric', 'Ethereal Cloth', 'Spectral Fabric'],
} as const;

export const GUILD_PROJECT_CONSTANTS = {
  /** Max items a single member can contribute per day across all categories */
  DAILY_MATERIAL_CAP: 200,
  /** Max turns a single member can contribute per day */
  DAILY_TURN_CAP: 10_000,
  /** Only one project can be active at a time */
  MAX_ACTIVE_PROJECTS: 1,
} as const;

export const GUILD_PROJECT_DEFINITIONS: readonly GuildProjectDefinition[] = [
  // --- Level 1: No prerequisites ---
  {
    key: 'guild_forge',
    name: 'Guild Forge',
    description: 'A communal forge that improves crafting outcomes for all members.',
    level: 1,
    prerequisites: [],
    treasuryCost: 500_000,
    materialCosts: [
      { category: 'ore', quantity: 2_000 },
      { category: 'ingot', quantity: 1_000 },
    ],
    memberTurnGoal: 100_000,
    perks: [{ effectType: 'craftingCrit', value: 0.05 }],
    guildXpReward: 500,
  },
  {
    key: 'war_room',
    name: 'War Room',
    description: 'A strategic planning center that sharpens combat skills.',
    level: 1,
    prerequisites: [],
    treasuryCost: 500_000,
    materialCosts: [
      { category: 'leather', quantity: 1_500 },
      { category: 'plank', quantity: 1_000 },
    ],
    memberTurnGoal: 100_000,
    perks: [{ effectType: 'xpBoost', value: 0.05 }],
    guildXpReward: 500,
  },
  {
    key: 'scout_network',
    name: 'Scout Network',
    description: 'A network of scouts that reduces travel time across zones.',
    level: 1,
    prerequisites: [],
    treasuryCost: 500_000,
    materialCosts: [
      { category: 'herb', quantity: 1_000 },
      { category: 'plank', quantity: 1_500 },
    ],
    memberTurnGoal: 100_000,
    perks: [{ effectType: 'travelCostReduction', value: 0.10 }],
    guildXpReward: 500,
  },
  // --- Level 2: Require one Level 1 ---
  {
    key: 'advanced_forge',
    name: 'Advanced Forge',
    description: 'An upgraded forge with superior tools and techniques.',
    level: 2,
    prerequisites: ['guild_forge'],
    treasuryCost: 2_000_000,
    materialCosts: [
      { category: 'ore', quantity: 5_000 },
      { category: 'ingot', quantity: 2_000 },
    ],
    memberTurnGoal: 400_000,
    perks: [{ effectType: 'craftingCrit', value: 0.10 }],
    guildXpReward: 1_000,
  },
  {
    key: 'barracks',
    name: 'Barracks',
    description: 'Training grounds that hone combat expertise.',
    level: 2,
    prerequisites: ['war_room'],
    treasuryCost: 2_000_000,
    materialCosts: [
      { category: 'leather', quantity: 3_000 },
      { category: 'ingot', quantity: 2_000 },
    ],
    memberTurnGoal: 400_000,
    perks: [{ effectType: 'xpBoost', value: 0.10 }],
    guildXpReward: 1_000,
  },
  {
    key: 'cartographers_lodge',
    name: "Cartographer's Lodge",
    description: 'Expert mapmakers chart safer and faster travel routes.',
    level: 2,
    prerequisites: ['scout_network'],
    treasuryCost: 2_000_000,
    materialCosts: [
      { category: 'plank', quantity: 2_500 },
      { category: 'herb', quantity: 2_000 },
    ],
    memberTurnGoal: 400_000,
    perks: [{ effectType: 'travelCostReduction', value: 0.20 }],
    guildXpReward: 1_000,
  },
  {
    key: 'apothecary',
    name: 'Apothecary',
    description: 'An alchemical lab that reduces repair costs guild-wide.',
    level: 2,
    prerequisites: [],  // requires ANY one L1 project (checked in service)
    treasuryCost: 1_500_000,
    materialCosts: [
      { category: 'herb', quantity: 2_000 },
      { category: 'cloth', quantity: 1_500 },
    ],
    memberTurnGoal: 300_000,
    perks: [{ effectType: 'repairCostReduction', value: 0.10 }],
    guildXpReward: 800,
  },
  // --- Level 3: Require two Level 2 ---
  {
    key: 'master_workshop',
    name: 'Master Workshop',
    description: 'The pinnacle of guild craftsmanship.',
    level: 3,
    prerequisites: ['advanced_forge', 'apothecary'],
    treasuryCost: 5_000_000,
    materialCosts: [
      { category: 'ore', quantity: 10_000 },
      { category: 'ingot', quantity: 5_000 },
      { category: 'herb', quantity: 3_000 },
    ],
    memberTurnGoal: 1_000_000,
    perks: [{ effectType: 'craftingCrit', value: 0.15 }],
    guildXpReward: 2_000,
  },
  {
    key: 'raid_hall',
    name: 'Raid Hall',
    description: 'A war council chamber for elite combat coordination.',
    level: 3,
    prerequisites: ['barracks', 'apothecary'],
    treasuryCost: 5_000_000,
    materialCosts: [
      { category: 'leather', quantity: 5_000 },
      { category: 'ingot', quantity: 4_000 },
      { category: 'plank', quantity: 3_000 },
    ],
    memberTurnGoal: 1_000_000,
    perks: [{ effectType: 'xpBoost', value: 0.15 }],
    guildXpReward: 2_000,
  },
  {
    key: 'explorers_guild',
    name: "Explorer's Guild",
    description: 'Master explorers that command unmatched knowledge of the land.',
    level: 3,
    prerequisites: ['cartographers_lodge', 'apothecary'],
    treasuryCost: 5_000_000,
    materialCosts: [
      { category: 'plank', quantity: 5_000 },
      { category: 'herb', quantity: 4_000 },
      { category: 'cloth', quantity: 3_000 },
    ],
    memberTurnGoal: 1_000_000,
    perks: [
      { effectType: 'travelCostReduction', value: 0.30 },
      { effectType: 'gatheringYield', value: 0.15 },
    ],
    guildXpReward: 2_000,
  },
] as const;

// =============================================================================
// GUILD SPECIALIZATION
// =============================================================================

export const GUILD_SPECIALIZATION_DEFINITIONS: readonly GuildSpecializationDefinition[] = [
  {
    path: 'warfare',
    name: 'Warfare',
    description: 'Focused on combat prowess and boss encounters.',
    tiers: [
      { tier: 1, guildLevelGate: 10, bonuses: [
        { effectType: 'xpBoost', value: 0.05 },
        { effectType: 'combatDamage', value: 0.05 },
      ]},
      { tier: 2, guildLevelGate: 25, bonuses: [
        { effectType: 'xpBoost', value: 0.10 },
        { effectType: 'combatDamage', value: 0.10 },
      ]},
      { tier: 3, guildLevelGate: 40, bonuses: [
        { effectType: 'xpBoost', value: 0.15 },
        { effectType: 'combatDamage', value: 0.15 },
        { effectType: 'defenseBoost', value: 0.05 },
      ]},
    ],
  },
  {
    path: 'industry',
    name: 'Industry',
    description: 'Focused on crafting excellence and gathering efficiency.',
    tiers: [
      { tier: 1, guildLevelGate: 10, bonuses: [
        { effectType: 'craftingCrit', value: 0.05 },
        { effectType: 'gatheringYield', value: 0.10 },
      ]},
      { tier: 2, guildLevelGate: 25, bonuses: [
        { effectType: 'craftingCrit', value: 0.10 },
        { effectType: 'gatheringYield', value: 0.20 },
        { effectType: 'repairCostReduction', value: 0.10 },
      ]},
      { tier: 3, guildLevelGate: 40, bonuses: [
        { effectType: 'craftingCrit', value: 0.15 },
        { effectType: 'gatheringYield', value: 0.30 },
        { effectType: 'repairCostReduction', value: 0.20 },
      ]},
    ],
  },
  {
    path: 'discovery',
    name: 'Discovery',
    description: 'Focused on exploration and resource acquisition.',
    tiers: [
      { tier: 1, guildLevelGate: 10, bonuses: [
        { effectType: 'travelCostReduction', value: 0.10 },
        { effectType: 'gatheringYield', value: 0.15 },
      ]},
      { tier: 2, guildLevelGate: 25, bonuses: [
        { effectType: 'travelCostReduction', value: 0.20 },
        { effectType: 'gatheringYield', value: 0.30 },
      ]},
      { tier: 3, guildLevelGate: 40, bonuses: [
        { effectType: 'travelCostReduction', value: 0.30 },
        { effectType: 'gatheringYield', value: 0.50 },
      ]},
    ],
  },
] as const;
```

**Step 3: Import new types in `gameConstants.ts`**

Add at top of `gameConstants.ts`:
```typescript
import type {
  GuildProjectDefinition,
  GuildSpecializationDefinition,
} from '../types/guild.types';
```

**Step 4: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Builds without errors

**Step 5: Commit**

```bash
git add packages/shared/src/types/guild.types.ts packages/shared/src/constants/gameConstants.ts
git commit -m "feat(shared): add guild project and specialization definitions"
```

---

## Task 2: Extend PlayerGuildModifiers

**Files:**
- Modify: `apps/api/src/services/guildUpgradeService.ts`
- Modify: `apps/api/src/services/guildUpgradeService.test.ts`

**Step 1: Add new modifier fields**

In `guildUpgradeService.ts`, update the `PlayerGuildModifiers` interface:

```typescript
export interface PlayerGuildModifiers {
  xpBoost: number;
  gatheringYield: number;
  craftingCrit: number;
  combatDamage: number;
  defenseBoost: number;
  // New — from projects & specialization
  travelCostReduction: number;
  repairCostReduction: number;
}
```

Update `NO_MODIFIERS`:

```typescript
const NO_MODIFIERS: PlayerGuildModifiers = {
  xpBoost: 0,
  gatheringYield: 0,
  craftingCrit: 0,
  combatDamage: 0,
  defenseBoost: 0,
  travelCostReduction: 0,
  repairCostReduction: 0,
};
```

**Step 2: Add project perk and specialization bonus aggregation to `getPlayerGuildModifiers()`**

After the upgrade loop in `getPlayerGuildModifiers()`, add:

```typescript
// --- Project perks (permanent, no scaling) ---
const completedProjects = await prisma.guildProject.findMany({
  where: { guildId: membership.guildId, status: 'completed' },
  select: { projectKey: true },
});

for (const project of completedProjects) {
  const def = GUILD_PROJECT_DEFINITIONS.find((d) => d.key === project.projectKey);
  if (!def) continue;
  for (const perk of def.perks) {
    const key = perk.effectType as keyof PlayerGuildModifiers;
    if (key in mods) {
      mods[key] = perk.value; // Project perks REPLACE (highest level wins, not additive)
    }
  }
}

// --- Specialization bonuses (permanent, no scaling) ---
const guild = await prisma.guild.findUnique({
  where: { id: membership.guildId },
  select: { specialization: true, level: true },
});

if (guild?.specialization) {
  const specDef = GUILD_SPECIALIZATION_DEFINITIONS.find(
    (s) => s.path === guild.specialization,
  );
  if (specDef) {
    // Find highest tier the guild qualifies for
    const activeTier = specDef.tiers
      .filter((t) => guild.level >= t.guildLevelGate)
      .sort((a, b) => b.tier - a.tier)[0];
    if (activeTier) {
      for (const bonus of activeTier.bonuses) {
        const key = bonus.effectType as keyof PlayerGuildModifiers;
        if (key in mods) {
          mods[key] += bonus.value; // Spec bonuses ADD on top of upgrades/projects
        }
      }
    }
  }
}
```

Note: Project perks for the same effectType use the **highest level project's value** (e.g., advanced_forge 10% replaces guild_forge 5%). The implementation uses `=` assignment, iterating in definition order (L1 first, then L2, then L3), so later (higher) values overwrite earlier ones. Specialization bonuses are additive on top.

**Step 3: Add imports**

```typescript
import {
  GUILD_PROJECT_DEFINITIONS,
  GUILD_SPECIALIZATION_DEFINITIONS,
} from '@adventure/shared';
```

**Step 4: Add tests for new modifier sources**

In `guildUpgradeService.test.ts`, add after existing `getPlayerGuildModifiers` tests:

```typescript
it('includes project perks from completed projects', async () => {
  mockPrisma.guildMember.findUnique.mockResolvedValue({
    guildId: GUILD_ID, lastActiveAt: new Date(),
  });
  mockPrisma.guildUpgrade.findMany.mockResolvedValue([]);
  mockPrisma.guildMember.findMany.mockResolvedValue([
    { lastActiveAt: new Date() },
  ]);
  mockPrisma.guildProject.findMany.mockResolvedValue([
    { projectKey: 'guild_forge' },
  ]);
  mockPrisma.guild.findUnique.mockResolvedValue({
    specialization: null, level: 5,
  });

  const mods = await getPlayerGuildModifiers(PLAYER_ID);
  expect(mods.craftingCrit).toBe(0.05);
});

it('higher-level project replaces lower-level perk', async () => {
  mockPrisma.guildMember.findUnique.mockResolvedValue({
    guildId: GUILD_ID, lastActiveAt: new Date(),
  });
  mockPrisma.guildUpgrade.findMany.mockResolvedValue([]);
  mockPrisma.guildMember.findMany.mockResolvedValue([
    { lastActiveAt: new Date() },
  ]);
  mockPrisma.guildProject.findMany.mockResolvedValue([
    { projectKey: 'guild_forge' },
    { projectKey: 'advanced_forge' },
  ]);
  mockPrisma.guild.findUnique.mockResolvedValue({
    specialization: null, level: 5,
  });

  const mods = await getPlayerGuildModifiers(PLAYER_ID);
  expect(mods.craftingCrit).toBe(0.10); // advanced_forge replaces guild_forge
});

it('includes specialization bonuses based on guild level', async () => {
  mockPrisma.guildMember.findUnique.mockResolvedValue({
    guildId: GUILD_ID, lastActiveAt: new Date(),
  });
  mockPrisma.guildUpgrade.findMany.mockResolvedValue([]);
  mockPrisma.guildMember.findMany.mockResolvedValue([
    { lastActiveAt: new Date() },
  ]);
  mockPrisma.guildProject.findMany.mockResolvedValue([]);
  mockPrisma.guild.findUnique.mockResolvedValue({
    specialization: 'industry', level: 25,
  });

  const mods = await getPlayerGuildModifiers(PLAYER_ID);
  expect(mods.craftingCrit).toBe(0.10);
  expect(mods.gatheringYield).toBe(0.20);
  expect(mods.repairCostReduction).toBe(0.10);
});

it('stacks upgrade + project + specialization bonuses', async () => {
  mockPrisma.guildMember.findUnique.mockResolvedValue({
    guildId: GUILD_ID, lastActiveAt: new Date(),
  });
  // Active crafting crit upgrade (tier 1 = 0.05)
  mockPrisma.guildUpgrade.findMany.mockResolvedValue([
    { upgradeType: 'crafting_fortune', tier: 1, expiresAt: new Date(Date.now() + 3600000) },
  ]);
  mockPrisma.guildMember.findMany.mockResolvedValue(
    Array(10).fill({ lastActiveAt: new Date() }),
  );
  // Completed guild_forge project (0.05 crafting crit)
  mockPrisma.guildProject.findMany.mockResolvedValue([
    { projectKey: 'guild_forge' },
  ]);
  // Industry spec tier 1 (0.05 crafting crit)
  mockPrisma.guild.findUnique.mockResolvedValue({
    specialization: 'industry', level: 10,
  });

  const mods = await getPlayerGuildModifiers(PLAYER_ID);
  // 0.05 (upgrade, full scale) + 0.05 (project) + 0.05 (spec) = 0.15
  expect(mods.craftingCrit).toBeCloseTo(0.15);
});

it('returns new modifier fields with zero defaults', async () => {
  mockPrisma.guildMember.findUnique.mockResolvedValue(null);
  const mods = await getPlayerGuildModifiers(PLAYER_ID);
  expect(mods.travelCostReduction).toBe(0);
  expect(mods.repairCostReduction).toBe(0);
});
```

**Step 5: Run tests**

Run: `npm run test:api -- --run guildUpgradeService`
Expected: All PASS

**Step 6: Commit**

```bash
git add apps/api/src/services/guildUpgradeService.ts apps/api/src/services/guildUpgradeService.test.ts
git commit -m "feat(api): extend guild modifiers with project perks and specialization bonuses"
```

---

## Task 3: Guild Project Service (TDD)

**Files:**
- Create: `apps/api/src/services/guildProjectService.ts`
- Create: `apps/api/src/services/guildProjectService.test.ts`

**Step 1: Write failing tests**

```typescript
// apps/api/src/services/guildProjectService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUILD_PROJECT_DEFINITIONS, GUILD_PROJECT_CONSTANTS } from '@adventure/shared';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));

import { prisma } from '@adventure/database';
import {
  startProject,
  getGuildProjects,
  contributeTurns,
  contributeMaterials,
} from './guildProjectService';

const mockPrisma = prisma as unknown as Record<string, any>;
const GUILD_ID = 'guild-1';
const PLAYER_ID = 'player-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startProject', () => {
  it('starts a project when prerequisites are met and treasury is sufficient', async () => {
    // Mock: player is leader
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    // Mock: guild has sufficient treasury
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, treasuryTurns: 600_000, level: 5,
    });
    // Mock: no active project
    mockPrisma.guildProject.findFirst.mockResolvedValue(null);
    // Mock: no completed projects (no prereqs needed for L1)
    mockPrisma.guildProject.findMany.mockResolvedValue([]);
    // Mock: transaction
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildProject.create.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: {}, status: 'active',
      startedAt: new Date(), completedAt: null,
    });
    mockPrisma.guildLog.create.mockResolvedValue({});

    const result = await startProject(PLAYER_ID, GUILD_ID, 'guild_forge');

    expect(result.projectKey).toBe('guild_forge');
    expect(result.status).toBe('active');
  });

  it('throws if player is not officer or leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });

    await expect(startProject(PLAYER_ID, GUILD_ID, 'guild_forge'))
      .rejects.toThrow('Only officers and leaders can start projects');
  });

  it('throws if treasury is insufficient', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, treasuryTurns: 100, level: 5,
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue(null);
    mockPrisma.guildProject.findMany.mockResolvedValue([]);

    await expect(startProject(PLAYER_ID, GUILD_ID, 'guild_forge'))
      .rejects.toThrow('Insufficient treasury');
  });

  it('throws if another project is already active', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, treasuryTurns: 600_000, level: 5,
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue({ id: 'existing-active' });

    await expect(startProject(PLAYER_ID, GUILD_ID, 'guild_forge'))
      .rejects.toThrow('already has an active project');
  });

  it('throws if prerequisites not met', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, treasuryTurns: 3_000_000, level: 10,
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue(null);
    // No completed projects → advanced_forge prereq (guild_forge) not met
    mockPrisma.guildProject.findMany.mockResolvedValue([]);

    await expect(startProject(PLAYER_ID, GUILD_ID, 'advanced_forge'))
      .rejects.toThrow('Prerequisites not met');
  });

  it('throws if project already completed', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, treasuryTurns: 600_000, level: 5,
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue(null);
    mockPrisma.guildProject.findMany.mockResolvedValue([
      { projectKey: 'guild_forge', status: 'completed' },
    ]);

    await expect(startProject(PLAYER_ID, GUILD_ID, 'guild_forge'))
      .rejects.toThrow('already been completed');
  });
});

describe('getGuildProjects', () => {
  it('returns all projects with progress data', async () => {
    mockPrisma.guildProject.findMany.mockResolvedValue([
      {
        id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
        turnsContributed: 50_000, materialsProgress: { ore: 1000, ingot: 500 },
        status: 'active', startedAt: new Date(), completedAt: null,
        contributions: [
          { playerId: 'p1', turnsContributed: 30_000, materialsContributed: { ore: 600 },
            player: { username: 'Alice' } },
          { playerId: 'p2', turnsContributed: 20_000, materialsContributed: { ore: 400 },
            player: { username: 'Bob' } },
        ],
      },
    ]);

    const result = await getGuildProjects(GUILD_ID);
    expect(result).toHaveLength(1);
    expect(result[0].projectKey).toBe('guild_forge');
    expect(result[0].turnsContributed).toBe(50_000);
  });
});

describe('contributeTurns', () => {
  it('contributes turns from player turn bank to project', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 50_000, materialsProgress: {},
      status: 'active',
    });
    // Mock daily contribution check
    mockPrisma.guildProjectContribution.findUnique.mockResolvedValue(null);
    // Mock turn bank
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: PLAYER_ID, currentTurns: 20_000, lastRegenAt: new Date(),
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.guildProject.update.mockResolvedValue({
      turnsContributed: 55_000, status: 'active',
    });
    mockPrisma.guildProjectContribution.upsert.mockResolvedValue({});

    const result = await contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000);

    expect(result.turnsContributed).toBe(55_000);
  });

  it('throws if project is not active', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', status: 'completed',
    });

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000))
      .rejects.toThrow('not active');
  });
});

describe('contributeMaterials', () => {
  it('consumes items from inventory and updates project progress', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 500 },
      status: 'active',
    });
    // Mock: player has Iron Ore
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 100, createdAt: new Date() },
    ]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.guildProject.update.mockResolvedValue({
      materialsProgress: { ore: 550 },
    });
    mockPrisma.guildProjectContribution.upsert.mockResolvedValue({});

    const result = await contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 50);

    expect(result.materialsProgress.ore).toBe(550);
  });

  it('throws if template is not in a required category', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    mockPrisma.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: {},
      status: 'active',
    });
    // Wolf Leather is not ore or ingot (guild_forge's requirements)
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-wolf-leather', name: 'Wolf Leather', itemType: 'resource',
    });

    await expect(contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-wolf-leather', 50))
      .rejects.toThrow('not needed for this project');
  });

  it('auto-completes project when all goals are met', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    // Project nearly complete: turns done, ore done, just needs 50 more ingots
    mockPrisma.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 100_000, materialsProgress: { ore: 2000, ingot: 950 },
      status: 'active',
    });
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ingot', name: 'Iron Ingot', itemType: 'resource',
    });
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 200, createdAt: new Date() },
    ]);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.guildProject.update.mockResolvedValue({
      materialsProgress: { ore: 2000, ingot: 1000 },
      status: 'completed', completedAt: new Date(),
    });
    mockPrisma.guildProjectContribution.upsert.mockResolvedValue({});
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});

    const result = await contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ingot', 50);

    expect(result.status).toBe('completed');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run guildProjectService`
Expected: FAIL (module not found)

**Step 3: Implement guild project service**

Create `apps/api/src/services/guildProjectService.ts` with functions:

- `startProject(playerId, guildId, projectKey)` — Validates role (officer+), definition exists, not already completed/active, prerequisites met, treasury sufficient. In transaction: deduct treasury, create GuildProject record, log event.

- `getGuildProjects(guildId)` — Returns all guild projects (active + completed) with progress. Enriches with definition data (name, description, costs, perks). Includes per-member contributions.

- `contributeTurns(playerId, guildId, projectId, amount)` — Validates membership, project active, daily cap not exceeded. In transaction: spend player turns, update project `turnsContributed`, upsert player contribution. Check for completion.

- `contributeMaterials(playerId, guildId, projectId, templateId, quantity)` — Validates membership, project active, template belongs to a needed category, daily cap not exceeded. In transaction: consume items via `consumeItemsByTemplateTx`, update project `materialsProgress`, upsert player contribution. Check for completion.

- `checkAndCompleteProject(tx, project, definition)` — Internal helper. Checks if `turnsContributed >= memberTurnGoal` AND all material categories are met. If so: set status='completed', set completedAt, grant guild XP via `addGuildXp`, log event.

- `getCategoryForTemplate(templateName)` — Looks up template name in `GUILD_MATERIAL_CATEGORIES`, returns category key or null.

- `getAvailableProjects(guildId)` — Returns project definitions that can be started (prereqs met, not completed, not active).

Key implementation patterns:
- Follow `guildUpgradeService.ts` transaction/validation pattern exactly
- Use `AppError` for all validation failures
- Use `consumeItemsByTemplateTx` from `inventoryService` for material consumption
- Use `spendPlayerTurnsTx` (or equivalent) from `turnBankService` for turn contributions
- The `materialsProgress` JSON field uses category keys (not template IDs): `{ ore: 1500, ingot: 800 }`
- The `materialsContributed` JSON field in GuildProjectContribution tracks per-player: `{ ore: 500 }`

**Step 4: Run tests**

Run: `npm run test:api -- --run guildProjectService`
Expected: All PASS

**Step 5: Add edge case tests**

Add tests for:
- `contributeTurns` when amount exceeds daily cap → throws
- `contributeTurns` when player has insufficient turns → throws
- `contributeMaterials` when category already fully contributed → throws
- `contributeMaterials` caps to remaining needed (don't over-contribute)
- `getAvailableProjects` with various completion states
- `startProject` for apothecary (requires ANY one L1 project)

**Step 6: Run all tests**

Run: `npm run test:api -- --run guildProjectService`
Expected: All PASS

**Step 7: Commit**

```bash
git add apps/api/src/services/guildProjectService.ts apps/api/src/services/guildProjectService.test.ts
git commit -m "feat(api): add guild project service with contributions and auto-completion"
```

---

## Task 4: Guild Specialization Service (TDD)

**Files:**
- Create: `apps/api/src/services/guildSpecializationService.ts`
- Create: `apps/api/src/services/guildSpecializationService.test.ts`

**Step 1: Write failing tests**

```typescript
// apps/api/src/services/guildSpecializationService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUILD_CONSTANTS } from '@adventure/shared';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));

import { prisma } from '@adventure/database';
import {
  selectSpecialization,
  respecSpecialization,
  getSpecializationStatus,
} from './guildSpecializationService';

const mockPrisma = prisma as unknown as Record<string, any>;
const GUILD_ID = 'guild-1';
const PLAYER_ID = 'player-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selectSpecialization', () => {
  it('sets specialization when guild is level 10+ and has none', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 12, specialization: null,
    });
    mockPrisma.guild.update.mockResolvedValue({
      id: GUILD_ID, specialization: 'warfare',
    });
    mockPrisma.guildLog.create.mockResolvedValue({});

    const result = await selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare');
    expect(result.specialization).toBe('warfare');
  });

  it('throws if player is not leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'officer',
    });

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow('Only the leader');
  });

  it('throws if guild level is below 10', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 5, specialization: null,
    });

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow(`level ${GUILD_CONSTANTS.SPECIALIZATION_UNLOCK_LEVEL}`);
  });

  it('throws if guild already has a specialization', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 15, specialization: 'industry',
    });

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow('already has a specialization');
  });

  it('throws for invalid specialization path', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'invalid' as any))
      .rejects.toThrow('Invalid specialization');
  });
});

describe('respecSpecialization', () => {
  it('changes specialization when treasury is sufficient', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 20, specialization: 'warfare',
      treasuryTurns: 2_500_000,
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.guild.update.mockResolvedValue({
      id: GUILD_ID, specialization: 'discovery',
    });
    mockPrisma.guildLog.create.mockResolvedValue({});

    const result = await respecSpecialization(PLAYER_ID, GUILD_ID, 'discovery');
    expect(result.specialization).toBe('discovery');
  });

  it('throws if treasury is insufficient for respec', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 20, specialization: 'warfare',
      treasuryTurns: 100_000,
    });

    await expect(respecSpecialization(PLAYER_ID, GUILD_ID, 'discovery'))
      .rejects.toThrow('Insufficient treasury');
  });

  it('throws if trying to respec to same path', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'leader',
    });
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 20, specialization: 'warfare',
      treasuryTurns: 3_000_000,
    });

    await expect(respecSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow('same specialization');
  });
});

describe('getSpecializationStatus', () => {
  it('returns current spec with active tier bonuses', async () => {
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 25, specialization: 'industry',
    });

    const result = await getSpecializationStatus(GUILD_ID);
    expect(result.path).toBe('industry');
    expect(result.activeTier).toBe(2);
    expect(result.bonuses).toHaveLength(3); // crit, yield, repair at tier 2
  });

  it('returns null when no specialization selected', async () => {
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 8, specialization: null,
    });

    const result = await getSpecializationStatus(GUILD_ID);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:api -- --run guildSpecializationService`
Expected: FAIL (module not found)

**Step 3: Implement specialization service**

Create `apps/api/src/services/guildSpecializationService.ts` with functions:

- `selectSpecialization(playerId, guildId, path)` — Validates leader role, guild level >= 10, no existing specialization. Updates guild record, logs event.

- `respecSpecialization(playerId, guildId, newPath)` — Validates leader role, has existing specialization, different path, treasury >= SPECIALIZATION_RESPEC_COST. In transaction: deduct treasury, update specialization, log event.

- `getSpecializationStatus(guildId)` — Returns current path, active tier (based on guild level), current bonuses, next tier info. Returns null if no specialization.

**Step 4: Run tests**

Run: `npm run test:api -- --run guildSpecializationService`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/api/src/services/guildSpecializationService.ts apps/api/src/services/guildSpecializationService.test.ts
git commit -m "feat(api): add guild specialization service with select and respec"
```

---

## Task 5: Guild Project & Specialization Routes

**Files:**
- Modify: `apps/api/src/routes/guild.ts`

**Step 1: Add Zod schemas**

```typescript
const startProjectSchema = z.object({
  projectKey: z.string().min(1),
});

const contributeTurnsSchema = z.object({
  amount: z.number().int().positive(),
});

const contributeMaterialsSchema = z.object({
  templateId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const selectSpecializationSchema = z.object({
  path: z.enum(['warfare', 'industry', 'discovery']),
});
```

**Step 2: Add project routes**

```typescript
// GET /:id/projects — list all projects with progress
guildRouter.get('/:id/projects', asyncHandler(async (req, res) => {
  const projects = await getGuildProjects(req.params.id);
  const available = await getAvailableProjects(req.params.id);
  res.json({ projects, available });
}));

// POST /:id/projects/start — start a new project
guildRouter.post('/:id/projects/start', asyncHandler(async (req, res) => {
  const body = startProjectSchema.parse(req.body);
  const result = await startProject(req.player!.playerId, req.params.id, body.projectKey);
  res.status(201).json(result);
}));

// POST /:id/projects/:projectId/contribute/turns — contribute turns
guildRouter.post('/:id/projects/:projectId/contribute/turns', asyncHandler(async (req, res) => {
  const body = contributeTurnsSchema.parse(req.body);
  const result = await contributeTurns(
    req.player!.playerId, req.params.id, req.params.projectId, body.amount,
  );
  res.json(result);
}));

// POST /:id/projects/:projectId/contribute/materials — contribute materials
guildRouter.post('/:id/projects/:projectId/contribute/materials', asyncHandler(async (req, res) => {
  const body = contributeMaterialsSchema.parse(req.body);
  const result = await contributeMaterials(
    req.player!.playerId, req.params.id, req.params.projectId, body.templateId, body.quantity,
  );
  res.json(result);
}));
```

**Step 3: Add specialization routes**

```typescript
// GET /:id/specialization — get current specialization status
guildRouter.get('/:id/specialization', asyncHandler(async (req, res) => {
  const result = await getSpecializationStatus(req.params.id);
  res.json(result);
}));

// POST /:id/specialization/select — choose specialization
guildRouter.post('/:id/specialization/select', asyncHandler(async (req, res) => {
  const body = selectSpecializationSchema.parse(req.body);
  const result = await selectSpecialization(req.player!.playerId, req.params.id, body.path);
  res.json(result);
}));

// POST /:id/specialization/respec — change specialization
guildRouter.post('/:id/specialization/respec', asyncHandler(async (req, res) => {
  const body = selectSpecializationSchema.parse(req.body);
  const result = await respecSpecialization(req.player!.playerId, req.params.id, body.path);
  res.json(result);
}));
```

**Step 4: Add imports**

```typescript
import {
  startProject, getGuildProjects, getAvailableProjects,
  contributeTurns, contributeMaterials,
} from '../services/guildProjectService';
import {
  selectSpecialization, respecSpecialization, getSpecializationStatus,
} from '../services/guildSpecializationService';
```

**Step 5: Build and typecheck**

Run: `npm run build:api`
Run: `npm run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/api/src/routes/guild.ts
git commit -m "feat(api): add guild project and specialization routes"
```

---

## Task 6: Apply New Modifiers in Routes

**Files:**
- Modify: `apps/api/src/routes/zones.ts` (travel cost reduction)
- Modify: `apps/api/src/routes/inventory.ts` or repair route (repair cost reduction)

**Step 1: Apply travel cost reduction in zones.ts**

Find the travel cost calculation (around line 247):

```typescript
// BEFORE:
const travelCost: number = isTownDeparture ? destinationZone.travelCost : currentZone.travelCost;

// AFTER:
const baseTravelCost: number = isTownDeparture ? destinationZone.travelCost : currentZone.travelCost;
const guildMods = await getPlayerGuildModifiers(playerId);
const travelCost = guildMods.travelCostReduction > 0
  ? Math.max(1, Math.round(baseTravelCost * (1 - guildMods.travelCostReduction)))
  : baseTravelCost;
```

Add import: `import { getPlayerGuildModifiers } from '../services/guildUpgradeService';`

**Step 2: Apply repair cost reduction in inventory repair route**

Find the repair cost calculation and apply:

```typescript
const guildMods = await getPlayerGuildModifiers(playerId);
const effectiveRepairCost = guildMods.repairCostReduction > 0
  ? Math.max(1, Math.round(baseRepairCost * (1 - guildMods.repairCostReduction)))
  : baseRepairCost;
```

**Step 3: Build and typecheck**

Run: `npm run build:api`
Run: `npm run typecheck`
Expected: No errors

**Step 4: Run all API tests**

Run: `npm run test:api`
Expected: All PASS (existing tests should be unaffected — mocked DB returns null for guild lookups)

**Step 5: Commit**

```bash
git add apps/api/src/routes/zones.ts apps/api/src/routes/inventory.ts
git commit -m "feat(api): apply guild travel cost reduction and repair cost reduction modifiers"
```

---

## Task 7: Frontend API Types & Functions

**Files:**
- Modify: `apps/web/src/lib/api/guild.ts`

**Step 1: Add project types**

```typescript
export interface GuildProjectResponse {
  id: string;
  projectKey: string;
  name: string;
  description: string;
  level: number;
  status: string;
  treasuryCost: number;
  materialCosts: { category: string; quantity: number }[];
  materialsProgress: Record<string, number>;
  memberTurnGoal: number;
  turnsContributed: number;
  perks: { effectType: string; value: number }[];
  startedAt: string;
  completedAt: string | null;
}

export interface GuildProjectAvailableResponse {
  key: string;
  name: string;
  description: string;
  level: number;
  prerequisites: string[];
  treasuryCost: number;
  materialCosts: { category: string; quantity: number }[];
  memberTurnGoal: number;
  perks: { effectType: string; value: number }[];
  canStart: boolean;
  reason?: string;
}

export interface GuildProjectsListResponse {
  projects: GuildProjectResponse[];
  available: GuildProjectAvailableResponse[];
}

export interface SpecializationStatusResponse {
  path: string;
  name: string;
  activeTier: number;
  bonuses: { effectType: string; value: number }[];
  nextTier: { tier: number; guildLevelGate: number; bonuses: { effectType: string; value: number }[] } | null;
} | null;
```

**Step 2: Add project API functions**

```typescript
export async function getGuildProjects(guildId: string) {
  return fetchApi<GuildProjectsListResponse>(`/api/v1/guild/${guildId}/projects`);
}

export async function startGuildProject(guildId: string, projectKey: string) {
  return fetchApi<GuildProjectResponse>(`/api/v1/guild/${guildId}/projects/start`, {
    method: 'POST',
    body: JSON.stringify({ projectKey }),
  });
}

export async function contributeProjectTurns(guildId: string, projectId: string, amount: number) {
  return fetchApi<GuildProjectResponse>(`/api/v1/guild/${guildId}/projects/${projectId}/contribute/turns`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function contributeProjectMaterials(guildId: string, projectId: string, templateId: string, quantity: number) {
  return fetchApi<GuildProjectResponse>(`/api/v1/guild/${guildId}/projects/${projectId}/contribute/materials`, {
    method: 'POST',
    body: JSON.stringify({ templateId, quantity }),
  });
}
```

**Step 3: Add specialization API functions**

```typescript
export async function getGuildSpecialization(guildId: string) {
  return fetchApi<SpecializationStatusResponse>(`/api/v1/guild/${guildId}/specialization`);
}

export async function selectGuildSpecialization(guildId: string, path: string) {
  return fetchApi<{ specialization: string }>(`/api/v1/guild/${guildId}/specialization/select`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function respecGuildSpecialization(guildId: string, path: string) {
  return fetchApi<{ specialization: string }>(`/api/v1/guild/${guildId}/specialization/respec`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}
```

**Step 4: Build web**

Run: `npm run build:web`
Expected: Builds without errors

**Step 5: Commit**

```bash
git add apps/web/src/lib/api/guild.ts
git commit -m "feat(web): add guild project and specialization API types and functions"
```

---

## Task 8: Frontend — Projects Tab

**Files:**
- Create: `apps/web/src/components/guild/GuildProjectsTab.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`

**Step 1: Create GuildProjectsTab component**

Build a projects tab with:
- **Active project section**: Shows current project with progress bars (turns + each material category). "Contribute Turns" and "Contribute Materials" buttons open modals.
- **Available projects section**: Cards for projects that can be started (prereqs met). "Start Project" button (officer+ only).
- **Completed projects section**: List of completed projects with their perks.
- **Project tree visualization**: Simple tiered layout showing L1→L2→L3 with connection lines. Completed projects highlighted, locked projects grayed.

Progress bar pattern (follow existing PixelCard/progress bar patterns):
```tsx
<div className="flex justify-between text-xs mb-1">
  <span>Turns</span>
  <span>{turnsContributed.toLocaleString()} / {memberTurnGoal.toLocaleString()}</span>
</div>
<div className="h-2 rounded-full" style={{ backgroundColor: 'var(--rpg-bg-dark)' }}>
  <div
    className="h-full rounded-full"
    style={{
      width: `${Math.min(100, (turnsContributed / memberTurnGoal) * 100)}%`,
      backgroundColor: 'var(--rpg-gold)',
    }}
  />
</div>
```

Material contribution modal:
- Shows player's inventory filtered to items matching required categories
- Player selects item and quantity (with slider or input)
- Calls `contributeProjectMaterials()`

Turn contribution modal:
- Shows player's current turns
- Player enters amount (with daily cap info)
- Calls `contributeProjectTurns()`

**Step 2: Add 'projects' tab to GuildScreen**

Update `GuildTab` type:
```typescript
type GuildTab = 'overview' | 'members' | 'upgrades' | 'contracts' | 'projects' | 'log' | 'settings';
```

Add tab to the tab list and render `GuildProjectsTab` when active.

**Step 3: Build and verify**

Run: `npm run build:web`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add apps/web/src/components/guild/GuildProjectsTab.tsx apps/web/src/components/screens/GuildScreen.tsx
git commit -m "feat(web): add guild projects tab with contribution UI"
```

---

## Task 9: Frontend — Specialization UI

**Files:**
- Create: `apps/web/src/components/guild/GuildSpecializationTab.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`

**Step 1: Create GuildSpecializationTab component**

Build a specialization tab with two states:

**No specialization (guild level >= 10):**
- Three cards: Warfare, Industry, Discovery
- Each card shows: name, description, all tier bonuses
- "Select" button on each (leader only)
- Confirmation modal before selection

**Has specialization:**
- Current path displayed prominently with icon/color
- Active tier highlighted
- Current bonuses listed
- Next tier shown with level gate progress
- "Respec" button (leader only) with cost display and confirmation modal

Color scheme:
- Warfare: `var(--rpg-red)` / `var(--rpg-red-dark)`
- Industry: `var(--rpg-gold)` / `var(--rpg-gold-dark)`
- Discovery: `var(--rpg-blue-light)` / `var(--rpg-blue-dark)`

**Guild level < 10 (locked):**
- Grayed out display: "Specialization unlocks at guild level 10"
- Preview of the three paths

**Step 2: Add specialization section to GuildScreen**

Add a "Specialization" subsection to the overview tab or as its own tab entry — follow existing tab patterns.

**Step 3: Build and verify**

Run: `npm run build:web`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add apps/web/src/components/guild/GuildSpecializationTab.tsx apps/web/src/components/screens/GuildScreen.tsx
git commit -m "feat(web): add guild specialization selection and display UI"
```

---

## Verification Checklist (Phase 3)

After completing Tasks 1-9:

1. `npm run build` — all packages build
2. `npm run typecheck` — no TS errors
3. `npm run test:engine` — game engine tests pass (no changes)
4. `npm run test:api` — API tests pass including new project/specialization tests
5. Manual test: start a guild project (officer+), contribute turns, contribute materials
6. Manual test: project auto-completes when all goals met, perk appears in modifiers
7. Manual test: select specialization at guild level 10+, verify bonuses in combat/crafting
8. Manual test: respec specialization, verify treasury deducted and bonuses change
9. Manual test: travel cost reduction applies to zone travel
10. Manual test: project tree shows prerequisites correctly, blocks L2 without L1
