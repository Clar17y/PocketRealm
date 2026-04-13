import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTravelActions } from './useTravelActions';

const apiMock = vi.hoisted(() => ({
  claimLoot: vi.fn(),
  travelToZone: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMock);

function buildHook({
  pendingLootSession = { sessionId: 'session-1', sessionIds: ['session-1', 'session-2'] },
  reloadPendingLootSession = vi.fn().mockResolvedValue(undefined),
} = {}) {
  const clearPendingLootSession = vi.fn();
  const setActionError = vi.fn();

  const hook = renderHook(() => useTravelActions({
    hpStateRef: { current: { currentHp: 100, maxHp: 100 } } as never,
    activeZoneId: 'zone-a',
    zones: [{ id: 'zone-a', name: 'Town', zoneType: 'town' }, { id: 'zone-b', name: 'Forest', zoneType: 'wilds' }],
    zoneConnections: [{ fromId: 'zone-a', toId: 'zone-b', explorationThreshold: 0 }],
    runAction: async (_name, fn) => { await fn(); },
    pushLog: vi.fn(),
    setTurns: vi.fn(),
    setActiveZoneId: vi.fn(),
    setActionError,
    setPlaybackActive: vi.fn(),
    stateSetters: {} as never,
    advanceTutorial: vi.fn(),
    refreshCraftingRecipes: vi.fn().mockResolvedValue(undefined),
    loadAll: vi.fn().mockResolvedValue(undefined),
    pendingLootSession,
    clearPendingLootSession,
    reloadPendingLootSession,
    pendingLootQueueRef: { current: [] },
    activateNextQueuedLoot: vi.fn().mockResolvedValue(undefined),
    logDurabilityWarnings: vi.fn(),
  }));

  return {
    ...hook,
    clearPendingLootSession,
    reloadPendingLootSession,
    setActionError,
  };
}

describe('useTravelActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the loot bundle retryable when abandoning loot fails mid-bundle', async () => {
    apiMock.claimLoot
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ error: { message: 'Loot claim failed', code: 'NETWORK_ERROR' } });

    const hook = buildHook();

    await act(async () => {
      await hook.result.current.handleTravelToZone('zone-b');
    });

    await act(async () => {
      await hook.result.current.abandonLootAndTravel();
    });

    expect(hook.clearPendingLootSession).not.toHaveBeenCalled();
    expect(hook.reloadPendingLootSession).toHaveBeenCalledTimes(1);
    expect(apiMock.travelToZone).not.toHaveBeenCalled();
  });

  it('still reports the discard failure when refresh recovery also throws', async () => {
    apiMock.claimLoot
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ error: { message: 'Loot claim failed', code: 'NETWORK_ERROR' } });

    const hook = buildHook({
      reloadPendingLootSession: vi.fn().mockRejectedValue(new Error('Refresh failed')),
    });

    await act(async () => {
      await hook.result.current.handleTravelToZone('zone-b');
    });

    await act(async () => {
      await hook.result.current.abandonLootAndTravel();
    });

    expect(hook.setActionError).toHaveBeenCalledWith('Loot claim failed');
    expect(apiMock.travelToZone).not.toHaveBeenCalled();
  });

  it('travels after the bundle is fully abandoned', async () => {
    apiMock.claimLoot
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: true } });
    apiMock.travelToZone.mockResolvedValueOnce({
      data: {
        turns: { currentTurns: 9 },
        zone: { id: 'zone-b', name: 'Forest', zoneType: 'wilds' },
        events: [],
        aborted: false,
        refundedTurns: 0,
        travelCost: 0,
        stateUpdates: {},
      },
    });

    const hook = buildHook();

    await act(async () => {
      await hook.result.current.handleTravelToZone('zone-b');
    });

    await act(async () => {
      await hook.result.current.abandonLootAndTravel();
    });

    expect(hook.clearPendingLootSession).toHaveBeenCalledTimes(1);
    expect(hook.reloadPendingLootSession).not.toHaveBeenCalled();
    expect(apiMock.travelToZone).toHaveBeenCalledWith('zone-b');
  });
});
