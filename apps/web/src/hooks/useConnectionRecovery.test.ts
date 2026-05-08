import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionRecovery } from './useConnectionRecovery';

const { checkApiReady, connectSocket, ensureFreshAccessToken, socketMock } = vi.hoisted(() => ({
  checkApiReady: vi.fn(),
  connectSocket: vi.fn(),
  ensureFreshAccessToken: vi.fn(),
  socketMock: { connected: false },
}));

vi.mock('@/lib/api', () => ({ checkApiReady, ensureFreshAccessToken }));
vi.mock('@/lib/socket', () => ({
  connectSocket,
  getSocket: () => socketMock,
}));

const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
let focused = true;
let visibilityState: DocumentVisibilityState = 'visible';
const cleanupCallbacks: Array<() => void> = [];

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

function collectReachableEvents(): boolean[] {
  const reachableEvents: boolean[] = [];
  const listener = (event: Event) => {
    reachableEvents.push((event as CustomEvent<{ ok: boolean }>).detail.ok);
  };
  window.addEventListener('api:reachable', listener);
  cleanupCallbacks.push(() => window.removeEventListener('api:reachable', listener));
  return reachableEvents;
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
    ensureFreshAccessToken.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    for (const cleanupCallback of cleanupCallbacks.splice(0)) {
      cleanupCallback();
    }
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
    const reachableEvents = collectReachableEvents();
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('failed'));

    dispatchWindowEvent('keydown');
    await flushPromises();

    expect(reachableEvents).toEqual([true]);
    expect(connectSocket).toHaveBeenCalledTimes(1);
  });

  it('refreshes the access token before reconnecting the socket', async () => {
    checkApiReady.mockResolvedValue(true);
    ensureFreshAccessToken.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('failed'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(ensureFreshAccessToken).toHaveBeenCalledTimes(1);
    expect(connectSocket).toHaveBeenCalledTimes(1);
    expect(ensureFreshAccessToken.mock.invocationCallOrder[0]).toBeLessThan(
      connectSocket.mock.invocationCallOrder[0],
    );
  });

  it('does not reconnect the socket when the access token cannot be refreshed', async () => {
    const reachableEvents = collectReachableEvents();
    checkApiReady.mockResolvedValue(true);
    ensureFreshAccessToken.mockResolvedValue(false);
    renderHook(() => useConnectionRecovery('failed'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(reachableEvents).toEqual([true]);
    expect(connectSocket).not.toHaveBeenCalled();
  });

  it('keeps the API unreachable after a failed probe', async () => {
    const reachableEvents = collectReachableEvents();
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

  it('does not probe while the document is hidden', async () => {
    visibilityState = 'hidden';
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('disconnected'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(checkApiReady).not.toHaveBeenCalled();
  });

  it('does not probe while the window is blurred', async () => {
    focused = false;
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('disconnected'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(checkApiReady).not.toHaveBeenCalled();
  });

  it('does not probe while already connected', async () => {
    checkApiReady.mockResolvedValue(true);
    renderHook(() => useConnectionRecovery('connected'));

    dispatchWindowEvent('pointerdown');
    await flushPromises();

    expect(checkApiReady).not.toHaveBeenCalled();
  });
});
