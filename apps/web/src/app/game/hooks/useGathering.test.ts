import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGathering } from './useGathering';

const apiMock = vi.hoisted(() => ({
  getGatheringNodes: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMock);

describe('useGathering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getGatheringNodes.mockResolvedValue({
      data: {
        nodes: [],
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
          resourceTypes: [],
        },
      },
      error: null,
    });
  });

  it('defaults the zone filter to the current zone and updates it when the player travels', async () => {
    const hook = renderHook(
      ({ currentZoneId }) => useGathering(true, 'gathering', currentZoneId),
      { initialProps: { currentZoneId: 'zone-forest' as string | null } },
    );

    await waitFor(() => {
      expect(apiMock.getGatheringNodes).toHaveBeenCalledWith(expect.objectContaining({
        zoneId: 'zone-forest',
      }));
    });

    expect(hook.result.current.gatheringZoneFilter).toBe('zone-forest');

    act(() => {
      hook.result.current.handleGatheringPageChange(2);
    });

    hook.rerender({ currentZoneId: 'zone-cave' });

    await waitFor(() => {
      expect(hook.result.current.gatheringZoneFilter).toBe('zone-cave');
    });

    expect(hook.result.current.gatheringPage).toBe(1);
    expect(apiMock.getGatheringNodes).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      zoneId: 'zone-cave',
    }));
  });
});
