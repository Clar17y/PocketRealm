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

interface RecordedDiscordRequest {
  method: string;
  path: string;
  body: unknown;
}

function stubDiscordSetupFetch(existingAutoModRules: unknown[]): RecordedDiscordRequest[] {
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
  const requests: RecordedDiscordRequest[] = [];

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const path = url.pathname.replace('/api/v10', '');
    const method = init?.method ?? 'GET';
    if (typeof init?.body === 'string') {
      requests.push({
        method,
        path,
        body: JSON.parse(init.body) as unknown,
      });
    }

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
      const body = requests.at(-1)?.body;
      return jsonResponse({ id: 'created-rule-id', name: asName(body) });
    }
    if (path.includes('/auto-moderation/rules/') && method === 'PATCH') {
      const body = requests.at(-1)?.body;
      return jsonResponse({ id: path.split('/').at(-1), name: asName(body) });
    }
    throw new Error(`Unhandled Discord test request: ${method} ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  return requests;
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
      'player',
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
      'ManageThreads',
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
    expect(rules.every((rule) => rule.exempt_roles.length === 0)).toBe(true);
    expect(rules.every((rule) => rule.exempt_channels.length === 0)).toBe(true);
    expect(JSON.stringify(rules)).not.toContain('"type":3');
  });

  it('creates missing AutoMod rules and updates existing planned rules by name', async () => {
    vi.stubEnv('DISCORD_AUTOMOD_EXTRA_KEYWORDS', 'gold spam, ,token leak');

    const existingAutoModRules = [
      { id: 'existing-spam-rule-id', name: 'PocketRealm: spam protection', trigger_type: 3 },
      { id: 'existing-private-rule-id', name: 'PocketRealm: private data guard', trigger_type: 1 },
    ];
    const requests = stubDiscordSetupFetch(existingAutoModRules);

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
    expect(result.categoryIdsByName.Support).toBe('support-category-id');
    expect(result.roleIdsByKey.linked).toBe('linked-role-id');

    const autoModRequests = requests.filter((request) => asName(request.body).startsWith('PocketRealm:'));
    const createBodies = autoModRequests
      .filter((request) => request.method === 'POST')
      .map((request) => request.body);
    const updateBodies = autoModRequests
      .filter((request) => request.method === 'PATCH')
      .map((request) => request.body);

    const autoModBodies = autoModRequests.map((request) => request.body);
    expect(autoModBodies).toHaveLength(4);
    expect(autoModBodies.some((body) => 'guild_id' in asObject(body))).toBe(false);
    expect(createBodies.every((body) => 'trigger_type' in asObject(body))).toBe(true);
    expect(updateBodies.every((body) => 'trigger_type' in asObject(body))).toBe(false);
    expect(autoModBodies.every((body) => Array.isArray(asObject(body).exempt_roles))).toBe(true);
    expect(autoModBodies.every((body) => Array.isArray(asObject(body).exempt_channels))).toBe(true);
    expect(autoModBodies.every((body) => (asObject(body).exempt_roles as unknown[]).length === 0)).toBe(true);
    expect(autoModBodies.every((body) => (asObject(body).exempt_channels as unknown[]).length === 0)).toBe(true);
    expect(JSON.stringify(autoModBodies)).toContain('gold spam');
    expect(JSON.stringify(autoModBodies)).toContain('token leak');
  });

  it('rejects unmanaged AutoMod rules that conflict with planned singleton trigger types', async () => {
    const requests = stubDiscordSetupFetch([
      { id: 'external-spam-rule-id', name: 'Existing spam rule', trigger_type: 3 },
    ]);

    await expect(setupDiscordServer({ botToken: 'token', guildId: 'guild-id' }))
      .rejects.toThrow(
        'Discord AutoMod rule "Existing spam rule" already uses trigger type 3. '
        + 'Rename or remove it before running PocketRealm setup.',
      );

    const autoModMutations = requests.filter((request) => (
      request.path.includes('/auto-moderation/rules')
      && ['POST', 'PATCH'].includes(request.method)
    ));
    expect(autoModMutations).toEqual([]);
  });

  it('rejects managed AutoMod rules with stale immutable trigger types before mutation', async () => {
    const requests = stubDiscordSetupFetch([
      { id: 'stale-rule-id', name: 'PocketRealm: spam protection', trigger_type: 1 },
    ]);

    await expect(setupDiscordServer({ botToken: 'token', guildId: 'guild-id' }))
      .rejects.toThrow(
        'Discord AutoMod rule "PocketRealm: spam protection" has trigger type 1, expected 3. '
        + 'Delete the stale rule before running PocketRealm setup.',
      );

    const autoModMutations = requests.filter((request) => (
      request.path.includes('/auto-moderation/rules')
      && ['POST', 'PATCH'].includes(request.method)
    ));
    expect(autoModMutations).toEqual([]);
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
