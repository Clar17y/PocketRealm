import { describe, expect, it } from 'vitest';
import {
  buildDiscordStarterMessage,
  buildPrivateChannelOverwrites,
  buildDiscordSetupPlan,
  buildRequiredBotPermissionBits,
  shouldCreateStarterMessage,
  parseLocalEnv,
  PermissionBits,
} from './discordServerSetup';

describe('discordServerSetup', () => {
  it('parses local env files without exposing comments or quotes', () => {
    expect(parseLocalEnv([
      '# comment',
      'DISCORD_BOT_TOKEN="token-value"',
      'DISCORD_GUILD_ID=1511052815399780413',
      'EMPTY=',
    ].join('\n'))).toEqual({
      DISCORD_BOT_TOKEN: 'token-value',
      DISCORD_GUILD_ID: '1511052815399780413',
      EMPTY: '',
    });
  });

  it('plans private staff-only support triage channel permissions', () => {
    const plan = buildDiscordSetupPlan();
    const supportCategory = plan.categories.find((category) => category.name === 'Support');
    const triage = supportCategory?.channels.find((channel) => channel.name === 'support-triage');

    expect(triage?.privateToRoleKeys).toEqual(['staff', 'moderator', 'triage']);
    expect(triage?.createWebhook).toBe(true);
  });

  it('plans starter information for launch channels', () => {
    const plan = buildDiscordSetupPlan();
    const channels = plan.categories.flatMap((category) => category.channels);

    expect(channels.find((channel) => channel.name === 'welcome')?.starterMessage?.title)
      .toBe('Welcome to PocketRealm');
    expect(channels.find((channel) => channel.name === 'support-triage')?.starterMessage?.title)
      .toBe('Support triage queue');
  });

  it('plans launch role keys for linked players and level milestones', () => {
    const plan = buildDiscordSetupPlan();
    const roleKeys = plan.roles.map((role) => role.key);

    expect(roleKeys).toEqual(expect.arrayContaining([
      'linked',
      'level5',
      'level10',
      'level20',
      'level30',
      'level50',
    ]));
  });

  it('plans launch channels for duels, bot health, support triage, and moderation logs', () => {
    const plan = buildDiscordSetupPlan();
    const channelNames = plan.categories.flatMap((category) => (
      category.channels.map((channel) => channel.name)
    ));

    expect(channelNames).toEqual(expect.arrayContaining([
      'duels',
      'bot-health',
      'support-triage',
      'mod-log',
    ]));
  });

  it('documents required bot permissions without kick or ban access', () => {
    const permissionBits = buildRequiredBotPermissionBits();

    expect(permissionBits).toEqual([
      'ViewChannel',
      'SendMessages',
      'ReadMessageHistory',
      'UseApplicationCommands',
      'ManageChannels',
      'ManageRoles',
      'CreatePublicThreads',
      'CreatePrivateThreads',
      'SendMessagesInThreads',
      'ManageGuild',
    ]);
    expect(permissionBits).not.toContain('KickMembers');
    expect(permissionBits).not.toContain('BanMembers');
  });

  it('uses deny view/send overwrites for private channels', () => {
    const deny = PermissionBits.ViewChannel | PermissionBits.SendMessages;
    expect(deny.toString()).toBe('3072');
  });

  it('keeps the bot explicitly allowed in private channel overwrites', () => {
    const overwrites = buildPrivateChannelOverwrites('guild-id', ['staff-role-id'], 'bot-user-id');

    expect(overwrites).toContainEqual({
      id: 'bot-user-id',
      type: 1,
      allow: '68608',
      deny: '0',
    });
  });

  it('skips starter messages when the bot already posted that channel title', () => {
    const starter = buildDiscordStarterMessage({
      title: 'Welcome to PocketRealm',
      lines: ['Start here.'],
    });

    expect(shouldCreateStarterMessage([], 'bot-user-id', starter)).toBe(true);
    expect(shouldCreateStarterMessage([
      {
        id: 'message-id',
        content: starter,
        author: { id: 'bot-user-id' },
      },
    ], 'bot-user-id', starter)).toBe(false);
  });
});
