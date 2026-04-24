import { useCallback } from 'react';
import {
  getFriendMailUnreadCount,
  getIncomingFriendRequests,
  getPvpNotificationCount,
} from '@/lib/api';

interface UseSocialCountsOptions {
  setPvpNotificationCount: (count: number) => void;
  setIncomingFriendRequestCount: (count: number) => void;
  setMailUnreadCount: (count: number) => void;
}

export function useSocialCounts({
  setPvpNotificationCount,
  setIncomingFriendRequestCount,
  setMailUnreadCount,
}: UseSocialCountsOptions) {
  const loadPvpNotificationCount = useCallback(async () => {
    const result = await getPvpNotificationCount();
    if (result.data) {
      setPvpNotificationCount(result.data.count);
    } else {
      window.dispatchEvent(new CustomEvent('api:error', {
        detail: {
          message: result.error?.message ?? 'Network error',
          code: result.error?.code ?? 'UNKNOWN',
        },
      }));
    }
  }, [setPvpNotificationCount]);

  const loadFriendCounts = useCallback(async () => {
    const [requestResult, mailResult] = await Promise.all([
      getIncomingFriendRequests(),
      getFriendMailUnreadCount(),
    ]);

    if (requestResult.data) {
      setIncomingFriendRequestCount(requestResult.data.requests.length);
    }
    if (mailResult.data) {
      setMailUnreadCount(mailResult.data.count);
    }
    if (!requestResult.data && !mailResult.data) {
      window.dispatchEvent(new CustomEvent('api:error', {
        detail: { message: 'Network error', code: 'NETWORK_ERROR' },
      }));
    }
  }, [setIncomingFriendRequestCount, setMailUnreadCount]);

  return {
    loadPvpNotificationCount,
    loadFriendCounts,
  };
}
