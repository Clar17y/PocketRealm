import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() },
}));

vi.mock('./guildUpgradeService', () => ({
  invalidateGuildModifiersForGuild: vi.fn(),
  invalidateGuildModifiersForPlayer: vi.fn(),
}));

import { GUILD_CONSTANTS } from '@pocketrealm/shared';
import { mockPrisma } from '../__test__/setup';
import {
  createGuild, getGuild, getPlayerGuild, getPlayerGuildId,
  searchGuilds, updateSettings, getGuildLog, addGuildXp,
  calculateMaxMembers, calculateTreasuryCap, calculateXpForLevel,
} from './guildService';
import {
  joinGuild, leaveGuild, kickMember,
  promoteMember, demoteMember, transferLeadership, disbandGuild,
} from './guildMembershipService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper calculations
// ---------------------------------------------------------------------------

describe('calculateMaxMembers', () => {
  it('returns base at level 1', () => {
    expect(calculateMaxMembers(1)).toBe(GUILD_CONSTANTS.BASE_MAX_MEMBERS);
  });
  it('adds members per 2 levels', () => {
    expect(calculateMaxMembers(4)).toBe(GUILD_CONSTANTS.BASE_MAX_MEMBERS + 2);
    expect(calculateMaxMembers(10)).toBe(GUILD_CONSTANTS.BASE_MAX_MEMBERS + 5);
  });
});

describe('calculateTreasuryCap', () => {
  it('returns base + level bonus', () => {
    expect(calculateTreasuryCap(1)).toBe(GUILD_CONSTANTS.TREASURY_BASE_CAP + GUILD_CONSTANTS.TREASURY_CAP_PER_LEVEL);
    expect(calculateTreasuryCap(5)).toBe(GUILD_CONSTANTS.TREASURY_BASE_CAP + 5 * GUILD_CONSTANTS.TREASURY_CAP_PER_LEVEL);
  });
});

describe('calculateXpForLevel', () => {
  it('returns expected XP', () => {
    const expected = Math.floor(GUILD_CONSTANTS.XP_PER_LEVEL_BASE * 1 ** GUILD_CONSTANTS.XP_PER_LEVEL_EXPONENT);
    expect(calculateXpForLevel(1)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// createGuild
// ---------------------------------------------------------------------------

describe('createGuild', () => {
  it('creates guild and sets creator as leader', async () => {
    const player = { id: 'p1', characterLevel: 25, username: 'TestPlayer' };
    mockPrisma.player.findUnique.mockResolvedValue(player);
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findFirst.mockResolvedValue(null);
    // Mock turnBank for spending turns
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      playerId: 'p1', currentTurns: 60000, lastRegenAt: new Date(),
    });
    mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });
    // The $transaction mock passes prisma as tx, so guild.create is on mockPrisma
    mockPrisma.guild.create.mockResolvedValue({
      id: 'g1', name: 'TestGuild', tag: 'TG', description: null,
      leaderId: 'p1', level: 1, xp: 0n, recruitmentMode: 'request_to_join',
      minLevelRequirement: 0, taxRate: 5, specialization: null,
      renown: 0, seasonalRenown: 0, treasuryTurns: 0,
      createdAt: new Date('2026-01-01'),
      _count: { members: 1 },
    });
    mockPrisma.guildLog.create.mockResolvedValue({});

    const result = await createGuild('p1', 'TestGuild', 'TG', null);

    expect(result.name).toBe('TestGuild');
    expect(result.tag).toBe('TG');
    expect(result.leaderId).toBe('p1');
    expect(result.memberCount).toBe(1);
  });

  it('throws if player level too low', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 5, username: 'Low' });

    await expect(createGuild('p1', 'Test', 'TG', null))
      .rejects.toThrow(`Character level ${GUILD_CONSTANTS.CREATION_MIN_LEVEL} required`);
  });

  it('throws if player already in a guild', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 25, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g2', playerId: 'p1' });

    await expect(createGuild('p1', 'Test', 'TG', null))
      .rejects.toThrow('Already in a guild');
  });

  it('throws if guild name taken', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 25, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(createGuild('p1', 'TakenName', 'TG', null))
      .rejects.toThrow('name or tag already taken');
  });

  it('throws if name too short', async () => {
    await expect(createGuild('p1', 'AB', 'TG', null))
      .rejects.toThrow('Guild name must be');
  });

  it('throws if tag too long', async () => {
    await expect(createGuild('p1', 'ValidName', 'TOOLONG', null))
      .rejects.toThrow('Guild tag must be');
  });
});

