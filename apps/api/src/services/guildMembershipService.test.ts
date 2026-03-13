import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUILD_CONSTANTS } from '@pocketrealm/shared';

import { mockPrisma } from '../__test__/setup';
import {
  joinGuild,
  leaveGuild,
  requestJoinGuild,
  getJoinRequests,
  respondToJoinRequest,
  kickMember,
  promoteMember,
  demoteMember,
  transferLeadership,
  disbandGuild,
} from './guildMembershipService';
import { calculateMaxMembers } from './guildService';

beforeEach(() => {
  vi.clearAllMocks();

  // Common happy-path stubs that many tests override
  mockPrisma.guildLog.create.mockResolvedValue({});
  mockPrisma.guild.update.mockResolvedValue({
    id: 'g1', name: 'G', tag: 'G', description: null,
    leaderId: 'leader1', level: 1, xp: 0n,
    recruitmentMode: 'open', minLevelRequirement: 0, taxRate: 5,
    specialization: null, renown: 0, seasonalRenown: 0,
    treasuryTurns: 0, createdAt: new Date(),
    _count: { members: 1 },
  });
  mockPrisma.guildMember.create.mockResolvedValue({});
  mockPrisma.guildMember.delete.mockResolvedValue({});
  mockPrisma.guildMember.update.mockResolvedValue({});
  mockPrisma.guild.delete.mockResolvedValue({});
  mockPrisma.guildJoinRequest.upsert.mockResolvedValue({});
  mockPrisma.guildJoinRequest.update.mockResolvedValue({});
  mockPrisma.guildJoinRequest.create.mockResolvedValue({});
  // checkGuildAchievementsForAllMembers queries members
  mockPrisma.guildMember.findMany.mockResolvedValue([]);
});

// =========================================================================
// joinGuild
// =========================================================================

describe('joinGuild', () => {
  const openGuild = (overrides: Record<string, any> = {}) => ({
    id: 'g1', name: 'Open', tag: 'OP', description: null,
    leaderId: 'leader1', level: 1, xp: 0n,
    recruitmentMode: 'open', minLevelRequirement: 0, taxRate: 5,
    specialization: null, renown: 0, seasonalRenown: 0,
    treasuryTurns: 0, createdAt: new Date(),
    _count: { members: 3 },
    ...overrides,
  });

  it('throws NOT_FOUND when player does not exist', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(joinGuild('nonexistent', 'g1'))
      .rejects.toThrow('Player not found');
  });

  it('throws ALREADY_IN_GUILD when player is in another guild', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g2', playerId: 'p1' });

    await expect(joinGuild('p1', 'g1'))
      .rejects.toThrow('Already in a guild');
  });

  it('throws LEVEL_TOO_LOW when player below global join level', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: GUILD_CONSTANTS.JOIN_MIN_LEVEL - 1, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild());

    await expect(joinGuild('p1', 'g1'))
      .rejects.toThrow(`Character level ${GUILD_CONSTANTS.JOIN_MIN_LEVEL} required to join a guild`);
  });

  it('throws NOT_FOUND when guild does not exist', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(null);

    await expect(joinGuild('p1', 'nonexistent'))
      .rejects.toThrow('Guild not found');
  });

  it('throws RECRUITMENT_CLOSED for closed guilds', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild({ recruitmentMode: 'closed' }));

    await expect(joinGuild('p1', 'g1'))
      .rejects.toThrow('not open for recruitment');
  });

  it('throws RECRUITMENT_CLOSED for request_to_join guilds', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild({ recruitmentMode: 'request_to_join' }));

    await expect(joinGuild('p1', 'g1'))
      .rejects.toThrow('not open for recruitment');
  });

  it('throws LEVEL_TOO_LOW when below guild-specific min level', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 15, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild({ minLevelRequirement: 20 }));

    await expect(joinGuild('p1', 'g1'))
      .rejects.toThrow('Character level 20 required');
  });

  it('throws GUILD_FULL when at capacity', async () => {
    const maxMembers = calculateMaxMembers(1);
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild({ _count: { members: maxMembers } }));

    await expect(joinGuild('p1', 'g1'))
      .rejects.toThrow('Guild is full');
  });

  it('joins successfully when all validations pass', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'Joiner' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild());
    // getGuild return for the final result
    mockPrisma.guild.findUnique
      .mockResolvedValueOnce(openGuild())   // initial check
      .mockResolvedValueOnce(openGuild({ _count: { members: 4 } })); // getGuild

    const result = await joinGuild('p1', 'g1');
    expect(result).toBeDefined();
    expect(result.name).toBe('Open');
  });

  it('creates guild member with role=member', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'Joiner' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild());

    await joinGuild('p1', 'g1');

    expect(mockPrisma.guildMember.create).toHaveBeenCalledWith({
      data: { guildId: 'g1', playerId: 'p1', role: 'member' },
    });
  });

  it('adds guild XP for the join event', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 20, username: 'Joiner' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(openGuild());

    await joinGuild('p1', 'g1');

    // addGuildXp reads the guild then updates it
    expect(mockPrisma.guild.update).toHaveBeenCalled();
  });
});

