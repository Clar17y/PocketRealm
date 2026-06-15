import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatNotificationMessage, pollDiscordNotifications } from './notificationPoll.js';

const EVENT = {
  id: 'event-1',
  discordGuildId: '23456789012345678',
  discordUserId: '34567890123456789',
  type: 'turns_capped' as const,
  payload: { currentTurns: 64800, bankCap: 64800, username: 'Mira' },
  createdAt: '2026-06-12T12:00:00.000Z',
};

function createOptions(overrides: Record<string, unknown> = {}) {
  const send = vi.fn().mockResolvedValue(undefined);
  const options = {
    api: {
      get: vi.fn().mockResolvedValue({ events: [EVENT] }),
      post: vi.fn().mockResolvedValue({ result: { delivered: 1, failed: 0 } }),
    },
    logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    readyClient: {
      users: {
        fetch: vi.fn().mockResolvedValue({ send }),
      },
    },
    redis: {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    },
    ...overrides,
  };
  return { options, send };
}

describe('pollDiscordNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DMs pending events and acks them as delivered', async () => {
    const { options, send } = createOptions();

    await pollDiscordNotifications(options);

    expect(options.api.get).toHaveBeenCalledWith('/api/v1/discord/notifications/pending?limit=50');
    expect(options.readyClient.users.fetch).toHaveBeenCalledWith(EVENT.discordUserId);
    expect(send).toHaveBeenCalledWith({ content: formatNotificationMessage(EVENT) });
    expect(options.api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/ack', {
      deliveredIds: [EVENT.id],
      failedIds: [],
    });
    // Suppression key is retained on success so the event cannot re-send within the TTL.
    expect(options.redis.del).not.toHaveBeenCalled();
  });

  it('acks failed DMs and releases the suppression key for retry', async () => {
    const { options } = createOptions();
    options.readyClient.users.fetch = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));

    await pollDiscordNotifications(options);

    expect(options.api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/ack', {
      deliveredIds: [],
      failedIds: [EVENT.id],
    });
    expect(options.redis.del).toHaveBeenCalledWith('discord:notifications:delivery:event-1');
  });

  it('skips events whose suppression key is already claimed', async () => {
    const { options, send } = createOptions();
    options.redis.set = vi.fn().mockResolvedValue(null);

    await pollDiscordNotifications(options);

    expect(send).not.toHaveBeenCalled();
    expect(options.api.post).not.toHaveBeenCalled();
  });

  it('skips events without a DM target', async () => {
    const { options, send } = createOptions();
    options.api.get = vi.fn().mockResolvedValue({ events: [{ ...EVENT, discordUserId: null }] });

    await pollDiscordNotifications(options);

    expect(send).not.toHaveBeenCalled();
    expect(options.api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/ack', {
      deliveredIds: [],
      failedIds: [EVENT.id],
    });
  });

  it('does not ack when nothing was processed', async () => {
    const { options } = createOptions();
    options.api.get = vi.fn().mockResolvedValue({ events: [] });

    await pollDiscordNotifications(options);

    expect(options.api.post).not.toHaveBeenCalled();
  });
});

describe('formatNotificationMessage', () => {
  it('formats turns-capped events', () => {
    const content = formatNotificationMessage(EVENT);

    expect(content).toContain('64,800');
    expect(content.toLowerCase()).toContain('turns are full');
  });
});
