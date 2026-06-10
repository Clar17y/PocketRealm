import { prisma, type Prisma } from '@pocketrealm/database';
import { DISCORD_XP_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import { levelForDiscordXp } from '@pocketrealm/shared/discord/discordXp';
import { AppError } from '../middleware/errorHandler';
import { getDayStart } from '../utils/dateHelpers';

const {
  XP_PER_MESSAGE_MIN,
  XP_PER_MESSAGE_MAX,
  DAILY_SOFT_CAP,
  RECENT_FINGERPRINT_WINDOW_SECONDS,
} = DISCORD_XP_CONSTANTS;

const MESSAGE_XP_REASON = 'chat_message';
const MAX_XP_DECREMENT_ATTEMPTS = 5;

type DiscordCommunityProfileForXp = NonNullable<
  Awaited<ReturnType<Prisma.TransactionClient['discordCommunityProfile']['findUnique']>>
>;

export type DiscordMessageXpGrantReason =
  | 'already_processed'
  | 'duplicate_fingerprint'
  | 'excluded_from_xp'
  | 'daily_cap'
  | 'granted';

export interface GrantDiscordMessageXpInput {
  discordGuildId: string;
  discordUserId: string;
  channelId: string;
  messageId: string;
  messageFingerprint: string;
}

export interface GrantDiscordMessageXpOptions {
  now?: Date;
  random?: () => number;
}

export interface GrantDiscordMessageXpResult {
  eligible: boolean;
  reason: DiscordMessageXpGrantReason;
  xpGranted?: number;
  previousLevel?: number;
  newLevel?: number;
  profileId?: string;
}

export interface AdjustDiscordXpInput {
  discordGuildId: string;
  actorDiscordUserId: string;
  targetDiscordUserId: string;
  amount: number;
  reason: string;
}

export interface AdjustDiscordXpResult {
  profileId: string | null;
  targetDiscordUserId: string;
  amount: number;
  previousXp: number;
  newXp: number;
  previousLevel: number;
  newLevel: number;
  reason: string;
}

export interface MarkDiscordXpRoleSyncedInput {
  profileId: string;
  discordGuildId: string;
  discordUserId: string;
  roleId: string;
  level: number;
  syncedAt?: Date;
}

function isSameUtcDay(left: Date | null, right: Date): boolean {
  return Boolean(
    left &&
      left.getUTCFullYear() === right.getUTCFullYear() &&
      left.getUTCMonth() === right.getUTCMonth() &&
      left.getUTCDate() === right.getUTCDate(),
  );
}

function randomXp(randomValue: number): number {
  const bounded = Math.min(Math.max(randomValue, 0), 0.999999999);
  return XP_PER_MESSAGE_MIN + Math.floor(bounded * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1));
}

function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  return (trimmed || 'staff adjustment').slice(0, 500);
}

export async function grantDiscordMessageXp(
  input: GrantDiscordMessageXpInput,
  options: GrantDiscordMessageXpOptions = {},
): Promise<GrantDiscordMessageXpResult> {
  const now = options.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const existingEvent = await tx.discordXpEvent.findUnique({
      where: {
        discordGuildId_messageId: {
          discordGuildId: input.discordGuildId,
          messageId: input.messageId,
        },
      },
    });
    if (existingEvent) {
      return { eligible: false, reason: 'already_processed' };
    }

    const profile = await tx.discordCommunityProfile.findUnique({
      where: {
        discordGuildId_discordUserId: {
          discordGuildId: input.discordGuildId,
          discordUserId: input.discordUserId,
        },
      },
    });
    if (profile?.excludedFromXp) {
      return { eligible: false, reason: 'excluded_from_xp' };
    }

    const duplicate = await tx.discordXpEvent.findFirst({
      where: {
        discordGuildId: input.discordGuildId,
        discordUserId: input.discordUserId,
        messageFingerprint: input.messageFingerprint,
        createdAt: {
          gte: new Date(now.getTime() - RECENT_FINGERPRINT_WINDOW_SECONDS * 1000),
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      return { eligible: false, reason: 'duplicate_fingerprint' };
    }

    const today = getDayStart(now);
    const previousXp = profile?.xp ?? 0;
    const previousLevel = profile?.level ?? levelForDiscordXp(previousXp);
    const currentDailyXp = profile && isSameUtcDay(profile.dailyXpDate, today) ? profile.dailyXp : 0;
    const remainingDailyXp = Math.max(0, DAILY_SOFT_CAP - currentDailyXp);
    if (remainingDailyXp <= 0) {
      return { eligible: false, reason: 'daily_cap' };
    }

    const rolledXp = randomXp(options.random?.() ?? Math.random());
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
            discordGuildId: input.discordGuildId,
            discordUserId: input.discordUserId,
            xp: xpGranted,
            level: newLevel,
            dailyXp: xpGranted,
            dailyXpDate: today,
            lastXpGrantedAt: now,
          },
        });

    await tx.discordXpEvent.create({
      data: {
        discordGuildId: input.discordGuildId,
        discordUserId: input.discordUserId,
        channelId: input.channelId,
        messageId: input.messageId,
        messageFingerprint: input.messageFingerprint,
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
    };
  });
}

