import { useEffect, useRef, useSyncExternalStore } from 'react';

export const PAGE_ACTIVE_IDLE_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

let lastInteractionAt = Date.now();

type VisibleIntervalOptions = {
  catchUpOnResume?: boolean;
};

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

function isPageActive(now = Date.now()): boolean {
  return isPageVisibleAndFocused() && now - lastInteractionAt < PAGE_ACTIVE_IDLE_MS;
}

function isPageVisibleAndFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return document.visibilityState === 'visible' && hasFocus;
}

/**
 * Sets up a polling interval that only ticks while the user is actively using the page.
 * When activity resumes, fires the callback immediately to catch up.
 */
export function useVisibleInterval(
  callback: () => void,
  ms: number,
  enabled = true,
  options: VisibleIntervalOptions = {},
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const catchUpOnResume = options.catchUpOnResume ?? true;

  useEffect(() => {
    if (!enabled) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let idleTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearIdleTimeout = () => {
      if (idleTimeout !== null) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
      }
    };

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      clearIdleTimeout();
    };

    const scheduleIdleStop = () => {
      clearIdleTimeout();
      if (!isPageActive()) {
        stop();
        return;
      }

      const remainingMs = Math.max(0, PAGE_ACTIVE_IDLE_MS - (Date.now() - lastInteractionAt));
      idleTimeout = setTimeout(() => {
        if (!isPageActive()) {
          stop();
        } else {
          scheduleIdleStop();
        }
      }, remainingMs + 1);
    };

    const start = () => {
      if (!isPageActive()) {
        stop();
        return;
      }

      if (intervalId !== null) {
        scheduleIdleStop();
        return;
      }
      intervalId = setInterval(() => {
        if (isPageActive()) {
          callbackRef.current();
        } else {
          stop();
        }
      }, ms);
      scheduleIdleStop();
    };

    const resumeIfActive = () => {
      const wasStopped = intervalId === null;
      start();
      if (catchUpOnResume && wasStopped && intervalId !== null) {
        callbackRef.current();
      }
    };

    const onActivity = () => {
      lastInteractionAt = Date.now();
      resumeIfActive();
    };

    const onFocusOrVisibilityChange = () => {
      if (isPageVisibleAndFocused()) {
        lastInteractionAt = Date.now();
        resumeIfActive();
      } else {
        stop();
      }
    };

    if (isPageActive()) {
      start();
    }

    document.addEventListener('visibilitychange', onFocusOrVisibilityChange);
    window.addEventListener('focus', onFocusOrVisibilityChange);
    window.addEventListener('blur', onFocusOrVisibilityChange);
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onFocusOrVisibilityChange);
      window.removeEventListener('focus', onFocusOrVisibilityChange);
      window.removeEventListener('blur', onFocusOrVisibilityChange);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [ms, enabled, catchUpOnResume]);
}
