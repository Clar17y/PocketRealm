import { describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  fetchApi: vi.fn(),
}));

import { fetchApi } from './core';
import { createSupportTicket } from './support';
import type { CreateSupportTicketRequest } from './support';

describe('support API client', () => {
  it('creates a support ticket through the support ticket endpoint', async () => {
    const input = {
      privacy: 'not_sure',
      category: 'bug',
      area: 'crafting',
      title: 'Forge result did not update',
      description: 'The forge result showed, but inventory stayed stale.',
      reproductionSteps: 'Open forge, upgrade an item, close result.',
      screen: 'forge',
      appVersion: '0.1.0',
      browser: 'Chrome',
      device: 'Desktop',
      requestId: 'req-1',
      sentryEventId: 'event-1',
    } satisfies CreateSupportTicketRequest;

    vi.mocked(fetchApi).mockResolvedValue({
      data: { ticket: { publicId: 'SUP-1', status: 'new' } },
    });

    await createSupportTicket(input);

    expect(fetchApi).toHaveBeenCalledWith('/api/v1/support/tickets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  });
});
