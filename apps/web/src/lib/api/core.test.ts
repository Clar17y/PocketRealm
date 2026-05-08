import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkApiReady, fetchApi } from './core';

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

describe('checkApiReady', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when the readiness endpoint succeeds without auth', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));

    await expect(checkApiReady()).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/health\/ready$/);
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('returns false when the readiness endpoint fails', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'error' }), { status: 503 }));

    await expect(checkApiReady()).resolves.toBe(false);
  });

  it('returns false when the readiness request throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(checkApiReady()).resolves.toBe(false);
  });
});
