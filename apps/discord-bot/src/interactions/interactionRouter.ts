import type { Interaction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { handleLinkCommand } from './linkCommand.js';

export interface InteractionRouterOptions {
  api: Pick<PocketRealmApiClient, 'post'>;
}

export async function routeInteraction(
  interaction: Interaction,
  options: InteractionRouterOptions,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'link') {
    await handleLinkCommand(interaction, options.api);
  }
}
