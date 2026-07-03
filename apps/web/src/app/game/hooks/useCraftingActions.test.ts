import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCraftingActions } from './useCraftingActions';

const apiMock = vi.hoisted(() => ({
  craft: vi.fn(),
}));

const analyticsMock = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  trackOnce: vi.fn(),
}));

const applyStateUpdatesMock = vi.hoisted(() => ({
  applyStateUpdates: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMock);
vi.mock('@/lib/analytics', () => analyticsMock);
vi.mock('../applyStateUpdates', () => applyStateUpdatesMock);
vi.mock('./useActivityLog', () => ({
  nowStamp: () => '2026-07-03T12:00:00.000Z',
}));

function buildHook() {
  const pushLog = vi.fn();
  const setTurns = vi.fn();
  const setActionError = vi.fn();
  const updateQuestProgress = vi.fn();
  const advanceTutorial = vi.fn();

  const hook = renderHook(() => useCraftingActions({
    craftingRecipes: [{
      id: 'robe',
      turnCost: 12,
      materials: [{ templateId: 'silk', quantity: 2 }],
      materialTemplates: [{ id: 'silk', name: 'Silk' }],
      resultTemplate: { name: 'Silk Robe' },
    }],
    runAction: async (_name, fn) => { await fn(); },
    pushLog,
    setTurns,
    setActionError,
    stateSetters: {} as never,
    updateQuestProgress,
    advanceTutorial,
  }));

  return {
    ...hook,
    pushLog,
    setTurns,
    setActionError,
    updateQuestProgress,
    advanceTutorial,
  };
}

describe('useCraftingActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.craft.mockResolvedValue({
      data: {
        turns: { currentTurns: 400 },
        crafted: {
          recipeId: 'robe',
          resultTemplateId: 'robe-template',
          quantity: 2,
          craftedItemIds: ['item-1', 'item-2'],
        },
        craftedItemDetails: [],
        xp: {
          skillType: 'tailoring',
          xpAfterEfficiency: 25,
          efficiency: 1,
          leveledUp: false,
          newLevel: 10,
          atDailyCap: false,
          newTotalXp: 100,
          newDailyXpGained: 25,
          characterXpGain: 5,
          characterXpAfter: 200,
          characterLevelBefore: 3,
          characterLevelAfter: 3,
          attributePointsAfter: 0,
          characterLeveledUp: false,
        },
        tax: null,
        stateUpdates: {},
      },
    });
  });

  it('logs actual auto-forge turn cost and tracks the total turns spent', async () => {
    apiMock.craft.mockResolvedValueOnce({
      data: {
        turns: {
          currentTurns: 400,
          timeToCapMs: null,
          lastRegenAt: '2026-07-03T12:00:00.000Z',
          spent: 216,
        },
        crafted: {
          recipeId: 'robe',
          resultTemplateId: 'robe-template',
          quantity: 2,
          craftedItemIds: ['item-1', 'item-2'],
        },
        craftedItemDetails: [],
        xp: {
          skillType: 'tailoring',
          xpAfterEfficiency: 25,
          efficiency: 1,
          leveledUp: false,
          newLevel: 10,
          atDailyCap: false,
          newTotalXp: 100,
          newDailyXpGained: 25,
          characterXpGain: 5,
          characterXpAfter: 200,
          characterLevelBefore: 3,
          characterLevelAfter: 3,
          attributePointsAfter: 0,
          characterLeveledUp: false,
        },
        autoForge: {
          targetRarity: 'epic',
          attempts: [],
          finalCountsByRarity: { epic: 1 },
          leftoverCountsByRarity: { rare: 1 },
          actualForgeTurnCost: 180,
          maxReservedTurnCost: 300,
        },
        tax: null,
        stateUpdates: {},
      },
    });

    const hook = buildHook();

    await act(async () => {
      await hook.result.current.handleCraft('robe', 2, {
        destination: 'stash',
        autoForgeMinRarity: 'epic',
      });
    });

    expect(hook.pushLog).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Used materials: Silk x4.' }),
      expect.objectContaining({ message: 'Crafted Silk Robe x2.' }),
      expect.objectContaining({ message: 'Auto-forge results: epic x1.' }),
      expect.objectContaining({ message: 'Auto-forge leftovers: rare x1.' }),
      expect.objectContaining({ message: 'Craft + auto-forge spent 216 turns total (180 base forge).' }),
      expect.objectContaining({ message: 'Gained 25 Tailoring XP.' }),
    );
    expect(analyticsMock.trackEvent).toHaveBeenCalledWith('action', { type: 'tailoring', turns: 204 });
  });
});
