import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
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

  it('calls the API for XP adjustments', async () => {
    const api = createApi({
      adjustment: {
        profileId: 'profile-1',
        targetDiscordUserId: targetUserId,
        amount: 20,
        previousXp: 90,
        newXp: 110,
        previousLevel: 1,
        newLevel: 2,
        reason: 'manual event credit',
      },
    });
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'xp-adjust',
      targetUserId,
      amount: 20,
      reason: 'manual event credit',
    });

    await handleStaffCommand(interaction, {
      api,
      config,
    });

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/adjustments', {
      discordGuildId: guildId,
      actorDiscordUserId: actorUserId,
      targetDiscordUserId: targetUserId,
      amount: 20,
      reason: 'manual event credit',
    });
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Adjusted <@789012345678901234> by 20 XP. New total: 110 XP (level 2).',
    });
  });

  it('syncs the highest qualifying level role after an XP adjustment changes level', async () => {
    const add = vi.fn<GuildMember['roles']['add']>(async () => ({} as GuildMember));
    const targetMember = { roles: { add } } as unknown as GuildMember;
    const guild = createGuild(targetMember);
    const api = createApi({
      adjustment: {
        profileId: 'profile-1',
        targetDiscordUserId: targetUserId,
        amount: 20,
        previousXp: 90,
        newXp: 110,
        previousLevel: 1,
        newLevel: 2,
        reason: 'manual event credit',
      },
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
      api,
      config: {
        ...config,
        levelRoleMap: new Map([[2, levelTwoRoleId]]),
      },
    });

    expect(guild.members.fetch).toHaveBeenCalledWith(targetUserId);
    expect(add).toHaveBeenCalledWith(levelTwoRoleId);
    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/role-sync', {
      profileId: 'profile-1',
      discordGuildId: guildId,
      discordUserId: targetUserId,
      roleId: levelTwoRoleId,
      level: 2,
      syncedAt: expect.any(String),
    });
  });

  it('passes negative XP adjustments through the API', async () => {
    const api = createApi({
      adjustment: {
        profileId: 'profile-1',
        targetDiscordUserId: targetUserId,
        amount: -200,
        previousXp: 90,
        newXp: 0,
        previousLevel: 1,
        newLevel: 1,
        reason: 'remove mistaken credit',
      },
    });
    const interaction = createStaffInteraction({
      member: memberWithRoles([staffRoleId]),
      subcommand: 'xp-adjust',
      targetUserId,
      amount: -200,
      reason: 'remove mistaken credit',
    });

    await handleStaffCommand(interaction, {
      api,
      config,
    });

    expect(api.post).toHaveBeenCalledWith('/api/v1/discord/xp/adjustments', expect.objectContaining({
      targetDiscordUserId: targetUserId,
      amount: -200,
      reason: 'remove mistaken credit',
    }));
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Adjusted <@789012345678901234> by -200 XP. New total: 0 XP (level 1).',
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

function createApi(postResult: unknown = {}): Pick<PocketRealmApiClient, 'get' | 'post'> {
  return {
    get: vi.fn(),
    post: vi.fn(async () => postResult),
  } as unknown as Pick<PocketRealmApiClient, 'get' | 'post'>;
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
