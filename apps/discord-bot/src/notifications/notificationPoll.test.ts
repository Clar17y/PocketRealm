import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DiscordNotificationEventView,
  DiscordNotificationPayload,
} from '@pocketrealm/shared/discord/discordNotifications';

import { formatNotificationMessage, pollDiscordNotifications } from './notificationPoll.js';

const EVENT = {
  id: 'event-1',
  discordGuildId: '23456789012345678',
  discordUserId: '34567890123456789',
  type: 'turns_capped' as const,
  payload: { currentTurns: 64800, bankCap: 64800, username: 'Mira' },
  createdAt: '2026-06-12T12:00:00.000Z',
};

const WEB_BASE_URL = 'https://play.pocketrealm.test';

// Typed builder so overriding `type`/`payload` stays assignable to the view.
function evt(type: DiscordNotificationEventView['type'], payload: DiscordNotificationPayload): DiscordNotificationEventView {
  return { ...EVENT, type, payload };
}

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
    webBaseUrl: WEB_BASE_URL,
    emojiMap: {},
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
    expect(send).toHaveBeenCalledWith({
      content: formatNotificationMessage(EVENT, WEB_BASE_URL, options.emojiMap),
    });
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
    const content = formatNotificationMessage(EVENT, WEB_BASE_URL);
    expect(content).toContain('64,800');
    expect(content.toLowerCase()).toContain('turns are full');
  });

  it('uses configured custom emoji overrides', () => {
    const content = formatNotificationMessage(
      evt('pvp_attack', { attackerName: 'Rook' }),
      WEB_BASE_URL,
      { duel: '<:pr_duel:123456789012345678>' },
    );

    expect(content.startsWith('<:pr_duel:123456789012345678>')).toBe(true);
  });

  it('formats a pvp_attack DM with a bold name and arena deep link', () => {
    const content = formatNotificationMessage(evt('pvp_attack', { attackerName: 'Rook' }), WEB_BASE_URL);
    expect(content).toContain('**Rook**');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=arena`);
  });

  it('formats a boss_appeared DM with the boss, zone, and worldEvents deep link', () => {
    const content = formatNotificationMessage(evt('boss_appeared', { bossName: 'Ymir', zoneName: 'Tundra' }), WEB_BASE_URL);
    expect(content).toContain('**Ymir**');
    expect(content).toContain('**Tundra**');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=worldEvents`);
  });

  it('formats a victorious expedition_finished DM with the guild expeditions deep link', () => {
    const content = formatNotificationMessage(evt('expedition_finished', { tier: 3, outcome: 'victory' }), WEB_BASE_URL);
    expect(content).toContain('Tier 3');
    expect(content.toLowerCase()).toContain('victorious');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=guild&tab=expeditions`);
  });

  it('formats a failed expedition_finished DM with the attempt count', () => {
    const content = formatNotificationMessage(evt('expedition_finished', { tier: 2, outcome: 'failed', attempts: 4 }), WEB_BASE_URL);
    expect(content).toContain('Tier 2');
    expect(content).toContain('4 attempts');
  });

  it('formats a pvp_scout DM with a bold name and arena deep link', () => {
    const content = formatNotificationMessage(evt('pvp_scout', { scouterName: 'Mira' }), WEB_BASE_URL);
    expect(content).toContain('**Mira**');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=arena`);
  });

  it('formats a boss_defeated DM with a bold boss name and worldEvents deep link', () => {
    const content = formatNotificationMessage(evt('boss_defeated', { bossName: 'Ymir' }), WEB_BASE_URL);
    expect(content).toContain('**Ymir**');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=worldEvents`);
  });

  it('formats an expedition_recruiting DM with the tier and guild expeditions deep link', () => {
    const content = formatNotificationMessage(evt('expedition_recruiting', { tier: 5 }), WEB_BASE_URL);
    expect(content).toContain('Tier 5');
    expect(content).toContain(`${WEB_BASE_URL}/game?screen=guild&tab=expeditions`);
  });

  it('falls back to a generic message for an unknown type', () => {
    const content = formatNotificationMessage(
      evt('mystery_type' as DiscordNotificationEventView['type'], {} as DiscordNotificationPayload),
      WEB_BASE_URL,
    );
    expect(content).toContain('Pocketrealm notification');
    expect(content).toContain(`${WEB_BASE_URL}/game`);
  });
});
