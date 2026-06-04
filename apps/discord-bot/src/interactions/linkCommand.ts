import type { ChatInputCommandInteraction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';

interface LinkCodeResponse {
  code: string;
  expiresAt: string;
}

type LinkApiClient = Pick<PocketRealmApiClient, 'post'>;

export async function handleLinkCommand(
  interaction: ChatInputCommandInteraction,
  api: LinkApiClient,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      ephemeral: true,
      content: '/link only works in the PocketRealm Discord server.',
    });
    return;
  }

  let response: LinkCodeResponse;
  try {
    response = await api.post<LinkCodeResponse>('/api/v1/discord/link-codes', {
      discordUserId: interaction.user.id,
      discordGuildId: interaction.guildId,
    });
  } catch {
    await interaction.reply({
      ephemeral: true,
      content: 'Unable to create a PocketRealm link code right now. Please try again later.',
    });
    return;
  }

  await interaction.reply({
    ephemeral: true,
    content: `Enter this code in PocketRealm Settings: ${response.code}\nIt expires at ${formatDiscordTimestamp(response.expiresAt)}.`,
  });
}

export function formatDiscordTimestamp(value: string): string {
  return `<t:${Math.floor(new Date(value).getTime() / 1000)}:F>`;
}
