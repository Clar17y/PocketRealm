import { describe, it, expect, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('./hpService.js', () => ({ getHpState: vi.fn() }));
vi.mock('./resourceService.js', () => ({ getResourceState: vi.fn() }));
vi.mock('./inventoryService.js', () => ({ getInventoryState: vi.fn() }));

import { toInventoryItemDTO } from './stateUpdateHelpers.js';

describe('toInventoryItemDTO', () => {
  const mockItem = {
    id: 'item-1',
    templateId: 'tpl-1',
    ownerId: 'player-1',
    rarity: 'uncommon' as const,
    currentDurability: 80,
    maxDurability: 100,
    quantity: 1,
    bonusStats: { attack: 5 },
    createdAt: new Date('2026-01-01'),
    inStash: false,
    isSoulbound: false,
    template: {
      id: 'tpl-1',
      name: 'Iron Sword',
      itemType: 'weapon',
      weightClass: 'medium' as const,
      slot: 'mainHand',
      tier: 1,
      baseStats: { attack: 10 },
      requiredSkill: 'melee',
      requiredLevel: 1,
      maxDurability: 100,
      stackable: false,
      sellPrice: 50,
      consumableEffect: null,
      resultTemplateId: null,
      setId: null,
      description: 'A sturdy blade',
      subtype: null,
    },
  };

  it('serialises a Prisma item+template to the InventoryItemDTO shape', () => {
    const dto = toInventoryItemDTO(mockItem);
    expect(dto).toEqual({
      id: 'item-1',
      templateId: 'tpl-1',
      ownerId: 'player-1',
      rarity: 'uncommon',
      currentDurability: 80,
      maxDurability: 100,
      quantity: 1,
      bonusStats: { attack: 5 },
      createdAt: '2026-01-01T00:00:00.000Z',
      template: {
        id: 'tpl-1',
        name: 'Iron Sword',
        itemType: 'weapon',
        weightClass: 'medium',
        slot: 'mainHand',
        tier: 1,
        baseStats: { attack: 10 },
        requiredSkill: 'melee',
        requiredLevel: 1,
        maxDurability: 100,
        stackable: false,
        sellPrice: 50,
      },
      equippedSlot: null,
    });
  });

  it('converts Date createdAt to ISO string', () => {
    const dto = toInventoryItemDTO(mockItem);
    expect(typeof dto.createdAt).toBe('string');
  });

  it('accepts optional equippedSlot', () => {
    const dto = toInventoryItemDTO(mockItem, 'mainHand');
    expect(dto.equippedSlot).toBe('mainHand');
  });

  it('handles null bonusStats', () => {
    const dto = toInventoryItemDTO({ ...mockItem, bonusStats: null });
    expect(dto.bonusStats).toBeNull();
  });
});
