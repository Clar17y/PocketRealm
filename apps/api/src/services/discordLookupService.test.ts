import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { lookupItemForDiscord, lookupMobForDiscord, lookupResourceForDiscord } from './discordLookupService';

describe('lookupItemForDiscord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.season.findFirst.mockResolvedValue(null);
  });

  it('returns a full item card for an exact match with drop and craft sources', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      {
        id: 'item-1',
        name: 'Iron Ingot',
        itemType: 'resource',
        slot: null,
        tier: 2,
        weightClass: null,
        setId: null,
        requiredSkill: null,
        requiredLevel: 1,
        sellPrice: 10,
        flavorText: 'A sturdy bar of iron.',
        baseStats: {},
        seasonId: null,
        season: null,
      },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([
      {
        dropChance: 0.25,
        minQuantity: 1,
        maxQuantity: 2,
        mobTemplate: { name: 'Iron Golem', zone: { name: 'Iron Hills' } },
      },
    ]);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValueOnce({
      skillType: 'refining',
      requiredLevel: 12,
      turnCost: 12,
      xpReward: 22,
      materials: [{ templateId: 'ore-1', quantity: 2 }],
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([{ id: 'ore-1', name: 'Iron Ore' }]);

    const result = await lookupItemForDiscord('iron ingot');

    expect(result.suggestions).toEqual([]);
    expect(result.match).toMatchObject({
      name: 'Iron Ingot',
      tier: 2,
      season: null,
      sources: {
        drops: [{ mobName: 'Iron Golem', zoneName: 'Iron Hills', dropRatePct: 25, minQty: 1, maxQty: 2 }],
        craft: { skillType: 'refining', materials: [{ name: 'Iron Ore', quantity: 2 }] },
      },
    });
  });

  it('returns non-zero stats in canonical order', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      {
        id: 'sword-1', name: 'Iron Sword', itemType: 'weapon', slot: 'mainhand', tier: 2,
        weightClass: 'medium', setId: null, requiredSkill: 'melee', requiredLevel: 5,
        sellPrice: 40, flavorText: null, baseStats: { armor: 0, attack: 12, accuracy: 3 },
        seasonId: null, season: null,
      },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([]);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValueOnce(null);

    const result = await lookupItemForDiscord('Iron Sword');

    expect(result.match?.stats).toEqual([
      { key: 'attack', value: 12 },
      { key: 'accuracy', value: 3 },
    ]);
  });

  it('returns suggestions when there is no exact match', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      { id: 'a', name: 'Spider Silk', baseStats: {}, seasonId: null, season: null },
      { id: 'b', name: 'Spider Fang', baseStats: {}, seasonId: null, season: null },
    ]);

    const result = await lookupItemForDiscord('spider');

    expect(result.match).toBeNull();
    expect(result.suggestions).toEqual(expect.arrayContaining(['Spider Silk', 'Spider Fang']));
  });

  it('prefers the active-season template and labels the season', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({ id: 'season-2', name: 'Season of Embers' });
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      { id: 'base', name: 'Ember Blade', baseStats: {}, seasonId: null, season: null, itemType: 'weapon', slot: 'mainhand', tier: 3, weightClass: null, setId: null, requiredSkill: null, requiredLevel: 1, sellPrice: null, flavorText: null },
      { id: 'seasonal', name: 'Ember Blade', baseStats: {}, seasonId: 'season-2', season: { id: 'season-2', name: 'Season of Embers', startsAt: new Date('2026-06-01') }, itemType: 'weapon', slot: 'mainhand', tier: 5, weightClass: null, setId: null, requiredSkill: null, requiredLevel: 1, sellPrice: null, flavorText: null },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([]);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValueOnce(null);

    const result = await lookupItemForDiscord('Ember Blade');

    expect(result.match?.tier).toBe(5);
    expect(result.match?.season).toEqual({ name: 'Season of Embers' });
    // drops queried only for the seasonal template id
    expect(mockPrisma.dropTable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemTemplateId: { in: ['seasonal'] } } }),
    );
  });

  it('falls back to the most recent season when there is no active or base template', async () => {
    mockPrisma.season.findFirst.mockResolvedValue(null);
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      {
        id: 'old', name: 'Frost Brand', itemType: 'weapon', slot: 'mainhand', tier: 2,
        weightClass: null, setId: null, requiredSkill: null, requiredLevel: 1,
        sellPrice: null, flavorText: null, baseStats: {},
        seasonId: 'season-1', season: { id: 'season-1', name: 'Old Season', startsAt: new Date('2026-01-01') },
      },
      {
        id: 'new', name: 'Frost Brand', itemType: 'weapon', slot: 'mainhand', tier: 4,
        weightClass: null, setId: null, requiredSkill: null, requiredLevel: 1,
        sellPrice: null, flavorText: null, baseStats: {},
        seasonId: 'season-3', season: { id: 'season-3', name: 'New Season', startsAt: new Date('2026-05-01') },
      },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([]);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValueOnce(null);

    const result = await lookupItemForDiscord('Frost Brand');

    expect(result.match?.season).toEqual({ name: 'New Season' });
    expect(result.match?.tier).toBe(4);
    expect(mockPrisma.dropTable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemTemplateId: { in: ['new'] } } }),
    );
  });
});