// ---------------------------------------------------------------------------
// getPlayerGuild
// ---------------------------------------------------------------------------

describe('getPlayerGuild', () => {
  it('returns null if player has no guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    const result = await getPlayerGuild('p1');
    expect(result).toBeNull();
  });

  it('returns guild data with member list when player has guild', async () => {
    const now = new Date();
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member',
      guild: {
        id: 'g1', name: 'TestGuild', tag: 'TG', description: null,
        leaderId: 'leader1', level: 3, xp: 500n,
        recruitmentMode: 'open', minLevelRequirement: 0, taxRate: 10,
        specialization: null, renown: 100, seasonalRenown: 50,
        treasuryTurns: 5000, createdAt: now,
        _count: { members: 5 },
        members: [
          {
            playerId: 'leader1', role: 'leader', joinedAt: now,
            totalTurnsContributed: 500, weeklyTurnsContributed: 100,
            lastActiveAt: now,
            player: { username: 'LeaderPlayer', characterLevel: 30 },
          },
          {
            playerId: 'p1', role: 'member', joinedAt: now,
            totalTurnsContributed: 100, weeklyTurnsContributed: 50,
            lastActiveAt: now,
            player: { username: 'TestPlayer', characterLevel: 15 },
          },
        ],
      },
    });

    const result = await getPlayerGuild('p1');
    expect(result).not.toBeNull();
    expect(result!.guild.name).toBe('TestGuild');
    expect(result!.guild.leaderUsername).toBe('LeaderPlayer');
    expect(result!.role).toBe('member');
    expect(result!.members).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getPlayerGuildId
// ---------------------------------------------------------------------------

describe('getPlayerGuildId', () => {
  it('returns guildId if player is in a guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g1' });
    expect(await getPlayerGuildId('p1')).toBe('g1');
  });

  it('returns null if player is not in a guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    expect(await getPlayerGuildId('p1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// searchGuilds
// ---------------------------------------------------------------------------

describe('searchGuilds', () => {
  it('returns paginated results', async () => {
    mockPrisma.guild.findMany.mockResolvedValue([
      {
        id: 'g1', name: 'Alpha', tag: 'AL', description: null,
        level: 5, recruitmentMode: 'open', minLevelRequirement: 0,
        taxRate: 5, specialization: null,
        _count: { members: 3 },
      },
    ]);
    mockPrisma.guild.count.mockResolvedValue(1);

    const result = await searchGuilds('Alpha', 1);
    expect(result.guilds).toHaveLength(1);
    expect(result.guilds[0].name).toBe('Alpha');
    expect(result.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// joinGuild
// ---------------------------------------------------------------------------

describe('joinGuild', () => {
  it('joins an open guild', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 15, username: 'Joiner' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: 'g1', name: 'OpenGuild', tag: 'OG', description: null,
      leaderId: 'leader1', level: 1, xp: 0n,
      recruitmentMode: 'open', minLevelRequirement: 0, taxRate: 5,
      specialization: null, renown: 0, seasonalRenown: 0,
      treasuryTurns: 0, createdAt: new Date(),
      _count: { members: 3 },
    });
    mockPrisma.guildMember.create.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});
    // For addGuildXp
    mockPrisma.guild.update.mockResolvedValue({
      id: 'g1', name: 'OpenGuild', tag: 'OG', description: null,
      leaderId: 'leader1', level: 1, xp: 50n,
      recruitmentMode: 'open', minLevelRequirement: 0, taxRate: 5,
      specialization: null, renown: 0, seasonalRenown: 0,
      treasuryTurns: 0, createdAt: new Date(),
      _count: { members: 4 },
    });

    const result = await joinGuild('p1', 'g1');
    expect(result.name).toBe('OpenGuild');
  });

  it('rejects if guild is full', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 15, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: 'g1', recruitmentMode: 'open', minLevelRequirement: 0,
      level: 1, _count: { members: calculateMaxMembers(1) },
    });

    await expect(joinGuild('p1', 'g1')).rejects.toThrow('Guild is full');
  });

  it('rejects if below global join level', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 5, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);

    await expect(joinGuild('p1', 'g1'))
      .rejects.toThrow(`Character level ${GUILD_CONSTANTS.JOIN_MIN_LEVEL} required to join a guild`);
  });

  it('rejects if below guild-specific level requirement', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 12, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: 'g1', recruitmentMode: 'open', minLevelRequirement: 20,
      level: 1, _count: { members: 3 },
    });

    await expect(joinGuild('p1', 'g1')).rejects.toThrow('Character level 20 required');
  });

  it('rejects if already in a guild', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 15, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue({ guildId: 'g2', playerId: 'p1' });

    await expect(joinGuild('p1', 'g1')).rejects.toThrow('Already in a guild');
  });

  it('rejects if invite-only', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ id: 'p1', characterLevel: 15, username: 'X' });
    mockPrisma.guildMember.findUnique.mockResolvedValue(null);
    mockPrisma.guild.findUnique.mockResolvedValue({
      id: 'g1', recruitmentMode: 'request_to_join', minLevelRequirement: 0,
      level: 1, _count: { members: 3 },
    });

    await expect(joinGuild('p1', 'g1')).rejects.toThrow('not open for recruitment');
  });
});

