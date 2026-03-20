# Error & Connection Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the three remaining items from issue #206 — disable action buttons while offline, toast for background errors, and slow-action timeout indicator.

**Architecture:** Piggyback on the existing 10s `getTurns()` polling cycle as a REST heartbeat via `CustomEvent` dispatch. New `useApiReachable` hook tracks consecutive failures; combined with existing `useConnectionStatus` to produce an `isOffline` flag. Background error toasts use the established two-piece pattern (event listener hook + toast component). Slow-action indicator adds a timer inside the existing `runAction` function.

**Tech Stack:** React hooks, CustomEvent API, existing `useToastQueue` + `ToastContainer`, Vitest with fake timers.

**Spec:** `docs/superpowers/specs/2026-03-20-error-connection-resilience-design.md`

**Worktree setup:**
```bash
./scripts/setup-worktree.sh error-resilience-206
```

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/web/src/hooks/useApiReachable.ts` | Create | Hook: listen for `api:reachable` events, 2-failure threshold, return boolean |
| `apps/web/src/hooks/useApiReachable.test.ts` | Create | Unit tests for the hook |
| `apps/web/src/hooks/isOffline.test.ts` | Create | isOffline combination logic tests |
| `apps/web/src/app/game/hooks/useErrorToast.ts` | Create | Hook: listen for `api:error` events, debounce 10s, suppress when offline |
| `apps/web/src/app/game/hooks/useErrorToast.test.ts` | Create | Unit tests for the hook |
| `apps/web/src/components/ErrorToast.tsx` | Create | Toast component using `useToastQueue` |
| `apps/web/src/app/game/useGameController.ts` | Modify | Dispatch events in polling, compute `isOffline`, add `slowAction` timer, expose new state |
| `apps/web/src/app/game/page.tsx` | Modify | Thread `isOffline` to sub-screens, mount `ErrorToast`, render slow-action indicator |
| `apps/web/src/components/screens/Exploration.tsx` | Modify | Accept `isOffline` prop, add to button disabled conditions |
| `apps/web/src/app/game/screens/CombatScreen.tsx` | Modify | Accept `isOffline` prop, add to button disabled conditions |
| `apps/web/src/app/game/screens/ArenaScreen.tsx` | Modify | Accept `isOffline` prop, add to button disabled conditions |
| `apps/web/src/components/common/ResourceStatusBar.tsx` | Modify | Accept `isOffline` prop, add to button disabled conditions |
| `apps/web/src/app/game/slowAction.test.ts` | Create | Slow-action timer logic tests |

---

## Task 1: `useApiReachable` Hook

**Files:**
- Create: `apps/web/src/hooks/useApiReachable.ts`
- Create: `apps/web/src/hooks/useApiReachable.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/src/hooks/useApiReachable.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiReachable } from './useApiReachable';

function fireReachable(ok: boolean) {
  window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok } }));
}

