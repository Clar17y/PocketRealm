'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPlayer, refreshToken as refreshTokenApi } from '@/lib/api';

interface Player {
  id: string;
  username: string;
  email: string;
  role: string;
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
            setState({
              player: retryResult.data.player,
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          }
        }
      }

      setState({ player: null, isLoading: false, isAuthenticated: false });
      return;
    }

    const { data, error } = await getPlayer();
    if (error || !data) {
      // Try refresh
      const refreshTok = localStorage.getItem('refreshToken');
      if (refreshTok) {
        const refreshResult = await refreshTokenApi(refreshTok);
        if (refreshResult.data) {
          localStorage.setItem('accessToken', refreshResult.data.accessToken);
          localStorage.setItem('refreshToken', refreshResult.data.refreshToken);
          // Retry
          const retryResult = await getPlayer();
          if (retryResult.data) {
            setState({
              player: retryResult.data.player,
              isLoading: false,
              isAuthenticated: true,
            });
            return;
          }
        }
      }
      // Failed
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setState({ player: null, isLoading: false, isAuthenticated: false });
      return;
    }

    setState({
      player: data.player,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  useEffect(() => {
    checkAuth();
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
  };
}
