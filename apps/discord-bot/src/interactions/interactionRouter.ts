import type { Interaction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { parseSupportButtonId } from '../discord/components.js';
import { handleSupportThreadAction } from '../support/threadActions.js';
import { handleLinkCommand } from './linkCommand.js';
import {
  handleProfileCommand,
  handleRankCommand,
  handleSkillsCommand,
  handleTurnsCommand,
} from './playerCommands.js';
import { handleWikiCommand } from './wikiCommand.js';

export interface InteractionRouterOptions {
  api: Pick<PocketRealmApiClient, 'get' | 'post'>;
  config: Pick<BotConfig, 'guildId' | 'webBaseUrl' | 'supportStaffRoleIds'>;
}

const UNIMPLEMENTED_REGISTERED_CHAT_COMMANDS = new Set([
  'duel',
  'report',
  'staff',
]);

export async function routeInteraction(
  interaction: Interaction,
  options: InteractionRouterOptions,
): Promise<void> {
  if (typeof interaction.isButton === 'function' && interaction.isButton()) {
    if (parseSupportButtonId(interaction.customId)) {
      await handleSupportThreadAction(interaction, options);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'link') {
    await handleLinkCommand(interaction, options.api);
    return;
  }

  if (interaction.commandName === 'wiki') {
    await handleWikiCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'profile') {
    await handleProfileCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'turns') {
    await handleTurnsCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'skills') {
    await handleSkillsCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'rank') {
    await handleRankCommand(interaction, options.api, options.config);
    return;
  }

  if (UNIMPLEMENTED_REGISTERED_CHAT_COMMANDS.has(interaction.commandName)) {
    await interaction.reply({
      ephemeral: true,
      content: `The /${interaction.commandName} command is not available yet.`,
    });
  }
}
