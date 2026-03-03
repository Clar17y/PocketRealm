import { useState, useCallback } from 'react';

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(
    action: () => Promise<{ data?: T | null; error?: { message: string } | null }>,
    onSuccess?: (data: T) => void,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await action();
      if (res.error) {
        setError(res.error.message);
      } else if (res.data !== undefined && res.data !== null && onSuccess) {
        onSuccess(res.data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, run, clearError };
}
