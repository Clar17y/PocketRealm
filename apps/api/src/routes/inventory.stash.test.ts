import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { InventoryItemDTO } from '@pocketrealm/shared';

vi.mock('../utils/routeHelpers.js', () => ({
  assertInTown: vi.fn().mockResolvedValue(undefined),
  getOwnedItem: vi.fn(),
}));

vi.mock('../services/stashService', () => ({
  depositItem: vi.fn().mockResolvedValue(undefined),
  depositBatch: vi.fn(),
  withdrawItem: vi.fn(),
  withdrawBatch: vi.fn(),
  listStash: vi.fn(),
}));

vi.mock('../services/stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn(),
  fetchInventoryMeta: vi.fn().mockResolvedValue({ inventoryCapacity: 24, inventoryUsedSlots: 0 }),
  fetchItemDTOs: vi.fn(),
  fetchMaterialTotals: vi.fn().mockResolvedValue({}),
}));

import { mockPrisma } from '../__test__/setup';
import { errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import { depositItem } from '../services/stashService';
import { fetchItemDTOs } from '../services/stateUpdateHelpers';
import { inventoryRouter } from './inventory';

const itemId = '11111111-1111-4111-8111-111111111111';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/inventory', inventoryRouter);
  app.use(errorHandler);
  return app;
}

function authToken() {
  return generateAccessToken({
    accountId: 'account-1',
    playerId: 'player-1',
    username: 'hero',
    seasonId: null,
    role: 'player',
  });
}

function makeInventoryItemDTO(quantity: number): InventoryItemDTO {
  return {
    id: itemId,
    templateId: 'template-1',
    ownerId: 'player-1',
    rarity: 'common',
    currentDurability: null,
    maxDurability: null,
    quantity,
    bonusStats: null,
    createdAt: '2026-04-24T12:00:00.000Z',
    equippedSlot: null,
    template: {
      id: 'template-1',
      name: 'Iron Ore',
      itemType: 'material',
      weightClass: null,
      slot: null,
      tier: 1,
      baseStats: {},
      requiredSkill: null,
      requiredLevel: 1,
      maxDurability: 0,
      stackable: true,
      sellPrice: 1,
      flavorText: null,
    },
  };
}

describe('inventory stash routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.update.mockResolvedValue({});
  });

  it('removes a fully deposited item from inventory state when the source row moved to stash', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({ inStash: true });

    const res = await request(buildApp())
      .post('/api/v1/inventory/stash/deposit')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ itemId });

    expect(res.status).toBe(200);
    expect(res.body.stateUpdates).toEqual({
      inventoryRemoved: [itemId],
      inventoryUsedSlots: 0,
      materialTotals: {},
    });
    expect(fetchItemDTOs).not.toHaveBeenCalled();
  });

  it('updates inventory state when a partial deposit leaves source quantity in the backpack', async () => {
    const remainingItem = makeInventoryItemDTO(7);
    mockPrisma.item.findUnique.mockResolvedValue({ inStash: false });
    vi.mocked(fetchItemDTOs).mockResolvedValue([remainingItem]);

    const res = await request(buildApp())
      .post('/api/v1/inventory/stash/deposit')
      .set('Authorization', `Bearer ${authToken()}`)
      .send({ itemId, quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.stateUpdates).toEqual({
      inventoryUpdated: [remainingItem],
      inventoryUsedSlots: 0,
      materialTotals: {},
    });
    expect(depositItem).toHaveBeenCalledWith('player-1', itemId, 3);
    expect(fetchItemDTOs).toHaveBeenCalledWith([itemId]);
  });
});
