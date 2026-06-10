import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import type { StaffPrismaClient } from '../prismaTypes.js';
import { handleStaffCommand } from './staffCommands.js';

const guildId = '234567890123456789';
const staffRoleId = '345678901234567890';
const userRoleId = '456789012345678901';
const playerRoleId = '456789012345678902';
const verifiedRoleId = '567890123456789012';
const actorUserId = '678901234567890123';
const targetUserId = '789012345678901234';
const levelTwoRoleId = '890123456789012345';
const supportTriageChannelId = '901234567890123456';
const botUserId = '112233445566778899';

const config = {
  guildId,
  playerRoleId,
  verifiedRoleId,
  supportTriageChannelId,
  supportStaffRoleIds: [staffRoleId],
  levelRoleMap: new Map<number, string>(),
} satisfies Pick<
  BotConfig,
  'guildId' | 'playerRoleId' | 'verifiedRoleId' | 'supportTriageChannelId' | 'supportStaffRoleIds' | 'levelRoleMap'
>;

describe('handleStaffCommand', () => {
  it('rejects non-staff users ephemerally', async () => {
    const interaction = createStaffInteraction({
      member: memberWithRoles([userRoleId]),
      subcommand: 'sync-roles',
    });

    await handleStaffCommand(interaction, {
      api: createApi(),
      config,
    });

    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: 'Only support staff can use staff commands.',
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it('creates an audit event for XP adjustments', async () => {
    const prisma = createPrisma({
      profile: createProfile({
        xp: 90,
        level: 1,
      }),
    });
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'xp-adjust',
      targetUserId,
      amount: 20,
      reason: 'manual event credit',
    });

    await handleStaffCommand(interaction, {
      api: createApi(),
      config,
      prisma,
    });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(prisma.discordCommunityProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'profile-1' },
      data: expect.objectContaining({
        xp: { increment: 20 },
      }),
    }));
    expect(prisma.discordCommunityProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'profile-1' },
      data: expect.objectContaining({
        level: 2,
      }),
    }));
    expect(prisma.discordBotAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        guildId,
        actorDiscordUserId: actorUserId,
        targetDiscordUserId: targetUserId,
        command: '/staff xp-adjust',
        status: 'success',
        metadata: expect.objectContaining({
          amount: 20,
          appliedAmount: 20,
          previousXp: 90,
          newXp: 110,
          previousLevel: 1,
          newLevel: 2,
          reason: 'manual event credit',
        }),
      }),
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Adjusted <@789012345678901234> by 20 XP'),
    });
  });

  it('syncs the highest qualifying level role after an XP adjustment changes level', async () => {
    const add = vi.fn<GuildMember['roles']['add']>(async () => ({} as GuildMember));
    const targetMember = {
      roles: { add },
    } as unknown as GuildMember;
    const guild = createGuild(targetMember);
    const prisma = createPrisma({
      profile: createProfile({
        xp: 90,
        level: 1,
      }),
    });
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'xp-adjust',
      targetUserId,
      amount: 20,
      reason: 'manual event credit',
      guild,
    });

    await handleStaffCommand(interaction, {
      api: createApi(),
      config: {
        ...config,
        levelRoleMap: new Map([[2, levelTwoRoleId]]),
      },
      prisma,
    });

    expect(guild.members.fetch).toHaveBeenCalledWith(targetUserId);
    expect(add).toHaveBeenCalledWith(levelTwoRoleId);
    expect(prisma.discordCommunityProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'profile-1' },
      data: expect.objectContaining({
        lastRoleSyncAt: expect.any(Date),
      }),
    }));
  });

  it('uses a guarded decrement for negative XP adjustments', async () => {
    const prisma = createPrisma({
      profile: createProfile({
        xp: 90,
        level: 1,
      }),
    });
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'xp-adjust',
      targetUserId,
      amount: -200,
      reason: 'remove mistaken credit',
    });

    await handleStaffCommand(interaction, {
      api: createApi(),
      config,
      prisma,
    });

    expect(prisma.discordCommunityProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'profile-1', xp: 90 },
      data: { xp: { decrement: 90 } },
    });
    expect(prisma.discordBotAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'success',
        metadata: expect.objectContaining({
          amount: -200,
          appliedAmount: -90,
          previousXp: 90,
          newXp: 0,
        }),
      }),
    });
  });

  it('calls syncLinkedRoles for staff sync-roles commands', async () => {
    const api = createApi();
    const syncLinkedRoles = vi.fn(async () => ({
      fetched: 3,
      roleSynced: 2,
      missingMembers: 1,
      failed: 0,
    }));
    const guild = createGuild(memberWithRoles([staffRoleId]));
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'sync-roles',
      guild,
    });

    await handleStaffCommand(interaction, {
      api,
      config,
      syncLinkedRoles,
    });

    expect(syncLinkedRoles).toHaveBeenCalledWith({
      api,
      guild,
      config,
    });
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Role sync complete: 2 synced, 1 missing, 0 failed out of 3 linked players.',
    });
  });

  it('edits the deferred reply when role sync fails', async () => {
    const syncLinkedRoles = vi.fn(async (): Promise<never> => {
      throw new Error('api unavailable');
    });
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'sync-roles',
      guild: createGuild(memberWithRoles([staffRoleId])),
    });

    await handleStaffCommand(interaction, {
      api: createApi(),
      config,
      syncLinkedRoles,
    });

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Could not sync roles right now. Try again or check bot logs.',
    });
  });

  it('previews support triage cleanup by default', async () => {
    const channel = createCleanupChannel();
    const cleanupSupportTriageMessages = vi.fn(async () => ({
      scanned: 20,
      matchedTickets: 1,
      duplicateTicketCount: 1,
      duplicateCandidates: 2,
      deleted: 0,
      skipped: 0,
      failed: 0,
      confirmed: false,
      scanLimit: 50,
      targetPublicId: 'SUP-ABC12345',
    }));
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'cleanup-triage',
      publicId: 'SUP-ABC12345',
      scanLimit: 50,
      confirm: false,
      cleanupChannel: channel,
    });

    await handleStaffCommand(interaction, {
      api: createApi(),
      config,
      cleanupSupportTriageMessages,
    });

    expect(interaction.client.channels.fetch).toHaveBeenCalledWith(supportTriageChannelId);
    expect(cleanupSupportTriageMessages).toHaveBeenCalledWith({
      channel,
      botUserId,
      publicId: 'SUP-ABC12345',
      scanLimit: 50,
      confirm: false,
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Triage cleanup preview for `SUP-ABC12345`: 2 duplicate cards would be deleted across 1 ticket. Re-run with `confirm:true` to delete.',
    });
  });

  it('runs confirmed support triage cleanup', async () => {
    const cleanupSupportTriageMessages = vi.fn(async () => ({
      scanned: 100,
      matchedTickets: 2,
      duplicateTicketCount: 2,
      duplicateCandidates: 3,
      deleted: 2,
      skipped: 1,
      failed: 0,
      confirmed: true,
      scanLimit: 100,
      targetPublicId: null,
    }));
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'cleanup-triage',
      confirm: true,
    });

    await handleStaffCommand(interaction, {
      api: createApi(),
      config,
      cleanupSupportTriageMessages,
    });

    expect(cleanupSupportTriageMessages).toHaveBeenCalledWith(expect.objectContaining({
      publicId: null,
      scanLimit: 100,
      confirm: true,
    }));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Triage cleanup complete: deleted 2 duplicate cards across 2 tickets. 1 skipped, 0 failed.',
    });
  });
});

