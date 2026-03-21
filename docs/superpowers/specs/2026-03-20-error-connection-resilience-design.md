# Error & Connection Resilience — Remaining Work (Issue #206)

## Context

PR #234 delivered `useConnectionStatus`, `ConnectionBanner`, `ErrorBoundary`, and `LoadingSkeleton`. Three items from issue #206 remain:

1. Disable action buttons while disconnected
2. Extend toast error handling to passive/background error paths
3. Timeout handling (>10s "Still working..." indicator) for user-initiated actions

## 1. Disable Action Buttons While Disconnected

### Problem

When the server is unreachable, action buttons remain clickable. Users can fire requests that will fail, producing confusing error messages.

### Design

**API reachability signal:** `pollScreenData` already calls `getTurns()` every 10s on every screen. Piggyback on this by tracking consecutive failures.

New hook: `useApiReachable()`
- Listens for a `CustomEvent('api:reachable')` with `detail: { ok: boolean }` dispatched after each `getTurns()` call in `pollScreenData`.
- Initialises to `true` (SSR-safe — `typeof window === 'undefined'` guard).
- Requires **2 consecutive failures** before returning `false`, to avoid flickering offline on a single dropped packet.
- Resets to `true` immediately on the next successful poll.

Dispatch integration in `pollScreenData`:
```ts
// Inside pollScreenData, replace the existing getTurns().then(...) with:
fetches.push(
  getTurns().then(res => {
    if (res.data) {
      setTurns(res.data.currentTurns);
      window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: true } }));
    } else {
      window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: false } }));
    }
  })
);
```

Combined offline flag in `useGameController`:
```ts
const connectionStatus = useConnectionStatus();   // existing hook
const apiReachable = useApiReachable();            // new hook
const isOffline = !apiReachable
  || connectionStatus === 'disconnected'
  || connectionStatus === 'reconnecting'
  || connectionStatus === 'failed';
```

**Button disabling:**
- `isOffline` is passed down from `useGameController` and added to the `disabled` condition on action buttons (combat, exploration, crafting, gathering, travel, rest, etc.).
- These already use `PixelButton` which supports the `disabled` prop.
- Add `title="You're offline"` when `isOffline` is true so users understand why buttons are disabled.
- `isOffline` must be threaded into sub-screen components that receive props from `page.tsx` (e.g. Exploration, Gathering, Crafting screens that render their own action buttons).

**Scope:** Only game action buttons. Navigation, settings, and read-only screens remain functional.

**Note:** There is a brief window (up to 10s) where the socket may reconnect (ConnectionBanner shows "Connected") but buttons remain disabled waiting for the next REST poll. This is acceptable — buttons re-enable on the next successful `getTurns()`.

### Files Changed

| File | Change |
|------|--------|
| `apps/web/src/hooks/useApiReachable.ts` | New hook — listens for `api:reachable` event, 2-failure threshold, SSR-safe |
| `apps/web/src/app/game/useGameController.ts` | Dispatch `api:reachable` event in `pollScreenData`; compute `isOffline`; expose `isOffline` in return value |
| `apps/web/src/app/game/page.tsx` | Thread `isOffline` into action button `disabled` props + tooltip |
| Sub-screen components (Exploration, Gathering, Crafting, etc.) | Accept + use `isOffline` prop on their action buttons |

## 2. Toast for Background/Passive Errors

### Problem

Background failures (polling, socket events, fire-and-forget calls) are swallowed silently. Only rate-limit (429) currently gets a toast.

### Design

Two-piece pattern matching `RateLimitToast`:

**Hook:** `useErrorToast()` (new file `apps/web/src/app/game/hooks/useErrorToast.ts`)
- Listens for `CustomEvent('api:error')` on `window`.
- Debounces: max one toast per 10s.
- Suppresses toasts while `isOffline` is true (the ConnectionBanner already communicates the problem; no need for duplicate noise).
- Calls `window.__showErrorToast(message)` to push into the queue.

**Component:** `ErrorToast` (new file `apps/web/src/components/ErrorToast.tsx`)
- Uses `useToastQueue` with `globalKey: '__showErrorToast'`, `maxVisible: 1`, `autoDismissMs: 5000`.
- Styled with `--rpg-red` border, matching existing toast aesthetics.

**Event dispatch — NOT from `fetchApi` globally.** To prevent double-display (inline `actionError` + toast) when user-initiated actions fail, we do NOT dispatch `api:error` from `fetchApi`. Instead, only passive/background callers dispatch the event explicitly:

