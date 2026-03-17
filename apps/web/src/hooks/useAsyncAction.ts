import { useState, useCallback } from 'react';

export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>(
    action: () => Promise<{ data?: T | null; error?: { message: string } | null }>,
    onSuccess?: (data: T) => void,
    key?: string,
  ) => {
    setLoading(true);
    if (key !== undefined) setLoadingKey(key);
    setError(null);
    try {
      const res = await action();
      if (res.error) {
        setError(res.error.message);
      } else if (onSuccess) {
        onSuccess(res.data as T);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, loadingKey, error, run, clearError };
}
