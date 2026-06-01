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

type RoleKey = 'staff' | 'moderator' | 'triage' | 'tester' | 'founder';

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
}

interface CategorySpec {
  name: string;
  channels: ChannelSpec[];
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

export function buildDiscordSetupPlan(): DiscordSetupPlan {
  return {
    roles: [
      { key: 'staff', name: 'PocketRealm Staff', color: 0xd4a84b },
      { key: 'moderator', name: 'Moderator', color: 0x4f8cff },
      { key: 'triage', name: 'Support Triage', color: 0x9b59b6 },
      { key: 'tester', name: 'Tester', color: 0x2ecc71 },
      { key: 'founder', name: 'Founder', color: 0xf1c40f },
    ],
    categories: [
      {
        name: 'Info',
        channels: [
          { name: 'welcome', readOnly: true },
          { name: 'rules', readOnly: true },
          { name: 'announcements', readOnly: true },
          { name: 'known-issues', readOnly: true },
        ],
      },
      {
        name: 'Community',
        channels: [
          { name: 'general' },
          { name: 'help' },
          { name: 'screenshots' },
          { name: 'feedback' },
        ],
      },
      {
        name: 'Support',
        channels: [
          { name: 'bug-reports' },
          { name: 'support-triage', privateToRoleKeys: ['staff', 'moderator', 'triage'], createWebhook: true },
        ],
      },
      {
        name: 'Staff',
        channels: [
          { name: 'staff-chat', privateToRoleKeys: ['staff', 'moderator', 'triage'] },
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
    webhookUrl: '',
  };

  const rolesByName = new Map((await client.getRoles(options.guildId)).map((role) => [role.name, role]));
  const roleIdsByKey = new Map<RoleKey, string>();

  for (const roleSpec of plan.roles) {
    const existing = rolesByName.get(roleSpec.name);
    if (existing) {
      result.existingRoles.push(roleSpec.name);
      roleIdsByKey.set(roleSpec.key, existing.id);
      continue;
    }

    const created = await client.createRole(options.guildId, roleSpec);
    result.createdRoles.push(roleSpec.name);
    roleIdsByKey.set(roleSpec.key, created.id);
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

  return result;
}

export function readDiscordSetupOptions(): SetupOptions {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();

  if (!botToken) throw new Error('DISCORD_BOT_TOKEN is required');
  if (!guildId) throw new Error('DISCORD_GUILD_ID is required');

  return { botToken, guildId };
}
