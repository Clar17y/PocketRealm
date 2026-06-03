import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDiscordStarterMessage,
  buildPrivateChannelOverwrites,
  buildDiscordSetupPlan,
  buildAutoModRules,
  buildRequiredBotPermissionBits,
  shouldCreateStarterMessage,
  parseLocalEnv,
  PermissionBits,
  setupDiscordServer,
} from './discordServerSetup';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function emptyResponse(): Response {
  return new Response(null, { status: 204 });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asName(value: unknown): string {
  const name = asObject(value).name;
  return typeof name === 'string' ? name : '';
}

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

  it('plans enabled AutoMod rules with block and alert actions only', () => {
    const rules = buildAutoModRules({
      alertChannelId: 'mod-log-id',
      extraKeywords: ['gold spam'],
    });

    expect(rules.map((rule) => rule.name)).toEqual([
      'PocketRealm: spam protection',
      'PocketRealm: mention protection',
      'PocketRealm: preset safety',
      'PocketRealm: private data guard',
    ]);
    expect(rules.every((rule) => rule.actions.some((action) => action.type === 1))).toBe(true);
    expect(rules.every((rule) => rule.actions.some((action) => action.type === 2))).toBe(true);
    expect(JSON.stringify(rules)).not.toContain('"type":3');
  });

  it('creates missing AutoMod rules and updates existing planned rules by name', async () => {
    vi.stubEnv('DISCORD_AUTOMOD_EXTRA_KEYWORDS', 'gold spam, ,token leak');

    const plan = buildDiscordSetupPlan();
    const roles = plan.roles.map((role) => ({
      id: `${role.key}-role-id`,
      name: role.name,
    }));
    const channels = plan.categories.flatMap((category) => {
      const categoryId = `${category.name.toLowerCase()}-category-id`;
      return [
        { id: categoryId, name: category.name, type: 4, parent_id: null },
        ...category.channels.map((channel) => ({
          id: `${channel.name}-id`,
          name: channel.name,
          type: 0,
          parent_id: categoryId,
        })),
      ];
    });
    const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
    const existingAutoModRules = [
      { id: 'existing-spam-rule-id', name: 'PocketRealm: spam protection' },
      { id: 'existing-private-rule-id', name: 'PocketRealm: private data guard' },
    ];
    const requestBodies: unknown[] = [];

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const path = url.pathname.replace('/api/v10', '');
      const method = init?.method ?? 'GET';
      if (typeof init?.body === 'string') requestBodies.push(JSON.parse(init.body) as unknown);

      if (path === '/users/@me') return jsonResponse({ id: 'bot-user-id' });
      if (path.endsWith('/roles') && method === 'GET') return jsonResponse(roles);
      if (path.includes('/members/') && path.includes('/roles/') && method === 'PUT') return emptyResponse();
      if (path.endsWith('/channels') && method === 'GET') return jsonResponse(channels);
      if (path.startsWith('/channels/') && method === 'PATCH') {
        const channelId = path.split('/')[2];
        return jsonResponse(channelsById.get(channelId));
      }
      if (path.endsWith('/messages') && method === 'GET') return jsonResponse([]);
      if (path.endsWith('/messages') && method === 'POST') {
        return jsonResponse({ id: 'message-id', content: '', author: { id: 'bot-user-id' } });
      }
      if (path.endsWith('/webhooks') && method === 'GET') {
        return jsonResponse([{ id: 'webhook-id', name: 'PocketRealm Support', url: 'https://discord.test/webhook' }]);
      }
      if (path.endsWith('/auto-moderation/rules') && method === 'GET') return jsonResponse(existingAutoModRules);
      if (path.endsWith('/auto-moderation/rules') && method === 'POST') {
        const body = requestBodies.at(-1);
        return jsonResponse({ id: 'created-rule-id', name: asName(body) });
      }
      if (path.includes('/auto-moderation/rules/') && method === 'PATCH') {
        const body = requestBodies.at(-1);
        return jsonResponse({ id: path.split('/').at(-1), name: asName(body) });
      }
      throw new Error(`Unhandled Discord test request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await setupDiscordServer({ botToken: 'token', guildId: 'guild-id' });

    expect(result.createdAutoModRules).toEqual([
      'PocketRealm: mention protection',
      'PocketRealm: preset safety',
    ]);
    expect(result.updatedAutoModRules).toEqual([
      'PocketRealm: spam protection',
      'PocketRealm: private data guard',
    ]);
    expect(result.channelIdsByName['mod-log']).toBe('mod-log-id');
    expect(result.roleIdsByKey.linked).toBe('linked-role-id');

    const autoModBodies = requestBodies.filter((body) => asName(body).startsWith('PocketRealm:'));
    expect(autoModBodies).toHaveLength(4);
    expect(autoModBodies.some((body) => 'guild_id' in asObject(body))).toBe(false);
    expect(JSON.stringify(autoModBodies)).toContain('gold spam');
    expect(JSON.stringify(autoModBodies)).toContain('token leak');
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
