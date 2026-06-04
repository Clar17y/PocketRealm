import { createHash } from 'node:crypto';

import { ChannelType } from 'discord.js';

import type { BotConfig } from '../config.js';

const XP_PER_MESSAGE_MIN = 5;
const XP_PER_MESSAGE_MAX = 12;
const XP_COOLDOWN_SECONDS = 90;
const MIN_MESSAGE_LENGTH = 20;
const DAILY_SOFT_CAP = 500;
const RECENT_FINGERPRINT_WINDOW_SECONDS = 10 * 60;
const MESSAGE_XP_REASON = 'chat_message';

export function levelForDiscordXp(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

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

export interface DiscordCommunityProfileRecord {
  id: string;
  discordUserId: string;
  discordGuildId: string;
  xp: number;
  level: number;
  dailyXp: number;
  dailyXpDate: Date | null;
  excludedFromXp: boolean;
}

export interface DiscordXpEventRecord {
  id: string;
}

export interface MessageXpProfileDelegate {
  findUnique(args: {
    where: {
      discordGuildId_discordUserId: {
        discordGuildId: string;
        discordUserId: string;
      };
    };
  }): Promise<DiscordCommunityProfileRecord | null>;
  update(args: {
    where: { id: string };
    data: {
      xp?: { increment: number };
      level?: number;
      dailyXp?: number;
      dailyXpDate?: Date;
      lastXpGrantedAt?: Date;
      lastRoleSyncAt?: Date;
    };
  }): Promise<DiscordCommunityProfileRecord>;
  create(args: {
    data: {
      discordGuildId: string;
      discordUserId: string;
      xp: number;
      level: number;
      dailyXp: number;
      dailyXpDate: Date;
      lastXpGrantedAt: Date;
    };
  }): Promise<DiscordCommunityProfileRecord>;
}

export interface MessageXpEventDelegate {
  findUnique(args: {
    where: {
      discordGuildId_messageId: {
        discordGuildId: string;
        messageId: string;
      };
    };
  }): Promise<DiscordXpEventRecord | null>;
  findFirst(args: {
    where: {
      discordGuildId: string;
      discordUserId: string;
      messageFingerprint: string;
      createdAt: { gte: Date };
    };
    select: { id: true };
  }): Promise<DiscordXpEventRecord | null>;
  create(args: {
    data: {
      discordGuildId: string;
      discordUserId: string;
      channelId: string;
      messageId: string;
      messageFingerprint: string;
      xp: number;
      reason: string;
      createdAt: Date;
    };
  }): Promise<DiscordXpEventRecord>;
}

export interface MessageXpTransactionClient {
  discordCommunityProfile: MessageXpProfileDelegate;
  discordXpEvent: MessageXpEventDelegate;
}

export interface MessageXpPrismaClient extends MessageXpTransactionClient {
  $transaction<T>(callback: (tx: MessageXpTransactionClient) => Promise<T>): Promise<T>;
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

type MessageXpConfig = Pick<
  BotConfig,
  | 'guildId'
  | 'supportCategoryId'
  | 'supportTriageChannelId'
  | 'supportStaffRoleIds'
  | 'xpIgnoredChannelIds'
  | 'xpEligibleChannelIds'
  | 'levelRoleMap'
>;

export interface EvaluateXpMessageOptions {
  prisma?: MessageXpPrismaClient;
  redis?: MessageXpRedisClient;
  config?: Partial<MessageXpConfig>;
  now?: () => Date;
}

export interface GrantXpMessageDeps {
  prisma: MessageXpPrismaClient;
  redis?: MessageXpRedisClient;
  config: MessageXpConfig;
  now?: () => Date;
  random?: () => number;
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

interface GrantTransactionResult extends GrantXpMessageResult {
  profileId?: string;
}

const emptyConfig: MessageXpConfig = {
  guildId: '',
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
  const now = options.now?.() ?? new Date();

  if (options.prisma) {
    const profile = await findProfile(options.prisma, guildId, userId);
    if (profile?.excludedFromXp) {
      return { eligible: false, reason: 'excluded_from_xp', fingerprint };
    }

    const duplicate = await options.prisma.discordXpEvent.findFirst({
      where: {
        discordGuildId: guildId,
        discordUserId: userId,
        messageFingerprint: fingerprint,
        createdAt: {
          gte: new Date(now.getTime() - RECENT_FINGERPRINT_WINDOW_SECONDS * 1000),
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      return { eligible: false, reason: 'duplicate_fingerprint', fingerprint };
    }
  }

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
  let transactionResult: GrantTransactionResult;

  try {
    transactionResult = await deps.prisma.$transaction(async (tx) => {
      const existingEvent = await tx.discordXpEvent.findUnique({
        where: {
          discordGuildId_messageId: {
            discordGuildId: guildId,
            messageId: message.id,
          },
        },
      });
      if (existingEvent) {
        return { eligible: false, reason: 'already_processed' } satisfies GrantTransactionResult;
      }

      const profile = await findProfile(tx, guildId, userId);
      if (profile?.excludedFromXp) {
        return { eligible: false, reason: 'excluded_from_xp' } satisfies GrantTransactionResult;
      }

      const today = startOfUtcDay(now);
      const previousXp = profile?.xp ?? 0;
      const previousLevel = profile?.level ?? levelForDiscordXp(previousXp);
      const currentDailyXp = profile && isSameUtcDay(profile.dailyXpDate, today) ? profile.dailyXp : 0;
      const remainingDailyXp = Math.max(0, DAILY_SOFT_CAP - currentDailyXp);
      if (remainingDailyXp <= 0) {
        return { eligible: false, reason: 'daily_cap' } satisfies GrantTransactionResult;
      }

      const rolledXp = randomXp(deps.random?.() ?? Math.random());
      const xpGranted = Math.min(rolledXp, remainingDailyXp);
      const newXp = previousXp + xpGranted;
      const newLevel = levelForDiscordXp(newXp);

      const updatedProfile = profile
        ? await tx.discordCommunityProfile.update({
            where: { id: profile.id },
            data: {
              xp: { increment: xpGranted },
              level: newLevel,
              dailyXp: currentDailyXp + xpGranted,
              dailyXpDate: today,
              lastXpGrantedAt: now,
            },
          })
        : await tx.discordCommunityProfile.create({
            data: {
              discordGuildId: guildId,
              discordUserId: userId,
              xp: xpGranted,
              level: newLevel,
              dailyXp: xpGranted,
              dailyXpDate: today,
              lastXpGrantedAt: now,
            },
          });

      await tx.discordXpEvent.create({
        data: {
          discordGuildId: guildId,
          discordUserId: userId,
          channelId: message.channelId,
          messageId: message.id,
          messageFingerprint: fingerprint,
          xp: xpGranted,
          reason: MESSAGE_XP_REASON,
          createdAt: now,
        },
      });

      return {
        eligible: true,
        reason: 'granted',
        xpGranted,
        previousLevel,
        newLevel,
        profileId: updatedProfile.id,
      } satisfies GrantTransactionResult;
    });
  } catch (error) {
    await releaseCooldown(deps.redis, cooldownReleaseKey);
    throw error;
  }

  if (!transactionResult.eligible) {
    await releaseCooldown(deps.redis, cooldownReleaseKey);
  }

  if (
    transactionResult.eligible &&
    transactionResult.profileId &&
    transactionResult.previousLevel !== undefined &&
    transactionResult.newLevel !== undefined &&
    transactionResult.newLevel > transactionResult.previousLevel
  ) {
    await syncHighestLevelRole(message, deps, transactionResult.profileId, transactionResult.newLevel, now);
  }

  return {
    eligible: transactionResult.eligible,
    reason: transactionResult.reason,
    xpGranted: transactionResult.xpGranted,
    previousLevel: transactionResult.previousLevel,
    newLevel: transactionResult.newLevel,
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
    channelName === 'mod-log' ||
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

function randomXp(randomValue: number): number {
  const bounded = Math.min(Math.max(randomValue, 0), 0.999999999);
  return XP_PER_MESSAGE_MIN + Math.floor(bounded * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isSameUtcDay(left: Date | null, right: Date): boolean {
  return Boolean(
    left &&
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate(),
  );
}

function findProfile(
  prisma: MessageXpTransactionClient,
  guildId: string,
  userId: string,
): Promise<DiscordCommunityProfileRecord | null> {
  return prisma.discordCommunityProfile.findUnique({
    where: {
      discordGuildId_discordUserId: {
        discordGuildId: guildId,
        discordUserId: userId,
      },
    },
  });
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
    await deps.prisma.discordCommunityProfile.update({
      where: { id: profileId },
      data: { lastRoleSyncAt: now },
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

export function highestRoleIdForLevel(level: number, levelRoleMap: Map<number, string>): string | null {
  let selectedLevel = 0;
  let selectedRoleId: string | null = null;

  for (const [roleLevel, roleId] of levelRoleMap.entries()) {
    if (level >= roleLevel && roleLevel > selectedLevel) {
      selectedLevel = roleLevel;
      selectedRoleId = roleId;
    }
  }

  return selectedRoleId;
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
