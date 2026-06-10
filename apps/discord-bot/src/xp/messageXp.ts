import { createHash } from 'node:crypto';

import { DISCORD_XP_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import { highestRoleIdForLevel } from '@pocketrealm/shared/discord/discordXp';
import { ChannelType } from 'discord.js';

import type { BotConfig } from '../config.js';

// Temporary re-export: staffCommands.ts still imports these from this file
// until Task 6 switches it to the shared import. Task 6 removes this line.
export { highestRoleIdForLevel, levelForDiscordXp } from '@pocketrealm/shared/discord/discordXp';

const {
  XP_COOLDOWN_SECONDS,
  MIN_MESSAGE_LENGTH,
} = DISCORD_XP_CONSTANTS;

export type XpEligibilityReason =
  | 'eligible'
  | 'bot_user'
  | 'dm'
  | 'command'
  | 'ignored_channel'
  | 'too_short'
  | 'cooldown'
  | 'duplicate_fingerprint'
  | 'excluded_from_xp';

export type GrantXpReason =
  | Exclude<XpEligibilityReason, 'eligible'>
  | 'already_processed'
  | 'daily_cap'
  | 'granted';

export interface XpMessageAuthor {
  id: string;
  bot?: boolean;
}

export interface XpMessageChannel {
  id?: string;
  name?: string | null;
  parentId?: string | null;
  type?: ChannelType | number | null;
  isDMBased?(): boolean;
}

export interface XpGuildMember {
  roles: {
    add(roleId: string): Promise<unknown> | unknown;
  };
}

export interface XpMessageGuild {
  members?: {
    fetch(userId: string): Promise<XpGuildMember | null>;
  };
}

export interface XpMessage {
  id: string;
  content: string;
  channelId: string;
  guildId: string | null;
  author: XpMessageAuthor;
  channel?: XpMessageChannel | null;
  member?: XpGuildMember | null;
  guild?: XpMessageGuild | null;
}

export interface MessageXpRedisClient {
  set(
    key: string,
    value: string,
    expiryMode: 'EX',
    seconds: number,
    setMode: 'NX',
  ): Promise<string | null>;
  del?(key: string): Promise<unknown>;
}

export interface MessageXpLogger {
  debug?(details: Record<string, unknown> | string, message?: string): void;
  warn?(details: Record<string, unknown> | string, message?: string): void;
}

interface DiscordMessageXpApiResponse {
  result: GrantXpMessageResult & { profileId?: string };
}

interface MessageXpApiClient {
  post<T>(path: string, body: unknown): Promise<T>;
}

type MessageXpConfig = Pick<
  BotConfig,
  | 'guildId'
  | 'duelsChannelId'
  | 'supportCategoryId'
  | 'supportTriageChannelId'
  | 'supportStaffRoleIds'
  | 'xpIgnoredChannelIds'
  | 'xpEligibleChannelIds'
  | 'levelRoleMap'
>;

export interface EvaluateXpMessageOptions {
  redis?: MessageXpRedisClient;
  config?: Partial<MessageXpConfig>;
  now?: () => Date;
}

export interface GrantXpMessageDeps {
  api: MessageXpApiClient;
  redis?: MessageXpRedisClient;
  config: MessageXpConfig;
  now?: () => Date;
  logger?: MessageXpLogger;
}

export interface EvaluateXpMessageResult {
  eligible: boolean;
  reason: XpEligibilityReason;
  fingerprint?: string;
}

export interface GrantXpMessageResult {
  eligible: boolean;
  reason: GrantXpReason;
  xpGranted?: number;
  previousLevel?: number;
  newLevel?: number;
}

const emptyConfig: MessageXpConfig = {
  guildId: '',
  duelsChannelId: '',
  supportCategoryId: '',
  supportTriageChannelId: '',
  supportStaffRoleIds: [],
  xpIgnoredChannelIds: [],
  xpEligibleChannelIds: [],
  levelRoleMap: new Map(),
};

export function createMessageXpService(deps: GrantXpMessageDeps): {
  evaluateXpMessage(message: Partial<XpMessage>, options?: EvaluateXpMessageOptions): Promise<EvaluateXpMessageResult>;
  grantXpForMessage(message: XpMessage): Promise<GrantXpMessageResult>;
} {
  return {
    evaluateXpMessage: (message, options = {}) => evaluateXpMessage(message, { ...deps, ...options }),
    grantXpForMessage: (message) => grantXpForMessage(message, deps),
  };
}

export async function evaluateXpMessage(
  message: Partial<XpMessage>,
  options: EvaluateXpMessageOptions = {},
): Promise<EvaluateXpMessageResult> {
  if (message.author?.bot) {
    return { eligible: false, reason: 'bot_user' };
  }

  if (isCommandMessage(message.content)) {
    return { eligible: false, reason: 'command' };
  }

  const config = resolveConfig(options.config);
  if (isIgnoredChannel(message, config)) {
    return { eligible: false, reason: 'ignored_channel' };
  }

  const content = message.content ?? '';
  if (content.trim().length < MIN_MESSAGE_LENGTH) {
    return { eligible: false, reason: 'too_short' };
  }

  if (isDmMessage(message)) {
    return { eligible: false, reason: 'dm' };
  }

  const guildId = message.guildId;
  const userId = message.author?.id;
  const messageId = message.id;
  const channelId = message.channelId ?? message.channel?.id;
  if (!guildId || !userId || !messageId || !channelId) {
    return { eligible: false, reason: 'dm' };
  }

  const fingerprint = fingerprintMessageContent(content);

  if (options.redis) {
    const cooldownSet = await options.redis.set(
      cooldownKey(guildId, userId),
      '1',
      'EX',
      XP_COOLDOWN_SECONDS,
      'NX',
    );
    if (cooldownSet !== 'OK') {
      return { eligible: false, reason: 'cooldown', fingerprint };
    }
  }

  return { eligible: true, reason: 'eligible', fingerprint };
}

export async function grantXpForMessage(
  message: XpMessage,
  deps: GrantXpMessageDeps,
): Promise<GrantXpMessageResult> {
  const evaluated = await evaluateXpMessage(message, deps);
  if (!evaluated.eligible) {
    return {
      eligible: false,
      reason: grantReasonForIneligibleMessage(evaluated.reason),
    };
  }

  const guildId = message.guildId;
  const userId = message.author.id;
  const fingerprint = evaluated.fingerprint;
  if (!guildId || !fingerprint) {
    return { eligible: false, reason: 'dm' };
  }

  const now = deps.now?.() ?? new Date();
  const cooldownReleaseKey = cooldownKey(guildId, userId);
  let apiResult: DiscordMessageXpApiResponse['result'];

  try {
    const response = await deps.api.post<DiscordMessageXpApiResponse>('/api/v1/discord/xp/messages', {
      discordGuildId: guildId,
      discordUserId: userId,
      channelId: message.channelId,
      messageId: message.id,
      messageFingerprint: fingerprint,
    });
    apiResult = response.result;
  } catch (error) {
    await releaseCooldown(deps.redis, cooldownReleaseKey);
    throw error;
  }

  if (!apiResult.eligible) {
    await releaseCooldown(deps.redis, cooldownReleaseKey);
  }

  if (
    apiResult.eligible &&
    apiResult.profileId &&
    apiResult.previousLevel !== undefined &&
    apiResult.newLevel !== undefined &&
    apiResult.newLevel > apiResult.previousLevel
  ) {
    await syncHighestLevelRole(message, deps, apiResult.profileId, apiResult.newLevel, now);
  }

  return {
    eligible: apiResult.eligible,
    reason: apiResult.reason,
    xpGranted: apiResult.xpGranted,
    previousLevel: apiResult.previousLevel,
    newLevel: apiResult.newLevel,
  };
}

async function releaseCooldown(
  redis: MessageXpRedisClient | undefined,
  key: string,
): Promise<void> {
  try {
    await redis?.del?.(key);
  } catch {
    // Cooldown release is best effort; the caller should keep the original result/error.
  }
}

function grantReasonForIneligibleMessage(reason: XpEligibilityReason): GrantXpReason {
  return reason === 'eligible' ? 'already_processed' : reason;
}

function resolveConfig(config: Partial<MessageXpConfig> | undefined): MessageXpConfig {
  return {
    ...emptyConfig,
    ...config,
    supportStaffRoleIds: config?.supportStaffRoleIds ?? emptyConfig.supportStaffRoleIds,
    xpIgnoredChannelIds: config?.xpIgnoredChannelIds ?? emptyConfig.xpIgnoredChannelIds,
    xpEligibleChannelIds: config?.xpEligibleChannelIds ?? emptyConfig.xpEligibleChannelIds,
    levelRoleMap: config?.levelRoleMap ?? emptyConfig.levelRoleMap,
  };
}

function isCommandMessage(content: string | undefined): boolean {
  const trimmed = content?.trim();
  return Boolean(trimmed && (trimmed.startsWith('/') || trimmed.startsWith('!')));
}

function isDmMessage(message: Partial<XpMessage>): boolean {
  return message.guildId === null || message.channel?.isDMBased?.() === true;
}

function isIgnoredChannel(message: Partial<XpMessage>, config: MessageXpConfig): boolean {
  const channelId = message.channelId ?? message.channel?.id;
  if (channelId && config.xpIgnoredChannelIds.includes(channelId)) {
    return true;
  }

  if (config.xpEligibleChannelIds.length > 0 && (!channelId || !config.xpEligibleChannelIds.includes(channelId))) {
    return true;
  }

  if (channelId && channelId === config.duelsChannelId) {
    return true;
  }

  if (channelId && channelId === config.supportTriageChannelId) {
    return true;
  }

  if (message.channel?.parentId && message.channel.parentId === config.supportCategoryId) {
    return true;
  }

  if (isPrivateChannelType(message.channel?.type)) {
    return true;
  }

  const channelName = normalizeChannelName(message.channel?.name);
  return channelName === 'duels' ||
    channelName.includes('support') ||
    channelName.includes('staff') ||
    channelName.startsWith('mod-') ||
    channelName === 'moderation-log';
}

function isPrivateChannelType(type: ChannelType | number | null | undefined): boolean {
  return type === ChannelType.DM ||
    type === ChannelType.GroupDM ||
    type === ChannelType.PrivateThread;
}

function normalizeChannelName(name: string | null | undefined): string {
  return name?.trim().toLowerCase().replace(/\s+/g, '-') ?? '';
}

function fingerprintMessageContent(content: string): string {
  const normalized = content
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/<@!?\d+>/g, '<user>')
    .replace(/<#\d+>/g, '<channel>')
    .replace(/<@&\d+>/g, '<role>')
    .replace(/[^\p{Letter}\p{Number}\s<>]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return createHash('sha256').update(normalized).digest('hex');
}

function cooldownKey(guildId: string, userId: string): string {
  return `discord:xp:cooldown:${guildId}:${userId}`;
}

async function syncHighestLevelRole(
  message: XpMessage,
  deps: GrantXpMessageDeps,
  profileId: string,
  newLevel: number,
  now: Date,
): Promise<void> {
  const roleId = highestRoleIdForLevel(newLevel, deps.config.levelRoleMap);
  if (!roleId) {
    return;
  }

  const member = await resolveGuildMember(message);
  if (!member) {
    deps.logger?.debug?.(
      {
        guildId: message.guildId,
        discordUserId: message.author.id,
        newLevel,
      },
      'Discord XP level role sync skipped because the guild member is unavailable',
    );
    return;
  }

  try {
    await member.roles.add(roleId);
    await deps.api.post('/api/v1/discord/xp/role-sync', {
      profileId,
      discordGuildId: message.guildId,
      discordUserId: message.author.id,
      roleId,
      level: newLevel,
      syncedAt: now.toISOString(),
    });
  } catch (error) {
    deps.logger?.warn?.(
      {
        error,
        guildId: message.guildId,
        discordUserId: message.author.id,
        roleId,
        newLevel,
      },
      'Discord XP level role sync failed',
    );
  }
}

async function resolveGuildMember(message: XpMessage): Promise<XpGuildMember | null> {
  if (message.member) {
    return message.member;
  }

  try {
    return await message.guild?.members?.fetch(message.author.id) ?? null;
  } catch {
    return null;
  }
}
