import { createHmac, randomBytes } from 'crypto';
import { prisma, type DiscordAccountLink, type PrismaClient } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';

const LINK_CODE_LENGTH = 8;
const LINK_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LINK_CODE_TTL_MS = 15 * 60 * 1000;
const LINK_CODE_MAX_GENERATION_ATTEMPTS = 5;
const LINKED_TITLE_ACHIEVEMENT_ID = 'discord_linked' as const;

type DiscordLinkTx = Pick<PrismaClient, 'discordAccountLink' | 'discordLinkCode' | 'playerAchievement'>;

type DiscordLinkRecord = Pick<
  DiscordAccountLink,
  'id' | 'discordUserId' | 'discordGuildId' | 'linkedAt' | 'roleSyncedAt'
>;

export interface DiscordLinkDto {
  id: string;
  discordUserId: string;
  discordGuildId: string;
  linkedAt: Date;
  roleSyncedAt: Date | null;
}

export interface DiscordLinkStatusDto {
  linked: boolean;
  link: DiscordLinkDto | null;
}

export interface ClaimedDiscordLinkDto extends DiscordLinkDto {
  titleAchievementId: typeof LINKED_TITLE_ACHIEVEMENT_ID;
}

function randomLinkCode(): string {
  const bytes = randomBytes(LINK_CODE_LENGTH);
  let code = '';

  for (const byte of bytes) {
    code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
  }

  return code;
}

function normalizeLinkCode(code: string): string {
  return code.trim().toUpperCase();
}

function hashLinkCode(code: string): string {
  const secret = process.env.DISCORD_INTERNAL_API_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new AppError(500, 'Discord link code HMAC secret is not configured', 'DISCORD_LINK_CODE_HMAC_NOT_CONFIGURED');
  }

  return createHmac('sha256', secret).update(normalizeLinkCode(code)).digest('hex');
}

function toDiscordLinkDto(link: DiscordLinkRecord): DiscordLinkDto {
  return {
    id: link.id,
    discordUserId: link.discordUserId,
    discordGuildId: link.discordGuildId,
    linkedAt: link.linkedAt,
    roleSyncedAt: link.roleSyncedAt,
  };
}

function isPrismaP2002(err: unknown): err is { code: 'P2002'; meta?: { target?: string[] | string } } {
  return Boolean(err && typeof err === 'object' && 'code' in err && err.code === 'P2002');
}

function uniqueTargetIncludes(err: { meta?: { target?: string[] | string } }, fields: string[]): boolean {
  const target = err.meta?.target;
  const targetParts = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  const normalizedTarget = targetParts.map(part => part.toLowerCase());

  return fields.every(field => normalizedTarget.some(part => part.includes(field.toLowerCase())));
}

function mapDiscordAccountLinkUniqueConflict(err: unknown): AppError | null {
  if (!isPrismaP2002(err)) {
    return null;
  }

  if (
    uniqueTargetIncludes(err, ['discordGuildId', 'discordUserId']) ||
    uniqueTargetIncludes(err, ['discord_guild_id', 'discord_user_id']) ||
    uniqueTargetIncludes(err, ['active_discord_unique'])
  ) {
    return new AppError(409, 'Discord user is already linked to a PocketRealm account', 'DISCORD_USER_ALREADY_LINKED');
  }

  if (
    uniqueTargetIncludes(err, ['accountId']) ||
    uniqueTargetIncludes(err, ['account_id']) ||
    uniqueTargetIncludes(err, ['active_account_unique'])
  ) {
    return new AppError(409, 'PocketRealm account is already linked to a Discord user', 'DISCORD_ACCOUNT_ALREADY_LINKED');
  }

  return null;
}

async function assertNoActiveDiscordLinkConflict(
  tx: DiscordLinkTx,
  discordGuildId: string,
  discordUserId: string,
  accountId: string,
): Promise<void> {
  const existingDiscordLink = await tx.discordAccountLink.findFirst({
    where: {
      discordGuildId,
      discordUserId,
      unlinkedAt: null,
    },
    select: { id: true },
  });
  if (existingDiscordLink) {
    throw new AppError(409, 'Discord user is already linked to a PocketRealm account', 'DISCORD_USER_ALREADY_LINKED');
  }

  const existingAccountLink = await tx.discordAccountLink.findFirst({
    where: { accountId, unlinkedAt: null },
    select: { id: true },
  });
  if (existingAccountLink) {
    throw new AppError(409, 'PocketRealm account is already linked to a Discord user', 'DISCORD_ACCOUNT_ALREADY_LINKED');
  }
}

