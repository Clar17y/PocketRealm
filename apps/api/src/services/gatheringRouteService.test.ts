import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { listResourceNodes, mineResourceNode } from './gatheringRouteService';
import { getInventoryState, assertNotOverEncumbered, addStackableItemTx } from './inventoryService';
import { getSkillLevel } from './combatStatsService.js';
import { spendPlayerTurnsTx } from './turnBankService';
import { applyGuildTaxTx, getPlayerTaxRateTx } from './guildTaxService';
import { grantSkillXp } from './xpService';
import { grantPassiveVocationXpTx, getVocationSnapshot } from './vocationService';
import { rollGemCritBatch } from '@pocketrealm/game-engine';
import { buildPagination, trackAchievements } from '../utils/routeHelpers.js';

vi.mock('./activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

vi.mock('./equipmentService.js', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({ luck: 0 }),
}));

vi.mock('./inventoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./inventoryService')>();
  return {
    ...actual,
    addStackableItemTx: vi.fn(),
    getInventoryState: vi.fn(),
    assertNotOverEncumbered: vi.fn(),
  };
});

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn(),
}));

vi.mock('./guildTaxService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./guildTaxService')>();
  return {
    ...actual,
    getPlayerTaxRateTx: vi.fn(),
    applyGuildTaxTx: vi.fn(),
  };
});

vi.mock('./guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn().mockResolvedValue({ gatheringYield: 0, xpBoost: 0 }),
}));

vi.mock('./buffService', () => ({
  getBuffValue: vi.fn().mockResolvedValue(0),
  consumeBuffStandalone: vi.fn(),
}));

vi.mock('./premiumEntitlement', () => ({
  getHasActivePremiumEntitlement: vi.fn().mockResolvedValue(false),
}));

vi.mock('./progressService', () => ({
  trackProgress: vi.fn().mockResolvedValue([]),
}));

vi.mock('./xpService', () => ({
  grantSkillXp: vi.fn(),
}));

vi.mock('./vocationService', () => ({
  grantPassiveVocationXpTx: vi.fn(),
  getVocationSnapshot: vi.fn(),
}));

vi.mock('./stateUpdateHelpers.js', () => ({
  fetchItemDTOs: vi.fn().mockResolvedValue([]),
  fetchSkillDTOs: vi.fn().mockResolvedValue([]),
  fetchCharacterProgression: vi.fn().mockResolvedValue({ characterXp: 0, characterLevel: 1, attributePoints: 0 }),
  fetchResourceState: vi.fn().mockResolvedValue({ currentTurns: 100 }),
  fetchInventoryMeta: vi.fn().mockResolvedValue({ inventoryUsedSlots: 1 }),
  fetchMaterialTotals: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/routeHelpers.js', async () => {
  const { z } = await import('zod');
  return {
  assertNotRecovering: vi.fn().mockResolvedValue(null),
  paginationSchema: {
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().default(20),
  },
  buildPagination: vi.fn(),
  serializeXpGrant: vi.fn((grant) => grant),
  trackAchievements: vi.fn(),
  };
});

vi.mock('./combatStatsService.js', () => ({
  getSkillLevel: vi.fn(),
}));

vi.mock('./expeditionLockoutService', () => ({
  checkActivityLockout: vi.fn(),
}));

vi.mock('./worldEventService', () => ({
  computeZoneModifiers: vi.fn().mockReturnValue({ resourceYieldMultiplier: 1 }),
  computeEventSummaries: vi.fn().mockReturnValue([]),
  getActiveEventsForZone: vi.fn().mockResolvedValue([]),
  getActiveWorldWideEvents: vi.fn().mockResolvedValue([]),
  getEventModifiersForEntity: vi.fn().mockResolvedValue([]),
}));

vi.mock('@pocketrealm/game-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pocketrealm/game-engine')>();
  return {
    ...actual,
    rollGemCritBatch: vi.fn(),
  };
});

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
const NODE_ID = '22222222-2222-4222-8222-222222222222';
const RESOURCE_TEMPLATE_ID = '33333333-3333-4333-8333-333333333333';
const GEM_TEMPLATE_ID = '44444444-4444-4444-8444-444444444444';

