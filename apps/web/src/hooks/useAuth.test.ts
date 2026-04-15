import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  getPlayer: vi.fn(),
  refreshToken: vi.fn(),
}));

vi.mock('@/lib/api', () => apiMock);

import { getPlayer, refreshToken as refreshTokenApi } from '@/lib/api';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('rejects checkAuth when the refresh-and-retry flow cannot load a player', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    localStorage.setItem('accessToken', 'expired-access');
    localStorage.setItem('refreshToken', 'refresh-token');

    vi.mocked(getPlayer)
      .mockResolvedValueOnce({ data: null, error: { message: 'expired' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'still expired' } });
    vi.mocked(refreshTokenApi).mockResolvedValue({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      error: null,
    });

    await expect(result.current.checkAuth()).rejects.toThrow('Failed to refresh account.');
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
