import { fetchApi } from './core';

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
