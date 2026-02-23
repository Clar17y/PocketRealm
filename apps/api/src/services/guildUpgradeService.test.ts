import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma as db } from '../__test__/setup';
import { activateUpgrade, getActiveUpgrades, getAvailableUpgrades, getPlayerGuildModifiers } from './guildUpgradeService';
import { GUILD_CONSTANTS } from '@adventure/shared';

const GUILD_ID = 'guild-1';
const PLAYER_ID = 'player-1';
const NOW = new Date('2026-02-22T12:00:00Z');

function makeGuild(overrides: Record<string, unknown> = {}) {
  return { id: GUILD_ID, level: 10, treasuryTurns: 50_000, ...overrides };
}

function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    playerId: PLAYER_ID,
    guildId: GUILD_ID,
    role: 'officer',
    lastActiveAt: NOW,
    guild: makeGuild(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('activateUpgrade', () => {
  it('activates an upgrade successfully', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMembership());
    db.guild.findUnique.mockResolvedValue({ treasuryTurns: 50_000 });
    db.guildUpgrade.findFirst.mockResolvedValue(null);
    db.guild.update.mockResolvedValue(makeGuild({ treasuryTurns: 40_000 }));
    db.guildUpgrade.create.mockResolvedValue({
      id: 'upgrade-1',
      guildId: GUILD_ID,
      upgradeType: 'xp_boost',
      tier: 10,
      activatedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000),
      activatedBy: PLAYER_ID,
    });
    db.guildLog.create.mockResolvedValue({});

    const result = await activateUpgrade(PLAYER_ID, GUILD_ID, 'xp_boost', 10);
    expect(result.upgradeKey).toBe('xp_boost');
    expect(result.tier).toBe(10);
    expect(result.effectValue).toBe(0.10);
  });

  it('rejects if player is not officer+', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMembership({ role: 'member' }));
    await expect(activateUpgrade(PLAYER_ID, GUILD_ID, 'xp_boost', 10))
      .rejects.toThrow('Only officers and leaders can activate upgrades');
  });

  it('rejects if guild level too low for tier', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMembership({ guild: makeGuild({ level: 5 }) }),
    );
    await expect(activateUpgrade(PLAYER_ID, GUILD_ID, 'xp_boost', 10))
      .rejects.toThrow('Guild level 10 required for this tier');
  });

  it('rejects if insufficient treasury', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMembership({ guild: makeGuild({ treasuryTurns: 100 }) }),
    );
    await expect(activateUpgrade(PLAYER_ID, GUILD_ID, 'xp_boost', 10))
      .rejects.toThrow('Insufficient treasury funds');
  });

  it('rejects if same type already active', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMembership());
    db.guild.findUnique.mockResolvedValue({ treasuryTurns: 50_000 });
    db.guildUpgrade.findFirst.mockResolvedValue({
      id: 'existing',
      upgradeType: 'xp_boost',
      expiresAt: new Date(NOW.getTime() + 3600000),
    });

    await expect(activateUpgrade(PLAYER_ID, GUILD_ID, 'xp_boost', 10))
      .rejects.toThrow('An upgrade of this type is already active');
  });

  it('rejects unknown upgrade key', async () => {
    await expect(activateUpgrade(PLAYER_ID, GUILD_ID, 'bogus', 1))
      .rejects.toThrow('Unknown upgrade type');
  });

  it('rejects invalid tier', async () => {
    await expect(activateUpgrade(PLAYER_ID, GUILD_ID, 'xp_boost', 99))
      .rejects.toThrow('Invalid upgrade tier');
  });
});

describe('getActiveUpgrades', () => {
  it('returns only non-expired upgrades', async () => {
    db.guildUpgrade.findMany.mockResolvedValue([
      {
        id: 'u1',
        upgradeType: 'xp_boost',
        tier: 1,
        activatedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 3600000),
        activatedBy: PLAYER_ID,
      },
    ]);

    const result = await getActiveUpgrades(GUILD_ID);
    expect(result).toHaveLength(1);
    expect(result[0].upgradeKey).toBe('xp_boost');
  });
});

describe('getAvailableUpgrades', () => {
  it('returns all upgrade definitions with availability', async () => {
    db.guild.findUnique.mockResolvedValue(makeGuild());
    db.guildUpgrade.findMany.mockResolvedValue([]);

    const result = await getAvailableUpgrades(GUILD_ID);
    expect(result).toHaveLength(5); // 5 upgrade types
    expect(result[0].key).toBe('xp_boost');
    // Tier 1 and 10 should be available at guild level 10
    const xpBoost = result[0];
    expect(xpBoost.tiers[0].available).toBe(true);
    expect(xpBoost.tiers[1].available).toBe(true);
    expect(xpBoost.tiers[2].available).toBe(false); // Level 25 required
  });
});