// =========================================================================
// leaveGuild
// =========================================================================

describe('leaveGuild', () => {
  it('throws NOT_IN_GUILD when player has no membership', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    await expect(leaveGuild('p1'))
      .rejects.toThrow('Not in a guild');
  });

  it('throws LEADER_CANNOT_LEAVE when player is the leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'leader',
      guild: { id: 'g1', leaderId: 'p1' },
      player: { username: 'Leader' },
    });

    await expect(leaveGuild('p1'))
      .rejects.toThrow('Leader must transfer leadership before leaving');
  });

  it('deletes membership and logs on success', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member',
      guild: { id: 'g1', leaderId: 'leader1' },
      player: { username: 'Leaver' },
    });

    await leaveGuild('p1');

    expect(mockPrisma.guildMember.delete).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'p1' } },
    });
    expect(mockPrisma.guildLog.create).toHaveBeenCalled();
  });

});

// =========================================================================
// requestJoinGuild
// =========================================================================

describe('requestJoinGuild', () => {
  const rjtGuild = (overrides: Record<string, any> = {}) => ({
    id: 'g1', recruitmentMode: 'request_to_join', minLevelRequirement: 0,
    level: 1, _count: { members: 3 },
    ...overrides,
  });

  it('throws NOT_FOUND when player does not exist', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(requestJoinGuild('nonexistent', 'g1'))
      .rejects.toThrow('Player not found');
  });

  it('throws ALREADY_IN_GUILD when player is in a guild', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g2', playerId: 'p1' });

    await expect(requestJoinGuild('p1', 'g1'))
      .rejects.toThrow('Already in a guild');
  });

  it('throws LEVEL_TOO_LOW when below global join level', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: GUILD_CONSTANTS.JOIN_MIN_LEVEL - 1 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    await expect(requestJoinGuild('p1', 'g1'))
      .rejects.toThrow(`Character level ${GUILD_CONSTANTS.JOIN_MIN_LEVEL} required to join a guild`);
  });

  it('throws NOT_FOUND when guild does not exist', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(null);

    await expect(requestJoinGuild('p1', 'nonexistent'))
      .rejects.toThrow('Guild not found');
  });

  it('throws NOT_INVITE_ONLY when guild is open (not request_to_join)', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild({ recruitmentMode: 'open' }));

    await expect(requestJoinGuild('p1', 'g1'))
      .rejects.toThrow('does not accept join requests');
  });

  it('throws NOT_INVITE_ONLY when guild is closed', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild({ recruitmentMode: 'closed' }));

    await expect(requestJoinGuild('p1', 'g1'))
      .rejects.toThrow('does not accept join requests');
  });

  it('throws GUILD_FULL when guild is at capacity', async () => {
    const maxMembers = calculateMaxMembers(1);
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild({ _count: { members: maxMembers } }));

    await expect(requestJoinGuild('p1', 'g1'))
      .rejects.toThrow('Guild is full');
  });

  it('throws LEVEL_TOO_LOW when below guild-specific min level', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: 15 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild({ minLevelRequirement: 20 }));

    await expect(requestJoinGuild('p1', 'g1'))
      .rejects.toThrow('Character level 20 required');
  });

  it('throws REQUEST_ALREADY_SENT when a pending request exists', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild());
    mockPrisma.guildJoinRequest.findUnique.mockResolvedValue({ status: 'pending' });

    await expect(requestJoinGuild('p1', 'g1'))
      .rejects.toThrow('Join request already pending');
  });

  it('allows re-request after previous rejection via upsert', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'Requester', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild());
    mockPrisma.guildJoinRequest.findUnique.mockResolvedValue({ status: 'rejected' });

    await requestJoinGuild('p1', 'g1');

    expect(mockPrisma.guildJoinRequest.upsert).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'p1' } },
      create: { guildId: 'g1', playerId: 'p1', status: 'pending' },
      update: { status: 'pending' },
    });
  });

  it('creates a fresh request when none exists', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'Requester', characterLevel: 20 });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild());
    mockPrisma.guildJoinRequest.findUnique.mockResolvedValue(null);

    await requestJoinGuild('p1', 'g1');

    expect(mockPrisma.guildJoinRequest.upsert).toHaveBeenCalled();
    expect(mockPrisma.guildLog.create).toHaveBeenCalled();
  });

  it('does not throw when minLevelRequirement is 0 and player meets global requirement', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', username: 'X', characterLevel: GUILD_CONSTANTS.JOIN_MIN_LEVEL });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue(rjtGuild({ minLevelRequirement: 0 }));
    mockPrisma.guildJoinRequest.findUnique.mockResolvedValue(null);

    await expect(requestJoinGuild('p1', 'g1')).resolves.toBeUndefined();
  });
});

