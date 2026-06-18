import type { ChatInputCommandInteraction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { botHeadline, botStatus } from '../discord/messageFormat.js';
import { formatDiscordTimestamp } from '../utils.js';

interface LinkCodeResponse {
  code: string;
  expiresAt: string;
}

type LinkApiClient = Pick<PocketRealmApiClient, 'post'>;
type LinkCommandConfig = Pick<BotConfig, 'emojiMap'>;

export async function handleLinkCommand(
  interaction: ChatInputCommandInteraction,
  api: LinkApiClient,
  config: LinkCommandConfig,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: botStatus(
        'warning',
        'Server only',
        '/link only works in the PocketRealm Discord server.',
        config.emojiMap,
      ),
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let response: LinkCodeResponse;
  try {
    response = await api.post<LinkCodeResponse>('/api/v1/discord/link-codes', {
      discordUserId: interaction.user.id,
      discordGuildId: interaction.guildId,
    });
  } catch {
    await interaction.editReply({
      content: botStatus(
        'error',
        'Link failed',
        'Unable to create a PocketRealm link code right now. Please try again later.',
        config.emojiMap,
      ),
    });
    return;
  }

  await interaction.editReply({
    content: [
      botHeadline('link', 'Link PocketRealm', config.emojiMap),
      `Enter this code in PocketRealm Settings: \`${response.code}\``,
      `Expires ${formatDiscordTimestamp(response.expiresAt, 'F', 'the listed expiry time')}.`,
    ].join('\n'),
  });
}