// ---------------------------------------------------------------------------
// leaveGuild
// ---------------------------------------------------------------------------

describe('leaveGuild', () => {
  it('removes member from guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member',
      guild: { id: 'g1', leaderId: 'leader1' },
      player: { username: 'Leaver' },
    });
    mockPrisma.guildMember.delete.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});

    await expect(leaveGuild('p1')).resolves.toBeUndefined();
  });

  it('rejects if leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'leader',
      guild: { id: 'g1', leaderId: 'p1' },
      player: { username: 'Leader' },
    });

    await expect(leaveGuild('p1')).rejects.toThrow('Leader must transfer leadership');
  });
});

// ---------------------------------------------------------------------------
// kickMember
// ---------------------------------------------------------------------------

describe('kickMember', () => {
  it('officer kicks member', async () => {
    // requireRole mock: requester is officer
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' } }) // requireRole
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'member', player: { username: 'Target' } }); // target lookup
    mockPrisma.guildMember.delete.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});

    await expect(kickMember('officer1', 'p2')).resolves.toBeUndefined();
  });

  it('rejects if kicking self', async () => {
    await expect(kickMember('p1', 'p1')).rejects.toThrow('Cannot kick yourself');
  });

  it('rejects if member tries to kick', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member', guild: { id: 'g1' },
    });

    await expect(kickMember('p1', 'p2')).rejects.toThrow('Only officers and leaders');
  });
});

// ---------------------------------------------------------------------------
// promoteMember
// ---------------------------------------------------------------------------

describe('promoteMember', () => {
  it('leader promotes member to officer', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'member', player: { username: 'Promoted' } });
    mockPrisma.guildMember.update.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});

    await expect(promoteMember('leader1', 'p2')).resolves.toBeUndefined();
  });

  it('rejects if not leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });

    await expect(promoteMember('officer1', 'p2')).rejects.toThrow('Only the leader');
  });
});

// ---------------------------------------------------------------------------
// demoteMember
// ---------------------------------------------------------------------------

describe('demoteMember', () => {
  it('leader demotes officer to member', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'officer', player: { username: 'Demoted' } });
    mockPrisma.guildMember.update.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});

    await expect(demoteMember('leader1', 'p2')).resolves.toBeUndefined();
  });

  it('rejects if target is member (not officer)', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'member', player: { username: 'X' } });

    await expect(demoteMember('leader1', 'p2')).rejects.toThrow('Can only demote officers');
  });
});

