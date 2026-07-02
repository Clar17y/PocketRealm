import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { InventoryItemDTO } from '@pocketrealm/shared';

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((req: { player?: unknown }, _res: unknown, next: () => void) => {
    req.player = {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'hero',
      seasonId: null,
      role: 'player',
    };
    next();
  }),
}));

vi.mock('../utils/routeHelpers.js', () => ({
  assertNotRecovering: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/equipmentService', () => ({
  equipItem: vi.fn().mockResolvedValue(undefined),
  unequipSlot: vi.fn().mockResolvedValue(undefined),
  getEquippedItemInSlot: vi.fn(),
  ensureEquipmentSlots: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/stateUpdateHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/stateUpdateHelpers')>();
  return {
    ...actual,
    fetchInventoryMeta: vi.fn(),
    fetchEquipmentMap: vi.fn(),
  };
});

import { errorHandler } from '../middleware/errorHandler';
import { equipItem, unequipSlot, getEquippedItemInSlot } from '../services/equipmentService';
import { fetchEquipmentMap, fetchInventoryMeta } from '../services/stateUpdateHelpers';
import { equipmentRouter } from './equipment';

const itemId = '11111111-1111-4111-8111-111111111111';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/equipment', equipmentRouter);
  app.use(errorHandler);
  return app;
}

function makeInventoryItemDTO(overrides: Partial<InventoryItemDTO> = {}): InventoryItemDTO {
  return {
    id: itemId,
    templateId: 'template-backpack',
    ownerId: 'player-1',
    rarity: 'common',
    currentDurability: null,
    maxDurability: null,
    quantity: 1,
    bonusStats: null,
    createdAt: '2026-07-02T12:00:00.000Z',
    equippedSlot: 'backpack',
    template: {
      id: 'template-backpack',
      name: 'Cloth Satchel',
      itemType: 'armor',
      weightClass: null,
      slot: 'backpack',
      tier: 1,
      baseStats: { inventorySlots: 8 },
      requiredSkill: null,
      requiredLevel: 1,
      maxDurability: 0,
      stackable: false,
      sellPrice: 15,
      flavorText: null,
    },
    ...overrides,
  };
}

function makeEquippedItem(): NonNullable<Awaited<ReturnType<typeof getEquippedItemInSlot>>> {
  const item: NonNullable<Awaited<ReturnType<typeof getEquippedItemInSlot>>> = {
    id: itemId,
    templateId: 'template-backpack',
    ownerId: 'player-1',
    rarity: 'common',
    currentDurability: null,
    maxDurability: null,
    quantity: 1,
    bonusStats: null,
    createdAt: new Date('2026-07-02T12:00:00.000Z'),
    inStash: false,
    isSoulbound: false,
    template: {
      id: 'template-backpack',
      name: 'Cloth Satchel',
      seasonId: null,
      itemType: 'armor',
      weightClass: null,
      setId: null,
      slot: 'backpack',
      tier: 1,
      baseStats: { inventorySlots: 8 },
      requiredSkill: null,
      requiredLevel: 1,
      maxDurability: 0,
      stackable: false,
      consumableEffect: null,
      sellPrice: 15,
      flavorText: null,
    },
  };
  return item;
}

describe('equipment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns refreshed inventory capacity after equipping a backpack', async () => {
    const equippedBackpack = makeInventoryItemDTO();
    let inventoryCapacity = 24;
    vi.mocked(getEquippedItemInSlot).mockResolvedValue(null);
    vi.mocked(equipItem).mockImplementationOnce(async () => {
      inventoryCapacity = 32;
    });
    vi.mocked(fetchEquipmentMap).mockResolvedValue({ backpack: equippedBackpack });
    vi.mocked(fetchInventoryMeta).mockImplementation(async () => ({ inventoryCapacity, inventoryUsedSlots: 4 }));

    const res = await request(buildApp())
      .post('/api/v1/equipment/equip')
      .send({ itemId, slot: 'backpack' });

    expect(res.status).toBe(200);
    expect(equipItem).toHaveBeenCalledWith('player-1', itemId, 'backpack');
    expect(fetchInventoryMeta).toHaveBeenCalledWith('player-1');
    expect(vi.mocked(equipItem).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(fetchInventoryMeta).mock.invocationCallOrder[0]);
    expect(res.body.stateUpdates).toEqual({
      equipment: { backpack: equippedBackpack },
      inventoryUpdated: [equippedBackpack],
      inventoryCapacity: 32,
      inventoryUsedSlots: 4,
    });
  });

  it('returns refreshed inventory capacity after unequipping a backpack', async () => {
    const unequippedBackpack = makeInventoryItemDTO({ equippedSlot: null });
    let inventoryCapacity = 32;
    vi.mocked(getEquippedItemInSlot).mockResolvedValue(makeEquippedItem());
    vi.mocked(unequipSlot).mockImplementationOnce(async () => {
      inventoryCapacity = 24;
    });
    vi.mocked(fetchEquipmentMap).mockResolvedValue({ backpack: null });
    vi.mocked(fetchInventoryMeta).mockImplementation(async () => ({ inventoryCapacity, inventoryUsedSlots: 5 }));

    const res = await request(buildApp())
      .post('/api/v1/equipment/unequip')
      .send({ slot: 'backpack' });

    expect(res.status).toBe(200);
    expect(unequipSlot).toHaveBeenCalledWith('player-1', 'backpack');
    expect(fetchInventoryMeta).toHaveBeenCalledWith('player-1');
    expect(vi.mocked(unequipSlot).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(fetchInventoryMeta).mock.invocationCallOrder[0]);
    expect(res.body.stateUpdates).toEqual({
      equipment: { backpack: null },
      inventoryUpdated: [unequippedBackpack],
      inventoryCapacity: 24,
      inventoryUsedSlots: 5,
    });
  });
});
