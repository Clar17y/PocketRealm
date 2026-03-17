import { describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '@/lib/api';
import { runSimpleAction } from './simpleAction';

describe('runSimpleAction', () => {
  it('awaits async onSuccess work', async () => {
    const events: string[] = [];

    await runSimpleAction({
      actionName: 'equip',
      apiFn: async (): Promise<ApiResponse<{ ok: true }>> => ({ data: { ok: true }, error: null }),
      onSuccess: async () => {
        events.push('success:start');
        await Promise.resolve();
        events.push('success:end');
      },
      setActionError: vi.fn(),
    });

    expect(events).toEqual(['success:start', 'success:end']);
  });

  it('sets the fallback error message and skips onSuccess on API failure', async () => {
    const setActionError = vi.fn();
    const onSuccess = vi.fn();

    await runSimpleAction({
      actionName: 'equip_item',
      apiFn: async (): Promise<ApiResponse<{ ok: true }>> => ({
        data: null,
        error: { message: null, code: 'BAD_REQUEST' },
      }),
      onSuccess,
      setActionError,
    });

    expect(setActionError).toHaveBeenCalledWith('equip item failed');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
