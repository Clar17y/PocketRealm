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
import { botHeadline, botStatus } from '../discord/messageFormat.js';

// Discord allows at most five buttons per action row.
const MAX_BUTTONS_PER_ROW = 5;

type NotifyApiClient = Pick<PocketRealmApiClient, 'get' | 'post'>;
type NotifyCommandConfig = Pick<BotConfig, 'emojiMap'>;

interface PreferencesResponse {
  preferences: DiscordNotificationPreferenceView[];
}

function notifyIntro(emojiMap: DiscordEmojiMap): string {
  return [
    botHeadline('notify', 'Discord notifications', emojiMap),
    'Choose which PocketRealm events DM you. Everything is off until you turn it on.',
  ].join('\n');
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
      ephemeral: true,
      content: '/notify only works in the PocketRealm Discord server.',
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
      await interaction.editReply({
        content: 'Link your PocketRealm account first with /link, then run /notify again.',
      });
      return;
    }

    await interaction.editReply({
      content: 'Unable to load your notification settings right now. Please try again later.',
    });
    return;
  }

  await interaction.editReply({
    content: notifyIntro(config.emojiMap),
    components: buildPreferenceComponents(response.preferences),
  });
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
    const content = isLinkRequiredError(error)
      ? 'Link your PocketRealm account first with /link, then run /notify again.'
      : botStatus(
        'error',
        'Update failed',
        'Unable to update that notification setting right now. Please try again later.',
        config.emojiMap,
      );
    await interaction.followUp({ ephemeral: true, content });
    return;
  }

  let enabled = parsed.nextEnabled;

  if (parsed.nextEnabled) {
    try {
      await interaction.user.send({
        content: botStatus(
          'success',
          'Notification enabled',
          `I'll DM you when **${DISCORD_NOTIFICATION_TYPE_LABELS[parsed.type]}** fires.`,
          config.emojiMap,
        ),
      });
    } catch {
      // DMs from this server are blocked; revert so the user is not opted
      // into notifications that can never arrive.
      try {
        await upsert(false);
        enabled = false;
        await interaction.followUp({
          ephemeral: true,
          content: botStatus(
            'warning',
            'DM blocked',
            'I could not DM you, so that notification stays off. Enable "Allow direct messages from server members" for this server, then try again.',
            config.emojiMap,
          ),
        });
      } catch {
        // Revert failed too — the preference is still enabled but undeliverable.
        // Surface the inconsistency rather than claiming it's off.
        await interaction.followUp({
          ephemeral: true,
          content: 'I could not DM you and could not update that setting. Please run /notify again to turn it off.',
        });
      }
    }
  }

  try {
    const { preferences } = await api.get<PreferencesResponse>(
      `/api/v1/discord/notifications/preferences?guildId=${interaction.guildId}&discordUserId=${interaction.user.id}`,
    );
    await interaction.editReply({
      content: notifyIntro(config.emojiMap),
      components: buildPreferenceComponents(preferences),
    });
  } catch {
    // Could not reload the full menu — the toggle still applied. Leave the
    // existing buttons in place and confirm the change out of band.
    await interaction.followUp({
      ephemeral: true,
      content: botStatus(
        'success',
        'Saved',
        `${DISCORD_NOTIFICATION_TYPE_LABELS[parsed.type]} is now ${enabled ? 'ON' : 'OFF'}. Run /notify again to refresh the menu.`,
        config.emojiMap,
      ),
    });
  }
}
