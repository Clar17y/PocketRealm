import { useEffect } from 'react';

export function useRateLimitToast() {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timeout) return; // debounce — max one toast per 4s
      const show = (window as unknown as Record<string, unknown>).__showRateLimitToast as
        | ((msg: string) => void)
        | undefined;
      show?.('Too many requests — wait a moment');
      timeout = setTimeout(() => {
        timeout = null;
      }, 4000);
    };
    window.addEventListener('api:rate-limited', handler);
    return () => {
      window.removeEventListener('api:rate-limited', handler);
      if (timeout) clearTimeout(timeout);
    };
  }, []);
}