// =========================================================================
// getJoinRequests
// =========================================================================

describe('getJoinRequests', () => {
  it('throws INSUFFICIENT_ROLE when officer is from a different guild', async () => {
    // requireRole succeeds but guildId doesn't match
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g2', playerId: 'officer1', role: 'officer', guild: { id: 'g2' },
    });

    await expect(getJoinRequests('officer1', 'g1'))
      .rejects.toThrow('Not your guild');
  });

  it('throws when requester is a regular member (not officer)', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member', guild: { id: 'g1' },
    });

    await expect(getJoinRequests('p1', 'g1'))
      .rejects.toThrow('Only officers and leaders');
  });

  it('returns pending requests with player info', async () => {
    const now = new Date('2026-01-15');
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });
    mockPrisma.guildJoinRequest.findMany.mockResolvedValue([
      {
        id: 'req-1', playerId: 'applicant1', createdAt: now,
        player: { username: 'Applicant1', characterLevel: 15 },
      },
      {
        id: 'req-2', playerId: 'applicant2', createdAt: now,
        player: { username: 'Applicant2', characterLevel: 25 },
      },
    ]);

    const result = await getJoinRequests('officer1', 'g1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'req-1',
      playerId: 'applicant1',
      username: 'Applicant1',
      characterLevel: 15,
      createdAt: now.toISOString(),
    });
    expect(result[1].username).toBe('Applicant2');
  });

  it('returns empty array when no pending requests', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });
    mockPrisma.guildJoinRequest.findMany.mockResolvedValue([]);

    const result = await getJoinRequests('officer1', 'g1');
    expect(result).toEqual([]);
  });

  it('leader can also view requests', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' },
    });
    mockPrisma.guildJoinRequest.findMany.mockResolvedValue([]);

    const result = await getJoinRequests('leader1', 'g1');
    expect(result).toEqual([]);
  });
});

// =========================================================================
// respondToJoinRequest
// =========================================================================

