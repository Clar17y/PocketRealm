import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSocialCounts } from './useSocialCounts';

const { getPvpNotificationCount, getIncomingFriendRequests, getFriendMailUnreadCount } = vi.hoisted(() => ({
  getPvpNotificationCount: vi.fn(),
  getIncomingFriendRequests: vi.fn(),
  getFriendMailUnreadCount: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getPvpNotificationCount,
  getIncomingFriendRequests,
  getFriendMailUnreadCount,
}));

describe('useSocialCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the pvp notification count into state', async () => {
    getPvpNotificationCount.mockResolvedValue({ data: { count: 7 } });
    const setPvpNotificationCount = vi.fn();

    const { result } = renderHook(() => useSocialCounts({
      setPvpNotificationCount,
      setIncomingFriendRequestCount: vi.fn(),
      setMailUnreadCount: vi.fn(),
    }));

    await act(async () => {
      await result.current.loadPvpNotificationCount();
    });

    expect(setPvpNotificationCount).toHaveBeenCalledWith(7);
  });

  it('dispatches a network error when both friend-count requests fail', async () => {
    getIncomingFriendRequests.mockResolvedValue({ error: { message: 'Nope', code: 'NETWORK_ERROR' } });
    getFriendMailUnreadCount.mockResolvedValue({ error: { message: 'Nope', code: 'NETWORK_ERROR' } });
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    const { result } = renderHook(() => useSocialCounts({
      setPvpNotificationCount: vi.fn(),
      setIncomingFriendRequestCount: vi.fn(),
      setMailUnreadCount: vi.fn(),
    }));

    await act(async () => {
      await result.current.loadFriendCounts();
    });

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'api:error',
      detail: { message: 'Network error', code: 'NETWORK_ERROR' },
    }));
  });
});
