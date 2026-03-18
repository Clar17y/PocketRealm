import { describe, it, expect, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('./hpService.js', () => ({ getHpState: vi.fn() }));
vi.mock('./resourceService.js', () => ({ getResourceState: vi.fn() }));
vi.mock('./inventoryService.js', () => ({ getInventoryState: vi.fn() }));

import { toInventoryItemDTO, toSkillStateDTO } from './stateUpdateHelpers.js';

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
      flavorText: null,
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
        flavorText: null,
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

describe('toSkillStateDTO', () => {
  const baseSkill = {
    id: 'skill-1',
    skillType: 'mining',
    level: 10,
    xp: BigInt(5000),
    dailyXpGained: 300,
    lastXpResetAt: new Date('2026-03-17T06:00:00Z'),
  };

  it('converts BigInt xp to number', () => {
    const now = new Date('2026-03-17T07:00:00Z');
    const dto = toSkillStateDTO(baseSkill, now);
    expect(dto.xp).toBe(5000);
    expect(typeof dto.xp).toBe('number');
  });

  it('preserves dailyXpGained within the same XP window', () => {
    const now = new Date('2026-03-17T07:00:00Z'); // 1h later
    const dto = toSkillStateDTO(baseSkill, now);
    expect(dto.dailyXpGained).toBe(300);
  });

  it('resets dailyXpGained to 0 when XP window has rolled over (12h)', () => {
    const now = new Date('2026-03-17T18:00:00Z'); // 12h later
    const dto = toSkillStateDTO(baseSkill, now);
    expect(dto.dailyXpGained).toBe(0);
  });

  it('resets dailyXpGained to 0 when well past the window (24h)', () => {
    const now = new Date('2026-03-18T06:00:00Z');
    const dto = toSkillStateDTO(baseSkill, now);
    expect(dto.dailyXpGained).toBe(0);
  });

  it('preserves dailyXpGained at 11h59m (just under 12h window)', () => {
    const justUnder = new Date(baseSkill.lastXpResetAt.getTime() + 11 * 60 * 60_000 + 59 * 60_000);
    const dto = toSkillStateDTO(baseSkill, justUnder);
    expect(dto.dailyXpGained).toBe(300);
  });

  it('copies all fields correctly', () => {
    const now = new Date('2026-03-17T07:00:00Z');
    const dto = toSkillStateDTO(baseSkill, now);
    expect(dto).toEqual({
      id: 'skill-1',
      skillType: 'mining',
      level: 10,
      xp: 5000,
      dailyXpGained: 300,
    });
  });
});
