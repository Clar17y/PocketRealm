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
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getEncounterSites.mockResolvedValue({
      data: {
        encounterSites: [],
        pagination: {
          page: 1,
          pageSize: 8,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        filters: {
          zones: [],
          mobFamilies: [],
        },
      },
      error: null,
    });
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
});
