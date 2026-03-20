type EventMap = {
  signup: undefined;
  tutorial_complete: undefined;
  first_combat: { zone?: string };
  first_craft: { skill?: string };
  action: { type: string; turns: number; zone?: string };
  level_up: { skill: string; level: number };
  death: { zone: string; mob: string };
  screen_view: { screen: string };
  pwa_install: undefined;
  push_subscribe: undefined;
  session_start: { characterLevel: number; daysSinceSignup: number };
};

type AnalyticsEvent = keyof EventMap;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number> }) => void;
  }
}

export function trackEvent<E extends AnalyticsEvent>(
  event: E,
  ...args: EventMap[E] extends undefined ? [] : [EventMap[E]]
): void {
  if (typeof window === 'undefined') return;
  const props = args[0] as Record<string, string | number> | undefined;
  window.plausible?.(event, props ? { props } : undefined);
}

/**
 * Fire a one-time event guarded by a localStorage flag.
 * Returns true if the event fired (first time), false if already tracked.
 */
export function trackOnce<E extends AnalyticsEvent>(
  event: E,
  ...args: EventMap[E] extends undefined ? [] : [EventMap[E]]
): boolean {
  const key = `pr_tracked_${event}`;
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, '1');
  trackEvent(event, ...args);
  return true;
}
