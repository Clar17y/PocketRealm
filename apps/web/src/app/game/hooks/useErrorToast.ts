import { useEffect, useRef } from 'react';
import { UI_TIMING_CONSTANTS } from '@pocketrealm/shared';

export function useErrorToast(isOffline: boolean) {
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: Event) => {
      if (isOfflineRef.current) return;
      if (timeout) return; // debounce — max one toast per 10s

      const detail = (e as CustomEvent<{ message: string; code: string }>).detail;
      const show = (window as unknown as Record<string, unknown>).__showErrorToast as
        | ((msg: string) => void)
        | undefined;
      show?.(detail.message);

      timeout = setTimeout(() => {
        timeout = null;
      }, UI_TIMING_CONSTANTS.ERROR_TOAST_DEBOUNCE_MS);
    };

    window.addEventListener('api:error', handler);
    return () => {
      window.removeEventListener('api:error', handler);
      if (timeout) clearTimeout(timeout);
    };
  }, []);
}
