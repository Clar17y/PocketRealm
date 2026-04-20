import { fetchApi } from './core';

export interface CharacterSummary {
  id: string;
  username: string;
  characterLevel: number;
  seasonId: string | null;
  seasonName: string | null;
  seasonStatus: string | null;
  seasonEndsAt: string | Date | null;
}

export interface SeasonArchiveSummary {
  id: string;
  username: string;
  characterLevel: number;
  characterXp: number;
  attributes: Record<string, unknown>;
  skills: unknown[];
  stats: Record<string, unknown>;
  combatTemplates: unknown[];
  leaderboardRanks: Record<string, unknown>;
  rewardsEarned: Record<string, unknown>;
  mergeLog: Record<string, unknown>;
  createdAt: string | Date;
  season: {
    id: string;
    name: string;
    startsAt: string | Date;
    endsAt: string | Date;
  };
}

export async function register(username: string, email: string, password: string) {
  return fetchApi<{
    player: {
      id: string;
      username: string;
      email: string;
      role: string;
      emailVerified: boolean;
      isPremium: boolean;
      premiumExpiresAt: string | null;
    };
    accessToken: string;
    refreshToken: string;
  }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export async function login(email: string, password: string) {
  return fetchApi<{
    player: {
      id: string;
      username: string;
      email: string;
      role: string;
      emailVerified: boolean;
      isPremium: boolean;
      premiumExpiresAt: string | null;
    };
    accessToken: string;
    refreshToken: string;
  }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshToken(token: string) {
  return fetchApi<{ accessToken: string; refreshToken: string }>('/api/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });
}

export async function verifyEmail(token: string) {
  return fetchApi<{ message: string; championTrialGranted: boolean }>('/api/v1/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function resendVerification() {
  return fetchApi<{ message: string }>('/api/v1/auth/resend-verification', {
    method: 'POST',
  });
}

export async function forgotPassword(email: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function changeEmail(email: string, password: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/change-email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function getCharacters() {
  return fetchApi<{ characters: CharacterSummary[]; activePlayerId: string }>('/api/v1/auth/characters');
}

export async function switchPlayer(playerId: string) {
  return fetchApi<{
    player: { id: string; username: string };
    accessToken: string;
    refreshToken: string;
  }>('/api/v1/auth/switch-player', {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export async function joinSeason(username: string) {
  return fetchApi<{
    player: { id: string; username: string };
    seasonId: string;
    accessToken: string;
    refreshToken: string;
  }>('/api/v1/auth/join-season', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function getSeasonArchives() {
  return fetchApi<{ archives: SeasonArchiveSummary[] }>('/api/v1/auth/season-archives');
}
