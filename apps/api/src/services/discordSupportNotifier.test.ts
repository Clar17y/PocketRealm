import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger';
import { notifySupportTicketCreated } from './discordSupportNotifier';

vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

interface DiscordWebhookPayload {
  embeds: Array<{
    title: string;
    fields: Array<{ name: string; value: string; inline: boolean }>;
  }>;
}

function successfulDiscordResponse(): Response {
  return {
    ok: true,
    status: 204,
    text: async () => '',
  } as Response;
}

function failedDiscordResponse(): Response {
  return {
    ok: false,
    status: 500,
    text: async () => 'discord unavailable',
  } as Response;
}

function webhookBody(): DiscordWebhookPayload {
  const [, init] = vi.mocked(fetch).mock.calls[0];
  return JSON.parse(String(init?.body)) as DiscordWebhookPayload;
}

describe('discordSupportNotifier', () => {
  const originalWebhook = process.env.DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(successfulDiscordResponse()));
    vi.mocked(logger.warn).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWebhook === undefined) delete process.env.DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL;
    else process.env.DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL = originalWebhook;
  });

  it('does nothing when webhook is not configured', async () => {
    delete process.env.DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL;

    await notifySupportTicketCreated({
      publicId: 'SUP-1',
      title: 'Bug',
      privacy: 'private',
      category: 'bug',
      area: 'combat',
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      screen: null,
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts a safe triage embed when configured', async () => {
    process.env.DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/token';

    await notifySupportTicketCreated({
      publicId: 'SUP-1',
      title: 'Bug player@example.com',
      privacy: 'private',
      category: 'bug',
      area: 'combat',
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      screen: 'combat',
    });

    expect(fetch).toHaveBeenCalledOnce();
    const body = webhookBody();
    expect(body.embeds[0]?.title).toBe('SUP-1: Bug [redacted-email]');
    expect(body.embeds[0]?.fields).toEqual(expect.arrayContaining([
      { name: 'Privacy', value: 'private', inline: true },
      { name: 'Area', value: 'combat', inline: true },
    ]));
  });

  it('logs Discord failures without throwing', async () => {
    process.env.DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/token';
    vi.mocked(fetch).mockResolvedValueOnce(failedDiscordResponse());

    await expect(notifySupportTicketCreated({
      publicId: 'SUP-1',
      title: 'Bug',
      privacy: 'private',
      category: 'bug',
      area: 'combat',
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      screen: null,
    })).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      { status: 500, body: 'discord unavailable' },
      'Discord support triage webhook failed',
    );
  });
});
