import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEncounterSites } from './useEncounterSites';

const apiMock = vi.hoisted(() => ({
  getEncounterSites: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMock);

vi.mock('@/hooks/usePageVisible', () => ({
  useVisibleInterval: vi.fn(),
}));

describe('useEncounterSites', () => {
  const buildSite = (overrides: Partial<{
    encounterSiteId: string;
    currentRoom: number;
    aliveMobs: number;
  }> = {}) => ({
    encounterSiteId: overrides.encounterSiteId ?? 'site-1',
    zoneId: 'zone-forest',
    zoneName: 'Deep Forest',
    mobFamilyId: 'family-wolves',
    mobFamilyName: 'Wolves',
    siteName: 'Wolves Den',
    size: 'large',
    totalMobs: 11,
    aliveMobs: overrides.aliveMobs ?? 11,
    defeatedMobs: 0,
    decayedMobs: 0,
    nextMobTemplateId: 'wolf',
    nextMobName: 'Wolf',
    nextMobPrefix: null,
    nextMobDisplayName: 'Wolf',
    discoveredAt: '2026-05-19T22:06:32.628Z',
    currentRoom: overrides.currentRoom ?? 1,
    totalRooms: 4,
    roomMobCounts: [
      { room: 1, alive: 0, total: 2 },
      { room: 2, alive: 0, total: 2 },
      { room: 3, alive: 0, total: 5 },
      { room: 4, alive: overrides.aliveMobs ?? 2, total: 2 },
    ],
    currentRoomMobs: [
      { slot: 9, name: 'Wolf', prefix: null, role: 'trash' as const, hp: 22, maxHp: 22 },
      { slot: 10, name: 'Wolf', prefix: null, role: 'elite' as const, hp: 22, maxHp: 22 },
    ],
    eventModifiers: [],
    totalTurnCost: 100,
  });

  const buildResponse = (
    encounterSites: ReturnType<typeof buildSite>[],
    pagination: Partial<{
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    }> = {},
  ) => ({
    data: {
      encounterSites,
      pagination: {
        page: pagination.page ?? 1,
        pageSize: pagination.pageSize ?? 8,
        total: pagination.total ?? encounterSites.length,
        totalPages: pagination.totalPages ?? 1,
        hasNext: pagination.hasNext ?? false,
        hasPrevious: pagination.hasPrevious ?? false,
      },
      filters: {
        zones: [],
        mobFamilies: [],
      },
    },
    error: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getEncounterSites.mockResolvedValue(buildResponse([]));
  });

  it('defaults the encounter zone filter to the current zone and updates it when the player travels', async () => {
    const hook = renderHook(
      ({ currentZoneId }) => useEncounterSites(true, 'combat', currentZoneId),
      { initialProps: { currentZoneId: 'zone-forest' as string | null } },
    );

    await waitFor(() => {
      expect(apiMock.getEncounterSites).toHaveBeenCalledWith(expect.objectContaining({
        zoneId: 'zone-forest',
      }));
    });

    expect(hook.result.current.pendingEncounterZoneFilter).toBe('zone-forest');

    act(() => {
      hook.result.current.handlePendingEncounterPageChange(2);
    });

    hook.rerender({ currentZoneId: 'zone-cave' });

    await waitFor(() => {
      expect(hook.result.current.pendingEncounterZoneFilter).toBe('zone-cave');
    });

    expect(hook.result.current.pendingEncounterPage).toBe(1);
    expect(apiMock.getEncounterSites).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      zoneId: 'zone-cave',
    }));
  });

  it('fetches the page containing the active encounter when it moved off the current danger-sorted page', async () => {
    apiMock.getEncounterSites
      .mockResolvedValueOnce(buildResponse(
        [buildSite({ encounterSiteId: 'other-site', aliveMobs: 11 })],
        { page: 1, total: 9, totalPages: 2, hasNext: true },
      ))
      .mockResolvedValueOnce(buildResponse(
        [buildSite({ encounterSiteId: 'active-site', currentRoom: 4, aliveMobs: 2 })],
        { page: 2, total: 9, totalPages: 2, hasPrevious: true },
      ));

    const hook = renderHook(() => useEncounterSites(true, 'inventory', 'zone-forest'));

    let refreshed: Awaited<ReturnType<typeof hook.result.current.refreshPendingEncounters>>;
    await act(async () => {
      refreshed = await hook.result.current.refreshPendingEncounters({ includeEncounterSiteId: 'active-site' });
    });

    expect(apiMock.getEncounterSites).toHaveBeenNthCalledWith(1, expect.objectContaining({
      page: 1,
      zoneId: 'zone-forest',
      sort: 'danger',
    }));
    expect(apiMock.getEncounterSites).toHaveBeenNthCalledWith(2, expect.objectContaining({
      page: 2,
      zoneId: 'zone-forest',
      sort: 'danger',
    }));
    expect(refreshed?.find(site => site.encounterSiteId === 'active-site')?.currentRoom).toBe(4);
  });

  it('finds the active encounter when the current page is stale and above the new total pages', async () => {
    apiMock.getEncounterSites
      .mockResolvedValueOnce(buildResponse(
        [],
        { page: 2, total: 1, totalPages: 1, hasPrevious: true },
      ))
      .mockResolvedValueOnce(buildResponse(
        [buildSite({ encounterSiteId: 'active-site', currentRoom: 4, aliveMobs: 2 })],
        { page: 1, total: 1, totalPages: 1 },
      ));

    const hook = renderHook(() => useEncounterSites(true, 'inventory', 'zone-forest'));

    act(() => {
      hook.result.current.handlePendingEncounterPageChange(2);
    });

    let refreshed: Awaited<ReturnType<typeof hook.result.current.refreshPendingEncounters>>;
    await act(async () => {
      refreshed = await hook.result.current.refreshPendingEncounters({ includeEncounterSiteId: 'active-site' });
    });

    expect(apiMock.getEncounterSites).toHaveBeenNthCalledWith(1, expect.objectContaining({
      page: 2,
      zoneId: 'zone-forest',
    }));
    expect(apiMock.getEncounterSites).toHaveBeenNthCalledWith(2, expect.objectContaining({
      page: 1,
      zoneId: 'zone-forest',
    }));
    expect(hook.result.current.pendingEncounterPage).toBe(1);
    expect(refreshed?.find(site => site.encounterSiteId === 'active-site')?.currentRoom).toBe(4);
  });
});
