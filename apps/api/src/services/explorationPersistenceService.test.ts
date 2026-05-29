import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cacheLootService', () => ({
  grantCacheLootTx: vi.fn(),
}));
vi.mock('./inventoryService', () => ({
  getInventoryState: vi.fn().mockResolvedValue({ usedSlots: 0, capacity: 100, availableSlots: 100 }),
}));
vi.mock('./pendingLootService', () => ({
  storePendingLoot: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { persistExplorationResults } from './explorationPersistenceService';

describe('persistExplorationResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.activityLog.create.mockResolvedValue({ id: 'exploration-log-id' });
    mockPrisma.playerResourceNode.create.mockResolvedValue({ id: 'resource-node-id' });
    mockPrisma.encounterSite.create.mockResolvedValue({
      id: 'encounter-site-id',
      discoveredAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('batch inserts independent resource, site, and combat log rows with stable response ids', async () => {
    const events = [
      { turn: 10, type: 'ambush_victory' as const, description: 'victory', details: { log: [] } },
      { turn: 20, type: 'ambush_victory' as const, description: 'victory', details: { log: [] } },
    ];

    const result = await persistExplorationResults({
      playerId: 'player-1',
      zoneId: 'zone-1',
      zoneName: 'Forest Edge',
      turnsToSpend: 2500,
      aborted: false,
      abortedAtTurn: null,
      refundAmount: 0,
      events,
      pendingResources: [
        {
          turnOccurred: 3,
          resourceNodeId: 'resource-1',
          resourceType: 'Copper Ore',
          capacity: 12,
          sizeName: 'Small',
        },
        {
          turnOccurred: 4,
          resourceNodeId: 'resource-2',
          resourceType: 'Oak Log',
          capacity: 18,
          sizeName: 'Medium',
        },
      ],
      pendingSites: [
        {
          turnOccurred: 5,
          mobFamilyId: 'family-1',
          siteName: 'Small Rat Nest',
          size: 'small',
          mobs: [{ slot: 0, mobTemplateId: 'mob-1', role: 'trash', prefix: null, status: 'alive', room: 1 }],
        },
        {
          turnOccurred: 6,
          mobFamilyId: 'family-2',
          siteName: 'Spider Nest',
          size: 'medium',
          mobs: [
            { slot: 0, mobTemplateId: 'mob-2', role: 'trash', prefix: null, status: 'alive', room: 1 },
            { slot: 1, mobTemplateId: 'mob-3', role: 'elite', prefix: null, status: 'alive', room: 2 },
          ],
        },
      ],
      pendingCombatLogs: [
        { turnsSpent: 0, result: { mob: 'mob-1' } },
        { turnsSpent: 0, result: { mob: 'mob-2' } },
      ],
      pendingCacheLoot: [],
      hiddenCaches: [],
      allNewItemIds: [],
      allUpdatedItemIds: [],
      currentHp: 97,
      zoneExitDiscovered: false,
      luck: 0,
    });

    expect(mockPrisma.playerResourceNode.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', resourceNodeId: 'resource-1' }),
        expect.objectContaining({ playerId: 'player-1', resourceNodeId: 'resource-2' }),
      ]),
    });
    expect(mockPrisma.encounterSite.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', zoneId: 'zone-1', mobFamilyId: 'family-1' }),
        expect.objectContaining({ playerId: 'player-1', zoneId: 'zone-1', mobFamilyId: 'family-2' }),
      ]),
    });
    expect(mockPrisma.activityLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ playerId: 'player-1', activityType: 'combat', result: { mob: 'mob-1' } }),
        expect.objectContaining({ playerId: 'player-1', activityType: 'combat', result: { mob: 'mob-2' } }),
      ]),
    });
    expect(mockPrisma.playerResourceNode.create).not.toHaveBeenCalled();
    expect(mockPrisma.encounterSite.create).not.toHaveBeenCalled();
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(1);

    const resourceRows = mockPrisma.playerResourceNode.createMany.mock.calls[0][0].data;
    const siteRows = mockPrisma.encounterSite.createMany.mock.calls[0][0].data;
    const combatLogRows = mockPrisma.activityLog.createMany.mock.calls[0][0].data;

    expect(result.resourceDiscoveries.map((resource) => resource.playerNodeId)).toEqual(
      resourceRows.map((resource: { id: string }) => resource.id),
    );
    expect(result.encounterSites.map((site) => site.encounterSiteId)).toEqual(
      siteRows.map((site: { id: string }) => site.id),
    );
    expect(result.combatLogIds).toEqual(
      combatLogRows.map((log: { id: string }) => log.id),
    );
  });
});
