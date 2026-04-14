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

  it('passes trackingFamilyId into the exploration api helper', async () => {
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
    }));

    await act(async () => {
      await hook.result.current.handleStartExploration(500, 2, 'family-spider');
    });

    expect(apiMock.startExploration).toHaveBeenCalledWith('zone-forest', 500, 2, 'family-spider');
  });
});
