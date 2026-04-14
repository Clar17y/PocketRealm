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

  it('passes trackingFamilyId into the exploration api helper and refreshes zones after success', async () => {
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
    }));

    await act(async () => {
      await hook.result.current.handleStartExploration(500, 2, 'family-spider');
    });

    expect(apiMock.startExploration).toHaveBeenCalledWith('zone-forest', 500, 2, 'family-spider');
    expect(reloadZones).toHaveBeenCalledTimes(1);
  });
});