describe('getPlayerGuildModifiers', () => {
  it('returns zero modifiers if player not in guild', async () => {
    db.guildMember.findUnique.mockResolvedValue(null);
    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.xpBoost).toBe(0);
    expect(mods.combatDamage).toBe(0);
  });

  it('returns zero modifiers if player inactive', async () => {
    const oldDate = new Date(NOW.getTime() - 72 * 60 * 60 * 1000); // 72h ago
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID,
      lastActiveAt: oldDate,
    });
    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.xpBoost).toBe(0);
  });

  it('returns scaled modifiers with active upgrades', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID,
      lastActiveAt: NOW,
    });
    db.guildUpgrade.findMany.mockResolvedValue([
      {
        id: 'u1',
        guildId: GUILD_ID,
        upgradeType: 'xp_boost',
        tier: 10,
        activatedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 3600000),
        activatedBy: PLAYER_ID,
      },
    ]);
    // 10+ active members → full scaling
    const members = Array.from({ length: 12 }, () => ({ lastActiveAt: NOW }));
    db.guildMember.findMany.mockResolvedValue(members);
    db.guildProject.findMany.mockResolvedValue([]);
    db.guild.findUnique.mockResolvedValue({ specialization: null, level: 5 });

    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.xpBoost).toBeCloseTo(0.10);
  });

  it('applies medium scaling with 5-9 active members', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID,
      lastActiveAt: NOW,
    });
    db.guildUpgrade.findMany.mockResolvedValue([
      {
        id: 'u1',
        guildId: GUILD_ID,
        upgradeType: 'warriors_might',
        tier: 1,
        activatedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 3600000),
        activatedBy: PLAYER_ID,
      },
    ]);
    const members = Array.from({ length: 7 }, () => ({ lastActiveAt: NOW }));
    db.guildMember.findMany.mockResolvedValue(members);
    db.guildProject.findMany.mockResolvedValue([]);
    db.guild.findUnique.mockResolvedValue({ specialization: null, level: 5 });

    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.combatDamage).toBeCloseTo(0.05 * GUILD_CONSTANTS.BOOST_SCALING_MEDIUM);
  });

  it('applies low scaling with <5 active members', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID,
      lastActiveAt: NOW,
    });
    db.guildUpgrade.findMany.mockResolvedValue([
      {
        id: 'u1',
        guildId: GUILD_ID,
        upgradeType: 'iron_skin',
        tier: 1,
        activatedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 3600000),
        activatedBy: PLAYER_ID,
      },
    ]);
    const members = Array.from({ length: 3 }, () => ({ lastActiveAt: NOW }));
    db.guildMember.findMany.mockResolvedValue(members);
    db.guildProject.findMany.mockResolvedValue([]);
    db.guild.findUnique.mockResolvedValue({ specialization: null, level: 5 });

    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.defenseBoost).toBeCloseTo(0.05 * GUILD_CONSTANTS.BOOST_SCALING_LOW);
  });

  it('includes project perks from completed projects', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, lastActiveAt: NOW,
    });
    db.guildUpgrade.findMany.mockResolvedValue([]);
    db.guildProject.findMany.mockResolvedValue([
      { projectKey: 'guild_forge' },
    ]);
    db.guild.findUnique.mockResolvedValue({
      specialization: null, level: 5,
    });

    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.craftingCrit).toBe(0.05);
  });

  it('higher-level project replaces lower-level perk', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, lastActiveAt: NOW,
    });
    db.guildUpgrade.findMany.mockResolvedValue([]);
    db.guildProject.findMany.mockResolvedValue([
      { projectKey: 'guild_forge' },
      { projectKey: 'advanced_forge' },
    ]);
    db.guild.findUnique.mockResolvedValue({
      specialization: null, level: 5,
    });

    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.craftingCrit).toBe(0.10);
  });

  it('includes specialization bonuses based on guild level', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, lastActiveAt: NOW,
    });
    db.guildUpgrade.findMany.mockResolvedValue([]);
    db.guildProject.findMany.mockResolvedValue([]);
    db.guild.findUnique.mockResolvedValue({
      specialization: 'industry', level: 25,
    });

    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.craftingCrit).toBe(0.10);
    expect(mods.gatheringYield).toBe(0.20);
    expect(mods.repairCostReduction).toBe(0.10);
  });

  it('stacks upgrade + project + specialization bonuses', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, lastActiveAt: NOW,
    });
    db.guildUpgrade.findMany.mockResolvedValue([
      { upgradeType: 'crafting_fortune', tier: 1, expiresAt: new Date(NOW.getTime() + 3600000) },
    ]);
    db.guildMember.findMany.mockResolvedValue(
      Array(10).fill({ lastActiveAt: NOW }),
    );
    db.guildProject.findMany.mockResolvedValue([
      { projectKey: 'guild_forge' },
    ]);
    db.guild.findUnique.mockResolvedValue({
      specialization: 'industry', level: 10,
    });

    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    // 0.05 (upgrade, full scale) + 0.05 (project) + 0.05 (spec) = 0.15
    expect(mods.craftingCrit).toBeCloseTo(0.15);
  });

  it('returns new modifier fields with zero defaults', async () => {
    db.guildMember.findUnique.mockResolvedValue(null);
    const mods = await getPlayerGuildModifiers(PLAYER_ID);
    expect(mods.travelCostReduction).toBe(0);
    expect(mods.repairCostReduction).toBe(0);
  });
});
