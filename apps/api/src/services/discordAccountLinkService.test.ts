import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    discordLinkCode: {
      create: vi.fn(),
    },
    discordAccountLink: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  randomBytes: vi.fn(() => Buffer.from([0, 1, 2, 3, 4, 5, 6, 7])),
}));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomBytes: mocks.randomBytes,
  };
});

vi.mock('@pocketrealm/database', () => ({
  prisma: mocks.prisma,
}));

import {
  claimDiscordLinkCode,
  createDiscordLinkCode,
  getDiscordLinkStatus,
  listUnsyncedDiscordLinks,
  markDiscordLinkSynced,
  unlinkDiscordAccount,
} from './discordAccountLinkService';

const NOW = new Date('2026-06-04T12:00:00.000Z');
const FUTURE = new Date('2026-06-04T12:15:00.000Z');
const DISCORD_USER_ID = '1234567890123456';
const DISCORD_GUILD_ID = '2345678901234567';
const VALID_HMAC_SECRET = '12345678901234567890123456789012';
const ORIGINAL_DISCORD_INTERNAL_API_KEY = process.env.DISCORD_INTERNAL_API_KEY;

const tx = {
  discordLinkCode: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  discordAccountLink: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  playerAchievement: {
    upsert: vi.fn(),
  },
};

function linkRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    discordUserId: DISCORD_USER_ID,
    discordGuildId: DISCORD_GUILD_ID,
    accountId: 'account-1',
    linkedAt: NOW,
    unlinkedAt: null,
    roleSyncedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function hmacLinkCode(code: string): string {
  return createHmac('sha256', VALID_HMAC_SECRET).update(code.trim().toUpperCase()).digest('hex');
}

function prismaP2002(target: string[] | string) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

