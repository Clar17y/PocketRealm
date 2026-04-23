import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExplorationActions } from './useExplorationActions';

const apiMock = vi.hoisted(() => ({
  startExploration: vi.fn().mockResolvedValue({ data: null }),
}));

vi.mock('@/lib/api', () => apiMock);

describe('useExplorationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes trackingFamilyId into the exploration api helper and refreshes zones after playback completes', async () => {
    apiMock.startExploration.mockResolvedValue({
      data: {
        turns: { currentTurns: 500 },
        zone: { id: 'zone-forest', name: 'Forest Edge', difficulty: 1 },
        aborted: false,
        refundedTurns: 0,
        events: [],
        encounterSites: [],
        resourceDiscoveries: [],
        hiddenCaches: [],
        zoneExitDiscovered: false,
        explorationProgress: { turnsExplored: 900, percent: 30, turnsToExplore: 3000 },
        tax: null,
      },
    });
    const reloadZones = vi.fn().mockResolvedValue(undefined);

    const hook = renderHook(() => useExplorationActions({
      hpStateRef: { current: { currentHp: 100, maxHp: 100 } } as never,
      currentZone: { id: 'zone-forest', name: 'Forest Edge' },
      runAction: async (_name, fn) => { await fn(); },
      pushLog: vi.fn(),
      setTurns: vi.fn(),
      setActionError: vi.fn(),
      setPlaybackActive: vi.fn(),
      stateSetters: {} as never,
      advanceTutorial: vi.fn(),
      combatLogPrefetchClear: vi.fn(),
      refreshPendingEncounters: vi.fn().mockResolvedValue(undefined),
      loadGatheringNodes: vi.fn().mockResolvedValue(undefined),
      pendingLootQueueRef: { current: [] },
      activatePendingLoot: vi.fn().mockResolvedValue(undefined),
      updateZoneExploration: vi.fn(),
      updateQuestProgress: vi.fn(),
      reloadZones,
      refreshCraftingRecipes: vi.fn().mockResolvedValue(undefined),
    }));

    await act(async () => {
      await hook.result.current.handleStartExploration(500, 2, 'family-spider');
    });

    expect(apiMock.startExploration).toHaveBeenCalledWith('zone-forest', 500, 2, 'family-spider');
    expect(reloadZones).not.toHaveBeenCalled();

    await act(async () => {
      await hook.result.current.handleExplorationPlaybackComplete();
    });

    expect(reloadZones).toHaveBeenCalledTimes(1);
  });

  it('still finalizes playback when the post-playback zone refresh fails', async () => {
    apiMock.startExploration.mockResolvedValue({
      data: {
        turns: { currentTurns: 500 },
        zone: { id: 'zone-forest', name: 'Forest Edge', difficulty: 1 },
        aborted: false,
        refundedTurns: 0,
        events: [],
        encounterSites: [],
        resourceDiscoveries: [],
        hiddenCaches: [],
        zoneExitDiscovered: false,
        explorationProgress: { turnsExplored: 900, percent: 30, turnsToExplore: 3000 },
        tax: null,
      },
    });

    const setPlaybackActive = vi.fn();
    const reloadZones = vi.fn().mockRejectedValue(new Error('zones unavailable'));
    const hook = renderHook(() => useExplorationActions({
      hpStateRef: { current: { currentHp: 100, maxHp: 100 } } as never,
      currentZone: { id: 'zone-forest', name: 'Forest Edge' },
      runAction: async (_name, fn) => { await fn(); },
      pushLog: vi.fn(),
      setTurns: vi.fn(),
      setActionError: vi.fn(),
      setPlaybackActive,
      stateSetters: {} as never,
      advanceTutorial: vi.fn(),
      combatLogPrefetchClear: vi.fn(),
      refreshPendingEncounters: vi.fn().mockResolvedValue(undefined),
      loadGatheringNodes: vi.fn().mockResolvedValue(undefined),
      pendingLootQueueRef: { current: [] },
      activatePendingLoot: vi.fn().mockResolvedValue(undefined),
      updateZoneExploration: vi.fn(),
      updateQuestProgress: vi.fn(),
      reloadZones,
      refreshCraftingRecipes: vi.fn().mockResolvedValue(undefined),
    }));

    await act(async () => {
      await hook.result.current.handleStartExploration(500, 2, 'family-spider');
    });

    expect(setPlaybackActive).toHaveBeenCalledWith(true);
    expect(hook.result.current.explorationPlaybackData?.zoneName).toBe('Forest Edge');

    await act(async () => {
      await hook.result.current.handlePlaybackSkip();
    });

    expect(setPlaybackActive).toHaveBeenCalledWith(false);
    expect(reloadZones).toHaveBeenCalledTimes(1);
  });

  it('refreshes crafting context after a knockout respawn changes the active zone', async () => {
    apiMock.startExploration.mockResolvedValue({
      data: {
        turns: { currentTurns: 420 },
        zone: { id: 'zone-forest', name: 'Forest Edge', difficulty: 1 },
        aborted: true,
        refundedTurns: 80,
        events: [],
        encounterSites: [],
        resourceDiscoveries: [],
        hiddenCaches: [],
        zoneExitDiscovered: false,
        explorationProgress: { turnsExplored: 120, percent: 4, turnsToExplore: 3000 },
        tax: null,
        stateUpdates: {
          currentZoneId: 'zone-millbrook',
        },
      },
    });

    const refreshCraftingRecipes = vi.fn().mockResolvedValue(undefined);
    const reloadZones = vi.fn().mockResolvedValue(undefined);
    const setActiveZoneId = vi.fn();

    const hook = renderHook(() => useExplorationActions({
      hpStateRef: { current: { currentHp: 0, maxHp: 100 } } as never,
      currentZone: { id: 'zone-forest', name: 'Forest Edge' },
      runAction: async (_name, fn) => { await fn(); },
      pushLog: vi.fn(),
      setTurns: vi.fn(),
      setActionError: vi.fn(),
      setPlaybackActive: vi.fn(),
      stateSetters: { setActiveZoneId } as never,
      advanceTutorial: vi.fn(),
      combatLogPrefetchClear: vi.fn(),
      refreshPendingEncounters: vi.fn().mockResolvedValue(undefined),
      loadGatheringNodes: vi.fn().mockResolvedValue(undefined),
      pendingLootQueueRef: { current: [] },
      activatePendingLoot: vi.fn().mockResolvedValue(undefined),
      updateZoneExploration: vi.fn(),
      updateQuestProgress: vi.fn(),
      reloadZones,
      refreshCraftingRecipes,
    } as never));

    await act(async () => {
      await hook.result.current.handleStartExploration(500);
    });

    await act(async () => {
      await hook.result.current.handleExplorationPlaybackComplete();
    });

    expect(refreshCraftingRecipes).toHaveBeenCalledTimes(1);
    expect(reloadZones).toHaveBeenCalledTimes(1);
    expect(setActiveZoneId).toHaveBeenCalledWith('zone-millbrook');
  });
});
