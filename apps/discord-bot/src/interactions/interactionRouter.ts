import type { Interaction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleLinkCommand } from './linkCommand.js';

export interface InteractionRouterOptions {
  api: Pick<PocketRealmApiClient, 'post'>;
}

const UNIMPLEMENTED_REGISTERED_CHAT_COMMANDS = new Set([
  'wiki',
  'profile',
  'turns',
  'skills',
  'rank',
  'duel',
  'report',
  'staff',
]);

export async function routeInteraction(
  interaction: Interaction,
  options: InteractionRouterOptions,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'link') {
    await handleLinkCommand(interaction, options.api);
    return;
  }

  if (UNIMPLEMENTED_REGISTERED_CHAT_COMMANDS.has(interaction.commandName)) {
    await interaction.reply({
      ephemeral: true,
      content: `The /${interaction.commandName} command is not available yet.`,
    });
  }
}
