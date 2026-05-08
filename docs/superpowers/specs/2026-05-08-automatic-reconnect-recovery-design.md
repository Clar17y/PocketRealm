# Automatic Reconnect Recovery

**Date:** 2026-05-08

## Goal

Recover automatically from the "Connection lost. Reconnecting..." banner when a user returns to an idle Pocketrealm tab, without reintroducing background database polling.

## Context

The idle-polling change makes recurring web polling run only while the page is visible, focused, and recently active. That protects NeonDB from being kept warm by an unattended tab, but it exposes a weakness in the existing connection banner flow.

`useConnectionStatus()` combines Socket.IO state with `useApiReachable()`. `useApiReachable()` only flips back to reachable after an `api:reachable` success event, and the canonical success event currently comes from game polling. If the site is idle or the polling loop has stopped, there may be no request to prove recovery. The banner can remain visible even after the user clicks around, forcing a full page refresh.

## Design

Add an automatic recovery probe that runs only when the user resumes activity while the app is not connected.

### Recovery Trigger

Create `useConnectionRecovery(status)` in `apps/web/src/hooks/useConnectionRecovery.ts` and mount it from `ConnectionBanner`.

The hook is active only when `status !== 'connected'`. While active, it listens for user-return signals:

- `visibilitychange` when the document becomes visible
- `focus`
- `pointerdown`
- `keydown`
- `wheel`
- `touchstart`
- `scroll`

On one of those signals, the hook runs a throttled health probe. Use a 5 second throttle to avoid repeated clicks causing a request storm while still making the UI feel responsive.

This is deliberately event-driven. It does not create a background interval while the page is idle.

### Health Probe

Use `GET /health/ready` through a small web API helper, `checkApiReady()`, that fetches the endpoint with auth omitted. This endpoint verifies the API process and dependencies are ready, but the hook only calls it in response to foreground user activity, so it does not reintroduce idle background database polling.

On probe success:

1. Dispatch `window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: true } }))`.
2. Call `connectSocket()` if the socket is not connected.
3. Let `useConnectionStatus()` re-render to `connected` once the API and socket state are healthy.

On probe failure:

1. Dispatch `window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: false } }))`.
2. Keep the banner visible.
3. Wait for the next throttled user-return signal before trying again.

### Socket Recovery

Socket.IO may reach `failed` after its configured reconnection attempts. User activity after that should call `connectSocket()` again so the app is not stuck in a terminal state until reload.

The recovery hook should avoid replacing Socket.IO's built-in reconnect behavior. It only nudges the socket when the user returns and the banner is still active.

### Banner Behavior

Keep the current automatic UX:

- `connected`: no banner, except the existing short "Connected" confirmation after recovery
- `disconnected` or `reconnecting`: red reconnecting banner
- `failed`: still show the reload action as a fallback

The primary recovery path is automatic. The reload action remains useful for hard client-state failures, expired auth edge cases, or unexpected socket failures.

## Data Flow

1. API or socket failure causes `ConnectionBanner` to show.
2. Idle polling stops because the page is unattended.
3. User returns and clicks, focuses, scrolls, or types.
4. Recovery hook runs one throttled health probe.
5. Probe succeeds and dispatches `api:reachable=true`.
6. Recovery hook calls `connectSocket()`.
7. `useConnectionStatus()` observes API and socket recovery.
8. Banner clears and briefly shows "Connected".

## Testing

Add focused unit tests for the new hook and connection status behavior:

- Disconnected state plus user activity runs one health probe.
- Successful probe dispatches `api:reachable=true`.
- Successful probe attempts socket reconnect when the socket is disconnected or failed.
- Failed probe keeps the banner state disconnected.
- Repeated clicks within the throttle window do not run repeated probes.
- No probe runs while status is `connected`.

Update existing connection banner/status tests only where needed to cover the automatic recovery path.

## Out of Scope

- Restoring always-on background health polling.
- Retrying every failed gameplay action automatically.
- Offline action queues or optimistic mutations.
- Removing the reload fallback from the failed banner state.