describe('respondToJoinRequest', () => {
  it('throws when officer is not in a guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    await expect(respondToJoinRequest('nobody', 'req-1', true))
      .rejects.toThrow('Not in a guild');
  });

  it('throws when requester is a regular member', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member', guild: { id: 'g1' },
    });

    await expect(respondToJoinRequest('p1', 'req-1', true))
      .rejects.toThrow('Only officers and leaders');
  });

  it('throws NOT_FOUND when request does not exist', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });
    mockPrisma.guildJoinRequest.findFirst.mockResolvedValue(null);

    await expect(respondToJoinRequest('officer1', 'req-unknown', true))
      .rejects.toThrow('Request not found or already processed');
  });

  describe('accept', () => {
    it('creates membership and updates request status', async () => {
      mockPrisma.guildMember.findUnique
        .mockResolvedValueOnce({
          guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
        }) // requireRole
        .mockResolvedValueOnce(null); // alreadyMember check
      mockPrisma.guildJoinRequest.findFirst.mockResolvedValue({
        id: 'req-1', guildId: 'g1', playerId: 'applicant1', status: 'pending',
        player: { username: 'Applicant' },
      });
      mockPrisma.guild.findUnique.mockResolvedValue({
        id: 'g1', level: 1, xp: 0n, _count: { members: 3 },
      });

      await respondToJoinRequest('officer1', 'req-1', true);

      expect(mockPrisma.guildMember.create).toHaveBeenCalledWith({
        data: { guildId: 'g1', playerId: 'applicant1', role: 'member' },
      });
      expect(mockPrisma.guildJoinRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'accepted' },
      });
    });

    it('throws GUILD_FULL when guild is at capacity during acceptance', async () => {
      const maxMembers = calculateMaxMembers(1);
      mockPrisma.guildMember.findUnique.mockResolvedValueOnce({
        guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
      });
      mockPrisma.guildJoinRequest.findFirst.mockResolvedValue({
        id: 'req-1', guildId: 'g1', playerId: 'applicant1', status: 'pending',
        player: { username: 'Applicant' },
      });
      mockPrisma.guild.findUnique.mockResolvedValue({
        id: 'g1', level: 1, _count: { members: maxMembers },
      });

      await expect(respondToJoinRequest('officer1', 'req-1', true))
        .rejects.toThrow('Guild is full');
    });

    it('throws NOT_FOUND when guild lookup returns null during acceptance', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValueOnce({
        guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
      });
      mockPrisma.guildJoinRequest.findFirst.mockResolvedValue({
        id: 'req-1', guildId: 'g1', playerId: 'applicant1', status: 'pending',
        player: { username: 'Applicant' },
      });
      mockPrisma.guild.findUnique.mockResolvedValue(null);

      await expect(respondToJoinRequest('officer1', 'req-1', true))
        .rejects.toThrow('Guild not found');
    });

    it('rejects request when applicant is already in another guild', async () => {
      mockPrisma.guildMember.findUnique
        .mockResolvedValueOnce({
          guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
        }) // requireRole
        .mockResolvedValueOnce({ guildId: 'g99', playerId: 'applicant1' }); // alreadyMember
      mockPrisma.guildJoinRequest.findFirst.mockResolvedValue({
        id: 'req-1', guildId: 'g1', playerId: 'applicant1', status: 'pending',
        player: { username: 'Applicant' },
      });
      mockPrisma.guild.findUnique.mockResolvedValue({
        id: 'g1', level: 1, _count: { members: 3 },
      });

      await expect(respondToJoinRequest('officer1', 'req-1', true))
        .rejects.toThrow('Player is already in a guild');

      // Request should be auto-rejected
      expect(mockPrisma.guildJoinRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'rejected' },
      });
    });
  });

  describe('reject', () => {
    it('marks request as rejected and logs it', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValueOnce({
        guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
      });
      mockPrisma.guildJoinRequest.findFirst.mockResolvedValue({
        id: 'req-1', guildId: 'g1', playerId: 'applicant1', status: 'pending',
        player: { username: 'Applicant' },
      });

      await respondToJoinRequest('officer1', 'req-1', false);

      expect(mockPrisma.guildJoinRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'rejected' },
      });
      expect(mockPrisma.guildLog.create).toHaveBeenCalled();
    });

    it('does not create a guild member on rejection', async () => {
      mockPrisma.guildMember.findUnique.mockResolvedValueOnce({
        guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
      });
      mockPrisma.guildJoinRequest.findFirst.mockResolvedValue({
        id: 'req-1', guildId: 'g1', playerId: 'applicant1', status: 'pending',
        player: { username: 'Applicant' },
      });

      await respondToJoinRequest('officer1', 'req-1', false);

      expect(mockPrisma.guildMember.create).not.toHaveBeenCalled();
    });
  });
});

// =========================================================================
// kickMember
// =========================================================================

describe('kickMember', () => {
  it('throws SELF_KICK when trying to kick self', async () => {
    await expect(kickMember('p1', 'p1'))
      .rejects.toThrow('Cannot kick yourself');
  });

  it('throws INSUFFICIENT_ROLE when requester is a regular member', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member', guild: { id: 'g1' },
    });

    await expect(kickMember('p1', 'p2'))
      .rejects.toThrow('Only officers and leaders');
  });

  it('throws NOT_IN_GUILD when target is not in the guild', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' } }) // requireRole
      .mockResolvedValueOnce(null); // target

    await expect(kickMember('officer1', 'p2'))
      .rejects.toThrow('Target is not in your guild');
  });

  it('throws NOT_IN_GUILD when target is in a different guild', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' } }) // requireRole
      .mockResolvedValueOnce({ guildId: 'g2', playerId: 'p2', role: 'member', player: { username: 'Other' } }); // target

    await expect(kickMember('officer1', 'p2'))
      .rejects.toThrow('Target is not in your guild');
  });

  it('throws CANNOT_KICK_LEADER when target is the leader', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' } }) // requireRole
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', player: { username: 'Leader' } }); // target

    await expect(kickMember('officer1', 'leader1'))
      .rejects.toThrow('Cannot kick the leader');
  });

  it('throws INSUFFICIENT_ROLE when officer tries to kick another officer', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' } }) // requireRole
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer2', role: 'officer', player: { username: 'OtherOfficer' } }); // target

    await expect(kickMember('officer1', 'officer2'))
      .rejects.toThrow('Officers cannot kick other officers');
  });

  it('leader can kick officers', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } }) // requireRole
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer1', role: 'officer', player: { username: 'TargetOfficer' } }); // target

    await expect(kickMember('leader1', 'officer1')).resolves.toBeUndefined();
    expect(mockPrisma.guildMember.delete).toHaveBeenCalled();
  });

  it('officer can kick members', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' } }) // requireRole
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'member', player: { username: 'Target' } }); // target

    await expect(kickMember('officer1', 'p2')).resolves.toBeUndefined();
    expect(mockPrisma.guildMember.delete).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'p2' } },
    });
  });
});

