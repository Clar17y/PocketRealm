import type { Interaction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { parseDuelButtonId, parseSupportButtonId } from '../discord/components.js';
import { handleSupportThreadAction } from '../support/threadActions.js';
import { handleDuelButton, handleDuelCommand } from './duelCommand.js';
import { handleLinkCommand } from './linkCommand.js';
import {
  handleProfileCommand,
  handleRankCommand,
  handleSkillsCommand,
  handleTurnsCommand,
} from './playerCommands.js';
import {
  handleReportCommand,
  handleReportModalSubmit,
  isReportModalCustomId,
} from './reportCommand.js';
import { handleStaffCommand } from './staffCommands.js';
import { handleWikiCommand } from './wikiCommand.js';

export interface InteractionRouterOptions {
  api: Pick<PocketRealmApiClient, 'get' | 'post'>;
  config: Pick<
    BotConfig,
    'guildId'
    | 'webBaseUrl'
    | 'playerRoleId'
    | 'verifiedRoleId'
    | 'supportStaffRoleIds'
    | 'levelRoleMap'
    | 'duelsChannelId'
  >;
}

export async function routeInteraction(
  interaction: Interaction,
  options: InteractionRouterOptions,
): Promise<void> {
  if (typeof interaction.isButton === 'function' && interaction.isButton()) {
    if (parseDuelButtonId(interaction.customId)) {
      await handleDuelButton(interaction, options.api);
      return;
    }

    if (parseSupportButtonId(interaction.customId)) {
      await handleSupportThreadAction(interaction, options);
      return;
    }
    await replyUnhandledInteraction(interaction);
    return;
  }

  if (
    typeof interaction.isModalSubmit === 'function'
    && interaction.isModalSubmit()
    && isReportModalCustomId(interaction.customId)
  ) {
    await handleReportModalSubmit(interaction, options.api);
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

  if (interaction.commandName === 'report') {
    await handleReportCommand(interaction);
    return;
  }

  if (interaction.commandName === 'staff') {
    await handleStaffCommand(interaction, options);
    return;
  }

  if (interaction.commandName === 'duel') {
    await handleDuelCommand(interaction, options.api, options.config);
    return;
  }

  await replyUnhandledInteraction(interaction);
}

async function replyUnhandledInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable() || interaction.replied) {
    return;
  }

  const content = 'This interaction is no longer supported. Try the command again.';
  if (interaction.deferred) {
    await interaction.editReply({ content });
    return;
  }

  await interaction.reply({ ephemeral: true, content });
}
