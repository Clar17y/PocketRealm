import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { prisma } from '@pocketrealm/database';
import { bootstrapSeason } from './seasonBootstrapService';

const mockPrisma = prisma as any;

const permanentZones = [
  {
    id: 'zone-perm-1',
    name: 'Starter Grove',
    seasonId: null,
    description: 'The first safe zone.',
    arrivalText: 'You arrive at the grove.',
    ambientTexts: ['Birds sing overhead.'],
    environmentalTexts: ['Moss covers the stones.'],
    difficulty: 1,
    travelCost: 0,
    isStarter: true,
    zoneType: 'starter',
    zoneExitChance: 0.1,
    maxCraftingLevel: 5,
    turnsToExplore: 1,
    explorationTiers: [{ threshold: 0, description: 'Beginner' }],
  },
  {
    id: 'zone-perm-2',
    name: 'Old Road',
    seasonId: null,
    description: 'A weathered road leading east.',
    arrivalText: 'You step onto the road.',
    ambientTexts: ['Wind blows across the stones.'],
    environmentalTexts: ['Broken carts line the path.'],
    difficulty: 2,
    travelCost: 1,
    isStarter: false,
    zoneType: 'wilderness',
    zoneExitChance: 0.2,
    maxCraftingLevel: 10,
    turnsToExplore: 2,
    explorationTiers: [{ threshold: 10, description: 'Skilled' }],
  },
];

const permanentItemTemplates = [
  {
    id: 'item-perm-1',
    name: 'Bronze Sword',
    seasonId: null,
    itemType: 'weapon',
    weightClass: 'medium',
    setId: null,
    slot: 'main_hand',
    tier: 1,
    baseStats: { attack: 3 },
    requiredSkill: null,
    requiredLevel: 1,
    maxDurability: 50,
    stackable: false,
    consumableEffect: null,
    sellPrice: 12,
    flavorText: 'A sturdy starter blade.',
  },
  {
    id: 'item-perm-2',
    name: 'Leather Vest',
    seasonId: null,
    itemType: 'armor',
    weightClass: 'light',
    setId: null,
    slot: 'body',
    tier: 1,
    baseStats: { defence: 2 },
    requiredSkill: null,
    requiredLevel: 1,
    maxDurability: 40,
    stackable: false,
    consumableEffect: null,
    sellPrice: 10,
    flavorText: 'A reinforced vest.',
  },
];

const permanentMobTemplates = [
  {
    id: 'mob-perm-1',
    name: 'Field Rat',
    zoneId: 'zone-perm-1',
    seasonId: null,
    level: 1,
    hp: 10,
    accuracy: 5,
    defence: 1,
    magicDefence: 0,
    evasion: 2,
    damageMin: 1,
    damageMax: 2,
    xpReward: 5,
    encounterWeight: 10,
    explorationTier: 1,
    spellPattern: null,
    damageType: 'physical',
    isExpeditionMob: false,
    isBoss: false,
    bossAoeDmg: null,
    bossBaseHp: null,
    flavorAppearance: 'Small and quick.',
    flavorBehavior: 'Skitters between roots.',
    flavorLore: 'Common pests of the grove.',
  },
];

