import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {
  DISCORD_NOTIFICATION_TYPE_LABELS,
  type DiscordNotificationPreferenceView,
} from '@pocketrealm/shared/discord/discordNotifications';

import { PocketRealmApiError, type PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { notifyToggleButtonId, parseNotifyButtonId } from '../discord/components.js';
import type { DiscordEmojiMap } from '../discord/emojis.js';
import { statusCard, textCard } from '../discord/v2Card.js';

// Discord allows at most five buttons per action row.
const MAX_BUTTONS_PER_ROW = 5;

type NotifyApiClient = Pick<PocketRealmApiClient, 'get' | 'post'>;
type NotifyCommandConfig = Pick<BotConfig, 'emojiMap'>;

interface PreferencesResponse {
  preferences: DiscordNotificationPreferenceView[];
}

export function buildPreferenceComponents(
  preferences: DiscordNotificationPreferenceView[],
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = preferences.map((preference) =>
    new ButtonBuilder()
      .setCustomId(notifyToggleButtonId(preference.type, !preference.enabled))
      .setLabel(`${DISCORD_NOTIFICATION_TYPE_LABELS[preference.type]}: ${preference.enabled ? 'ON' : 'OFF'}`)
      .setStyle(preference.enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + MAX_BUTTONS_PER_ROW)));
  }
  return rows;
}

function isLinkRequiredError(error: unknown): boolean {
  return error instanceof PocketRealmApiError && error.code === 'DISCORD_LINK_REQUIRED';
}

export async function handleNotifyCommand(
  interaction: ChatInputCommandInteraction,
  api: NotifyApiClient,
  config: NotifyCommandConfig,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ...statusCard(
        'warning',
        'Server only',
        '/notify only works in the PocketRealm Discord server.',
        config.emojiMap,
        { ephemeral: true },
      ),
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let response: PreferencesResponse;
  try {
    response = await api.get<PreferencesResponse>(
      `/api/v1/discord/notifications/preferences?guildId=${interaction.guildId}&discordUserId=${interaction.user.id}`,
    );
  } catch (error) {
    if (isLinkRequiredError(error)) {
      await interaction.editReply(notifyLinkRequiredStatus(config.emojiMap));
      return;
    }

    await interaction.editReply(
      statusCard(
        'error',
        'Load failed',
        'Unable to load your notification settings right now. Please try again later.',
        config.emojiMap,
      ),
    );
    return;
  }

  await interaction.editReply(buildPreferenceCard(response.preferences, config.emojiMap));
}

export async function handleNotifyToggleButton(
  interaction: ButtonInteraction,
  api: NotifyApiClient,
  config: NotifyCommandConfig,
): Promise<void> {
  const parsed = parseNotifyButtonId(interaction.customId);
  if (!parsed || !interaction.guildId) {
    return;
  }

  await interaction.deferUpdate();

  const upsert = (enabled: boolean) =>
    api.post<{ preference: DiscordNotificationPreferenceView }>(
      '/api/v1/discord/notifications/preferences',
      {
        discordGuildId: interaction.guildId,
        discordUserId: interaction.user.id,
        type: parsed.type,
        enabled,
      },
    );

  try {
    await upsert(parsed.nextEnabled);
  } catch (error) {
    const payload = isLinkRequiredError(error)
      ? notifyLinkRequiredStatus(config.emojiMap, { ephemeral: true })
      : statusCard(
        'error',
        'Update failed',
        'Unable to update that notification setting right now. Please try again later.',
        config.emojiMap,
        { ephemeral: true },
      );
    await interaction.followUp(payload);
    return;
  }

  let enabled = parsed.nextEnabled;

  if (parsed.nextEnabled) {
    try {
      await interaction.user.send(
        statusCard(
          'success',
          'Notification enabled',
          `I'll DM you when **${DISCORD_NOTIFICATION_TYPE_LABELS[parsed.type]}** fires.`,
          config.emojiMap,
        ),
      );
    } catch {
      // DMs from this server are blocked; revert so the user is not opted
      // into notifications that can never arrive.
      try {
        await upsert(false);
        enabled = false;
        await interaction.followUp(
          statusCard(
            'warning',
            'DM blocked',
            'I could not DM you, so that notification stays off. Enable "Allow direct messages from server members" for this server, then try again.',
            config.emojiMap,
            { ephemeral: true },
          ),
        );
      } catch {
        // Revert failed too — the preference is still enabled but undeliverable.
        // Surface the inconsistency rather than claiming it's off.
        await interaction.followUp(
          statusCard(
            'error',
            'Update failed',
            'I could not DM you and could not update that setting. Please run /notify again to turn it off.',
            config.emojiMap,
            { ephemeral: true },
          ),
        );
      }
    }
  }

  try {
    const { preferences } = await api.get<PreferencesResponse>(
      `/api/v1/discord/notifications/preferences?guildId=${interaction.guildId}&discordUserId=${interaction.user.id}`,
    );
    await interaction.editReply(buildPreferenceCard(preferences, config.emojiMap));
  } catch {
    // Could not reload the full menu — the toggle still applied. Leave the
    // existing buttons in place and confirm the change out of band.
    await interaction.followUp(
      statusCard(
        'success',
        'Saved',
        `${DISCORD_NOTIFICATION_TYPE_LABELS[parsed.type]} is now ${enabled ? 'ON' : 'OFF'}. Run /notify again to refresh the menu.`,
        config.emojiMap,
        { ephemeral: true },
      ),
    );
  }
}

function notifyLinkRequiredStatus(emojiMap: DiscordEmojiMap, options: { ephemeral?: boolean } = {}) {
  return statusCard(
    'warning',
    'Link required',
    'Link your PocketRealm account first with /link, then run /notify again.',
    emojiMap,
    options,
  );
}

export function buildPreferenceCard(
  preferences: DiscordNotificationPreferenceView[],
  emojiMap: DiscordEmojiMap,
) {
  return textCard({
    emojiKey: 'notify',
    title: 'Discord notifications',
    emojiMap,
    lines: ['Choose which PocketRealm events DM you. Everything is off until you turn it on.'],
    actionRows: buildPreferenceComponents(preferences),
  });
}