function createApi(): Pick<PocketRealmApiClient, 'get' | 'post'> {
  return {
    get: vi.fn(),
    post: vi.fn(),
  } as unknown as Pick<PocketRealmApiClient, 'get' | 'post'>;
}

interface MockProfile {
  id: string;
  discordGuildId: string;
  discordUserId: string;
  xp: number;
  level: number;
  dailyXp: number;
  dailyXpDate: Date | null;
  lastRoleSyncAt: Date | null;
  excludedFromXp: boolean;
}

interface MockProfileUpdateData {
  xp?: number | { increment: number } | { decrement: number };
  level?: number;
  lastRoleSyncAt?: Date;
}

function createProfile(overrides: Partial<MockProfile> = {}): MockProfile {
  return {
    id: 'profile-1',
    discordGuildId: guildId,
    discordUserId: targetUserId,
    xp: 0,
    level: 1,
    dailyXp: 0,
    dailyXpDate: null,
    lastRoleSyncAt: null,
    excludedFromXp: false,
    ...overrides,
  };
}

function createPrisma(options: { profile?: MockProfile | null } = {}): StaffPrismaClient {
  let storedProfile = options.profile === undefined ? createProfile() : options.profile;
  const discordCommunityProfile = {
    findUnique: vi.fn(async () => storedProfile),
    update: vi.fn(async ({ data }: { where: { id: string }; data: MockProfileUpdateData }) => {
      const currentProfile = storedProfile ?? createProfile();
      const xpChange = data.xp;
      const nextXp = typeof xpChange === 'number'
        ? xpChange
        : xpChange && 'increment' in xpChange
          ? currentProfile.xp + xpChange.increment
          : xpChange && 'decrement' in xpChange
            ? currentProfile.xp - xpChange.decrement
            : currentProfile.xp;
      const { xp: _xp, ...restData } = data;
      storedProfile = {
        ...currentProfile,
        ...restData,
        xp: nextXp,
      };
      return storedProfile;
    }),
    updateMany: vi.fn(async ({ where, data }: {
      where: { id: string; xp?: number };
      data: { xp: { decrement: number } };
    }) => {
      if (!storedProfile || storedProfile.id !== where.id) {
        return { count: 0 };
      }

      if (where.xp !== undefined && storedProfile.xp !== where.xp) {
        return { count: 0 };
      }

      storedProfile = {
        ...storedProfile,
        xp: storedProfile.xp - data.xp.decrement,
      };

      return { count: 1 };
    }),
    create: vi.fn(async ({ data }: { data: Omit<MockProfile, 'id' | 'lastRoleSyncAt' | 'excludedFromXp' | 'dailyXpDate'> & { dailyXpDate?: Date | null } }) => {
      storedProfile = {
        id: 'profile-new',
        lastRoleSyncAt: null,
        excludedFromXp: false,
        ...data,
        dailyXpDate: data.dailyXpDate ?? null,
      };
      return storedProfile;
    }),
  };
  const discordBotAuditEvent = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'audit-1',
      ...data,
    })),
  };
  const tx = {
    discordCommunityProfile,
    discordBotAuditEvent,
  };

  return {
    ...tx,
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> => callback(tx),
  };
}

