import { resolveUrl } from '../resolveUrl';

const API_URL = resolveUrl();

export interface ApiResponse<T> {
  data?: T;
  error?: { message: string; code: string };
}

export type ApiRequestOptions = RequestInit & {
  auth?: 'include' | 'omit';
};

export interface TurnStateResponse {
  currentTurns: number;
  timeToCapMs: number | null;
  lastRegenAt: string;
}

export interface TaxInfo {
  rate: number;
  amount: number;
  guildId: string;
}

type RefreshOutcome =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'network' | 'bad_response' };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

export function clearStoredTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function getJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { exp?: number };

    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

async function refreshTokens(): Promise<RefreshOutcome> {
  if (typeof window === 'undefined') return { ok: false, reason: 'missing' };

  const currentRefreshToken = localStorage.getItem('refreshToken');
  if (!currentRefreshToken) return { ok: false, reason: 'missing' };

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: currentRefreshToken }),
        });

        const json = (await res.json().catch(() => null)) as
          | { accessToken?: string; refreshToken?: string; error?: { message: string; code: string } }
          | null;

        if (!res.ok) {
          const code = json?.error?.code;
          const isInvalid = code === 'INVALID_TOKEN' || code === 'MISSING_TOKEN';
          return { ok: false, reason: isInvalid ? 'invalid' : 'network' } as const;
        }
        if (!json?.accessToken || !json.refreshToken) return { ok: false, reason: 'bad_response' };

        localStorage.setItem('accessToken', json.accessToken);
        localStorage.setItem('refreshToken', json.refreshToken);
        return { ok: true, accessToken: json.accessToken, refreshToken: json.refreshToken } as const;
      } catch {
        return { ok: false, reason: 'network' } as const;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

export async function fetchApi<T>(
  endpoint: string,
  options: ApiRequestOptions = {},
  attempt = 0
): Promise<ApiResponse<T>> {
  const { auth = 'include', ...requestOptions } = options;
  const includeAuth = auth === 'include';
  // Only skip token refresh for unauthenticated auth endpoints (login, register, refresh, etc.)
  // Authenticated auth endpoints (resend-verification, change-email, change-password) need refresh.
  const AUTH_NO_REFRESH = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password', '/api/v1/auth/verify-email'];
  const isAuthEndpoint = AUTH_NO_REFRESH.some(p => endpoint === p);

  const token = includeAuth && typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  if (includeAuth && !isAuthEndpoint && token) {
    const expMs = getJwtExpMs(token);
    const shouldRefreshSoon = typeof expMs === 'number' && expMs - Date.now() < 60_000;
    if (shouldRefreshSoon) {
      await refreshTokens();
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((requestOptions.headers as Record<string, string>) || {}),
  };

  const latestToken = includeAuth && typeof window !== 'undefined' ? localStorage.getItem('accessToken') : token;
  if (latestToken) {
    headers['Authorization'] = `Bearer ${latestToken}`;
  }

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...requestOptions,
      headers,
      credentials: includeAuth ? requestOptions.credentials ?? 'include' : 'omit',
    });

    let jsonParsed = false;
    const json = await res.json().then((v: unknown) => { jsonParsed = true; return v; }).catch(() => null) as
      | (T & { error?: { message: string; code: string } })
      | { error?: { message: string; code: string } }
      | null;

    if (res.status === 429) {
      window.dispatchEvent(new CustomEvent('api:rate-limited'));
      return { error: { message: 'Too many requests', code: 'RATE_LIMITED' } };
    }

    if (!res.ok) {
      if (includeAuth && !isAuthEndpoint && res.status === 401 && attempt === 0) {
        const refreshed = await refreshTokens();
        if (refreshed?.ok) {
          return fetchApi<T>(endpoint, options, attempt + 1);
        }
        if (refreshed?.reason === 'invalid') clearStoredTokens();
      }

      const error = (json && 'error' in json ? json.error : undefined) || {
        message: 'Unknown error',
        code: 'UNKNOWN',
      };
      return { error };
    }

    if (!jsonParsed) return { error: { message: 'Invalid server response', code: 'INVALID_RESPONSE' } };
    return { data: json as T };
  } catch (err) {
    return { error: { message: 'Network error', code: 'NETWORK_ERROR' } };
  }
}
