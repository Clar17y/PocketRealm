import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const SUPPORT_WEBHOOK_NAME = 'PocketRealm Support';

export const PermissionBits = {
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  ReadMessageHistory: 1n << 16n,
} as const;

const ChannelType = {
  Text: 0,
  Category: 4,
} as const;

const AutoModEventType = { MessageSend: 1 } as const;
const AutoModTriggerType = { Keyword: 1, Spam: 3, KeywordPreset: 4, MentionSpam: 5 } as const;
const AutoModActionType = { BlockMessage: 1, SendAlertMessage: 2 } as const;

type RoleKey =
  | 'staff'
  | 'moderator'
  | 'triage'
  | 'tester'
  | 'founder'
  | 'linked'
  | 'level5'
  | 'level10'
  | 'level20'
  | 'level30'
  | 'level50';

interface RoleSpec {
  key: RoleKey;
  name: string;
  color: number;
}

interface ChannelSpec {
  name: string;
  readOnly?: boolean;
  privateToRoleKeys?: RoleKey[];
  createWebhook?: boolean;
  starterMessage?: StarterMessageSpec;
}

interface CategorySpec {
  name: string;
  channels: ChannelSpec[];
}

interface StarterMessageSpec {
  title: string;
  lines: string[];
}

export interface DiscordSetupPlan {
  roles: RoleSpec[];
  categories: CategorySpec[];
}

interface DiscordRole {
  id: string;
  name: string;
}

interface DiscordUser {
  id: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
}

interface DiscordWebhook {
  id: string;
  name?: string | null;
  token?: string;
  url?: string;
}

export interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
  };
}

interface AutoModAction {
  type: typeof AutoModActionType[keyof typeof AutoModActionType];
  metadata?: {
    channel_id?: string;
  };
}

interface AutoModRulePayload {
  name: string;
  event_type: typeof AutoModEventType[keyof typeof AutoModEventType];
  trigger_type: typeof AutoModTriggerType[keyof typeof AutoModTriggerType];
  trigger_metadata?: {
    keyword_filter?: string[];
    presets?: number[];
    mention_total_limit?: number;
    mention_raid_protection_enabled?: boolean;
  };
  actions: AutoModAction[];
  enabled: boolean;
  exempt_roles: string[];
  exempt_channels: string[];
}

type AutoModRuleUpdatePayload = Omit<AutoModRulePayload, 'trigger_type'>;

interface DiscordAutoModRule {
  id: string;
  name: string;
  trigger_type: number;
}

interface PermissionOverwrite {
  id: string;
  type: 0 | 1;
  allow: string;
  deny: string;
}

interface SetupOptions {
  botToken: string;
  guildId: string;
}

interface SetupResult {
  createdRoles: string[];
  existingRoles: string[];
  createdCategories: string[];
  existingCategories: string[];
  createdChannels: string[];
  existingChannels: string[];
  updatedChannels: string[];
  seededStarterMessages: string[];
  existingStarterMessages: string[];
  createdAutoModRules: string[];
  updatedAutoModRules: string[];
  categoryIdsByName: Record<string, string>;
  channelIdsByName: Record<string, string>;
  roleIdsByKey: Record<string, string>;
  webhookUrl: string;
}

