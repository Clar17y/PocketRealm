# Automatic Reconnect Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover automatically from the connection banner when a user returns to an idle tab, without restarting background polling.

**Architecture:** Add a lightweight unauthenticated readiness probe helper, then add a `useConnectionRecovery(status)` hook that listens for foreground user activity only while disconnected. Mount the hook from `ConnectionBanner` so successful recovery updates `api:reachable`, nudges Socket.IO reconnection, and lets the existing banner state clear.

**Tech Stack:** Next.js client React hooks, Vitest, React Testing Library, Socket.IO client, existing Express `/health/ready` endpoint.

---

## File Structure

- `apps/web/src/lib/api/core.ts`: add `checkApiReady()` next to `fetchApi()` so both use the same resolved API base URL.
- `apps/web/src/lib/api/index.ts`: export `checkApiReady()` through the existing API barrel.
- `apps/web/src/lib/api/core.test.ts`: cover readiness probing without auth headers.
- `apps/web/src/hooks/useConnectionRecovery.ts`: new focused hook for activity-triggered recovery probes.
- `apps/web/src/hooks/useConnectionRecovery.test.ts`: unit tests for success, failure, throttle, and connected no-op behavior.
- `apps/web/src/components/common/ConnectionBanner.tsx`: mount recovery hook with the current connection status.
- `apps/web/src/components/common/ConnectionBanner.test.tsx`: verify the banner wires status into the recovery hook.

---

### Task 1: API Readiness Helper

**Files:**
- Modify: `apps/web/src/lib/api/core.test.ts`
- Modify: `apps/web/src/lib/api/core.ts`
- Modify: `apps/web/src/lib/api/index.ts`

- [ ] **Step 1: Write failing readiness helper tests**

Add these tests to `apps/web/src/lib/api/core.test.ts` and update the import to `import { checkApiReady, fetchApi } from './core';`.

```ts
describe('checkApiReady', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when the readiness endpoint succeeds without auth', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));

    await expect(checkApiReady()).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/health\/ready$/);
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('returns false when the readiness endpoint fails', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'error' }), { status: 503 }));

    await expect(checkApiReady()).resolves.toBe(false);
  });

  it('returns false when the readiness request throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(checkApiReady()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm run test -w apps/web -- core.test.ts`

Expected: FAIL because `checkApiReady` is not exported from `./core`.

- [ ] **Step 3: Implement `checkApiReady()`**

Add this function to `apps/web/src/lib/api/core.ts` below the `ApiRequestOptions` type.

```ts
export async function checkApiReady(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health/ready`, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

Update `apps/web/src/lib/api/index.ts`:

```ts
export { fetchApi, clearStoredTokens, getJwtExpMs, checkApiReady } from './core';
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm run test -w apps/web -- core.test.ts`

Expected: PASS.

---

### Task 2: Activity-Triggered Recovery Hook

**Files:**
- Create: `apps/web/src/hooks/useConnectionRecovery.ts`
- Create: `apps/web/src/hooks/useConnectionRecovery.test.ts`

- [ ] **Step 1: Write failing hook tests**

Create `apps/web/src/hooks/useConnectionRecovery.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionRecovery } from './useConnectionRecovery';

const { checkApiReady, connectSocket, socketMock } = vi.hoisted(() => ({
  checkApiReady: vi.fn(),
  connectSocket: vi.fn(),
  socketMock: { connected: false },
}));

vi.mock('@/lib/api', () => ({ checkApiReady }));
vi.mock('@/lib/socket', () => ({
  connectSocket,
  getSocket: () => socketMock,
}));

const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
let focused = true;
let visibilityState: DocumentVisibilityState = 'visible';

function dispatchWindowEvent(type: string): void {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function restoreVisibilityState(): void {
  if (originalVisibilityStateDescriptor) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityStateDescriptor);
  } else {
    delete (document as Document & { visibilityState?: DocumentVisibilityState }).visibilityState;
  }
}

describe('useConnectionRecovery', () => {
  beforeEach(() => {
    focused = true;
    visibilityState = 'visible';
    socketMock.connected = false;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00.000Z'));
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreVisibilityState();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('probes readiness when the user acts while disconnected', async () => {
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('disconnected'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(checkApiReady).toHaveBeenCalledTimes(1);
  });

  it('marks the API reachable and reconnects the socket after a successful probe', async () => {
    const reachableEvents: boolean[] = [];
    window.addEventListener('api:reachable', (event) => {
      reachableEvents.push((event as CustomEvent<{ ok: boolean }>).detail.ok);
    });
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('failed'));

    dispatchWindowEvent('keydown');
    await flushPromises();

    expect(reachableEvents).toEqual([true]);
    expect(connectSocket).toHaveBeenCalledTimes(1);
  });

  it('keeps the API unreachable after a failed probe', async () => {
    const reachableEvents: boolean[] = [];
    window.addEventListener('api:reachable', (event) => {
      reachableEvents.push((event as CustomEvent<{ ok: boolean }>).detail.ok);
    });
    checkApiReady.mockResolvedValue(false);
    renderHook(() => useConnectionRecovery('disconnected'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(reachableEvents).toEqual([false]);
    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('throttles repeated recovery probes', async () => {
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('reconnecting'));

    dispatchWindowEvent('pointerdown');
    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(checkApiReady).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(checkApiReady).toHaveBeenCalledTimes(2);
  });

  it('does not probe while already connected', async () => {
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('connected'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(checkApiReady).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm run test -w apps/web -- useConnectionRecovery.test.ts`

