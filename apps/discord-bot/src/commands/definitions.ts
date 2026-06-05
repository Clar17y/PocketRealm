import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

export function buildCommandDefinitions(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [
    new SlashCommandBuilder()
      .setName('link')
      .setDescription('Link your Discord account to your Pocketrealm account.'),
    new SlashCommandBuilder()
      .setName('wiki')
      .setDescription('Search the Pocketrealm wiki.')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Search terms to look up.')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('profile')
      .setDescription('View a Pocketrealm player profile.')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('Discord user to view. Defaults to you.'),
      ),
    new SlashCommandBuilder()
      .setName('turns')
      .setDescription('Check your available Pocketrealm turns.'),
    new SlashCommandBuilder()
      .setName('skills')
      .setDescription('View your Pocketrealm skills.'),
    new SlashCommandBuilder()
      .setName('rank')
      .setDescription('View Pocketrealm rankings.')
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('Ranking category to view.')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('duel')
      .setDescription('Challenge another player to a duel.')
      .addUserOption((option) =>
        option
          .setName('opponent')
          .setDescription('Discord user to challenge.')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('report')
      .setDescription('Report a Pocketrealm support issue.'),
    new SlashCommandBuilder()
      .setName('staff')
      .setDescription('Pocketrealm staff support commands.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('sync-roles')
          .setDescription('Sync Discord roles for linked Pocketrealm players.'),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('repair-ticket')
          .setDescription('Repair a support ticket by public id.')
          .addStringOption((option) =>
            option
              .setName('public_id')
              .setDescription('Public support ticket id.')
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('sync-ticket')
          .setDescription('Sync a support ticket by public id.')
          .addStringOption((option) =>
            option
              .setName('public_id')
              .setDescription('Public support ticket id.')
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('cleanup-triage')
          .setDescription('Preview or remove duplicate support triage cards.')
          .addStringOption((option) =>
            option
              .setName('public_id')
              .setDescription('Optional public support ticket id to clean up.'),
          )
          .addIntegerOption((option) =>
            option
              .setName('scan_limit')
              .setDescription('Recent triage messages to scan.')
              .setMinValue(1)
              .setMaxValue(100),
          )
          .addBooleanOption((option) =>
            option
              .setName('confirm')
              .setDescription('Actually delete duplicate cards. Defaults to preview only.'),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('xp-adjust')
          .setDescription('Adjust a player Discord XP balance.')
          .addUserOption((option) =>
            option
              .setName('user')
              .setDescription('Discord user to adjust.')
              .setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName('amount')
              .setDescription('XP amount to add or remove.')
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('reason')
              .setDescription('Reason for the XP adjustment.')
              .setRequired(true),
          ),
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('known-issue')
          .setDescription('Mark a support ticket as a known issue.')
          .addStringOption((option) =>
            option
              .setName('public_id')
              .setDescription('Public support ticket id.')
              .setRequired(true),
          ),
      ),
  ].map((command) => command.toJSON());
}
