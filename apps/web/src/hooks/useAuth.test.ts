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
import { AUTH_PLAYER_SNAPSHOT_KEY, useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('rejects checkAuth when the refresh-and-retry flow cannot load a player', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    localStorage.setItem('accessToken', 'expired-access');
    localStorage.setItem('refreshToken', 'refresh-token');

    vi.mocked(getPlayer)
      .mockResolvedValueOnce({ data: null, error: { message: 'expired' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'still expired', code: 'INVALID_TOKEN' } });
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

    const player = {
      id: 'player-1',
      username: 'Rook',
      email: 'rook@example.com',
      role: 'player',
      emailVerified: false,
      isPremium: false,
      premiumExpiresAt: null,
      seasonId: null,
    };

    await act(async () => {
      result.current.setTokens('access-token', 'refresh-token', player);
    });

    expect(JSON.parse(sessionStorage.getItem(AUTH_PLAYER_SNAPSHOT_KEY) ?? 'null')).toEqual(player);

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

  it('keeps freshly refreshed tokens when the follow-up player fetch fails transiently', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    localStorage.setItem('accessToken', 'expired-access');
    localStorage.setItem('refreshToken', 'refresh-token');

    vi.mocked(getPlayer)
      .mockResolvedValueOnce({ data: null, error: { message: 'expired' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'network', code: 'NETWORK_ERROR' } });
    vi.mocked(refreshTokenApi).mockResolvedValue({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
      error: null,
    });

    await expect(result.current.checkAuth()).rejects.toThrow('Failed to refresh account.');
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
  });

  it('uses a one-shot authenticated player snapshot without blocking on a player fetch', async () => {
    const player = {
      id: 'player-1',
      username: 'Rook',
      email: 'rook@example.com',
      role: 'player',
      emailVerified: false,
      isPremium: false,
      premiumExpiresAt: null,
      seasonId: null,
    };

    localStorage.setItem('accessToken', 'access-token');
    sessionStorage.setItem(AUTH_PLAYER_SNAPSHOT_KEY, JSON.stringify(player));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.player).toEqual(player);
    expect(result.current.isLoading).toBe(false);
    expect(sessionStorage.getItem(AUTH_PLAYER_SNAPSHOT_KEY)).toBeNull();
    expect(getPlayer).not.toHaveBeenCalled();
  });
});