export async function createDiscordLinkCode(input: {
  discordUserId: string;
  discordGuildId: string;
}): Promise<{ code: string; expiresAt: Date }> {
  for (let attempt = 1; attempt <= LINK_CODE_MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const code = randomLinkCode();
    const codeHash = hashLinkCode(code);
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    try {
      await prisma.discordLinkCode.create({
        data: {
          discordUserId: input.discordUserId,
          discordGuildId: input.discordGuildId,
          codeHash,
          expiresAt,
        },
      });

      return { code, expiresAt };
    } catch (err: unknown) {
      if (!isPrismaP2002(err) || (!uniqueTargetIncludes(err, ['codeHash']) && !uniqueTargetIncludes(err, ['code_hash']))) {
        throw err;
      }
    }
  }

  throw new AppError(500, 'Discord link code generation failed after repeated collisions', 'DISCORD_LINK_CODE_GENERATION_FAILED');
}

export async function claimDiscordLinkCode(input: {
  accountId: string;
  playerId: string;
  code: string;
}): Promise<ClaimedDiscordLinkDto> {
  const codeHash = hashLinkCode(input.code);

  return prisma.$transaction(async (tx: DiscordLinkTx) => {
    const code = await tx.discordLinkCode.findUnique({ where: { codeHash } });
    const now = new Date();

    if (!code || code.usedAt || code.expiresAt <= now) {
      throw new AppError(400, 'Discord link code expired or invalid', 'DISCORD_LINK_CODE_INVALID');
    }

    await assertNoActiveDiscordLinkConflict(tx, code.discordGuildId, code.discordUserId, input.accountId);

    const consumed = await tx.discordLinkCode.updateMany({
      where: {
        id: code.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (consumed.count === 0) {
      throw new AppError(400, 'Discord link code expired or invalid', 'DISCORD_LINK_CODE_INVALID');
    }

    let link: DiscordAccountLink;
    try {
      link = await tx.discordAccountLink.create({
        data: {
          discordGuildId: code.discordGuildId,
          discordUserId: code.discordUserId,
          accountId: input.accountId,
        },
      });
    } catch (err: unknown) {
      const conflict = mapDiscordAccountLinkUniqueConflict(err);
      if (conflict) {
        throw conflict;
      }
      throw err;
    }

    await tx.playerAchievement.upsert({
      where: { playerId_achievementId: { playerId: input.playerId, achievementId: 'discord_linked' } },
      create: { playerId: input.playerId, achievementId: 'discord_linked' },
      update: {},
    });

    return {
      ...toDiscordLinkDto(link),
      titleAchievementId: LINKED_TITLE_ACHIEVEMENT_ID,
    };
  });
}

export async function getDiscordLinkStatus(accountId: string): Promise<DiscordLinkStatusDto> {
  const link = await prisma.discordAccountLink.findFirst({
    where: { accountId, unlinkedAt: null },
    orderBy: { linkedAt: 'desc' },
  });

  return {
    linked: Boolean(link),
    link: link ? toDiscordLinkDto(link) : null,
  };
}

export async function unlinkDiscordAccount(accountId: string): Promise<{ unlinked: boolean; link: DiscordLinkDto | null }> {
  const activeLink = await prisma.discordAccountLink.findFirst({
    where: { accountId, unlinkedAt: null },
    select: { id: true },
  });

  if (!activeLink) {
    return { unlinked: false, link: null };
  }

  const link = await prisma.discordAccountLink.update({
    where: { id: activeLink.id },
    data: {
      unlinkedAt: new Date(),
      roleSyncedAt: null,
    },
  });

  return { unlinked: true, link: toDiscordLinkDto(link) };
}

export async function listUnsyncedDiscordLinks(guildId: string): Promise<DiscordLinkDto[]> {
  const links = await prisma.discordAccountLink.findMany({
    where: {
      discordGuildId: guildId,
      unlinkedAt: null,
      roleSyncedAt: null,
    },
    orderBy: { linkedAt: 'asc' },
  });

  return links.map(toDiscordLinkDto);
}

export async function markDiscordLinkSynced(id: string): Promise<DiscordLinkDto> {
  const updatedCount = await prisma.discordAccountLink.updateMany({
    where: { id, unlinkedAt: null },
    data: { roleSyncedAt: new Date() },
  });

  if (updatedCount.count === 0) {
    const link = await prisma.discordAccountLink.findUnique({
      where: { id },
      select: { id: true, unlinkedAt: true },
    });

    if (!link) {
      throw new AppError(404, 'Discord account link not found', 'DISCORD_LINK_NOT_FOUND');
    }
    throw new AppError(409, 'Discord account link is inactive', 'DISCORD_LINK_INACTIVE');
  }

  const updated = await prisma.discordAccountLink.findUnique({ where: { id } });
  if (!updated) {
    throw new AppError(404, 'Discord account link not found', 'DISCORD_LINK_NOT_FOUND');
  }

  return toDiscordLinkDto(updated);
}