describe('discordAccountLinkService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.clearAllMocks();
    process.env.DISCORD_INTERNAL_API_KEY = VALID_HMAC_SECRET;
    mocks.prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_DISCORD_INTERNAL_API_KEY === undefined) {
      delete process.env.DISCORD_INTERNAL_API_KEY;
    } else {
      process.env.DISCORD_INTERNAL_API_KEY = ORIGINAL_DISCORD_INTERNAL_API_KEY;
    }
  });

  it('creates an uppercase 8-character link code and stores only its HMAC hash', async () => {
    mocks.prisma.discordLinkCode.create.mockResolvedValue({});

    const result = await createDiscordLinkCode({
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
    });

    expect(result).toEqual({
      code: expect.stringMatching(/^[A-Z0-9]{8}$/),
      expiresAt: FUTURE,
    });
    expect(result.code).toBe('ABCDEFGH');
    expect(mocks.prisma.discordLinkCode.create).toHaveBeenCalledWith({
      data: {
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        codeHash: hmacLinkCode(result.code),
        expiresAt: FUTURE,
      },
    });
  });

  it('fails clearly when the link-code HMAC secret is not configured', async () => {
    delete process.env.DISCORD_INTERNAL_API_KEY;

    await expect(createDiscordLinkCode({
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: 'DISCORD_LINK_CODE_HMAC_NOT_CONFIGURED',
      message: 'Discord link code HMAC secret is not configured',
    });
    expect(mocks.prisma.discordLinkCode.create).not.toHaveBeenCalled();

    process.env.DISCORD_INTERNAL_API_KEY = 'too-short';

    await expect(claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    })).rejects.toMatchObject({
      statusCode: 500,
      code: 'DISCORD_LINK_CODE_HMAC_NOT_CONFIGURED',
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retries bounded link-code generation when the code hash collides', async () => {
    mocks.randomBytes
      .mockReturnValueOnce(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))
      .mockReturnValueOnce(Buffer.from([8, 9, 10, 11, 12, 13, 14, 15]));
    mocks.prisma.discordLinkCode.create
      .mockRejectedValueOnce(prismaP2002(['codeHash']))
      .mockResolvedValueOnce({});

    const result = await createDiscordLinkCode({
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
    });

    expect(result.code).toBe('IJKLMNOP');
    expect(mocks.prisma.discordLinkCode.create).toHaveBeenCalledTimes(2);
  });

  it('stops retrying link-code generation after bounded hash collisions', async () => {
    mocks.prisma.discordLinkCode.create.mockRejectedValue(prismaP2002(['codeHash']));

    await expect(createDiscordLinkCode({
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: 'DISCORD_LINK_CODE_GENERATION_FAILED',
    });
    expect(mocks.prisma.discordLinkCode.create).toHaveBeenCalledTimes(5);
  });

  it('claims a valid code, links the account, and grants the linked title achievement', async () => {
    tx.discordLinkCode.findUnique.mockResolvedValue({
      id: 'code-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      expiresAt: FUTURE,
      usedAt: null,
    });
    tx.discordAccountLink.findFirst.mockResolvedValue(null);
    tx.discordLinkCode.updateMany.mockResolvedValue({ count: 1 });
    tx.discordAccountLink.create.mockResolvedValue(linkRecord());
    tx.playerAchievement.upsert.mockResolvedValue({});

    const result = await claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: ' abc12345 ',
    });

    expect(tx.discordLinkCode.findUnique).toHaveBeenCalledWith({
      where: { codeHash: hmacLinkCode('ABC12345') },
    });
    expect(tx.discordAccountLink.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_USER_ID,
        unlinkedAt: null,
      },
      select: { id: true },
    });
    expect(tx.discordAccountLink.findFirst).toHaveBeenNthCalledWith(2, {
      where: { accountId: 'account-1', unlinkedAt: null },
      select: { id: true },
    });
    expect(tx.discordLinkCode.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'code-1',
        usedAt: null,
        expiresAt: { gt: NOW },
      },
      data: { usedAt: NOW },
    });
    expect(tx.discordAccountLink.create).toHaveBeenCalledWith({
      data: {
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_USER_ID,
        accountId: 'account-1',
      },
    });
    expect(tx.playerAchievement.upsert).toHaveBeenCalledWith({
      where: { playerId_achievementId: { playerId: 'player-1', achievementId: 'discord_linked' } },
      create: { playerId: 'player-1', achievementId: 'discord_linked' },
      update: {},
    });
    expect(result).toEqual({
      id: 'link-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      linkedAt: NOW,
      roleSyncedAt: null,
      titleAchievementId: 'discord_linked',
    });
  });

  it.each([
    ['missing', null],
    ['used', { id: 'code-1', expiresAt: FUTURE, usedAt: NOW }],
    ['expired', { id: 'code-1', expiresAt: new Date('2026-06-04T11:59:59.000Z'), usedAt: null }],
  ])('rejects a %s link code as invalid', async (_case, codeRecord) => {
    tx.discordLinkCode.findUnique.mockResolvedValue(codeRecord);

    await expect(claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'DISCORD_LINK_CODE_INVALID',
      message: 'Discord link code expired or invalid',
    });

    expect(tx.discordAccountLink.create).not.toHaveBeenCalled();
    expect(tx.discordLinkCode.updateMany).not.toHaveBeenCalled();
    expect(tx.playerAchievement.upsert).not.toHaveBeenCalled();
  });

  it('rejects a claim when conditional code consumption loses a race', async () => {
    tx.discordLinkCode.findUnique.mockResolvedValue({
      id: 'code-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      expiresAt: FUTURE,
      usedAt: null,
    });
    tx.discordAccountLink.findFirst.mockResolvedValue(null);
    tx.discordLinkCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    })).rejects.toMatchObject({
      statusCode: 400,
      code: 'DISCORD_LINK_CODE_INVALID',
    });
    expect(tx.discordAccountLink.create).not.toHaveBeenCalled();
    expect(tx.playerAchievement.upsert).not.toHaveBeenCalled();
  });

  it('maps active Discord user unique races to the existing conflict error', async () => {
    tx.discordLinkCode.findUnique.mockResolvedValue({
      id: 'code-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      expiresAt: FUTURE,
      usedAt: null,
    });
    tx.discordAccountLink.findFirst.mockResolvedValue(null);
    tx.discordLinkCode.updateMany.mockResolvedValue({ count: 1 });
    tx.discordAccountLink.create.mockRejectedValue(prismaP2002(['discordGuildId', 'discordUserId']));

    await expect(claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'DISCORD_USER_ALREADY_LINKED',
    });
    expect(tx.playerAchievement.upsert).not.toHaveBeenCalled();
  });

  it('maps active account unique races to the existing conflict error', async () => {
    tx.discordLinkCode.findUnique.mockResolvedValue({
      id: 'code-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      expiresAt: FUTURE,
      usedAt: null,
    });
    tx.discordAccountLink.findFirst.mockResolvedValue(null);
    tx.discordLinkCode.updateMany.mockResolvedValue({ count: 1 });
    tx.discordAccountLink.create.mockRejectedValue(prismaP2002('discord_account_links_active_account_unique'));

    await expect(claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'DISCORD_ACCOUNT_ALREADY_LINKED',
    });
    expect(tx.playerAchievement.upsert).not.toHaveBeenCalled();
  });

  it('rejects a code when the Discord guild user already has an active link', async () => {
    tx.discordLinkCode.findUnique.mockResolvedValue({
      id: 'code-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      expiresAt: FUTURE,
      usedAt: null,
    });
    tx.discordAccountLink.findFirst.mockResolvedValueOnce({ id: 'existing-link' });

    await expect(claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'DISCORD_USER_ALREADY_LINKED',
    });
  });

  it('rejects a code when the account already has an active link', async () => {
    tx.discordLinkCode.findUnique.mockResolvedValue({
      id: 'code-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      expiresAt: FUTURE,
      usedAt: null,
    });
    tx.discordAccountLink.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-link' });

    await expect(claimDiscordLinkCode({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'DISCORD_ACCOUNT_ALREADY_LINKED',
    });
  });

  it('returns active link status for an account without exposing account ids', async () => {
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue(linkRecord());

    await expect(getDiscordLinkStatus('account-1')).resolves.toEqual({
      linked: true,
      link: {
        id: 'link-1',
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: NOW,
        roleSyncedAt: null,
      },
    });
    expect(mocks.prisma.discordAccountLink.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'account-1', unlinkedAt: null },
      orderBy: { linkedAt: 'desc' },
    });
  });

  it('unlinks an active account link and clears role sync state', async () => {
    mocks.prisma.discordAccountLink.findFirst.mockResolvedValue({ id: 'link-1' });
    mocks.prisma.discordAccountLink.update.mockResolvedValue(linkRecord({ unlinkedAt: NOW }));

    await expect(unlinkDiscordAccount('account-1')).resolves.toEqual({
      unlinked: true,
      link: {
        id: 'link-1',
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: NOW,
        roleSyncedAt: null,
      },
    });
    expect(mocks.prisma.discordAccountLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { unlinkedAt: NOW, roleSyncedAt: null },
    });
  });

  it('lists active unsynced links for a guild', async () => {
    mocks.prisma.discordAccountLink.findMany.mockResolvedValue([linkRecord()]);

    await expect(listUnsyncedDiscordLinks(DISCORD_GUILD_ID)).resolves.toEqual([
      {
        id: 'link-1',
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: NOW,
        roleSyncedAt: null,
      },
    ]);
    expect(mocks.prisma.discordAccountLink.findMany).toHaveBeenCalledWith({
      where: {
        discordGuildId: DISCORD_GUILD_ID,
        unlinkedAt: null,
        roleSyncedAt: null,
      },
      orderBy: { linkedAt: 'asc' },
    });
  });

  it('marks an active Discord link as role-synced', async () => {
    mocks.prisma.discordAccountLink.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.discordAccountLink.findUnique.mockResolvedValue(linkRecord({ roleSyncedAt: NOW }));

    await expect(markDiscordLinkSynced('link-1')).resolves.toEqual({
      id: 'link-1',
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      linkedAt: NOW,
      roleSyncedAt: NOW,
    });
    expect(mocks.prisma.discordAccountLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'link-1', unlinkedAt: null },
      data: { roleSyncedAt: NOW },
    });
    expect(mocks.prisma.discordAccountLink.findUnique).toHaveBeenCalledWith({
      where: { id: 'link-1' },
    });
  });

  it('rejects missing or inactive links when marking role sync complete', async () => {
    mocks.prisma.discordAccountLink.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.prisma.discordAccountLink.findUnique.mockResolvedValueOnce(null);

    await expect(markDiscordLinkSynced('missing-link')).rejects.toMatchObject({
      statusCode: 404,
      code: 'DISCORD_LINK_NOT_FOUND',
    });

    mocks.prisma.discordAccountLink.updateMany.mockResolvedValueOnce({ count: 0 });
    mocks.prisma.discordAccountLink.findUnique.mockResolvedValueOnce({
      id: 'link-1',
      unlinkedAt: NOW,
    });

    await expect(markDiscordLinkSynced('link-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'DISCORD_LINK_INACTIVE',
    });
    expect(mocks.prisma.discordAccountLink.update).not.toHaveBeenCalled();
  });
});
