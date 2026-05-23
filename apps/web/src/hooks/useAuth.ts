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
  seasonId: string | null;
}

interface AuthState {
  player: Player | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export const AUTH_PLAYER_SNAPSHOT_KEY = 'authPlayerSnapshot';

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function parseStoredPlayer(value: unknown): Player | null {
  if (!value || typeof value !== 'object') return null;

  const player = value as Partial<Player>;
  if (
    typeof player.id !== 'string'
    || typeof player.username !== 'string'
    || typeof player.email !== 'string'
    || typeof player.role !== 'string'
    || typeof player.emailVerified !== 'boolean'
    || typeof player.isPremium !== 'boolean'
    || !isStringOrNull(player.premiumExpiresAt)
    || !isStringOrNull(player.seasonId)
  ) {
    return null;
  }

  return {
    id: player.id,
    username: player.username,
    email: player.email,
    role: player.role,
    emailVerified: player.emailVerified,
    isPremium: player.isPremium,
    premiumExpiresAt: player.premiumExpiresAt,
    seasonId: player.seasonId,
  };
}

function takeAuthPlayerSnapshot(): Player | null {
  try {
    const snapshot = sessionStorage.getItem(AUTH_PLAYER_SNAPSHOT_KEY);
    if (!snapshot) return null;

    sessionStorage.removeItem(AUTH_PLAYER_SNAPSHOT_KEY);
    return parseStoredPlayer(JSON.parse(snapshot));
  } catch {
    return null;
  }
}

function storeAuthPlayerSnapshot(player: Player) {
  try {
    sessionStorage.setItem(AUTH_PLAYER_SNAPSHOT_KEY, JSON.stringify(player));
  } catch {
    // Session storage is an optimization for immediate navigation only.
  }
}

function clearAuthPlayerSnapshot() {
  try {
    sessionStorage.removeItem(AUTH_PLAYER_SNAPSHOT_KEY);
  } catch {
    // Clearing auth should not depend on optional session storage.
  }
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
    clearAuthPlayerSnapshot();
    setState({ player: null, isLoading: false, isAuthenticated: false });
    throw new Error('Failed to refresh account.');
  }, []);

  const isTerminalAuthError = useCallback((code?: string) => (
    code === 'INVALID_TOKEN' || code === 'MISSING_TOKEN'
  ), []);

  const finishTransientFailure = useCallback(() => {
    setState((current) => ({
      ...current,
      isLoading: false,
    }));
  }, []);

  const loadPlayerAfterRefresh = useCallback(async () => {
    const retryResult = await getPlayer();
    if (retryResult.data) {
      setAuthenticatedState(retryResult.data.player);
      return retryResult.data.player;
    }

    if (isTerminalAuthError(retryResult.error?.code)) {
      failRefresh();
    }

    finishTransientFailure();
    throw new Error('Failed to refresh account.');
  }, [failRefresh, finishTransientFailure, isTerminalAuthError, setAuthenticatedState]);

  const refreshPlayer = useCallback(async () => {
    const { data, error } = await getPlayer();
    if (data) {
      setAuthenticatedState(data.player);
      return data.player;
    }

    if (isTerminalAuthError(error?.code)) {
      failRefresh();
    }

    finishTransientFailure();
    throw new Error('Failed to refresh account.');
  }, [failRefresh, finishTransientFailure, isTerminalAuthError, setAuthenticatedState]);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      const refreshTok = localStorage.getItem('refreshToken');
      if (refreshTok) {
        const refreshResult = await refreshTokenApi(refreshTok);
        if (refreshResult.data) {
          localStorage.setItem('accessToken', refreshResult.data.accessToken);
          localStorage.setItem('refreshToken', refreshResult.data.refreshToken);
          await loadPlayerAfterRefresh();
          return;
        }

        if (isTerminalAuthError(refreshResult.error?.code)) {
          failRefresh();
        }

        finishTransientFailure();
        throw new Error('Failed to refresh account.');
      }

      failRefresh();
    }

    const snapshotPlayer = takeAuthPlayerSnapshot();
    if (snapshotPlayer) {
      setAuthenticatedState(snapshotPlayer);
      return;
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
        await loadPlayerAfterRefresh();
        return;
      }

      if (isTerminalAuthError(refreshResult.error?.code)) {
        failRefresh();
      }
    }

    if (isTerminalAuthError(error?.code)) {
      failRefresh();
    }

    finishTransientFailure();
    throw new Error('Failed to refresh account.');
  }, [failRefresh, finishTransientFailure, isTerminalAuthError, loadPlayerAfterRefresh, setAuthenticatedState]);

  useEffect(() => {
    void checkAuth().catch(() => undefined);
  }, [checkAuth]);

  const setTokens = useCallback((accessToken: string, refreshToken: string, player: Player) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    storeAuthPlayerSnapshot(player);
    setState({ player, isLoading: false, isAuthenticated: true });
  }, []);

  const storeTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    clearAuthPlayerSnapshot();
    setState({ player: null, isLoading: false, isAuthenticated: false });
  }, []);

  return {
    ...state,
    setTokens,
    storeTokens,
    logout,
    checkAuth,
    refreshPlayer,
  };
}
