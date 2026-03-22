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

let plausibleReady: Promise<typeof import('@plausible-analytics/tracker')> | null = null;

function getPlausible() {
  if (typeof window === 'undefined') return null;
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  if (!plausibleReady) {
    plausibleReady = import('@plausible-analytics/tracker').then((mod) => {
      mod.init({ domain });
      return mod;
    });
  }
  return plausibleReady;
}

export function trackEvent<E extends AnalyticsEvent>(
  event: E,
  ...args: EventMap[E] extends undefined ? [] : [EventMap[E]]
): void {
  const p = getPlausible();
  if (!p) return;
  const raw = args[0] as Record<string, string | number> | undefined;
  const props: Record<string, string> = {};
  if (raw) { for (const [k, v] of Object.entries(raw)) props[k] = String(v); }
  void p.then((mod) => mod.track(event, { props }));
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
