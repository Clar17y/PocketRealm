import { ApplicationCommandOptionType, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { buildCommandDefinitions } from './definitions.js';

describe('buildCommandDefinitions', () => {
  it('builds the Pocketrealm launch command set', () => {
    const commands = buildCommandDefinitions();
    const commandNames = commands.map((command) => command.name);

    expect(commandNames).toEqual([
      'link',
      'wiki',
      'item',
      'mob',
      'resource',
      'profile',
      'turns',
      'skills',
      'rank',
      'duel',
      'report',
      'notify',
      'announcement',
      'staff',
    ]);
    expect(commands).toHaveLength(14);
  });

  it('builds public command options with the expected schema', () => {
    const commands = buildCommandDefinitions();

    expect(commands.find((command) => command.name === 'wiki')?.options).toEqual([
      expect.objectContaining({
        name: 'query',
        type: ApplicationCommandOptionType.String,
        required: true,
      }),
    ]);
    expect(commands.find((command) => command.name === 'item')?.options).toEqual([
      expect.objectContaining({
        name: 'query',
        type: ApplicationCommandOptionType.String,
        required: true,
      }),
    ]);
    expect(commands.find((command) => command.name === 'mob')?.options).toEqual([
      expect.objectContaining({
        name: 'query',
        type: ApplicationCommandOptionType.String,
        required: true,
      }),
    ]);
    expect(commands.find((command) => command.name === 'resource')?.options).toEqual([
      expect.objectContaining({
        name: 'query',
        type: ApplicationCommandOptionType.String,
        required: true,
      }),
    ]);
    expect(commands.find((command) => command.name === 'profile')?.options).toEqual([
      expect.objectContaining({
        name: 'user',
        type: ApplicationCommandOptionType.User,
      }),
    ]);
    expect(commands.find((command) => command.name === 'rank')?.options).toEqual([
      expect.objectContaining({
        name: 'category',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      }),
    ]);
    expect(commands.find((command) => command.name === 'duel')?.options).toEqual([
      expect.objectContaining({
        name: 'opponent',
        type: ApplicationCommandOptionType.User,
        required: true,
      }),
    ]);
  });

  it('builds the announcement command with staff permissions, optional quick message, and mention toggle', () => {
    const commands = buildCommandDefinitions();
    const announcementCommand = commands.find((command) => command.name === 'announcement');

    expect(announcementCommand?.description).toBe('Post a Pocketrealm announcement.');
    expect(announcementCommand?.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
    expect(announcementCommand?.options).toEqual([
      expect.objectContaining({
        name: 'message',
        description: 'Optional one-line message. Omit to open the multi-line editor.',
        type: ApplicationCommandOptionType.String,
        required: false,
      }),
      expect.objectContaining({
        name: 'everyone',
        description: 'Notify everyone in the announcement channel.',
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      }),
    ]);
  });

  it('builds staff moderation subcommands', () => {
    const commands = buildCommandDefinitions();
    const staffCommand = commands.find((command) => command.name === 'staff');
    const staffSubcommandNames = staffCommand?.options
      ?.filter((option) => option.type === ApplicationCommandOptionType.Subcommand)
      .map((option) => option.name);

    expect(staffSubcommandNames).toEqual([
      'sync-roles',
      'repair-ticket',
      'sync-ticket',
      'cleanup-triage',
      'xp-adjust',
      'known-issue',
    ]);
  });

  it('builds staff command options with the expected schema', () => {
    const commands = buildCommandDefinitions();
    const staffCommand = commands.find((command) => command.name === 'staff');
    const staffSubcommands = staffCommand?.options?.filter(
      (option) => option.type === ApplicationCommandOptionType.Subcommand,
    );

    expect(staffCommand?.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
    expect(staffSubcommands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'repair-ticket',
        options: [
          expect.objectContaining({
            name: 'public_id',
            type: ApplicationCommandOptionType.String,
            required: true,
          }),
        ],
      }),
      expect.objectContaining({
        name: 'sync-ticket',
        options: [
          expect.objectContaining({
            name: 'public_id',
            type: ApplicationCommandOptionType.String,
            required: true,
          }),
        ],
      }),
      expect.objectContaining({
        name: 'cleanup-triage',
        options: [
          expect.objectContaining({
            name: 'public_id',
            type: ApplicationCommandOptionType.String,
            required: false,
          }),
          expect.objectContaining({
            name: 'scan_limit',
            type: ApplicationCommandOptionType.Integer,
            required: false,
            min_value: 1,
            max_value: 100,
          }),
          expect.objectContaining({
            name: 'confirm',
            type: ApplicationCommandOptionType.Boolean,
            required: false,
          }),
        ],
      }),
      expect.objectContaining({
        name: 'xp-adjust',
        options: [
          expect.objectContaining({
            name: 'user',
            type: ApplicationCommandOptionType.User,
            required: true,
          }),
          expect.objectContaining({
            name: 'amount',
            type: ApplicationCommandOptionType.Integer,
            required: true,
          }),
          expect.objectContaining({
            name: 'reason',
            type: ApplicationCommandOptionType.String,
            required: true,
          }),
        ],
      }),
      expect.objectContaining({
        name: 'known-issue',
        options: [
          expect.objectContaining({
            name: 'public_id',
            type: ApplicationCommandOptionType.String,
            required: true,
          }),
        ],
      }),
    ]));
  });
});
