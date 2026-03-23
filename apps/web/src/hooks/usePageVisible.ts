import { useEffect, useRef, useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
}

function getSnapshot() {
  return document.visibilityState === 'visible';
}

function getServerSnapshot() {
  return true;
}

/** Returns true when the page tab is visible/focused. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Sets up a polling interval that only ticks when the tab is visible.
 * When the tab becomes visible again, fires the callback immediately to catch up.
 */
export function useVisibleInterval(callback: () => void, ms: number, enabled = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => callbackRef.current(), ms);
    };

    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Catch up immediately, then resume interval
        callbackRef.current();
        start();
      } else {
        stop();
      }
    };

    // Start immediately if visible
    if (document.visibilityState === 'visible') {
      start();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [ms, enabled]);
}