describe('bootstrapSeason', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(mockPrisma));
  });

  it('clones permanent records into the target season and remaps foreign keys', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
      id: 'season-1',
      status: 'upcoming',
    });
    mockPrisma.zone.findFirst.mockResolvedValue(null);
    mockPrisma.zone.findMany.mockResolvedValue(permanentZones);
    mockPrisma.itemTemplate.findMany.mockResolvedValue(permanentItemTemplates);
    mockPrisma.mobTemplate.findMany.mockResolvedValue(permanentMobTemplates);
    mockPrisma.zoneConnection.findMany.mockResolvedValue([
      {
        id: 'connection-perm-1',
        fromId: 'zone-perm-1',
        toId: 'zone-perm-2',
        explorationThreshold: 7,
      },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValue([
      {
        id: 'drop-perm-1',
        mobTemplateId: 'mob-perm-1',
        itemTemplateId: 'item-perm-1',
        dropChance: 0.5,
        minQuantity: 1,
        maxQuantity: 2,
      },
    ]);
    mockPrisma.chestDropTable.findMany.mockResolvedValue([
      {
        id: 'chest-perm-1',
        mobFamilyId: 'family-perm-1',
        chestRarity: 'rare',
        itemTemplateId: 'item-perm-2',
        dropChance: 0.25,
        minQuantity: 1,
        maxQuantity: 1,
      },
    ]);
    mockPrisma.resourceNode.findMany.mockResolvedValue([
      {
        id: 'node-perm-1',
        zoneId: 'zone-perm-2',
        resourceType: 'wood',
        skillRequired: 'woodcutting',
        levelRequired: 1,
        baseYield: 2,
        discoveryChance: 0.3,
        minCapacity: 10,
        maxCapacity: 20,
        discoveryWeight: 5,
      },
    ]);
    mockPrisma.craftingRecipe.findMany.mockResolvedValue([
      {
        id: 'recipe-perm-1',
        seasonId: null,
        skillType: 'smithing',
        requiredLevel: 2,
        resultTemplateId: 'item-perm-1',
        isAdvanced: false,
        soulbound: false,
        mobFamilyId: 'family-perm-1',
        turnCost: 3,
        materials: [{ itemTemplateId: 'item-perm-2', quantity: 2 }],
        xpReward: 25,
      },
    ]);
    mockPrisma.zoneMobFamily.findMany.mockResolvedValue([
      {
        zoneId: 'zone-perm-1',
        mobFamilyId: 'family-perm-1',
        discoveryWeight: 11,
        minSize: 1,
        maxSize: 3,
      },
    ]);

    mockPrisma.zone.create
      .mockResolvedValueOnce({ id: 'zone-season-1' })
      .mockResolvedValueOnce({ id: 'zone-season-2' });
    mockPrisma.itemTemplate.create
      .mockResolvedValueOnce({ id: 'item-season-1' })
      .mockResolvedValueOnce({ id: 'item-season-2' });
    mockPrisma.mobTemplate.create.mockResolvedValueOnce({ id: 'mob-season-1' });

    const result = await bootstrapSeason('season-1');

    expect(result).toEqual({ seasonId: 'season-1' });
    expect(mockPrisma.zone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seasonId: 'season-1',
        name: 'Starter Grove',
      }),
    });
    expect(mockPrisma.zoneConnection.createMany).toHaveBeenCalledWith({
      data: [
        {
          fromId: 'zone-season-1',
          toId: 'zone-season-2',
          explorationThreshold: 7,
        },
      ],
    });
    expect(mockPrisma.itemTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seasonId: 'season-1',
        name: 'Bronze Sword',
      }),
    });
    expect(mockPrisma.mobTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seasonId: 'season-1',
        zoneId: 'zone-season-1',
        name: 'Field Rat',
      }),
    });
    expect(mockPrisma.dropTable.createMany).toHaveBeenCalledWith({
      data: [
        {
          mobTemplateId: 'mob-season-1',
          itemTemplateId: 'item-season-1',
          dropChance: 0.5,
          minQuantity: 1,
          maxQuantity: 2,
        },
      ],
    });
    expect(mockPrisma.chestDropTable.createMany).toHaveBeenCalledWith({
      data: [
        {
          mobFamilyId: 'family-perm-1',
          chestRarity: 'rare',
          itemTemplateId: 'item-season-2',
          dropChance: 0.25,
          minQuantity: 1,
          maxQuantity: 1,
        },
      ],
    });
    expect(mockPrisma.resourceNode.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          zoneId: 'zone-season-2',
          resourceType: 'wood',
        }),
      ],
    });
    expect(mockPrisma.craftingRecipe.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          seasonId: 'season-1',
          resultTemplateId: 'item-season-1',
          mobFamilyId: 'family-perm-1',
        }),
      ],
    });
    expect(mockPrisma.zoneMobFamily.createMany).toHaveBeenCalledWith({
      data: [
        {
          zoneId: 'zone-season-1',
          mobFamilyId: 'family-perm-1',
          discoveryWeight: 11,
          minSize: 1,
          maxSize: 3,
        },
      ],
    });
  });

  it('rejects already bootstrapped seasons', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
      id: 'season-1',
      status: 'upcoming',
    });
    mockPrisma.zone.findFirst.mockResolvedValue({
      id: 'zone-season-1',
      seasonId: 'season-1',
      isStarter: true,
    });

    await expect(bootstrapSeason('season-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'SEASON_ALREADY_BOOTSTRAPPED',
    });
    expect(mockPrisma.zone.findMany).not.toHaveBeenCalled();
  });

  it('rejects non-upcoming seasons', async () => {
    mockPrisma.season.findUniqueOrThrow.mockResolvedValue({
      id: 'season-1',
      status: 'active',
    });

    await expect(bootstrapSeason('season-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'SEASON_NOT_UPCOMING',
    });
    expect(mockPrisma.zone.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.zone.findMany).not.toHaveBeenCalled();
  });
});
