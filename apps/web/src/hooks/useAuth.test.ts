import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  clearStoredTokens: vi.fn(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }),
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

  it('refreshes player data without logging out on transient player fetch failures', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.setTokens('access-token', 'refresh-token', {
        id: 'player-1',
        username: 'Rook',
        email: 'rook@example.com',
        role: 'player',
        emailVerified: false,
      });
    });

    vi.mocked(getPlayer).mockResolvedValue({
      data: null,
      error: { message: 'Network error', code: 'NETWORK_ERROR' },
    });

    await expect(result.current.refreshPlayer()).rejects.toThrow('Failed to refresh account.');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.player?.email).toBe('rook@example.com');
  });

  it('clears stale refresh tokens when no access token exists and refresh fails', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    localStorage.setItem('refreshToken', 'stale-refresh');
    vi.mocked(refreshTokenApi).mockResolvedValue({
      data: null,
      error: { message: 'invalid', code: 'INVALID_TOKEN' },
    });

    await expect(result.current.checkAuth()).rejects.toThrow('Failed to refresh account.');
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});
