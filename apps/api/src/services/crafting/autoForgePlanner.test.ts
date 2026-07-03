import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateForgeUpgradeSuccessChance } from '@pocketrealm/game-engine';
import {
  addCraftedItemToAutoForge,
  createCraftAutoForgeAccumulator,
  finishCraftAutoForge,
  getAutoForgePersistedItemCount,
  type CraftVirtualItem,
} from './autoForgePlanner';

vi.mock('@pocketrealm/game-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pocketrealm/game-engine')>();
  return {
    ...actual,
    calculateForgeUpgradeSuccessChance: vi.fn((rarity: string) => {
      if (rarity === 'common') return 1;
      if (rarity === 'uncommon') return 1;
      if (rarity === 'rare') return 1;
      if (rarity === 'epic') return 1;
      return null;
    }),
    getEligibleBonusStats: vi.fn(() => ['attack']),
    rollBonusStat: vi.fn(() => ({ stat: 'attack', value: 2 })),
  };
});

function virtualItem(id: string, rarity: CraftVirtualItem['rarity']): CraftVirtualItem {
  return {
    virtualId: id,
    rarity,
    bonusStats: null,
    isCrit: rarity !== 'common',
    bonusEntries: [],
  };
}

function makeAccumulator(rolls: number[]) {
  let index = 0;
  return createCraftAutoForgeAccumulator({
    targetRarity: 'rare',
    itemType: 'armor',
    baseStats: { armor: 5 },
    slot: 'chest',
    luckStat: 0,
    upgradeCostsByRarity: { common: 100, uncommon: 250, rare: 500, epic: 1000 },
    roll: () => rolls[index++] ?? 0,
  });
}

describe('autoForgePlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upgrades only newly crafted virtual items into final survivors', () => {
    const accumulator = makeAccumulator([0, 0, 0]);

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v3', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v4', 'common'));

    const result = finishCraftAutoForge(accumulator);

    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]).toMatchObject({ rarity: 'rare', bonusStats: { attack: 4 } });
    expect(result.leftovers).toHaveLength(0);
    expect(result.summary.attempts).toHaveLength(3);
    expect(result.summary.actualForgeTurnCost).toBe(450);
    expect(result.summary.finalCountsByRarity).toEqual({ rare: 1 });
  });

  it('keeps below-target leftovers when no more pairs exist', () => {
    const accumulator = makeAccumulator([0]);

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v3', 'common'));

    const result = finishCraftAutoForge(accumulator);

    expect(result.survivors).toHaveLength(0);
    expect(result.leftovers.map((item) => item.rarity).sort()).toEqual(['common', 'uncommon']);
    expect(result.summary.leftoverCountsByRarity).toEqual({ common: 1, uncommon: 1 });
  });

  it('destroys both virtual items on failed forge and records null resultVirtualId', () => {
    vi.mocked(calculateForgeUpgradeSuccessChance).mockReturnValueOnce(0.5);

    const accumulator = createCraftAutoForgeAccumulator({
      targetRarity: 'rare',
      itemType: 'weapon',
      baseStats: { attack: 5 },
      slot: 'main_hand',
      luckStat: 0,
      upgradeCostsByRarity: { common: 100, uncommon: 250, rare: 500, epic: 1000 },
      roll: () => 0.99,
    });

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));

    const result = finishCraftAutoForge(accumulator);

    expect(result.survivors).toHaveLength(0);
    expect(result.leftovers).toHaveLength(0);
    expect(result.summary.attempts[0]).toMatchObject({
      success: false,
      targetVirtualId: 'v1',
      sacrificeVirtualId: 'v2',
      resultVirtualId: null,
    });
  });

  it('tracks persisted item count during incremental crafting', () => {
    const accumulator = makeAccumulator([0]);

    addCraftedItemToAutoForge(accumulator, virtualItem('v1', 'common'));
    expect(getAutoForgePersistedItemCount(accumulator)).toBe(1);

    addCraftedItemToAutoForge(accumulator, virtualItem('v2', 'common'));
    expect(getAutoForgePersistedItemCount(accumulator)).toBe(1);
  });
});
