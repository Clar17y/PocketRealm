import { ApplicationCommandOptionType } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { buildCommandDefinitions } from './definitions.js';

describe('buildCommandDefinitions', () => {
  it('builds the Pocketrealm launch command set', () => {
    const commands = buildCommandDefinitions();
    const commandNames = commands.map((command) => command.name);

    expect(commandNames).toEqual(expect.arrayContaining([
      'link',
      'wiki',
      'profile',
      'turns',
      'skills',
      'rank',
      'duel',
      'report',
      'staff',
    ]));
  });

  it('builds staff moderation subcommands', () => {
    const commands = buildCommandDefinitions();
    const staffCommand = commands.find((command) => command.name === 'staff');
    const staffSubcommandNames = staffCommand?.options
      ?.filter((option) => option.type === ApplicationCommandOptionType.Subcommand)
      .map((option) => option.name);

    expect(staffSubcommandNames).toEqual(expect.arrayContaining([
      'sync-roles',
      'repair-ticket',
      'sync-ticket',
      'xp-adjust',
      'known-issue',
    ]));
  });
});