function mockModel() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  };
}

function playerNode() {
  return {
    id: NODE_ID,
    playerId: PLAYER_ID,
    remainingCapacity: 10,
    decayedCapacity: 0,
    discoveredAt: new Date(),
    resourceNode: {
      id: 'resource-node-1',
      zoneId: 'zone-1',
      resourceType: 'Iron Ore',
      skillRequired: 'mining',
      levelRequired: 1,
      baseYield: 1,
      maxCapacity: 10,
      zone: { id: 'zone-1', name: 'Test Zone' },
    },
  };
}

function discoveredNode(overrides: Partial<ReturnType<typeof playerNode>['resourceNode']> = {}) {
  return {
    ...playerNode(),
    id: `player-node-${overrides.resourceType ?? 'default'}`,
    resourceNode: {
      ...playerNode().resourceNode,
      ...overrides,
    },
  };
}

async function act(body: Record<string, unknown> = { playerNodeId: NODE_ID, turns: 30 }) {
  return mineResourceNode({
    body,
    player: { playerId: PLAYER_ID, username: 'Tester', accountId: 'account-1', seasonId: null, role: 'player' },
  });
}

async function listAct(query: Record<string, unknown>) {
  return listResourceNodes({
    query,
    player: { playerId: PLAYER_ID, username: 'Tester', accountId: 'account-1', seasonId: null, role: 'player' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.playerVocationTechnique = mockModel();
  mockPrisma.playerVocationCounter = mockModel();
  mockPrisma.playerResourceNode.findUnique.mockResolvedValue(playerNode());
  mockPrisma.itemTemplate.findMany.mockResolvedValue([{ id: RESOURCE_TEMPLATE_ID, name: 'Iron Ore' }]);
  mockPrisma.itemTemplate.findFirst.mockResolvedValue(null);
  mockPrisma.item.findMany.mockResolvedValue([
    {
      id: 'unmarked-stack',
      templateId: RESOURCE_TEMPLATE_ID,
      rarity: 'common',
      bonusStats: null,
      craftMarks: null,
    },
  ]);
  mockPrisma.player.findUnique.mockResolvedValue({ currentZoneId: 'zone-1' });
  mockPrisma.playerResourceNode.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.playerResourceNode.deleteMany.mockResolvedValue({ count: 1 });
  vi.mocked(getSkillLevel).mockResolvedValue(1);
  vi.mocked(assertNotOverEncumbered).mockResolvedValue(undefined);
  vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 24, capacity: 24, availableSlots: 0 });
  vi.mocked(buildPagination).mockImplementation((page, pageSize, total) => ({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasNext: page * pageSize < total,
    hasPrevious: page > 1,
  }));
  vi.mocked(spendPlayerTurnsTx).mockImplementation(async (_tx, _playerId, amount) => ({
    previousTurns: 100,
    spent: amount,
    currentTurns: 100 - amount,
    lastRegenAt: '2026-05-21T00:00:00.000Z',
    timeToCapMs: null,
  }));
  vi.mocked(getPlayerTaxRateTx).mockResolvedValue({ taxRate: 0, guildId: null });
  vi.mocked(applyGuildTaxTx).mockImplementation(async (_tx, _playerId, amount) => ({
    preTaxAmount: amount,
    taxAmount: 0,
    postTaxAmount: amount,
    taxRatePercent: 0,
    guildId: null,
  }));
  vi.mocked(addStackableItemTx).mockResolvedValue({ itemId: 'resource-stack', quantity: 1, created: false });
  vi.mocked(grantSkillXp).mockResolvedValue({
    skillType: 'mining',
    xpResult: { xpGained: 5, xpAfterEfficiency: 5, efficiency: 1, leveledUp: false, newLevel: 1, atDailyCap: false },
    boostedXpAfterEfficiency: 5,
    newTotalXp: 5,
    newDailyXpGained: 5,
    newLevel: 1,
    skillLeveledUp: false,
    characterXpGain: 1,
    characterXpAfter: 1,
    characterLevelBefore: 1,
    characterLevelAfter: 1,
    attributePointsAfter: 0,
    characterLeveledUp: false,
    skillPointsGained: 0,
  });
  vi.mocked(grantPassiveVocationXpTx).mockResolvedValue({
    vocationId: 'prospector',
    xp: 1,
    rank: 1,
    xpForCurrentRank: 0,
    xpForNextRank: 300,
    masteryPointsEarned: 0,
    availableMasteryPoints: 0,
    spentPoints: 0,
    learnedTechniqueIds: [],
  });
  vi.mocked(getVocationSnapshot).mockResolvedValue({
    playerId: PLAYER_ID,
    vocations: [],
    dailyCap: {
      dayStart: '2026-05-21T00:00:00.000Z',
      turnsSpent: 0,
      turnsLimit: 50,
      turnsRemaining: 50,
    },
  });
  vi.mocked(rollGemCritBatch).mockReturnValue({ gemsFound: 0, critChance: 0.03 });
});

