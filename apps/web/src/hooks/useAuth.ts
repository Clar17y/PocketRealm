'use client';

import { useState, useEffect, useCallback } from 'react';
import { clearStoredTokens, getPlayer, refreshToken as refreshTokenApi } from '@/lib/api';

interface Player {
  id: string;
  username: string;
  email: string;
  role: string;
  emailVerified: boolean;
  isPremium: boolean;
  premiumExpiresAt: string | null;
}

interface AuthState {
  player: Player | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    player: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const setAuthenticatedState = useCallback((player: Player) => {
    setState({
      player,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const failRefresh = useCallback((): never => {
    clearStoredTokens();
    setState({ player: null, isLoading: false, isAuthenticated: false });
    throw new Error('Failed to refresh account.');
  }, []);

  const refreshPlayer = useCallback(async () => {
    const { data, error } = await getPlayer();
    if (data) {
      setAuthenticatedState(data.player);
      return data.player;
    }

    if (error?.code === 'INVALID_TOKEN' || error?.code === 'MISSING_TOKEN') {
      failRefresh();
    }

    throw new Error('Failed to refresh account.');
  }, [failRefresh, setAuthenticatedState]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      const refreshTok = localStorage.getItem('refreshToken');
      if (refreshTok) {
        const refreshResult = await refreshTokenApi(refreshTok);
        if (refreshResult.data) {
          localStorage.setItem('accessToken', refreshResult.data.accessToken);
          localStorage.setItem('refreshToken', refreshResult.data.refreshToken);
          const retryResult = await getPlayer();
          if (retryResult.data) {
            setAuthenticatedState(retryResult.data.player);
            return;
          }
        }
      }

      failRefresh();
    }

    const { data, error } = await getPlayer();
    if (data && !error) {
      setAuthenticatedState(data.player);
      return;
    }

    // Try refresh
    const refreshTok = localStorage.getItem('refreshToken');
    if (refreshTok) {
      const refreshResult = await refreshTokenApi(refreshTok);
      if (refreshResult.data) {
        localStorage.setItem('accessToken', refreshResult.data.accessToken);
        localStorage.setItem('refreshToken', refreshResult.data.refreshToken);
        const retryResult = await getPlayer();
        if (retryResult.data) {
          setAuthenticatedState(retryResult.data.player);
          return;
        }
      }
    }

    // Failed
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    failRefresh();
  }, [failRefresh, setAuthenticatedState]);

  useEffect(() => {
    void checkAuth().catch(() => undefined);
  }, [checkAuth]);

  const setTokens = useCallback((accessToken: string, refreshToken: string, player: Player) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setState({ player, isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setState({ player: null, isLoading: false, isAuthenticated: false });
  }, []);

  return {
    ...state,
    setTokens,
    logout,
    checkAuth,
    refreshPlayer,
  };
}
