import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_ACTIVE_IDLE_MS, useVisibleInterval } from './usePageVisible';

const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
let focused = true;
let visibilityState: DocumentVisibilityState = 'visible';

function dispatchWindowEvent(type: string): void {
  act(() => {
    window.dispatchEvent(new Event(type));
  });
}

function markActive(callback: ReturnType<typeof vi.fn>): void {
  focused = true;
  dispatchWindowEvent('focus');
  callback.mockClear();
}

function restoreVisibilityState(): void {
  if (originalVisibilityStateDescriptor) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityStateDescriptor);
  } else {
    delete (document as Document & { visibilityState?: DocumentVisibilityState }).visibilityState;
  }
}

describe('useVisibleInterval', () => {
  beforeEach(() => {
    focused = true;
    visibilityState = 'visible';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00.000Z'));
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterEach(() => {
    restoreVisibilityState();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not poll while the window is blurred', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000, true));
    markActive(callback);

    focused = false;
    dispatchWindowEvent('blur');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('stops polling after the page has been idle', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000, true));
    markActive(callback);

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS + 1000);
    });
    const callsAtIdle = callback.mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(callback).toHaveBeenCalledTimes(callsAtIdle);
  });

  it('extends the active polling window after user activity', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000, true));
    markActive(callback);

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS / 2);
    });
    dispatchWindowEvent('pointerdown');

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS / 2 + 5000);
    });

    const callsAfterOriginalDeadline = callback.mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(callsAfterOriginalDeadline + 1);
  });

  it('does not extend the active polling window when the interval changes without user activity', () => {
    const callback = vi.fn();
    const { rerender } = renderHook(
      ({ ms }) => useVisibleInterval(callback, ms, true),
      { initialProps: { ms: 1000 } },
    );
    markActive(callback);

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS / 2);
    });

    rerender({ ms: 500 });

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS / 2 + 1000);
    });
    const callsAfterOriginalIdle = callback.mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(callback).toHaveBeenCalledTimes(callsAfterOriginalIdle);
  });

  it('resumes polling immediately when the user becomes active again', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000, true));
    markActive(callback);

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS + 1000);
    });
    const callsAtIdle = callback.mock.calls.length;

    dispatchWindowEvent('pointerdown');

    expect(callback).toHaveBeenCalledTimes(callsAtIdle + 1);
  });

  it('treats focusing an idle visible window as active use', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000, true));
    markActive(callback);

    focused = false;
    dispatchWindowEvent('blur');

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS + 1000);
    });

    focused = true;
    dispatchWindowEvent('focus');

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('can resume without immediate catch-up', () => {
    const callback = vi.fn();
    renderHook(() => useVisibleInterval(callback, 1000, true, { catchUpOnResume: false }));
    markActive(callback);

    focused = false;
    dispatchWindowEvent('blur');

    act(() => {
      vi.advanceTimersByTime(PAGE_ACTIVE_IDLE_MS + 1000);
    });

    focused = true;
    dispatchWindowEvent('focus');

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