async function applyXpAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    profile: DiscordCommunityProfileForXp | null;
    guildId: string;
    targetDiscordUserId: string;
    amount: number;
  },
) {
  if (!input.profile) {
    if (input.amount <= 0) {
      return { updatedProfile: null, appliedAmount: 0 };
    }

    return {
      updatedProfile: await tx.discordCommunityProfile.create({
        data: {
          discordGuildId: input.guildId,
          discordUserId: input.targetDiscordUserId,
          xp: input.amount,
          level: levelForDiscordXp(input.amount),
          dailyXp: 0,
        },
      }),
      appliedAmount: input.amount,
    };
  }

  if (input.amount >= 0) {
    return {
      updatedProfile: await tx.discordCommunityProfile.update({
        where: { id: input.profile.id },
        data: { xp: { increment: input.amount } },
      }),
      appliedAmount: input.amount,
    };
  }

  return applyGuardedXpDecrement(tx, input.profile, Math.abs(input.amount));
}

// CAS retry: under read-committed isolation a concurrent committed transaction can
// change profile.xp between our read and the guarded updateMany, so the xp-matched
// write may miss and must re-read and retry to keep the decrement clamped at zero.
async function applyGuardedXpDecrement(
  tx: Prisma.TransactionClient,
  profile: DiscordCommunityProfileForXp,
  requestedDecrement: number,
) {
  let currentProfile: typeof profile | null = profile;

  for (let attempt = 0; attempt < MAX_XP_DECREMENT_ATTEMPTS; attempt += 1) {
    if (!currentProfile || currentProfile.xp <= 0) {
      return { updatedProfile: currentProfile, appliedAmount: 0 };
    }

    const decrement = Math.min(requestedDecrement, currentProfile.xp);
    const update = await tx.discordCommunityProfile.updateMany({
      where: { id: currentProfile.id, xp: currentProfile.xp },
      data: { xp: { decrement } },
    });

    if (update.count === 1) {
      const updatedProfile = await tx.discordCommunityProfile.findUnique({
        where: { id: currentProfile.id },
      });
      if (!updatedProfile) {
        throw new Error('Discord community profile disappeared after XP decrement');
      }

      return { updatedProfile, appliedAmount: -decrement };
    }

    currentProfile = await tx.discordCommunityProfile.findUnique({
      where: { id: currentProfile.id },
    });
  }

  throw new Error('Could not apply Discord staff XP decrement safely');
}

export async function adjustDiscordXp(input: AdjustDiscordXpInput): Promise<AdjustDiscordXpResult> {
  const reason = normalizeReason(input.reason);

  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.discordCommunityProfile.findUnique({
        where: {
          discordGuildId_discordUserId: {
            discordGuildId: input.discordGuildId,
            discordUserId: input.targetDiscordUserId,
          },
        },
      });
      const { updatedProfile, appliedAmount } = await applyXpAdjustment(tx, {
        profile,
        guildId: input.discordGuildId,
        targetDiscordUserId: input.targetDiscordUserId,
        amount: input.amount,
      });
      const newXp = updatedProfile?.xp ?? 0;
      const effectivePreviousXp = Math.max(0, newXp - appliedAmount);
      const previousLevel = levelForDiscordXp(effectivePreviousXp);
      const newLevel = levelForDiscordXp(newXp);
      const normalizedProfile = updatedProfile && updatedProfile.level !== newLevel
        ? await tx.discordCommunityProfile.update({
            where: { id: updatedProfile.id },
            data: { level: newLevel },
          })
        : updatedProfile;

      await tx.discordBotAuditEvent.create({
        data: {
          guildId: input.discordGuildId,
          actorDiscordUserId: input.actorDiscordUserId,
          targetDiscordUserId: input.targetDiscordUserId,
          command: '/staff xp-adjust',
          status: 'success',
          metadata: {
            amount: input.amount,
            appliedAmount,
            previousXp: effectivePreviousXp,
            newXp,
            previousLevel,
            newLevel,
            reason,
          },
        },
      });

      return {
        profileId: normalizedProfile?.id ?? null,
        targetDiscordUserId: input.targetDiscordUserId,
        amount: input.amount,
        previousXp: effectivePreviousXp,
        newXp,
        previousLevel,
        newLevel,
        reason,
      };
    });
  } catch (error) {
    await recordDiscordXpAdjustmentFailure(input, reason).catch(() => undefined);
    throw error;
  }
}

async function recordDiscordXpAdjustmentFailure(input: AdjustDiscordXpInput, reason: string): Promise<void> {
  await prisma.discordBotAuditEvent.create({
    data: {
      guildId: input.discordGuildId,
      actorDiscordUserId: input.actorDiscordUserId,
      targetDiscordUserId: input.targetDiscordUserId,
      command: '/staff xp-adjust',
      status: 'failed',
      errorCode: 'DISCORD_STAFF_XP_ADJUST_FAILED',
      metadata: {
        amount: input.amount,
        reason,
      },
    },
  });
}

export async function markDiscordXpRoleSynced(input: MarkDiscordXpRoleSyncedInput) {
  const syncedAt = input.syncedAt ?? new Date();
  const result = await prisma.discordCommunityProfile.updateMany({
    where: {
      id: input.profileId,
      discordGuildId: input.discordGuildId,
      discordUserId: input.discordUserId,
    },
    data: {
      lastRoleSyncAt: syncedAt,
    },
  });

  if (result.count === 0) {
    throw new AppError(404, 'Discord community profile not found', 'DISCORD_XP_PROFILE_NOT_FOUND');
  }

  return {
    profileId: input.profileId,
    lastRoleSyncAt: syncedAt,
  };
}
