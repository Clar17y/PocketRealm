import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchApi } from './core';

function base64Url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function accessTokenExpiringAt(expSeconds: number): string {
  return `${base64Url({ alg: 'none' })}.${base64Url({ exp: expSeconds })}.signature`;
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchApi auth options', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('omits auth headers and token refresh for public requests', async () => {
    localStorage.setItem('accessToken', accessTokenExpiringAt(Math.floor(Date.now() / 1000) + 30));
    localStorage.setItem('refreshToken', 'refresh-token');

    const result = await fetchApi<{ ok: boolean }>('/api/v1/leaderboard/public-summary', { auth: 'omit' });

    expect(result.data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    expect(init?.credentials).toBe('omit');
    expect(headers?.Authorization).toBeUndefined();
  });
});