Expected: FAIL because `useConnectionRecovery.ts` does not exist.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/hooks/useConnectionRecovery.ts`:

```ts
import { useEffect, useRef } from 'react';
import { checkApiReady } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import type { ConnectionState } from './useConnectionStatus';

const RECOVERY_PROBE_THROTTLE_MS = 5_000;
const RECOVERY_EVENTS = ['focus', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function isForeground(): boolean {
  if (typeof document === 'undefined') return false;
  const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return document.visibilityState === 'visible' && hasFocus;
}

function dispatchApiReachable(ok: boolean): void {
  window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok } }));
}

export function useConnectionRecovery(status: ConnectionState): void {
  const statusRef = useRef(status);
  const lastProbeAtRef = useRef(-RECOVERY_PROBE_THROTTLE_MS);
  const probeInFlightRef = useRef(false);

  statusRef.current = status;

  useEffect(() => {
    if (status === 'connected' || typeof window === 'undefined') return;

    const runProbe = () => {
      if (statusRef.current === 'connected' || !isForeground() || probeInFlightRef.current) return;

      const now = Date.now();
      if (now - lastProbeAtRef.current < RECOVERY_PROBE_THROTTLE_MS) return;
      lastProbeAtRef.current = now;
      probeInFlightRef.current = true;

      void (async () => {
        try {
          const ok = await checkApiReady();
          dispatchApiReachable(ok);
          if (ok && !getSocket().connected) {
            connectSocket();
          }
        } finally {
          probeInFlightRef.current = false;
        }
      })();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') runProbe();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    for (const eventName of RECOVERY_EVENTS) {
      window.addEventListener(eventName, runProbe, { passive: true });
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      for (const eventName of RECOVERY_EVENTS) {
        window.removeEventListener(eventName, runProbe);
      }
    };
  }, [status]);
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm run test -w apps/web -- useConnectionRecovery.test.ts`

Expected: PASS.

---

### Task 3: Mount Recovery from the Banner

**Files:**
- Create: `apps/web/src/components/common/ConnectionBanner.test.tsx`
- Modify: `apps/web/src/components/common/ConnectionBanner.tsx`

- [ ] **Step 1: Write failing banner wiring test**

Create `apps/web/src/components/common/ConnectionBanner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionBanner } from './ConnectionBanner';

const { useConnectionRecovery, useConnectionStatus } = vi.hoisted(() => ({
  useConnectionRecovery: vi.fn(),
  useConnectionStatus: vi.fn(),
}));

vi.mock('@/hooks/useConnectionStatus', () => ({ useConnectionStatus }));
vi.mock('@/hooks/useConnectionRecovery', () => ({ useConnectionRecovery }));

describe('ConnectionBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStatus.mockReturnValue('disconnected');
  });

  it('mounts automatic recovery with the current connection status', () => {
    render(<ConnectionBanner />);

    expect(useConnectionRecovery).toHaveBeenCalledWith('disconnected');
    expect(screen.getByText('Connection lost. Reconnecting...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test -w apps/web -- ConnectionBanner.test.tsx`

Expected: FAIL because `ConnectionBanner` does not call `useConnectionRecovery`.

- [ ] **Step 3: Mount the hook**

Update `apps/web/src/components/common/ConnectionBanner.tsx`:

```tsx
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery';
import { useEffect, useRef, useState } from 'react';
```

Then call the hook immediately after reading status:

```tsx
export function ConnectionBanner() {
  const status = useConnectionStatus();
  useConnectionRecovery(status);
  const [showReconnected, setShowReconnected] = useState(false);
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm run test -w apps/web -- ConnectionBanner.test.tsx`

Expected: PASS.

---

### Task 4: Focused Verification and Commit

**Files:**
- All files changed in Tasks 1-3

- [ ] **Step 1: Run focused test suite**

Run:

```powershell
npm run test -w apps/web -- core.test.ts useConnectionRecovery.test.ts ConnectionBanner.test.tsx useApiReachable.test.ts isOffline.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `rtk npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run diff whitespace check**

Run: `git diff --check`

Expected: PASS, with no whitespace errors. CRLF warnings are acceptable on this Windows worktree.

- [ ] **Step 4: Commit implementation**

Run:

```powershell
git add -- apps/web/src/lib/api/core.ts apps/web/src/lib/api/index.ts apps/web/src/lib/api/core.test.ts apps/web/src/hooks/useConnectionRecovery.ts apps/web/src/hooks/useConnectionRecovery.test.ts apps/web/src/components/common/ConnectionBanner.tsx apps/web/src/components/common/ConnectionBanner.test.tsx docs/superpowers/plans/2026-05-08-automatic-reconnect-recovery.md
git commit -m "Recover connection on user activity"
```

Expected: commit succeeds on branch `codex/neondb-idle-polling`.