// ---------------------------------------------------------------------------
// transferLeadership
// ---------------------------------------------------------------------------

describe('transferLeadership', () => {
  it('transfers leadership (old leader becomes officer)', async () => {
    mockPrisma.guildMember.findUnique
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' } })
      .mockResolvedValueOnce({ guildId: 'g1', playerId: 'p2', role: 'officer', player: { username: 'NewLeader' } });
    mockPrisma.guildMember.update.mockResolvedValue({});
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});

    await expect(transferLeadership('leader1', 'p2')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// disbandGuild
// ---------------------------------------------------------------------------

describe('disbandGuild', () => {
  it('deletes the guild', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' },
    });
    mockPrisma.guildMember.findMany.mockResolvedValue([{ playerId: 'leader1' }]);
    mockPrisma.guild.delete.mockResolvedValue({});

    await expect(disbandGuild('leader1', 'g1')).resolves.toBeUndefined();
  });

  it('rejects if not leader', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'p1', role: 'member', guild: { id: 'g1' },
    });

    await expect(disbandGuild('p1', 'g1')).rejects.toThrow('Only the leader');
  });

  it('rejects if guild ID does not match', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'leader1', role: 'leader', guild: { id: 'g1' },
    });

    await expect(disbandGuild('leader1', 'g999')).rejects.toThrow('Not your guild');
  });
});

// ---------------------------------------------------------------------------
// updateSettings
// ---------------------------------------------------------------------------

describe('updateSettings', () => {
  it('updates guild settings', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });
    mockPrisma.guild.update.mockResolvedValue({
      id: 'g1', name: 'TestGuild', tag: 'TG', description: 'New desc',
      leaderId: 'leader1', level: 1, xp: 0n, recruitmentMode: 'open',
      minLevelRequirement: 0, taxRate: 10, specialization: null,
      renown: 0, seasonalRenown: 0, treasuryTurns: 0,
      createdAt: new Date(), _count: { members: 5 },
    });

    const result = await updateSettings('officer1', 'g1', { taxRate: 10, recruitmentMode: 'open' });
    expect(result.taxRate).toBe(10);
    expect(result.recruitmentMode).toBe('open');
  });

  it('rejects if tax rate too high', async () => {
    mockPrisma.guildMember.findUnique.mockResolvedValue({
      guildId: 'g1', playerId: 'officer1', role: 'officer', guild: { id: 'g1' },
    });

    await expect(updateSettings('officer1', 'g1', { taxRate: 50 }))
      .rejects.toThrow(`Tax rate must be 0-${GUILD_CONSTANTS.MAX_TAX_RATE}%`);
  });
});

// ---------------------------------------------------------------------------
// getGuildLog
// ---------------------------------------------------------------------------

describe('getGuildLog', () => {
  it('returns paginated log entries', async () => {
    mockPrisma.guildLog.findMany.mockResolvedValue([
      { id: 'l1', eventType: 'guild_created', message: 'Guild was created', metadata: null, createdAt: new Date() },
    ]);
    mockPrisma.guildLog.count.mockResolvedValue(1);

    const result = await getGuildLog('g1');
    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// addGuildXp
// ---------------------------------------------------------------------------

describe('addGuildXp', () => {
  it('adds XP without leveling up', async () => {
    mockPrisma.guild.findUnique.mockResolvedValue({ level: 1, xp: 0n });
    mockPrisma.guild.update.mockResolvedValue({});

    const result = await addGuildXp('g1', 10);
    expect(result.xp).toBe(10n);
    expect(result.leveledUp).toBe(false);
  });

  it('levels up when XP exceeds threshold', async () => {
    const xpForLevel1 = calculateXpForLevel(1);
    mockPrisma.guild.findUnique.mockResolvedValue({ level: 1, xp: BigInt(xpForLevel1 - 1) });
    mockPrisma.guild.update.mockResolvedValue({});
    mockPrisma.guildLog.create.mockResolvedValue({});

    const result = await addGuildXp('g1', 1);
    expect(result.level).toBe(2);
    expect(result.leveledUp).toBe(true);
  });
});
