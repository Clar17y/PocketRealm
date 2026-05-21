import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { mineResourceNode } from './gatheringRouteService';
import { getInventoryState, assertNotOverEncumbered } from './inventoryService';
import { getSkillLevel } from './combatStatsService.js';

vi.mock('./inventoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./inventoryService')>();
  return {
    ...actual,
    addStackableItemTx: vi.fn(),
    getInventoryState: vi.fn(),
    assertNotOverEncumbered: vi.fn(),
  };
});

vi.mock('../utils/routeHelpers.js', () => ({
  assertNotRecovering: vi.fn().mockResolvedValue(null),
  paginationSchema: {},
  buildPagination: vi.fn(),
  serializeXpGrant: vi.fn((grant) => grant),
  trackAchievements: vi.fn(),
}));

vi.mock('./combatStatsService.js', () => ({
  getSkillLevel: vi.fn(),
}));

vi.mock('./expeditionLockoutService', () => ({
  checkActivityLockout: vi.fn(),
}));

vi.mock('./worldEventService', () => ({
  computeZoneModifiers: vi.fn().mockReturnValue({ resourceYield: 1, turnCostMultiplier: 1 }),
  computeEventSummaries: vi.fn().mockReturnValue([]),
  getActiveEventsForZone: vi.fn().mockResolvedValue([]),
  getActiveWorldWideEvents: vi.fn().mockResolvedValue([]),
  getEventModifiersForEntity: vi.fn().mockResolvedValue([]),
}));

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
const NODE_ID = '22222222-2222-4222-8222-222222222222';
const RESOURCE_TEMPLATE_ID = '33333333-3333-4333-8333-333333333333';

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
      zone: { id: 'zone-1' },
    },
  };
}

async function act() {
  return mineResourceNode({
    body: { playerNodeId: NODE_ID, turns: 30 },
    player: { playerId: PLAYER_ID, username: 'Tester', accountId: 'account-1', seasonId: null, role: 'player' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.playerResourceNode.findUnique.mockResolvedValue(playerNode());
  mockPrisma.itemTemplate.findMany.mockResolvedValue([{ id: RESOURCE_TEMPLATE_ID, name: 'Iron Ore' }]);
  vi.mocked(getSkillLevel).mockResolvedValue(1);
  vi.mocked(assertNotOverEncumbered).mockResolvedValue(undefined);
  vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 24, capacity: 24, availableSlots: 0 });
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

    await expect(act()).rejects.not.toMatchObject({ code: 'BACKPACK_FULL' });
    expect(getInventoryState).not.toHaveBeenCalled();
  });
});
