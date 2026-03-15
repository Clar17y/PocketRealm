import { useCallback, useState } from 'react';

/**
 * Manages loading vs. silent-refresh state for data fetching.
 *
 * Initial loads show a full spinner; post-action refreshes show a subtle
 * "Refreshing…" indicator without replacing the screen content.
 */
export function useSilentRefresh() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /** Call at the start of a fetch. `silent` = post-action background refresh. */
  const startLoad = useCallback((silent: boolean) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
  }, []);

  /** Call in the `finally` block of a fetch. */
  const endLoad = useCallback((silent: boolean) => {
    if (silent) {
      setRefreshing(false);
    } else {
      setLoading(false);
    }
  }, []);

  return { loading, refreshing, startLoad, endLoad } as const;
}
