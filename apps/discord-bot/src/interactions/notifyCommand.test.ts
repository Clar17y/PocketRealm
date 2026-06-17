import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DISCORD_NOTIFICATION_TYPES } from '@pocketrealm/shared/discord/discordNotifications';
import { PocketRealmApiError } from '../api/pocketRealmApi.js';
import { notifyToggleButtonId } from '../discord/components.js';
import { buildPreferenceComponents, handleNotifyCommand, handleNotifyToggleButton } from './notifyCommand.js';

const GUILD_ID = '23456789012345678';
const USER_ID = '34567890123456789';

function createApi(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockResolvedValue({ preferences: [{ type: 'turns_capped', enabled: false }] }),
    post: vi.fn().mockResolvedValue({ preference: { type: 'turns_capped', enabled: true } }),
    ...overrides,
  };
}

function createCommandInteraction(overrides: Record<string, unknown> = {}) {
  return {
    guildId: GUILD_ID,
    user: { id: USER_ID, send: vi.fn().mockResolvedValue(undefined) },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createButtonInteraction(customId: string, overrides: Record<string, unknown> = {}) {
  return {
    customId,
    guildId: GUILD_ID,
    user: { id: USER_ID, send: vi.fn().mockResolvedValue(undefined) },
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('handleNotifyCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows toggle buttons for linked users', async () => {
    const api = createApi();
    const interaction = createCommandInteraction();

    await handleNotifyCommand(interaction as never, api as never);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(api.get).toHaveBeenCalledWith(
      `/api/v1/discord/notifications/preferences?guildId=${GUILD_ID}&discordUserId=${USER_ID}`,
    );
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.components).toHaveLength(1);
    expect(JSON.stringify(payload.components)).toContain(notifyToggleButtonId('turns_capped', true));
  });

  it('prompts unlinked users to /link', async () => {
    const api = createApi({
      get: vi.fn().mockRejectedValue(new PocketRealmApiError('not linked', 404, 'DISCORD_LINK_REQUIRED', {})),
    });
    const interaction = createCommandInteraction();

    await handleNotifyCommand(interaction as never, api as never);

    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.content).toContain('/link');
  });

  it('rejects use outside the guild', async () => {
    const interaction = createCommandInteraction({ guildId: null });

    await handleNotifyCommand(interaction as never, createApi() as never);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});

describe('handleNotifyToggleButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enables a preference and sends a confirmation DM', async () => {
    const api = createApi();
    const interaction = createButtonInteraction(notifyToggleButtonId('turns_capped', true));

    await handleNotifyToggleButton(interaction as never, api as never);

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/preferences', {
      discordGuildId: GUILD_ID,
      discordUserId: USER_ID,
      type: 'turns_capped',
      enabled: true,
    });
    expect(interaction.user.send).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('reverts the toggle when the confirmation DM fails', async () => {
    const api = createApi();
    const interaction = createButtonInteraction(notifyToggleButtonId('turns_capped', true));
    interaction.user.send = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));

    await handleNotifyToggleButton(interaction as never, api as never);

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/notifications/preferences', {
      discordGuildId: GUILD_ID,
      discordUserId: USER_ID,
      type: 'turns_capped',
      enabled: false,
    });
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
      ephemeral: true,
      content: expect.stringContaining('DM'),
    }));
  });

  it('surfaces an error when the DM fails and the revert also fails', async () => {
    const api = createApi();
    api.post = vi.fn()
      .mockResolvedValueOnce({ preference: { type: 'turns_capped', enabled: true } })
      .mockRejectedValueOnce(new Error('api down'));
    const interaction = createButtonInteraction(notifyToggleButtonId('turns_capped', true));
    interaction.user.send = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));

    await handleNotifyToggleButton(interaction as never, api as never);

    // both upserts attempted (enable + revert)
    expect(api.post).toHaveBeenCalledTimes(2);
    // user is informed; no unhandled rejection (test completes)
    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });

  it('disables without sending a DM', async () => {
    const api = createApi({
      post: vi.fn().mockResolvedValue({ preference: { type: 'turns_capped', enabled: false } }),
    });
    const interaction = createButtonInteraction(notifyToggleButtonId('turns_capped', false));

    await handleNotifyToggleButton(interaction as never, api as never);

    expect(interaction.user.send).not.toHaveBeenCalled();
  });

  it('re-renders all notification types after a toggle', async () => {
    const allPrefs = DISCORD_NOTIFICATION_TYPES.map((type) => ({ type, enabled: false }));
    const api = createApi({
      get: vi.fn().mockResolvedValue({ preferences: allPrefs }),
    });
    const interaction = createButtonInteraction(notifyToggleButtonId('pvp_attack', true));

    await handleNotifyToggleButton(interaction as never, api as never);

    // After toggling, the menu re-fetches the full list and re-renders every type.
    expect(api.get).toHaveBeenCalledWith(
      `/api/v1/discord/notifications/preferences?guildId=${GUILD_ID}&discordUserId=${USER_ID}`,
    );
    const payload = interaction.editReply.mock.calls.at(-1)![0];
    const totalButtons = payload.components.reduce(
      (sum: number, row: { components: unknown[] }) => sum + row.components.length,
      0,
    );
    expect(totalButtons).toBe(DISCORD_NOTIFICATION_TYPES.length);
  });
});

describe('buildPreferenceComponents', () => {
  it('splits all toggles into rows of at most five buttons', () => {
    const prefs = DISCORD_NOTIFICATION_TYPES.map((type) => ({ type, enabled: false }));
    const rows = buildPreferenceComponents(prefs);

    const total = rows.reduce((sum, row) => sum + row.components.length, 0);
    expect(total).toBe(DISCORD_NOTIFICATION_TYPES.length);
    for (const row of rows) {
      expect(row.components.length).toBeLessThanOrEqual(5);
    }
    expect(rows.length).toBe(Math.ceil(DISCORD_NOTIFICATION_TYPES.length / 5));
  });
});
