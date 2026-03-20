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
