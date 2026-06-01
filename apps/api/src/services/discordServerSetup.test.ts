import { describe, expect, it } from 'vitest';
import {
  buildPrivateChannelOverwrites,
  buildDiscordSetupPlan,
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
});