describe('mineResourceNode stack identity capacity checks', () => {
  it('rejects with BACKPACK_FULL when only a marked same-template stack exists', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      {
        id: 'marked-stack',
        templateId: RESOURCE_TEMPLATE_ID,
        rarity: 'common',
        bonusStats: null,
        craftMarks: [{ markId: 'mark-1', sourceTechniqueId: 'tech-1' }],
      },
    ]);

    await expect(act()).rejects.toMatchObject({ code: 'BACKPACK_FULL' });
    expect(getInventoryState).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('skips capacity check when an unmarked normal stack exists', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      {
        id: 'unmarked-stack',
        templateId: RESOURCE_TEMPLATE_ID,
        rarity: 'common',
        bonusStats: null,
        craftMarks: null,
      },
    ]);

    await expect(act()).resolves.toMatchObject({
      body: { results: { totalYield: 1 } },
    });
    expect(getInventoryState).not.toHaveBeenCalled();
  });
});

describe('listResourceNodes resource category filters', () => {
  it('filters display-name resource types by returned category', async () => {
    mockPrisma.playerResourceNode.findMany.mockResolvedValue([
      discoveredNode({ resourceType: 'Iron Ore' }),
      discoveredNode({ resourceType: 'Sandstone' }),
      discoveredNode({ resourceType: 'Oak Log', skillRequired: 'woodcutting' }),
    ]);

    const result = await listAct({ resourceType: 'ore', page: 1, pageSize: 20 });

    expect(mockPrisma.playerResourceNode.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        playerId: PLAYER_ID,
        resourceNode: expect.objectContaining({
          OR: expect.arrayContaining([
            { resourceType: { in: expect.arrayContaining(['Iron Ore', 'Sandstone']) } },
          ]),
        }),
      }),
    }));
    expect(result.body).toMatchObject({
      nodes: [
        expect.objectContaining({ resourceType: 'Iron Ore', resourceTypeCategory: 'ore' }),
        expect.objectContaining({ resourceType: 'Sandstone', resourceTypeCategory: 'ore' }),
      ],
      filters: { resourceTypes: ['ore'] },
    });
  });
});

