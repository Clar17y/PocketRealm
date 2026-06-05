import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pollSupportTriageTickets } from './triagePoll.js';
import type { SupportTriageTicketDto } from './triageCards.js';

const ticket: SupportTriageTicketDto = {
  publicId: 'SUP-ABC12345',
  status: 'new',
  privacy: 'private',
  category: 'bug',
  area: 'inventory',
  sensitivityFlags: [],
  title: 'Inventory does not stack',
  summary: 'Private report body withheld. Review in staff support tools.',
  realmLabel: 'Preseason',
  createdAt: '2026-06-04T12:00:00.000Z',
};

function createPollDeps() {
  const send = vi.fn().mockResolvedValue({ id: '345678901234567890' });
  const get = vi.fn().mockResolvedValue({ tickets: [ticket] });
  const post = vi.fn().mockRejectedValue(new Error('API unavailable'));
  const channel = {
    isSendable: () => true,
    send,
  };
  const api = {
    async get<T>(path: string): Promise<T> {
      return get(path) as Promise<T>;
    },
    async post<T>(path: string, body: unknown): Promise<T> {
      return post(path, body) as Promise<T>;
    },
  };
  const redis = {
    set: vi.fn()
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(null),
    del: vi.fn(),
  };
  const logger = {
    warn: vi.fn(),
    debug: vi.fn(),
  };

  return {
    api,
    channel,
    config: {
      guildId: '123456789012345678',
      supportTriageChannelId: '234567890123456789',
    },
    logger,
    readyClient: {
      channels: {
        fetch: vi.fn().mockResolvedValue(channel),
      },
    },
    redis,
    post,
    send,
  };
}

describe('pollSupportTriageTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not repost the same ticket while a failed post-mark suppression is active', async () => {
    const deps = createPollDeps();

    await pollSupportTriageTickets(deps);
    await pollSupportTriageTickets(deps);

    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.post).toHaveBeenCalledTimes(1);
    expect(deps.redis.set).toHaveBeenCalledWith(
      'discord:support-triage:posting:SUP-ABC12345',
      '1',
      'EX',
      3600,
      'NX',
    );
    expect(deps.redis.del).not.toHaveBeenCalled();
  });
});
