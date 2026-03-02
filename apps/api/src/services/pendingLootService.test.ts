import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('./inventoryService', async (importOriginal) => {
  const original = await importOriginal<typeof import('./inventoryService')>();
  return {
    ...original,
    getInventoryState: vi.fn(),
  };
});

import { mockPrisma } from '../__test__/setup';
import { redis } from '../redis';
import { getInventoryState } from './inventoryService';
import { storePendingLoot, getPendingLoot, claimPendingLoot } from './pendingLootService';
import type { PendingLootItem } from './pendingLootService';

const mockRedis = redis as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockGetInventoryState = getInventoryState as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetInventoryState.mockResolvedValue({ usedSlots: 5, capacity: 24, availableSlots: 19 });
});

const sampleLoot: PendingLootItem[] = [
  {
    templateId: 'tpl-sword',
    templateName: 'Iron Sword',
    rarity: 'common',
    quantity: 1,
    bonusStats: { attack: 5 },
    currentDurability: 100,
    maxDurability: 100,
  },
  {
    templateId: 'tpl-ore',
    templateName: 'Iron Ore',
    rarity: 'common',
    quantity: 3,
    bonusStats: null,
    currentDurability: null,
    maxDurability: null,
  },
];

describe('storePendingLoot', () => {
  it('stores items in Redis with TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const sessionId = await storePendingLoot('p1', sampleLoot);

    expect(sessionId).toBeTruthy();
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('pending_loot:p1:'),
      JSON.stringify(sampleLoot),
      'EX',
      600 // INVENTORY_CONSTANTS.PENDING_LOOT_TTL_SECONDS
    );
  });
});

describe('getPendingLoot', () => {
  it('retrieves and parses stored loot', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(sampleLoot));

    const result = await getPendingLoot('p1', 'session-1');

    expect(result).toEqual(sampleLoot);
    expect(mockRedis.get).toHaveBeenCalledWith('pending_loot:p1:session-1');
  });

  it('returns null for missing key', async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await getPendingLoot('p1', 'expired-session');

    expect(result).toBeNull();
  });
});

describe('claimPendingLoot', () => {
  it('creates items in inventory and deletes Redis key', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(sampleLoot));
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.item.create.mockResolvedValue({});

    await claimPendingLoot('p1', 'session-1', [0, 1]);

    expect(mockPrisma.item.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'p1',
        templateId: 'tpl-sword',
        rarity: 'common',
      }),
    });
    expect(mockRedis.del).toHaveBeenCalledWith('pending_loot:p1:session-1');
  });

  it('throws when loot session expired', async () => {
    mockRedis.get.mockResolvedValue(null);

    await expect(claimPendingLoot('p1', 'expired', [0])).rejects.toThrow(
      'Pending loot expired or not found'
    );
  });

  it('respects capacity limit', async () => {
    mockGetInventoryState.mockResolvedValue({ usedSlots: 23, capacity: 24, availableSlots: 1 });
    mockRedis.get.mockResolvedValue(JSON.stringify(sampleLoot));
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.item.create.mockResolvedValue({});

    await claimPendingLoot('p1', 'session-1', [0, 1]);

    // Only 1 slot available (23/24), so only first item should be created
    expect(mockPrisma.item.create).toHaveBeenCalledTimes(1);
  });

  it('skips invalid indices', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(sampleLoot));
    mockRedis.del.mockResolvedValue(1);
    mockPrisma.item.create.mockResolvedValue({});

    await claimPendingLoot('p1', 'session-1', [-1, 99, 0]);

    expect(mockPrisma.item.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ templateId: 'tpl-sword' }),
    });
  });

  it('deletes Redis key even when no items selected', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(sampleLoot));
    mockRedis.del.mockResolvedValue(1);

    await claimPendingLoot('p1', 'session-1', []);

    expect(mockPrisma.item.create).not.toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledWith('pending_loot:p1:session-1');
  });
});
