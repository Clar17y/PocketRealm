import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from './core';
import { getVexExchanges, purchaseVexExchange } from './vex';

describe('vex API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches available Vex exchanges', async () => {
    vi.mocked(fetchApi).mockResolvedValue({ data: { exchanges: [] } });

    await getVexExchanges();

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/vex/exchanges');
  });

  it('purchases a Vex exchange with optional target item', async () => {
    const params = { targetItemId: 'item-1' };
    const exchangeKey = 'weapon/vex?rare';
    vi.mocked(fetchApi).mockResolvedValue({ data: { success: true } });

    await purchaseVexExchange(exchangeKey, params);

    expect(fetchApi).toHaveBeenCalledWith(
      `/api/v1/vex/exchanges/${encodeURIComponent(exchangeKey)}/purchase`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      },
    );
  });
});