// =========================================================================
// promoteMember
// =========================================================================

describe('promoteMember', () => {
  it('throws NOT_LEADER when requester is not the leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });

    await expect(promoteMember('officer1', 'p2'))
      .rejects.toThrow('Only the leader');
  });

  it('throws ALREADY_OFFICER when target is already an officer', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'officer', player: { username: 'AlreadyOfficer' } });

    await expect(promoteMember('leader1', 'p2'))
      .rejects.toThrow('Can only promote members to officer');
  });

  it('throws ALREADY_OFFICER when target is the leader', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader2', role: 'leader', player: { username: 'OtherLeader' } });

    await expect(promoteMember('leader1', 'leader2'))
      .rejects.toThrow('Can only promote members to officer');
  });

  it('promotes member to officer and logs', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'member', player: { username: 'Promoted' } });

    await promoteMember('leader1', 'p2');

    expect(mockPrisma.guildMember.update).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'p2' } },
      data: { role: 'officer' },
    });
    expect(mockPrisma.guildLog.create).toHaveBeenCalled();
  });
});

// =========================================================================
// demoteMember
// =========================================================================

describe('demoteMember', () => {
  it('throws NOT_LEADER when requester is not the leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });

    await expect(demoteMember('officer1', 'p2'))
      .rejects.toThrow('Only the leader');
  });

  it('throws NOT_OFFICER when target is a member (not officer)', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'member', player: { username: 'X' } });

    await expect(demoteMember('leader1', 'p2'))
      .rejects.toThrow('Can only demote officers to member');
  });

  it('throws NOT_OFFICER when target is the leader', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader2', role: 'leader', player: { username: 'X' } });

    await expect(demoteMember('leader1', 'leader2'))
      .rejects.toThrow('Can only demote officers to member');
  });

  it('demotes officer to member and logs', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'officer', player: { username: 'Demoted' } });

    await demoteMember('leader1', 'p2');

    expect(mockPrisma.guildMember.update).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'p2' } },
      data: { role: 'member' },
    });
    expect(mockPrisma.guildLog.create).toHaveBeenCalled();
  });
});

// =========================================================================
// transferLeadership
// =========================================================================

describe('transferLeadership', () => {
  it('throws NOT_LEADER when requester is not the leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });

    await expect(transferLeadership('officer1', 'p2'))
      .rejects.toThrow('Only the leader');
  });

  it('transfers leadership: target becomes leader, old leader becomes officer', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'officer', player: { username: 'NewLeader' } });

    await transferLeadership('leader1', 'p2');

    // target -> leader
    expect(mockPrisma.guildMember.update).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'p2' } },
      data: { role: 'leader' },
    });
    // old leader -> officer
    expect(mockPrisma.guildMember.update).toHaveBeenCalledWith({
      where: { guildId_playerId: { guildId: 'g1', playerId: 'leader1' } },
      data: { role: 'officer' },
    });
    // guild.leaderId updated
    expect(mockPrisma.guild.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { leaderId: 'p2' },
    });
    expect(mockPrisma.guildLog.create).toHaveBeenCalled();
  });

});

// =========================================================================
// disbandGuild
// =========================================================================

describe('disbandGuild', () => {
  it('throws NOT_LEADER when requester is not the leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });

    await expect(disbandGuild('officer1', 'g1'))
      .rejects.toThrow('Only the leader');
  });

  it('throws NOT_IN_GUILD when requester has no guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    await expect(disbandGuild('nobody', 'g1'))
      .rejects.toThrow('Not in a guild');
  });

  it('throws WRONG_GUILD when guild ID does not match', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' },
    });

    await expect(disbandGuild('leader1', 'g999'))
      .rejects.toThrow('Not your guild');
  });

  it('deletes the guild when leader disbands their own guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' },
    });

    await disbandGuild('leader1', 'g1');

    expect(mockPrisma.guild.delete).toHaveBeenCalledWith({
      where: { id: 'g1' },
    });
  });
});