export function parseLocalEnv(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsIndex = line.indexOf('=');
    if (equalsIndex < 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();
    parsed[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return parsed;
}

export function loadLocalEnvFile(cwd: string, filename = '.discord-setup.env'): void {
  const envPath = resolve(cwd, filename);
  if (!existsSync(envPath)) return;

  const parsed = parseLocalEnv(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }
}

export function buildRequiredBotPermissionBits(): string[] {
  return [
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
  ];
}

function buildAutoModActions(alertChannelId: string): AutoModAction[] {
  return [
    { type: AutoModActionType.BlockMessage },
    { type: AutoModActionType.SendAlertMessage, metadata: { channel_id: alertChannelId } },
  ];
}

function buildAutoModRuleBase(alertChannelId: string): Pick<
  AutoModRulePayload,
  'actions' | 'enabled' | 'exempt_roles' | 'exempt_channels'
> {
  return {
    actions: buildAutoModActions(alertChannelId),
    enabled: true,
    exempt_roles: [],
    exempt_channels: [],
  };
}

export function buildAutoModRules(options: { alertChannelId: string; extraKeywords: string[] }): AutoModRulePayload[] {
  return [
    {
      name: 'PocketRealm: spam protection',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.Spam,
      ...buildAutoModRuleBase(options.alertChannelId),
    },
    {
      name: 'PocketRealm: mention protection',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.MentionSpam,
      trigger_metadata: {
        mention_total_limit: 8,
        mention_raid_protection_enabled: true,
      },
      ...buildAutoModRuleBase(options.alertChannelId),
    },
    {
      name: 'PocketRealm: preset safety',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.KeywordPreset,
      trigger_metadata: { presets: [1, 2, 3] },
      ...buildAutoModRuleBase(options.alertChannelId),
    },
    {
      name: 'PocketRealm: private data guard',
      event_type: AutoModEventType.MessageSend,
      trigger_type: AutoModTriggerType.Keyword,
      trigger_metadata: {
        keyword_filter: [
          'Bearer *',
          'access_token=*',
          'refreshToken=*',
          'password=*',
          ...options.extraKeywords,
        ],
      },
      ...buildAutoModRuleBase(options.alertChannelId),
    },
  ];
}

function buildAutoModRuleUpdatePayload(rule: AutoModRulePayload): AutoModRuleUpdatePayload {
  const { trigger_type: _triggerType, ...updatePayload } = rule;
  return updatePayload;
}

function isSingletonAutoModTriggerType(triggerType: number): boolean {
  return triggerType === AutoModTriggerType.Spam
    || triggerType === AutoModTriggerType.KeywordPreset
    || triggerType === AutoModTriggerType.MentionSpam;
}

function assertAutoModPreflight(
  existingRules: DiscordAutoModRule[],
  plannedRules: AutoModRulePayload[],
): void {
  const plannedRulesByName = new Map(plannedRules.map((rule) => [rule.name, rule]));
  const plannedSingletonTriggerTypes = new Set<number>(
    plannedRules
      .map((rule) => rule.trigger_type)
      .filter(isSingletonAutoModTriggerType),
  );

  for (const existingRule of existingRules) {
    const plannedRule = plannedRulesByName.get(existingRule.name);
    if (plannedRule) {
      if (existingRule.trigger_type !== plannedRule.trigger_type) {
        throw new Error(
          `Discord AutoMod rule "${existingRule.name}" has trigger type ${existingRule.trigger_type}, `
          + `expected ${plannedRule.trigger_type}. Delete the stale rule before running PocketRealm setup.`,
        );
      }
      continue;
    }

    if (!plannedSingletonTriggerTypes.has(existingRule.trigger_type)) continue;

    throw new Error(
      `Discord AutoMod rule "${existingRule.name}" already uses trigger type ${existingRule.trigger_type}. `
      + 'Rename or remove it before running PocketRealm setup.',
    );
  }
}

export function buildDiscordSetupPlan(): DiscordSetupPlan {
  return {
    roles: [
      { key: 'staff', name: 'PocketRealm Staff', color: 0xd4a84b },
      { key: 'moderator', name: 'Moderator', color: 0x4f8cff },
      { key: 'triage', name: 'Support Triage', color: 0x9b59b6 },
      { key: 'tester', name: 'Tester', color: 0x2ecc71 },
      { key: 'founder', name: 'Founder', color: 0xf1c40f },
      { key: 'linked', name: 'Linked Account', color: 0x2ecc71 },
      { key: 'level5', name: 'Realm Level 5', color: 0x95a5a6 },
      { key: 'level10', name: 'Realm Level 10', color: 0x3498db },
      { key: 'level20', name: 'Realm Level 20', color: 0x9b59b6 },
      { key: 'level30', name: 'Realm Level 30', color: 0xe67e22 },
      { key: 'level50', name: 'Realm Level 50', color: 0xf1c40f },
    ],
    categories: [
      {
        name: 'Info',
        channels: [
          {
            name: 'welcome',
            readOnly: true,
            starterMessage: {
              title: 'Welcome to PocketRealm',
              lines: [
                'This is the community hub for PocketRealm players, testers, and launch updates.',
                'Use the in-game Help links for the current Wiki and Discord invite.',
                'For bugs, prefer the in-game report flow so account context and privacy choices stay attached.',
              ],
            },
          },
          {
            name: 'rules',
            readOnly: true,
            starterMessage: {
              title: 'Server rules',
              lines: [
                'Be direct, constructive, and respectful.',
                'Do not post private account data, email addresses, access tokens, or payment details.',
                'Keep bug details factual. Staff may move reports into private triage when they include account-specific information.',
                'No spam, harassment, exploits-for-clout, or impersonation.',
              ],
            },
          },
          {
            name: 'announcements',
            readOnly: true,
            starterMessage: {
              title: 'Announcements',
              lines: [
                'Patch notes, test windows, downtime notices, and launch updates will land here.',
                'Discussion can continue in #general or #feedback so this channel stays easy to scan.',
              ],
            },
          },
          {
            name: 'known-issues',
            readOnly: true,
            starterMessage: {
              title: 'Known issues',
              lines: [
                'Staff will keep broad-impact issues here once they are confirmed.',
                'If you hit something listed here, avoid duplicate public reports unless you have new reproduction details.',
                'Account-specific problems should still go through the in-game support report flow.',
              ],
            },
          },
        ],
      },
      {
        name: 'Community',
        channels: [
          {
            name: 'general',
            starterMessage: {
              title: 'General chat',
              lines: [
                'Talk PocketRealm here: builds, progress, questions, and launch chat.',
                'Use #help for gameplay questions and #bug-reports for public bug discussion.',
              ],
            },
          },
          {
            name: 'help',
            starterMessage: {
              title: 'Getting help',
              lines: [
                'For gameplay questions, include your character goal and what you already tried.',
                'For bugs, use the in-game report flow first when possible. It gives staff better context than a chat message.',
                'The Wiki is the first stop for mechanics, crafting, skills, and realm systems.',
              ],
            },
          },
          {
            name: 'duels',
            starterMessage: {
              title: 'Friendly duels',
              lines: [
                'Use /duel here for no-stakes simulations against linked players.',
                'Duels do not spend turns, change ratings, damage gear, grant rewards, or alter character state.',
                'Use the site to adjust equipment, skills, and combat templates before rematching.',
              ],
            },
          },
          {
            name: 'screenshots',
            starterMessage: {
              title: 'Screenshots',
              lines: [
                'Share progress, discoveries, UI oddities, and good moments here.',
                'Avoid posting private account details or anything that exposes another player without consent.',
              ],
            },
          },
          {
            name: 'feedback',
            starterMessage: {
              title: 'Feedback',
              lines: [
                'Use this for balance, pacing, UX, onboarding, and content feedback.',
                'The most useful posts explain what happened, what you expected, and why it mattered.',
              ],
            },
          },
        ],
      },
      {
        name: 'Support',
        channels: [
          {
            name: 'bug-reports',
            starterMessage: {
              title: 'Public bug reports',
              lines: [
                'Use this for broad bugs that affect the game publicly and do not expose private account data.',
                'For account-specific issues, emails, payments, moderation, or anything sensitive, use the in-game report flow.',
                'Include steps to reproduce, expected behavior, actual behavior, browser/device, and screenshots when useful.',
              ],
            },
          },
          {
            name: 'support-triage',
            privateToRoleKeys: ['staff', 'moderator', 'triage'],
            createWebhook: true,
            starterMessage: {
              title: 'Support triage queue',
              lines: [
                'Private intake from in-game reports lands here through the API webhook.',
                'Codex triage should compare new reports against the backlog, group duplicates, and recommend GitHub issue updates, new issues, or rejection.',
                'Do not repost sensitive player data into public channels.',
              ],
            },
          },
        ],
      },
      {
        name: 'Staff',
        channels: [
          {
            name: 'staff-chat',
            privateToRoleKeys: ['staff', 'moderator', 'triage'],
            starterMessage: {
              title: 'Staff chat',
              lines: [
                'Private coordination for moderation, launch operations, and support decisions.',
                'Keep player-sensitive details here or in the triage queue, not in public channels.',
              ],
            },
          },
          {
            name: 'bot-health',
            privateToRoleKeys: ['staff', 'moderator', 'triage'],
            starterMessage: {
              title: 'Bot health',
              lines: [
                'PocketRealmBot startup, repair, and role-sync notices land here.',
              ],
            },
          },
          {
            name: 'mod-log',
            privateToRoleKeys: ['staff', 'moderator'],
            starterMessage: {
              title: 'Moderation log',
              lines: [
                'Discord AutoMod alerts and staff moderation notes land here.',
              ],
            },
          },
        ],
      },
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Discord API response missing ${field}`);
  }
  return value;
}

function parseRole(value: unknown): DiscordRole {
  const record = asRecord(value);
  return {
    id: requireString(record.id, 'role.id'),
    name: requireString(record.name, 'role.name'),
  };
}

function parseUser(value: unknown): DiscordUser {
  const record = asRecord(value);
  return {
    id: requireString(record.id, 'user.id'),
  };
}

function parseChannel(value: unknown): DiscordChannel {
  const record = asRecord(value);
  return {
    id: requireString(record.id, 'channel.id'),
    name: requireString(record.name, 'channel.name'),
    type: typeof record.type === 'number' ? record.type : -1,
    parent_id: typeof record.parent_id === 'string' ? record.parent_id : null,
  };
}

function parseWebhook(value: unknown): DiscordWebhook {
  const record = asRecord(value);
  return {
    id: requireString(record.id, 'webhook.id'),
    name: typeof record.name === 'string' ? record.name : null,
    token: typeof record.token === 'string' ? record.token : undefined,
    url: typeof record.url === 'string' ? record.url : undefined,
  };
}

function parseMessage(value: unknown): DiscordMessage {
  const record = asRecord(value);
  const author = asRecord(record.author);
  return {
    id: requireString(record.id, 'message.id'),
    content: typeof record.content === 'string' ? record.content : '',
    author: {
      id: requireString(author.id, 'message.author.id'),
    },
  };
}

function parseAutoModRule(value: unknown): DiscordAutoModRule {
  const record = asRecord(value);
  return {
    id: requireString(record.id, 'autoModRule.id'),
    name: requireString(record.name, 'autoModRule.name'),
    trigger_type: typeof record.trigger_type === 'number' ? record.trigger_type : -1,
  };
}

class DiscordRestClient {
  constructor(private readonly botToken: string) {}

  async getCurrentUser(): Promise<DiscordUser> {
    const data = await this.request('/users/@me', { method: 'GET' });
    return parseUser(data);
  }

  async getRoles(guildId: string): Promise<DiscordRole[]> {
    const data = await this.request(`/guilds/${guildId}/roles`, { method: 'GET' });
    if (!Array.isArray(data)) throw new Error('Discord API returned invalid roles payload');
    return data.map(parseRole);
  }

  async createRole(guildId: string, role: RoleSpec): Promise<DiscordRole> {
    const data = await this.request(`/guilds/${guildId}/roles`, {
      method: 'POST',
      body: JSON.stringify({
        name: role.name,
        color: role.color,
        mentionable: false,
        hoist: false,
      }),
    });
    return parseRole(data);
  }

  async addGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    await this.request(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });
  }

  async getChannels(guildId: string): Promise<DiscordChannel[]> {
    const data = await this.request(`/guilds/${guildId}/channels`, { method: 'GET' });
    if (!Array.isArray(data)) throw new Error('Discord API returned invalid channels payload');
    return data.map(parseChannel);
  }

  async createCategory(guildId: string, name: string): Promise<DiscordChannel> {
    const data = await this.request(`/guilds/${guildId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name, type: ChannelType.Category }),
    });
    return parseChannel(data);
  }

  async createTextChannel(
    guildId: string,
    categoryId: string,
    channel: ChannelSpec,
    overwrites: PermissionOverwrite[],
  ): Promise<DiscordChannel> {
    const data = await this.request(`/guilds/${guildId}/channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: channel.name,
        type: ChannelType.Text,
        parent_id: categoryId,
        permission_overwrites: overwrites,
      }),
    });
    return parseChannel(data);
  }

  async updateTextChannel(channelId: string, categoryId: string, overwrites: PermissionOverwrite[]): Promise<DiscordChannel> {
    const data = await this.request(`/channels/${channelId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        parent_id: categoryId,
        ...(overwrites.length > 0 ? { permission_overwrites: overwrites } : {}),
      }),
    });
    return parseChannel(data);
  }

  async getWebhooks(channelId: string): Promise<DiscordWebhook[]> {
    const data = await this.request(`/channels/${channelId}/webhooks`, { method: 'GET' });
    if (!Array.isArray(data)) throw new Error('Discord API returned invalid webhooks payload');
    return data.map(parseWebhook);
  }

  async createWebhook(channelId: string): Promise<DiscordWebhook> {
    const data = await this.request(`/channels/${channelId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ name: SUPPORT_WEBHOOK_NAME }),
    });
    return parseWebhook(data);
  }

  async getRecentMessages(channelId: string): Promise<DiscordMessage[]> {
    const data = await this.request(`/channels/${channelId}/messages?limit=50`, { method: 'GET' });
    if (!Array.isArray(data)) throw new Error('Discord API returned invalid messages payload');
    return data.map(parseMessage);
  }

  async createMessage(channelId: string, content: string): Promise<DiscordMessage> {
    const data = await this.request(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return parseMessage(data);
  }

  async getAutoModRules(guildId: string): Promise<DiscordAutoModRule[]> {
    const data = await this.request(`/guilds/${guildId}/auto-moderation/rules`, { method: 'GET' });
    if (!Array.isArray(data)) throw new Error('Discord API returned invalid AutoMod rules payload');
    return data.map(parseAutoModRule);
  }

  async createAutoModRule(guildId: string, rule: AutoModRulePayload): Promise<DiscordAutoModRule> {
    const data = await this.request(`/guilds/${guildId}/auto-moderation/rules`, {
      method: 'POST',
      body: JSON.stringify(rule),
    });
    return parseAutoModRule(data);
  }

  async updateAutoModRule(guildId: string, ruleId: string, rule: AutoModRulePayload): Promise<DiscordAutoModRule> {
    const data = await this.request(`/guilds/${guildId}/auto-moderation/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(buildAutoModRuleUpdatePayload(rule)),
    });
    return parseAutoModRule(data);
  }

  private async request(path: string, init: Omit<RequestInit, 'headers'>): Promise<unknown> {
    const response = await fetch(`${DISCORD_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${this.botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) as unknown : null;
    if (!response.ok) {
      const message = asRecord(body).message;
      throw new Error(`Discord API ${response.status} ${path}: ${typeof message === 'string' ? message : text}`);
    }

    return body;
  }
}

function bitString(value: bigint): string {
  return value.toString();
}

export function buildDiscordStarterMessage(starterMessage: StarterMessageSpec): string {
  return [
    `**${starterMessage.title}**`,
    '',
    ...starterMessage.lines.map((line) => `- ${line}`),
  ].join('\n');
}

export function shouldCreateStarterMessage(
  messages: DiscordMessage[],
  botUserId: string,
  starterMessageContent: string,
): boolean {
  const [titleLine] = starterMessageContent.split('\n');
  return !messages.some((message) => (
    message.author.id === botUserId
    && message.content.startsWith(titleLine)
  ));
}

function publicReadOnlyOverwrites(guildId: string, staffRoleIds: string[]): PermissionOverwrite[] {
  const staffAllow = PermissionBits.ViewChannel | PermissionBits.SendMessages | PermissionBits.ReadMessageHistory;
  return [
    {
      id: guildId,
      type: 0,
      allow: bitString(PermissionBits.ViewChannel | PermissionBits.ReadMessageHistory),
      deny: bitString(PermissionBits.SendMessages),
    },
    ...staffRoleIds.map((id) => ({
      id,
      type: 0 as const,
      allow: bitString(staffAllow),
      deny: '0',
    })),
  ];
}

export function buildPrivateChannelOverwrites(
  guildId: string,
  allowedRoleIds: string[],
  botUserId: string,
): PermissionOverwrite[] {
  const roleAllow = PermissionBits.ViewChannel | PermissionBits.SendMessages | PermissionBits.ReadMessageHistory;
  return [
    {
      id: guildId,
      type: 0,
      allow: '0',
      deny: bitString(PermissionBits.ViewChannel | PermissionBits.SendMessages),
    },
    {
      id: botUserId,
      type: 1,
      allow: bitString(roleAllow),
      deny: '0',
    },
    ...allowedRoleIds.map((id) => ({
      id,
      type: 0 as const,
      allow: bitString(roleAllow),
      deny: '0',
    })),
  ];
}

function webhookUrl(webhook: DiscordWebhook): string | null {
  if (webhook.url) return webhook.url;
  if (webhook.token) return `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
  return null;
}

function readAutoModExtraKeywords(): string[] {
  return (process.env.DISCORD_AUTOMOD_EXTRA_KEYWORDS ?? '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

export async function setupDiscordServer(options: SetupOptions): Promise<SetupResult> {
  const client = new DiscordRestClient(options.botToken);
  const plan = buildDiscordSetupPlan();
  const botUser = await client.getCurrentUser();
  const result: SetupResult = {
    createdRoles: [],
    existingRoles: [],
    createdCategories: [],
    existingCategories: [],
    createdChannels: [],
    existingChannels: [],
    updatedChannels: [],
    seededStarterMessages: [],
    existingStarterMessages: [],
    createdAutoModRules: [],
    updatedAutoModRules: [],
    categoryIdsByName: {},
    channelIdsByName: {},
    roleIdsByKey: {},
    webhookUrl: '',
  };

  const rolesByName = new Map((await client.getRoles(options.guildId)).map((role) => [role.name, role]));
  const roleIdsByKey = new Map<RoleKey, string>();

  for (const roleSpec of plan.roles) {
    const existing = rolesByName.get(roleSpec.name);
    if (existing) {
      result.existingRoles.push(roleSpec.name);
      roleIdsByKey.set(roleSpec.key, existing.id);
      result.roleIdsByKey[roleSpec.key] = existing.id;
      continue;
    }

    const created = await client.createRole(options.guildId, roleSpec);
    result.createdRoles.push(roleSpec.name);
    roleIdsByKey.set(roleSpec.key, created.id);
    result.roleIdsByKey[roleSpec.key] = created.id;
  }

  const triageRoleId = roleIdsByKey.get('triage');
  if (triageRoleId) await client.addGuildMemberRole(options.guildId, botUser.id, triageRoleId);

  const channels = await client.getChannels(options.guildId);
  const channelKey = (name: string, type: number) => `${type}:${name}`;
  const channelByKey = new Map(channels.map((channel) => [channelKey(channel.name, channel.type), channel]));
  const staffRoleKeys: RoleKey[] = ['staff', 'moderator', 'triage'];
  const staffRoleIds = staffRoleKeys
    .map((key) => roleIdsByKey.get(key))
    .filter((id): id is string => Boolean(id));

  for (const categorySpec of plan.categories) {
    const categoryKey = channelKey(categorySpec.name, ChannelType.Category);
    let category = channelByKey.get(categoryKey);
    if (category) {
      result.existingCategories.push(categorySpec.name);
    } else {
      category = await client.createCategory(options.guildId, categorySpec.name);
      result.createdCategories.push(categorySpec.name);
      channelByKey.set(categoryKey, category);
    }
    result.categoryIdsByName[categorySpec.name] = category.id;

    for (const channelSpec of categorySpec.channels) {
      const textKey = channelKey(channelSpec.name, ChannelType.Text);
      const existingChannel = channelByKey.get(textKey);
      const privateRoleIds = channelSpec.privateToRoleKeys
        ?.map((key) => roleIdsByKey.get(key))
        .filter((id): id is string => Boolean(id));
      const overwrites = privateRoleIds
        ? buildPrivateChannelOverwrites(options.guildId, privateRoleIds, botUser.id)
        : channelSpec.readOnly
          ? publicReadOnlyOverwrites(options.guildId, staffRoleIds)
          : [];

      const channel = existingChannel
        ? await client.updateTextChannel(existingChannel.id, category.id, overwrites)
        : await client.createTextChannel(options.guildId, category.id, channelSpec, overwrites);
      if (existingChannel) {
        result.existingChannels.push(channelSpec.name);
        result.updatedChannels.push(channelSpec.name);
      } else {
        result.createdChannels.push(channelSpec.name);
      }
      channelByKey.set(textKey, channel);
      result.channelIdsByName[channelSpec.name] = channel.id;

      if (channelSpec.starterMessage) {
        const starterMessageContent = buildDiscordStarterMessage(channelSpec.starterMessage);
        const messages = await client.getRecentMessages(channel.id);
        if (shouldCreateStarterMessage(messages, botUser.id, starterMessageContent)) {
          await client.createMessage(channel.id, starterMessageContent);
          result.seededStarterMessages.push(channelSpec.name);
        } else {
          result.existingStarterMessages.push(channelSpec.name);
        }
      }

      if (channelSpec.createWebhook) {
        const existingWebhook = (await client.getWebhooks(channel.id))
          .find((webhook) => webhook.name === SUPPORT_WEBHOOK_NAME && webhookUrl(webhook));
        const webhook = existingWebhook ?? await client.createWebhook(channel.id);
        const url = webhookUrl(webhook);
        if (!url) throw new Error('Discord webhook did not include a token or URL');
        result.webhookUrl = url;
      }
    }
  }

  const modLogChannelId = result.channelIdsByName['mod-log'];
  if (!modLogChannelId) throw new Error('Discord setup plan did not create or find mod-log channel');

  const existingAutoModRules = await client.getAutoModRules(options.guildId);
  const plannedAutoModRules = buildAutoModRules({
    alertChannelId: modLogChannelId,
    extraKeywords: readAutoModExtraKeywords(),
  });
  assertAutoModPreflight(existingAutoModRules, plannedAutoModRules);

  const existingAutoModRulesByName = new Map(existingAutoModRules.map((rule) => [rule.name, rule]));

  for (const rule of plannedAutoModRules) {
    const existing = existingAutoModRulesByName.get(rule.name);
    if (existing) {
      await client.updateAutoModRule(options.guildId, existing.id, rule);
      result.updatedAutoModRules.push(rule.name);
    } else {
      await client.createAutoModRule(options.guildId, rule);
      result.createdAutoModRules.push(rule.name);
    }
  }

  return result;
}

export function readDiscordSetupOptions(): SetupOptions {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();

  if (!botToken) throw new Error('DISCORD_BOT_TOKEN is required');
  if (!guildId) throw new Error('DISCORD_GUILD_ID is required');

  return { botToken, guildId };
}