describe('lookupMobForDiscord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.season.findFirst.mockResolvedValue(null);
  });

  it('aggregates zones across same-named mobs and omits combat stats', async () => {
    mockPrisma.mobTemplate.findMany.mockResolvedValueOnce([
      { id: 'm1', name: 'Warg', isBoss: false, isExpeditionMob: false, flavorAppearance: 'A grey wolf.', seasonId: null, season: null, zone: { name: 'Whispering Plains' } },
      { id: 'm2', name: 'Warg', isBoss: false, isExpeditionMob: false, flavorAppearance: 'A grey wolf.', seasonId: null, season: null, zone: { name: 'Frostpeak' } },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([
      { dropChance: 0.5, minQuantity: 1, maxQuantity: 1, itemTemplate: { name: 'Warg Pelt', itemType: 'resource', tier: 1 } },
    ]);

    const result = await lookupMobForDiscord('warg');

    expect(result.match).toEqual({
      name: 'Warg',
      isBoss: false,
      isExpeditionMob: false,
      season: null,
      zones: ['Whispering Plains', 'Frostpeak'],
      flavorAppearance: 'A grey wolf.',
      drops: [{ itemName: 'Warg Pelt', itemType: 'resource', tier: 1, dropRatePct: 50, minQty: 1, maxQty: 1 }],
    });
    expect(JSON.stringify(result.match)).not.toContain('hp');
  });

  it('flags expedition-only mobs', async () => {
    mockPrisma.mobTemplate.findMany.mockResolvedValueOnce([
      { id: 'm1', name: 'Cavern Spider', isBoss: false, isExpeditionMob: true, flavorAppearance: null, seasonId: null, season: null, zone: { name: 'Forest Edge' } },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([]);

    const result = await lookupMobForDiscord('Cavern Spider');

    expect(result.match?.isExpeditionMob).toBe(true);
  });

  it('returns suggestions when no exact mob match exists', async () => {
    mockPrisma.mobTemplate.findMany.mockResolvedValueOnce([
      { id: 'm1', name: 'Forest Spider', seasonId: null, season: null, zone: { name: 'Forest Edge' } },
    ]);

    const result = await lookupMobForDiscord('spider');

    expect(result.match).toBeNull();
    expect(result.suggestions).toContain('Forest Spider');
  });
});

describe('lookupResourceForDiscord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.season.findFirst.mockResolvedValue(null);
  });

  it('returns all resources containing the query with their zones', async () => {
    mockPrisma.resourceNode.findMany.mockResolvedValueOnce([
      {
        id: 'iron-node',
        resourceType: 'Iron Ore',
        skillRequired: 'mining',
        levelRequired: 12,
        baseYield: 1,
        discoveryChance: 0.25,
        minCapacity: 25,
        maxCapacity: 120,
        zone: { name: 'Deep Mines', difficulty: 3, seasonId: null, season: null },
      },
      {
        id: 'dark-iron-node',
        resourceType: 'Dark Iron Ore',
        skillRequired: 'mining',
        levelRequired: 20,
        baseYield: 1,
        discoveryChance: 0.2,
        minCapacity: 30,
        maxCapacity: 150,
        zone: { name: 'Haunted Marsh', difficulty: 4, seasonId: null, season: null },
      },
      {
        id: 'oak-node',
        resourceType: 'Oak Log',
        skillRequired: 'woodcutting',
        levelRequired: 1,
        baseYield: 1,
        discoveryChance: 0.35,
        minCapacity: 15,
        maxCapacity: 80,
        zone: { name: 'Forest Edge', difficulty: 1, seasonId: null, season: null },
      },
    ]);
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      { id: 'iron-template', name: 'Iron Ore', tier: 3, seasonId: null, season: null },
      { id: 'dark-iron-template', name: 'Dark Iron Ore', tier: 4, seasonId: null, season: null },
    ]);
    const result = await lookupResourceForDiscord('Iron');

    expect(result.suggestions).toEqual([]);
    expect(result.match).toEqual({
      query: 'Iron',
      resources: [
        {
          name: 'Iron Ore',
          tier: 3,
          zones: [
            {
              name: 'Deep Mines',
              skillRequired: 'mining',
              levelRequired: 12,
              baseYield: 1,
              discoveryChancePct: 25,
              minCapacity: 25,
              maxCapacity: 120,
            },
          ],
        },
        {
          name: 'Dark Iron Ore',
          tier: 4,
          zones: [
            {
              name: 'Haunted Marsh',
              skillRequired: 'mining',
              levelRequired: 20,
              baseYield: 1,
              discoveryChancePct: 20,
              minCapacity: 30,
              maxCapacity: 150,
            },
          ],
        },
      ],
    });
  });

  it('prefers active-season resource nodes over base duplicates', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({ id: 'season-2' });
    mockPrisma.resourceNode.findMany.mockResolvedValueOnce([
      {
        id: 'base-iron-node',
        resourceType: 'Iron Ore',
        skillRequired: 'mining',
        levelRequired: 12,
        baseYield: 1,
        discoveryChance: 0.25,
        minCapacity: 25,
        maxCapacity: 120,
        zone: { name: 'Deep Mines', difficulty: 3, seasonId: null, season: null },
      },
      {
        id: 'seasonal-iron-node',
        resourceType: 'Iron Ore',
        skillRequired: 'mining',
        levelRequired: 14,
        baseYield: 1,
        discoveryChance: 0.35,
        minCapacity: 30,
        maxCapacity: 140,
        zone: {
          name: 'Deep Mines',
          difficulty: 3,
          seasonId: 'season-2',
          season: { id: 'season-2', name: 'Season of Embers', startsAt: new Date('2026-06-01') },
        },
      },
      {
        id: 'old-iron-node',
        resourceType: 'Iron Ore',
        skillRequired: 'mining',
        levelRequired: 16,
        baseYield: 1,
        discoveryChance: 0.4,
        minCapacity: 40,
        maxCapacity: 160,
        zone: {
          name: 'Deep Mines',
          difficulty: 3,
          seasonId: 'season-1',
          season: { id: 'season-1', name: 'Old Season', startsAt: new Date('2026-01-01') },
        },
      },
    ]);
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      { id: 'iron-template', name: 'Iron Ore', tier: 3, seasonId: null, season: null },
    ]);

    const result = await lookupResourceForDiscord('Iron Ore');

    expect(result.match?.resources).toEqual([
      {
        name: 'Iron Ore',
        tier: 3,
        zones: [
          {
            name: 'Deep Mines',
            skillRequired: 'mining',
            levelRequired: 14,
            baseYield: 1,
            discoveryChancePct: 35,
            minCapacity: 30,
            maxCapacity: 140,
          },
        ],
      },
    ]);
  });
});
