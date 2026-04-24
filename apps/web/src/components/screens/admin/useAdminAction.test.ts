import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAction } from './useAdminAction';

describe('useAdminAction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns data and a success message when the action succeeds', async () => {
    const { result } = renderHook(() => useAdminAction());

    let response: { currentTurns: number } | null = null;
    await act(async () => {
      response = await result.current.act('Grant turns', async () => ({
        data: { currentTurns: 5000 },
      }));
    });

    expect(response).toEqual({ currentTurns: 5000 });
    expect(result.current.msg).toEqual({
      text: 'Grant turns succeeded',
      ok: true,
    });
    expect(result.current.busy).toBe(false);
  });

  it('returns null and a failure message when the action returns an error', async () => {
    const { result } = renderHook(() => useAdminAction());

    let response: { currentTurns: number } | null = null;
    await act(async () => {
      response = await result.current.act('Grant turns', async () => ({
        error: { message: 'Not allowed' },
      }));
    });

    expect(response).toBeNull();
    expect(result.current.msg).toEqual({
      text: 'Grant turns failed: Not allowed',
      ok: false,
    });
    expect(result.current.busy).toBe(false);
  });

  it('does not invoke the action when confirmation is declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const action = vi.fn();
    const { result } = renderHook(() => useAdminAction());

    let response: string | null = 'pending';
    await act(async () => {
      response = await result.current.act('Dangerous action', action, 'Proceed?');
    });

    expect(confirmSpy).toHaveBeenCalledWith('Proceed?');
    expect(action).not.toHaveBeenCalled();
    expect(response).toBeNull();
    expect(result.current.msg).toBeNull();
    expect(result.current.busy).toBe(false);
  });
});
