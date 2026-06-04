import { describe, expect, it, vi } from 'vitest';

import { PocketRealmApiClient } from './pocketRealmApi.js';

function createClient(fetchImpl: typeof fetch): PocketRealmApiClient {
  return new PocketRealmApiClient({
    baseUrl: 'https://api.pocketrealm.test',
    internalApiKey: 'internal-key',
    fetchImpl,
  });
}

describe('PocketRealmApiClient', () => {
  it('rejects absolute URLs before sending a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createClient(fetchImpl);

    await expect(client.get('https://evil.test/leak')).rejects.toThrow();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects protocol-relative paths before sending a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createClient(fetchImpl);

    await expect(client.get('//evil.test/leak')).rejects.toThrow();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends the internal bot key for normal API paths', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true })));
    const client = createClient(fetchImpl);

    await expect(client.get('/support/tickets')).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(new URL('https://api.pocketrealm.test/support/tickets'), {
      method: 'GET',
      headers: {
        'x-pocketrealm-bot-key': 'internal-key',
      },
    });
  });
});
