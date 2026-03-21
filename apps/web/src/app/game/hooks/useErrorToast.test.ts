import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useErrorToast } from './useErrorToast';
import { UI_TIMING_CONSTANTS } from '@pocketrealm/shared';

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
    vi.advanceTimersByTime(UI_TIMING_CONSTANTS.ERROR_TOAST_DEBOUNCE_MS);
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