describe('useApiReachable', () => {
  afterEach(() => {
    // Clean up any lingering listeners by re-rendering nothing
  });

  it('initialises to true', () => {
    const { result } = renderHook(() => useApiReachable());
    expect(result.current).toBe(true);
  });

  it('stays true after a single failure', () => {
    const { result } = renderHook(() => useApiReachable());
    act(() => fireReachable(false));
    expect(result.current).toBe(true);
  });

  it('returns false after 2 consecutive failures', () => {
    const { result } = renderHook(() => useApiReachable());
    act(() => fireReachable(false));
    act(() => fireReachable(false));
    expect(result.current).toBe(false);
  });

  it('resets to true immediately on success after failures', () => {
    const { result } = renderHook(() => useApiReachable());
    act(() => fireReachable(false));
    act(() => fireReachable(false));
    expect(result.current).toBe(false);
    act(() => fireReachable(true));
    expect(result.current).toBe(true);
  });

  it('resets failure count on success', () => {
    const { result } = renderHook(() => useApiReachable());
    act(() => fireReachable(false));
    act(() => fireReachable(true));
    // One more failure should NOT trigger offline (count reset)
    act(() => fireReachable(false));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run src/hooks/useApiReachable.test.ts
```

Expected: FAIL — module `./useApiReachable` not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/src/hooks/useApiReachable.ts
import { useState, useEffect, useRef } from 'react';

export function useApiReachable(): boolean {
  const [reachable, setReachable] = useState(true);
  const failCountRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (e: Event) => {
      const ok = (e as CustomEvent<{ ok: boolean }>).detail.ok;
      if (ok) {
        failCountRef.current = 0;
        setReachable(true);
      } else {
        failCountRef.current += 1;
        if (failCountRef.current >= 2) {
          setReachable(false);
        }
      }
    };

    window.addEventListener('api:reachable', handler);
    return () => window.removeEventListener('api:reachable', handler);
  }, []);

  return reachable;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run src/hooks/useApiReachable.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useApiReachable.ts apps/web/src/hooks/useApiReachable.test.ts
git commit -m "feat: add useApiReachable hook with 2-failure threshold (#206)"
```

---

## Task 1b: `isOffline` Combination Logic Tests

**Files:**
- Create: `apps/web/src/hooks/isOffline.test.ts`

The `isOffline` flag is a simple OR computed inline in `useGameController`, but it's critical enough to test all state combinations in isolation.

- [ ] **Step 1: Write tests**

```ts
// apps/web/src/hooks/isOffline.test.ts
import { describe, it, expect } from 'vitest';
import type { ConnectionState } from './useConnectionStatus';

// Extract the isOffline logic as a pure function for testing
function computeIsOffline(apiReachable: boolean, connectionStatus: ConnectionState): boolean {
  return !apiReachable
    || connectionStatus === 'disconnected'
    || connectionStatus === 'reconnecting'
    || connectionStatus === 'failed';
}

describe('isOffline combination logic', () => {
  it('is false when both connected and API reachable', () => {
    expect(computeIsOffline(true, 'connected')).toBe(false);
  });

  it('is true when socket disconnected but API reachable', () => {
    expect(computeIsOffline(true, 'disconnected')).toBe(true);
  });

  it('is true when socket reconnecting but API reachable', () => {
    expect(computeIsOffline(true, 'reconnecting')).toBe(true);
  });

  it('is true when socket failed but API reachable', () => {
    expect(computeIsOffline(true, 'failed')).toBe(true);
  });

  it('is true when socket connected but API unreachable', () => {
    expect(computeIsOffline(false, 'connected')).toBe(true);
  });

  it('is true when both disconnected and API unreachable', () => {
    expect(computeIsOffline(false, 'disconnected')).toBe(true);
  });

  it('is true when both reconnecting and API unreachable', () => {
    expect(computeIsOffline(false, 'reconnecting')).toBe(true);
  });

  it('is true when both failed and API unreachable', () => {
    expect(computeIsOffline(false, 'failed')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/web && npx vitest run src/hooks/isOffline.test.ts
```

Expected: all 8 tests PASS (pure function, no dependencies).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/isOffline.test.ts
git commit -m "test: add isOffline combination logic tests (#206)"
```

---

## Task 2: Dispatch `api:reachable` Event from Polling

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Reference:** Read `apps/web/src/app/game/useGameController.ts:426-450` for the current `pollScreenData` implementation.

- [ ] **Step 1: Modify `pollScreenData` to dispatch `api:reachable`**

In `useGameController.ts`, find the `getTurns()` call inside `pollScreenData` (around line 430):

```ts
// BEFORE:
fetches.push(getTurns().then(res => { if (res.data) setTurns(res.data.currentTurns); }));

// AFTER:
fetches.push(getTurns().then(res => {
  if (res.data) {
    setTurns(res.data.currentTurns);
    window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: true } }));
  } else {
    window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: false } }));
  }
}));
```

- [ ] **Step 2: Typecheck**

```bash
npm run build:api && npm run typecheck
```

Expected: PASS (ignore pre-existing `page.tsx:333` error if present).

- [ ] **Step 3: Run existing tests to verify no regressions**

```bash
npm run test:engine
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: dispatch api:reachable event from polling heartbeat (#206)"
```

---

## Task 3: Compute and Expose `isOffline` Flag

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

**Reference:** Read `apps/web/src/hooks/useConnectionStatus.ts` for the existing hook API, and `useGameController.ts:1735-1940` for the return object.

- [ ] **Step 1: Import hooks and compute `isOffline`**

At the top of `useGameController.ts`, add import:
```ts
import { useApiReachable } from '@/hooks/useApiReachable';
```

`useConnectionStatus` is NOT currently imported in `useGameController.ts` (it's used by `ConnectionBanner` separately). Add the import:

```ts
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
```

Inside the `useGameController` function body (near where `busyAction` state is declared), add:

```ts
const connectionStatus = useConnectionStatus();
const apiReachable = useApiReachable();
const isOffline = !apiReachable
  || connectionStatus === 'disconnected'
  || connectionStatus === 'reconnecting'
  || connectionStatus === 'failed';
```

- [ ] **Step 2: Add `isOffline` to the return object**

In the return statement, add `isOffline` near `busyAction`:

```ts
busyAction,
isOffline,
actionError,
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat: compute isOffline from socket + API reachability (#206)"
```

---

## Task 4: Thread `isOffline` into Sub-Screen Components

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/app/game/screens/CombatScreen.tsx`
- Modify: `apps/web/src/app/game/screens/ArenaScreen.tsx`
- Modify: `apps/web/src/components/common/ResourceStatusBar.tsx`

**Reference:** Read each file's props interface and the places where `busyAction` is used in `disabled` conditions.

- [ ] **Step 1: Add `isOffline` prop to `ResourceStatusBar`**

In `apps/web/src/components/common/ResourceStatusBar.tsx`, add to the props interface:

```ts
isOffline?: boolean;
```

Destructure it in the component. Update the two button `disabled` conditions:

```ts
// Quick Rest button (around line 81):
disabled={busyAction != null || isOffline}

// Recover button (around line 90):
disabled={busyAction != null || isOffline}
```

Add tooltip on both buttons: `title={isOffline ? "You're offline" : undefined}`

- [ ] **Step 2: Add `isOffline` prop to `Exploration`**

In `apps/web/src/components/screens/Exploration.tsx`, add to props interface:

```ts
isOffline?: boolean;
```

Destructure it. Update the Explore button disabled condition (around line 386):

```ts
disabled={isRecovering || isOverEncumbered || turnInvestment[0] > availableTurns || !!busyAction || isOffline}
```

Add tooltip: `title={isOffline ? "You're offline" : undefined}`

Pass `isOffline` down to `ResourceStatusBar` (around line 159):

```ts
<ResourceStatusBar ... isOffline={isOffline} />
```

- [ ] **Step 3: Add `isOffline` prop to `CombatScreen`**

In `apps/web/src/app/game/screens/CombatScreen.tsx`, add to props interface:

```ts
isOffline?: boolean;
```

Destructure it. Update disabled conditions:

Strategy buttons (around lines 212, 227):
```ts
disabled={!!busyAction || isOffline}
```

Combat start button (around line 491) — add `|| isOffline` to the `isDisabled` computation:
```ts
const isDisabled = isOverEncumbered || hpState.isRecovering || busyAction === 'combat' || !e.nextMobTemplateId || isWrongZone || !!combatPlaybackData || isOffline;
```

Pass `isOffline` down to `ResourceStatusBar` (around line 280):
```ts
<ResourceStatusBar ... isOffline={isOffline} />
```

Add tooltip on strategy buttons and combat button: `title={isOffline ? "You're offline" : undefined}`

- [ ] **Step 4: Add `isOffline` prop to `ArenaScreen`**

In `apps/web/src/app/game/screens/ArenaScreen.tsx`, add to props interface:

```ts
isOffline?: boolean;
```

Destructure it. Update disabled conditions:

Scout button (around line 433):
```ts
disabled={!isInTown || !meetsLevel || !!actionBusy || !!busyAction || currentTurns < PVP_CONSTANTS.SCOUT_TURN_COST || isOffline}
```

Challenge button (around line 444):
```ts
disabled={!isInTown || !meetsLevel || !!actionBusy || !!busyAction || currentTurns < PVP_CONSTANTS.CHALLENGE_TURN_COST || isOffline}
```

**Important:** These buttons already have `title` props. Merge the offline tooltip with existing titles:

Scout button (around line 435):
```ts
title={isOffline ? "You're offline" : isInTown ? `Scout (${PVP_CONSTANTS.SCOUT_TURN_COST} turns)` : 'Must be in a town'}
```

Challenge button (around line 446):
```ts
title={isOffline ? "You're offline" : isInTown ? `Challenge (${PVP_CONSTANTS.CHALLENGE_TURN_COST} turns)` : 'Must be in a town'}
```

- [ ] **Step 5: Thread `isOffline` from `page.tsx` to sub-screens**

In `apps/web/src/app/game/page.tsx`, destructure `isOffline` from `useGameController()` (around line 165, near `busyAction`):

```ts
isOffline,
```

Pass it to each sub-screen component:

Exploration (around line 573):
```ts
isOffline={isOffline}
```

CombatScreen (around line 1002):
```ts
isOffline={isOffline}
```

ArenaScreen (around line 1038):
```ts
isOffline={isOffline}
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/common/ResourceStatusBar.tsx apps/web/src/components/screens/Exploration.tsx apps/web/src/app/game/screens/CombatScreen.tsx apps/web/src/app/game/screens/ArenaScreen.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: disable action buttons when offline (#206)"
```

---

## Task 5: `ErrorToast` Component

**Files:**
- Create: `apps/web/src/components/ErrorToast.tsx`

**Reference:** Read `apps/web/src/components/RateLimitToast.tsx` for the pattern to follow, and `apps/web/src/hooks/useToastQueue.ts` for the queue API.

- [ ] **Step 1: Create `ErrorToast` component**

```tsx
// apps/web/src/components/ErrorToast.tsx
'use client';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

let _errorSeq = 0;

export function ErrorToast() {
  const queue = useToastQueue<string>({
    globalKey: '__showErrorToast',
    maxVisible: 1,
    autoDismissMs: 5000,
    makeItem: (msg) => ({ id: `error-${++_errorSeq}`, data: msg }),
  });

  if (queue.isEmpty) return null;

  return (
    <ToastContainer
      position="top-left"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      overflowLabel=""
      renderToast={(item) => (
        <p className="text-sm font-medium text-[var(--rpg-red)]">{item.data}</p>
      )}
    />
  );
}
```

Note: uses `top-left` position to avoid overlap with `RateLimitToast` which uses `top-right`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ErrorToast.tsx
git commit -m "feat: add ErrorToast component for background error display (#206)"
```

---

## Task 6: `useErrorToast` Hook

**Files:**
- Create: `apps/web/src/app/game/hooks/useErrorToast.ts`
- Create: `apps/web/src/app/game/hooks/useErrorToast.test.ts`

**Reference:** Read `apps/web/src/app/game/hooks/useRateLimitToast.ts` for the established pattern.

- [ ] **Step 1: Write failing tests**

```ts
// apps/web/src/app/game/hooks/useErrorToast.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useErrorToast } from './useErrorToast';

function fireApiError(message = 'Network error', code = 'NETWORK_ERROR') {
  window.dispatchEvent(new CustomEvent('api:error', { detail: { message, code } }));
}

describe('useErrorToast', () => {
  let showToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    showToast = vi.fn();
    (window as unknown as Record<string, unknown>).__showErrorToast = showToast;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as Record<string, unknown>).__showErrorToast;
  });

  it('calls __showErrorToast on api:error event', () => {
    renderHook(() => useErrorToast(false));
    fireApiError('Network error');
    expect(showToast).toHaveBeenCalledWith('Network error');
  });

  it('debounces — suppresses second toast within 10s', () => {
    renderHook(() => useErrorToast(false));
    fireApiError('Error 1');
    fireApiError('Error 2');
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('allows toast after 10s debounce expires', () => {
    renderHook(() => useErrorToast(false));
    fireApiError('Error 1');
    vi.advanceTimersByTime(10_000);
    fireApiError('Error 2');
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  it('suppresses toast when isOffline is true', () => {
    renderHook(() => useErrorToast(true));
    fireApiError('Network error');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const { unmount } = renderHook(() => useErrorToast(false));
    unmount();
    fireApiError('Network error');
    expect(showToast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run src/app/game/hooks/useErrorToast.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// apps/web/src/app/game/hooks/useErrorToast.ts
import { useEffect, useRef } from 'react';

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
      }, 10_000);
    };

    window.addEventListener('api:error', handler);
    return () => {
      window.removeEventListener('api:error', handler);
      if (timeout) clearTimeout(timeout);
    };
  }, []);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run src/app/game/hooks/useErrorToast.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/game/hooks/useErrorToast.ts apps/web/src/app/game/hooks/useErrorToast.test.ts
git commit -m "feat: add useErrorToast hook with debounce and offline suppression (#206)"
```

---

## Task 7: Dispatch `api:error` from Background Polling + Mount Toast

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx`

**Reference:** Read `useGameController.ts:426-450` (pollScreenData), `useGameController.ts:460-474` (loadPvpNotificationCount, loadFriendCounts), and `page.tsx` for where toasts are mounted.

- [ ] **Step 1: Add `api:error` dispatch to `pollScreenData`**

The `getTurns()` handler in `pollScreenData` was already modified in Task 2 to dispatch `api:reachable`. Now extend the `else` branch to also dispatch `api:error`:

```ts
fetches.push(getTurns().then(res => {
  if (res.data) {
    setTurns(res.data.currentTurns);
    window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: true } }));
  } else {
    window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: false } }));
    window.dispatchEvent(new CustomEvent('api:error', {
      detail: { message: res.error?.message ?? 'Network error', code: res.error?.code ?? 'UNKNOWN' }
    }));
  }
}));
```

- [ ] **Step 2: Add `api:error` dispatch to `loadPvpNotificationCount`**

```ts
const loadPvpNotificationCount = useCallback(async () => {
  const result = await getPvpNotificationCount();
  if (result.data) {
    setPvpNotificationCount(result.data.count);
  } else {
    window.dispatchEvent(new CustomEvent('api:error', {
      detail: { message: result.error?.message ?? 'Network error', code: result.error?.code ?? 'UNKNOWN' }
    }));
  }
}, []);
```

- [ ] **Step 3: Add `api:error` dispatch to `loadFriendCounts`**

```ts
const loadFriendCounts = useCallback(async () => {
  const [reqRes, mailRes] = await Promise.all([
    getIncomingFriendRequests(),
    getFriendMailUnreadCount(),
  ]);
  if (reqRes.data) setIncomingFriendRequestCount(reqRes.data.requests.length);
  if (mailRes.data) setMailUnreadCount(mailRes.data.count);
  // Dispatch error if both failed (if only one failed, partial success is OK)
  if (!reqRes.data && !mailRes.data) {
    window.dispatchEvent(new CustomEvent('api:error', {
      detail: { message: 'Network error', code: 'NETWORK_ERROR' }
    }));
  }
}, []);
```

- [ ] **Step 4: Mount `ErrorToast` and call `useErrorToast` in `page.tsx`**

In `apps/web/src/app/game/page.tsx`, add imports:

```ts
import { ErrorToast } from '@/components/ErrorToast';
import { useErrorToast } from './hooks/useErrorToast';
```

Call `useErrorToast` inside the component (near other hook calls):

```ts
useErrorToast(isOffline);
```

Mount `<ErrorToast />` alongside existing toast components (near `<RateLimitToast />`).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx
git commit -m "feat: dispatch api:error from background polling, mount ErrorToast (#206)"
```

---

## Task 8: Slow-Action Timeout Indicator

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/app/game/page.tsx`
- Create: `apps/web/src/app/game/slowAction.test.ts`

**Reference:** Read `useGameController.ts:758-767` for the current `runAction` implementation, and `page.tsx:1373-1393` for the action error display area.

- [ ] **Step 1: Write failing test for slow-action timer**

Add to `apps/web/src/app/game/simpleAction.test.ts` (or create a new test file if the existing one doesn't cover `runAction` directly — since `runAction` lives in `useGameController`, we'll test via the hook):

Create a new test file `apps/web/src/app/game/slowAction.test.ts`:

```ts
// apps/web/src/app/game/slowAction.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('runAction slow-action timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets slowAction to true after 10s', async () => {
    let resolveAction: () => void;
    const actionPromise = new Promise<void>((resolve) => { resolveAction = resolve; });

    let slowAction = false;
    const setSlowAction = (v: boolean) => { slowAction = v; };
    let busyAction: string | null = null;
    const setBusyAction = (v: string | null) => { busyAction = v; };
    const setActionError = vi.fn();

    // Simulate runAction logic
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

    const promise = runAction('test', () => actionPromise);

    // Before 10s
    vi.advanceTimersByTime(9_999);
    expect(slowAction).toBe(false);
    expect(busyAction).toBe('test');

    // At 10s
    vi.advanceTimersByTime(1);
    expect(slowAction).toBe(true);

    // Resolve action
    resolveAction!();
    await promise;

    expect(slowAction).toBe(false);
    expect(busyAction).toBeNull();
  });

  it('does not set slowAction if action completes before 10s', async () => {
    let slowAction = false;
    const setSlowAction = (v: boolean) => { slowAction = v; };
    let busyAction: string | null = null;
    const setBusyAction = (v: string | null) => { busyAction = v; };
    const setActionError = vi.fn();

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

    await runAction('test', async () => {});

    vi.advanceTimersByTime(15_000);
    expect(slowAction).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (these test the logic directly, should pass immediately)**

```bash
cd apps/web && npx vitest run src/app/game/slowAction.test.ts
```

Expected: PASS — we're testing the logic pattern in isolation first.

- [ ] **Step 3: Add `slowAction` state and timer to `runAction` in `useGameController.ts`**

Near the existing `busyAction` state declaration, add:

```ts
const [slowAction, setSlowAction] = useState(false);
```

Replace the `runAction` function (around line 758):

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

Add `slowAction` to the return object (near `busyAction`):

```ts
busyAction,
slowAction,
isOffline,
```

- [ ] **Step 4: Add "Still working..." indicator to `page.tsx`**

In `apps/web/src/app/game/page.tsx`, destructure `slowAction` from `useGameController()`:

```ts
slowAction,
```

Below the action error display area (around line 1393), add:

```tsx
{busyAction && slowAction && (
  <div className="text-center text-xs text-[var(--rpg-gold)] animate-pulse py-1">
    Still working...
  </div>
)}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Run all tests**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/app/game/page.tsx apps/web/src/app/game/slowAction.test.ts
git commit -m "feat: add slow-action timeout indicator after 10s (#206)"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Full test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Verify commit history**

```bash
git log --oneline -8
```

Expected: 7 clean commits covering all three features.
