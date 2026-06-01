import { describe, expect, it } from 'vitest';
import {
  buildDiscordStarterMessage,
  buildPrivateChannelOverwrites,
  buildDiscordSetupPlan,
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