```ts
// In pollScreenData and other background polling callbacks:
getTurns().then(res => {
  if (res.data) { /* success handling */ }
  else {
    window.dispatchEvent(new CustomEvent('api:error', {
      detail: { message: res.error?.message ?? 'Network error', code: res.error?.code ?? 'UNKNOWN' }
    }));
  }
});
```

This keeps the boundary clean: user-initiated actions show inline errors via `actionError`, background/passive failures show toasts.

**Scope of `api:error` dispatch:**
- `NETWORK_ERROR` or `UNKNOWN` (5xx) from background polls.
- Only `getTurns()` in `pollScreenData` dispatches both `api:reachable` and `api:error` — it is the canonical heartbeat that runs unconditionally on every 10s cycle regardless of screen. Other `pollScreenData` fetches (HP, resources) are conditional and do not dispatch, to avoid redundant signals.
- `loadPvpNotificationCount` and `loadFriendCounts` (60s intervals, separate from `pollScreenData`) should also dispatch `api:error` on failure in their `else` branches.
- Does NOT cover 4xx errors (already handled per-action) or auth failures (handled separately).

**Interaction between `api:reachable` and `api:error`:** On the first background poll failure, a toast appears. On the second consecutive failure, offline mode activates and the `useErrorToast` hook suppresses further toasts (ConnectionBanner takes over). On recovery, `api:reachable` with `ok: true` re-enables buttons immediately.

### Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/game/hooks/useErrorToast.ts` | New hook — event listener, debounce, offline suppression |
| `apps/web/src/components/ErrorToast.tsx` | New component — `useToastQueue` + `ToastContainer` |
| `apps/web/src/app/game/useGameController.ts` | Dispatch `api:error` from `pollScreenData` and other background polling on failure |
| `apps/web/src/app/game/page.tsx` | Mount `ErrorToast`; call `useErrorToast(isOffline)` |

## 3. Timeout Handling for Actions (>10s "Still Working...")

### Problem

Slow actions (e.g. combat on a loaded server) give no feedback — the button shows a spinner but after 10s+ users may think the app is broken.

### Design

**State in `useGameController`:**
```ts
const [slowAction, setSlowAction] = useState(false);
```

**Timer in `runAction`:**
```ts
const runAction = async (actionName: string, fn: () => Promise<void>) => {
  if (busyAction) return;
  setBusyAction(actionName);
  setActionError(null);
  setSlowAction(false);
  const timer = setTimeout(() => setSlowAction(true), 10_000);
  try {
    await fn();
  } finally {
    clearTimeout(timer);
    setBusyAction(null);
    setSlowAction(false);
  }
};
```

**UI indicator:**
- When `busyAction && slowAction`, render a small text indicator below the action error area: "Still working..." with a subtle pulse animation.
- Uses existing RPG theme colors (`--rpg-gold` text).
- Disappears immediately when the action completes.

### Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/game/useGameController.ts` | Add `slowAction` state + timer in `runAction`; expose in return value |
| `apps/web/src/app/game/page.tsx` | Render "Still working..." indicator when `slowAction` is true |

## Testing

| Scenario | Expected behavior |
|----------|------------------|
| Socket disconnected, API reachable | `isOffline = true` (socket state) |
| Socket connected, API unreachable (2+ failures) | `isOffline = true` (API state) |
| Both disconnected | `isOffline = true` |
| Both connected/reachable | `isOffline = false` |
| Single API failure then success | `isOffline` stays `false` (2-failure threshold) |
| Background poll fails with NETWORK_ERROR | Toast shown (no `actionError`) |
| Background poll fails while `isOffline` = true | Toast suppressed (ConnectionBanner active) |
| User action fails with NETWORK_ERROR | `actionError` shown inline, no toast |
| Action takes >10s | "Still working..." indicator appears |
| Action completes after slow indicator | Indicator disappears immediately |

**Unit tests:**
- `useApiReachable` — dispatch events, verify 2-failure threshold, verify recovery, verify SSR default.
- `useErrorToast` — dispatch `api:error` events, verify toast calls, verify 10s debounce, verify offline suppression.
- `runAction` slow indicator — fake timers, verify `slowAction` becomes true after 10s, resets on completion.
- `isOffline` combination logic — verify OR of connection status and API reachability across all state combinations.

**Manual integration test:**
- Kill the API server → connection banner appears, action buttons disable with tooltip, error toast appears once then suppressed while offline.
- Restart API → buttons re-enable within 10s, banner clears.

## Out of Scope

- AbortController / actual request timeouts (requests continue, we only show UI feedback)
- Retry buttons on failed actions (existing UX: user clicks the action again)
- Offline queue / optimistic mutations
