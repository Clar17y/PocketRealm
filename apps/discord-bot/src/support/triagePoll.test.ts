import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import { pollSupportTriageTickets } from './triagePoll.js';
import type { SupportTriageTicketDto } from './triageCards.js';

const SUPPRESSION_KEY = 'discord:support-triage:posting:SUP-ABC12345';
const MESSAGE_ID = '345678901234567890';

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

interface PollDepsOptions {
  sentMessage?: Record<string, unknown>;
  postSucceeds?: boolean;
  channelSendable?: boolean;
  redisSetResults?: Array<'OK' | null>;
}

function createPollDeps(options: PollDepsOptions = {}) {
  const sentMessage = options.sentMessage ?? { id: MESSAGE_ID };
  const send = vi.fn().mockResolvedValue(sentMessage);
  const get = vi.fn().mockResolvedValue({ tickets: [ticket] });
  const post = options.postSucceeds
    ? vi.fn().mockResolvedValue({})
    : vi.fn().mockRejectedValue(new Error('API unavailable'));
  const channel = {
    isSendable: () => options.channelSendable ?? true,
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
  const setMock = vi.fn();
  for (const result of options.redisSetResults ?? ['OK']) {
    setMock.mockResolvedValueOnce(result);
  }
  setMock.mockResolvedValue('OK');
  const redis = {
    set: setMock,
    del: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };

  return {
    api,
    channel,
    config: {
      guildId: '123456789012345678',
      supportTriageChannelId: '234567890123456789',
      emojiMap: {
        support: '<:pr_support:123456789012345678>',
      },
    },
    logger,
    readyClient: {
      channels: {
        fetch: vi.fn().mockResolvedValue(channel),
      },
    },
    redis,
    get,
    post,
    send,
  };
}

describe('pollSupportTriageTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the card, registers it, and releases the suppression key on success', async () => {
    const deps = createPollDeps({ postSucceeds: true });

    await pollSupportTriageTickets(deps);

    expect(deps.send).toHaveBeenCalledTimes(1);
    const payload = deps.send.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toContain(
      '<:pr_support:123456789012345678> **SUP-ABC12345 - Inventory does not stack**',
    );
    expect(deps.post).toHaveBeenCalledWith(
      '/api/v1/discord/support/tickets/SUP-ABC12345/triage-message',
      {
        guildId: '123456789012345678',
        triageChannelId: '234567890123456789',
        triageMessageId: MESSAGE_ID,
      },
    );
    expect(deps.redis.del).toHaveBeenCalledWith(SUPPRESSION_KEY);
  });

  it('does not repost the same ticket while a failed post-mark suppression is active', async () => {
    const deps = createPollDeps({ redisSetResults: ['OK', null] });

    await pollSupportTriageTickets(deps);
    await pollSupportTriageTickets(deps);

    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deps.post).toHaveBeenCalledTimes(1);
    expect(deps.redis.set).toHaveBeenCalledWith(
      SUPPRESSION_KEY,
      '1',
      'EX',
      3600,
      'NX',
    );
    expect(deps.redis.del).not.toHaveBeenCalled();
  });

  it('deletes the posted card and releases suppression when registration fails but rollback succeeds', async () => {
    const deleteMessage = vi.fn().mockResolvedValue(undefined);
    const deps = createPollDeps({
      sentMessage: { id: MESSAGE_ID, delete: deleteMessage },
    });

    await pollSupportTriageTickets(deps);

    expect(deps.send).toHaveBeenCalledTimes(1);
    expect(deleteMessage).toHaveBeenCalledTimes(1);
    expect(deps.redis.del).toHaveBeenCalledWith(SUPPRESSION_KEY);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: 'SUP-ABC12345', messageId: MESSAGE_ID }),
      expect.stringContaining('deleted the posted card'),
    );
    expect(deps.logger.error).not.toHaveBeenCalled();
  });

  it('keeps the suppression key and flags manual repair when registration and rollback delete both fail', async () => {
    const deleteMessage = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
    const deps = createPollDeps({
      sentMessage: { id: MESSAGE_ID, delete: deleteMessage },
    });

    await pollSupportTriageTickets(deps);

    expect(deleteMessage).toHaveBeenCalledTimes(1);
    expect(deps.redis.del).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: 'SUP-ABC12345', messageId: MESSAGE_ID }),
      expect.stringContaining('requires manual repair'),
    );
  });

  it('releases the suppression key when the channel send itself fails', async () => {
    const deps = createPollDeps();
    deps.send.mockRejectedValue(new Error('Missing Access'));

    await pollSupportTriageTickets(deps);

    expect(deps.post).not.toHaveBeenCalled();
    expect(deps.redis.del).toHaveBeenCalledWith(SUPPRESSION_KEY);
  });

  it('rejects channels whose isSendable() returns false', async () => {
    const deps = createPollDeps({ channelSendable: false });

    await pollSupportTriageTickets(deps);

    expect(deps.get).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: '234567890123456789' }),
      'Discord support triage channel is not sendable',
    );
  });
});
