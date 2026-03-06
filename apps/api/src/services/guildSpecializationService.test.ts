import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUILD_CONSTANTS } from '@pocketrealm/shared';
import { mockPrisma as db } from '../__test__/setup';

import {
  selectSpecialization,
  respecSpecialization,
  getSpecializationStatus,
} from './guildSpecializationService';

const GUILD_ID = 'guild-1';
const PLAYER_ID = 'player-1';

function makeMember(role: string, guild: Record<string, unknown> = {}) {
  return {
    guildId: GUILD_ID,
    playerId: PLAYER_ID,
    role,
    guild: { id: GUILD_ID, ...guild },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('selectSpecialization', () => {
  it('sets specialization when guild is level 10+ and has none', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader', { level: 12, specialization: null }),
    );
    db.guild.update.mockResolvedValue({
      id: GUILD_ID, specialization: 'warfare',
    });
    db.guildLog.create.mockResolvedValue({});

    const result = await selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare');
    expect(result.specialization).toBe('warfare');
  });

  it('throws if player is not leader', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('officer'),
    );

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow('Only the leader');
  });

  it('throws if guild level is below 10', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader', { level: 5, specialization: null }),
    );

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow(`level ${GUILD_CONSTANTS.SPECIALIZATION_UNLOCK_LEVEL}`);
  });

  it('throws if guild already has a specialization', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader', { level: 15, specialization: 'industry' }),
    );

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow('already has a specialization');
  });

  it('throws for invalid specialization path', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader'),
    );

    await expect(selectSpecialization(PLAYER_ID, GUILD_ID, 'invalid' as any))
      .rejects.toThrow('Invalid specialization');
  });
});

describe('respecSpecialization', () => {
  it('changes specialization when treasury is sufficient', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader', { level: 20, specialization: 'warfare', treasuryTurns: 2_500_000 }),
    );
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.guild.update.mockResolvedValue({
      id: GUILD_ID, specialization: 'discovery',
    });
    db.guildLog.create.mockResolvedValue({});

    const result = await respecSpecialization(PLAYER_ID, GUILD_ID, 'discovery');
    expect(result.specialization).toBe('discovery');
  });

  it('throws if treasury is insufficient for respec', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader', { level: 20, specialization: 'warfare', treasuryTurns: 100_000 }),
    );

    await expect(respecSpecialization(PLAYER_ID, GUILD_ID, 'discovery'))
      .rejects.toThrow('Insufficient treasury');
  });

  it('throws if trying to respec to same path', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader', { level: 20, specialization: 'warfare', treasuryTurns: 3_000_000 }),
    );

    await expect(respecSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow('same specialization');
  });

  it('throws if no specialization to respec from', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('leader', { level: 20, specialization: null, treasuryTurns: 3_000_000 }),
    );

    await expect(respecSpecialization(PLAYER_ID, GUILD_ID, 'warfare'))
      .rejects.toThrow('no specialization');
  });

  it('throws if player is not leader', async () => {
    db.guildMember.findUnique.mockResolvedValue(
      makeMember('officer'),
    );

    await expect(respecSpecialization(PLAYER_ID, GUILD_ID, 'discovery'))
      .rejects.toThrow('Only the leader');
  });
});

describe('getSpecializationStatus', () => {
  it('returns current spec with active tier bonuses', async () => {
    db.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 25, specialization: 'industry',
    });

    const result = await getSpecializationStatus(GUILD_ID);
    expect(result!.path).toBe('industry');
    expect(result!.activeTier).toBe(2);
    expect(result!.bonuses).toHaveLength(3); // crit, yield, repair at tier 2
  });

  it('returns null when no specialization selected', async () => {
    db.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 8, specialization: null,
    });

    const result = await getSpecializationStatus(GUILD_ID);
    expect(result).toBeNull();
  });

  it('returns tier 1 bonuses at level 10', async () => {
    db.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 10, specialization: 'warfare',
    });

    const result = await getSpecializationStatus(GUILD_ID);
    expect(result!.activeTier).toBe(1);
    expect(result!.bonuses).toHaveLength(2); // xpBoost, combatDamage
  });

  it('returns tier 3 bonuses at level 40+', async () => {
    db.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 50, specialization: 'discovery',
    });

    const result = await getSpecializationStatus(GUILD_ID);
    expect(result!.activeTier).toBe(3);
    expect(result!.nextTier).toBeNull();
  });

  it('includes next tier info when not at max', async () => {
    db.guild.findUnique.mockResolvedValue({
      id: GUILD_ID, level: 15, specialization: 'industry',
    });

    const result = await getSpecializationStatus(GUILD_ID);
    expect(result!.activeTier).toBe(1);
    expect(result!.nextTier).not.toBeNull();
    expect(result!.nextTier!.tier).toBe(2);
    expect(result!.nextTier!.guildLevelGate).toBe(25);
  });
});