function memberWithRoles(roleIds: string[]): GuildMember {
  return {
    roles: {
      cache: {
        some: (predicate: (role: { id: string }) => boolean) => roleIds.some((id) => predicate({ id })),
      },
    },
  } as unknown as GuildMember;
}

function createGuild(member: GuildMember) {
  return {
    id: guildId,
    members: {
      fetch: vi.fn(async () => member),
    },
  };
}

function createCleanupChannel() {
  return {
    id: supportTriageChannelId,
    messages: {
      fetch: vi.fn(),
    },
  };
}

function createStaffInteraction(input: {
  member: unknown;
  subcommand: string;
  targetUserId?: string;
  amount?: number;
  reason?: string;
  guild?: ReturnType<typeof createGuild>;
  publicId?: string;
  scanLimit?: number;
  confirm?: boolean;
  cleanupChannel?: unknown;
}): ChatInputCommandInteraction {
  const guild = input.guild ?? {
    id: guildId,
  };
  const cleanupChannel = input.cleanupChannel ?? createCleanupChannel();

  return {
    commandName: 'staff',
    guildId,
    guild,
    client: {
      user: {
        id: botUserId,
      },
      channels: {
        fetch: vi.fn(async () => cleanupChannel),
      },
    },
    user: {
      id: actorUserId,
    },
    member: input.member,
    options: {
      getSubcommand: vi.fn(() => input.subcommand),
      getUser: vi.fn(() => ({
        id: input.targetUserId ?? targetUserId,
      })),
      getInteger: vi.fn((name: string) => (name === 'scan_limit' ? input.scanLimit ?? null : input.amount ?? 0)),
      getString: vi.fn((name: string) => (name === 'public_id' ? input.publicId ?? null : input.reason ?? 'staff adjustment')),
      getBoolean: vi.fn(() => input.confirm ?? false),
    },
    reply: vi.fn(),
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as ChatInputCommandInteraction;
}
