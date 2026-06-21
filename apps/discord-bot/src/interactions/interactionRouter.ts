import type { Interaction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { parseDuelButtonId, parseNotifyButtonId, parseSupportButtonId } from '../discord/components.js';
import { statusCard } from '../discord/v2Card.js';
import { getRankCategoryAutocompleteChoices } from '../rankCategories.js';
import { handleSupportThreadAction } from '../support/threadActions.js';
import {
  handleAnnouncementCommand,
  handleAnnouncementModalSubmit,
  isAnnouncementModalCustomId,
} from './announcementCommand.js';
import { handleDuelButton, handleDuelCommand } from './duelCommand.js';
import { handleLinkCommand } from './linkCommand.js';
import { handleNotifyCommand, handleNotifyToggleButton } from './notifyCommand.js';
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
import { handleItemCommand, handleMobCommand } from './lookupCommand.js';
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
    | 'supportTriageChannelId'
    | 'levelRoleMap'
    | 'duelsChannelId'
    | 'announcementChannelId'
    | 'emojiMap'
  >;
}

export async function routeInteraction(
  interaction: Interaction,
  options: InteractionRouterOptions,
): Promise<void> {
  if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) {
    if (interaction.commandName === 'rank') {
      await interaction.respond(getRankCategoryAutocompleteChoices(interaction.options.getFocused()));
    } else {
      // Discord requires every autocomplete interaction to be answered within 3s.
      await interaction.respond([]);
    }
    return;
  }

  if (typeof interaction.isButton === 'function' && interaction.isButton()) {
    if (parseDuelButtonId(interaction.customId)) {
      await handleDuelButton(interaction, options.api, options.config);
      return;
    }

    if (parseNotifyButtonId(interaction.customId)) {
      await handleNotifyToggleButton(interaction, options.api, options.config);
      return;
    }

    if (parseSupportButtonId(interaction.customId)) {
      await handleSupportThreadAction(interaction, options);
      return;
    }
    await replyUnhandledInteraction(interaction);
    return;
  }

  if (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit()) {
    if (isReportModalCustomId(interaction.customId)) {
      await handleReportModalSubmit(interaction, options.api, options.config);
      return;
    }

    if (isAnnouncementModalCustomId(interaction.customId)) {
      await handleAnnouncementModalSubmit(interaction, { config: options.config });
      return;
    }

    await replyUnhandledInteraction(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'link') {
    await handleLinkCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'wiki') {
    await handleWikiCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'item') {
    await handleItemCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'mob') {
    await handleMobCommand(interaction, options.api, options.config);
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
    await handleReportCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'announcement') {
    await handleAnnouncementCommand(interaction, { config: options.config });
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

  if (interaction.commandName === 'notify') {
    await handleNotifyCommand(interaction, options.api, options.config);
    return;
  }

  await replyUnhandledInteraction(interaction);
}

async function replyUnhandledInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable() || interaction.replied) {
    return;
  }

  const payload = statusCard(
    'info',
    'Unsupported interaction',
    'This interaction is no longer supported. Try the command again.',
  );
  if (interaction.deferred) {
    await interaction.editReply(payload);
    return;
  }

  await interaction.reply({ ...payload, ephemeral: true });
}