describe('mineResourceNode vocation technique integration', () => {
  it('grants passive vocation XP and includes vocation state without a technique', async () => {
    const result = await act();

    expect(grantPassiveVocationXpTx).toHaveBeenCalledWith({
      tx: mockPrisma,
      playerId: PLAYER_ID,
      vocationId: 'prospector',
      source: 'gather',
      baseXp: 5,
    });
    expect(mockPrisma.playerVocationTechnique.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_gathers_prospector' } },
      create: { playerId: PLAYER_ID, statKey: 'vocation_gathers_prospector', value: 1 },
      update: { value: { increment: 1 } },
    });
    expect(result.body).toMatchObject({
      results: { actions: 1, totalYield: 1 },
      stateUpdates: { vocations: { playerId: PLAYER_ID } },
    });
    expect(trackAchievements).toHaveBeenCalledWith(
      PLAYER_ID,
      expect.objectContaining({ totalGatheringActions: 1, totalTurnsSpent: 30 }),
      {
        statKeys: expect.arrayContaining([
          'totalVocationGathers',
          'vocationGathers_prospector',
          'highestVocationRank',
          'vocationRank5Count',
          'vocationRank10Count',
        ]),
      },
    );
  });

  it('applies a selected learned gathering technique to turn cost before spending turns', async () => {
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'prospector_quiet_pick' },
    ]);

    const result = await act({ playerNodeId: NODE_ID, turns: 58, techniqueId: 'prospector_quiet_pick' });

    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(mockPrisma, PLAYER_ID, 58);
    expect(result.body).toMatchObject({
      results: { actions: 2, totalYield: 2 },
    });
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_technique_uses_prospector_quiet_pick' } },
      create: { playerId: PLAYER_ID, statKey: 'vocation_technique_uses_prospector_quiet_pick', value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it('applies a selected learned gathering technique to yield when inventory pressure allows', async () => {
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'prospector_clean_split' },
    ]);
    vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 21, capacity: 24, availableSlots: 3 });

    const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'prospector_clean_split' });

    expect(addStackableItemTx).toHaveBeenCalledWith(mockPrisma, PLAYER_ID, RESOURCE_TEMPLATE_ID, 2);
    expect(result.body).toMatchObject({
      node: { remainingCapacity: 8, nodeDepleted: false },
      results: { actions: 1, totalYield: 2 },
    });
  });

  it('applies a forester wood technique to Oak Log', async () => {
    mockPrisma.playerResourceNode.findUnique.mockResolvedValue({
      ...playerNode(),
      resourceNode: {
        ...playerNode().resourceNode,
        resourceType: 'Oak Log',
        skillRequired: 'woodcutting',
      },
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValue([{ id: RESOURCE_TEMPLATE_ID, name: 'Oak Log' }]);
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'forester_grain_call' },
    ]);
    vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 21, capacity: 24, availableSlots: 3 });

    const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'forester_grain_call' });

    expect(result.body).toMatchObject({
      results: { actions: 1, totalYield: 2 },
      stateUpdates: { vocations: { playerId: PLAYER_ID } },
    });
  });

  it('applies a herbalist herb technique to Forest Sage', async () => {
    mockPrisma.playerResourceNode.findUnique.mockResolvedValue({
      ...playerNode(),
      resourceNode: {
        ...playerNode().resourceNode,
        resourceType: 'Forest Sage',
        skillRequired: 'foraging',
      },
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValue([{ id: RESOURCE_TEMPLATE_ID, name: 'Forest Sage' }]);
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'herbalist_dawn_pinch' },
    ]);
    vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 21, capacity: 24, availableSlots: 3 });

    const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'herbalist_dawn_pinch' });

    expect(result.body).toMatchObject({
      results: { actions: 1, totalYield: 2 },
      stateUpdates: { vocations: { playerId: PLAYER_ID } },
    });
  });

  it('applies a prospector ore technique to Sandstone', async () => {
    mockPrisma.playerResourceNode.findUnique.mockResolvedValue({
      ...playerNode(),
      resourceNode: {
        ...playerNode().resourceNode,
        resourceType: 'Sandstone',
        skillRequired: 'mining',
      },
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValue([{ id: RESOURCE_TEMPLATE_ID, name: 'Sandstone' }]);
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'prospector_clean_split' },
    ]);
    vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 21, capacity: 24, availableSlots: 3 });

    const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'prospector_clean_split' });

    expect(result.body).toMatchObject({
      results: { actions: 1, totalYield: 2 },
      stateUpdates: { vocations: { playerId: PLAYER_ID } },
    });
  });

  it('applies a selected gem crit modifier to the existing gem crit path', async () => {
    mockPrisma.playerResourceNode.findUnique.mockResolvedValue({
      ...playerNode(),
      resourceNode: {
        ...playerNode().resourceNode,
        resourceType: 'rough_gem',
      },
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValue([{ id: RESOURCE_TEMPLATE_ID, name: 'Rough Gem' }]);
    mockPrisma.itemTemplate.findFirst.mockResolvedValue({ id: GEM_TEMPLATE_ID });
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'prospector_bright_inclusion' },
    ]);
    vi.mocked(rollGemCritBatch).mockReturnValue({ gemsFound: 1, critChance: 0.07 });
    vi.mocked(addStackableItemTx)
      .mockResolvedValueOnce({ itemId: 'resource-stack', quantity: 1, created: false })
      .mockResolvedValueOnce({ itemId: 'gem-stack', quantity: 1, created: false });

    const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'prospector_bright_inclusion' });

    expect(rollGemCritBatch).toHaveBeenCalledWith(
      expect.objectContaining({ critChanceBonus: 0.04 }),
      1,
    );
    expect(result.body).toMatchObject({
      gemCrit: { itemTemplateId: GEM_TEMPLATE_ID, gemsFound: 1, critChance: 0.07 },
    });
    expect(trackAchievements).toHaveBeenCalledWith(
      PLAYER_ID,
      expect.any(Object),
      {
        statKeys: expect.arrayContaining(['totalVocationGatherCrits']),
      },
    );
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_gather_crits_prospector_bright_inclusion_gem_crit' } },
      create: { playerId: PLAYER_ID, statKey: 'vocation_gather_crits_prospector_bright_inclusion_gem_crit', value: 1 },
      update: { value: { increment: 1 } },
    });
  });

  it('does not preserve node capacity above the node max capacity', async () => {
    mockPrisma.playerResourceNode.findUnique.mockResolvedValue({
      ...playerNode(),
      remainingCapacity: 2,
      resourceNode: {
        ...playerNode().resourceNode,
        maxCapacity: 1,
      },
    });
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'prospector_deep_vein_sense' },
    ]);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'prospector_deep_vein_sense' });

      expect(result.body).toMatchObject({
        node: { remainingCapacity: 1, nodeDepleted: false },
      });
      expect(mockPrisma.playerResourceNode.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ remainingCapacity: 1 }),
      }));
      expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
        where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_capacity_preserved_prospector_deep_vein_sense' } },
        create: { playerId: PLAYER_ID, statKey: 'vocation_capacity_preserved_prospector_deep_vein_sense', value: 1 },
        update: { value: { increment: 1 } },
      });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('does not preserve node capacity when gathering exhausts final capacity', async () => {
    mockPrisma.playerResourceNode.findUnique.mockResolvedValue({
      ...playerNode(),
      remainingCapacity: 1,
      resourceNode: {
        ...playerNode().resourceNode,
        maxCapacity: 1,
      },
    });
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'prospector_deep_vein_sense' },
    ]);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'prospector_deep_vein_sense' });

      expect(result.body).toMatchObject({
        node: { remainingCapacity: 0, nodeDepleted: true },
      });
      expect(mockPrisma.playerResourceNode.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: NODE_ID }),
      }));
      expect(mockPrisma.playerVocationCounter.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
        where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_capacity_preserved_prospector_deep_vein_sense' } },
      }));
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('rejects an unlearned gathering technique', async () => {
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([]);

    await expect(act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'prospector_clean_split' }))
      .rejects.toMatchObject({ code: 'TECHNIQUE_NOT_ELIGIBLE' });
  });

  it('normalizes herbalism alias to the supported foraging skill during gather execution', async () => {
    mockPrisma.playerResourceNode.findUnique.mockResolvedValue({
      ...playerNode(),
      resourceNode: {
        ...playerNode().resourceNode,
        resourceType: 'Wild Herb',
        skillRequired: 'herbalism',
      },
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValue([{ id: RESOURCE_TEMPLATE_ID, name: 'Wild Herb' }]);
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'herbalist_dawn_pinch' },
    ]);
    vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 21, capacity: 24, availableSlots: 3 });

    const result = await act({ playerNodeId: NODE_ID, turns: 30, techniqueId: 'herbalist_dawn_pinch' });

    expect(getSkillLevel).toHaveBeenCalledWith(PLAYER_ID, 'foraging');
    expect(grantPassiveVocationXpTx).toHaveBeenCalledWith(expect.objectContaining({
      playerId: PLAYER_ID,
      vocationId: 'herbalist',
      source: 'gather',
    }));
    expect(grantSkillXp).toHaveBeenCalledWith(PLAYER_ID, 'foraging', 5, undefined, undefined);
    expect(result.body).toMatchObject({
      results: { actions: 1, totalYield: 2 },
      stateUpdates: { vocations: { playerId: PLAYER_ID } },
    });
  });
});
