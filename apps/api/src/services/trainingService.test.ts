import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAINING_CONSTANTS } from '@adventure/shared';

vi.mock('./equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({
    attack: 10, rangedPower: 0, magicPower: 0, accuracy: 5,
    armor: 5, magicDefence: 0, health: 0, dodge: 0, luck: 0,
    critChance: 0, critDamage: 0,
  }),
}));

vi.mock('./attributesService', () => ({
  getPlayerProgressionState: vi.fn().mockResolvedValue({
    characterXp: 0,
    characterLevel: 1,
    attributePoints: 0,
    attributes: { vitality: 0, strength: 5, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
  }),
}));

vi.mock('./hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({
    currentHp: 80,
    maxHp: 100,
    regenPerSecond: 0.4,
    lastHpRegenAt: new Date().toISOString(),
    isRecovering: false,
    recoveryCost: null,
  }),
}));

vi.mock('./combatStatsService', () => ({
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
  getSkillLevel: vi.fn().mockResolvedValue(5),
}));

vi.mock('@adventure/game-engine', () => ({
  runCombat: vi.fn().mockReturnValue({
    outcome: 'victory',
    log: [],
    combatantAMaxHp: 100,
    combatantBMaxHp: 50,
    combatantAHpRemaining: 60,
    combatantBHpRemaining: 0,
    potionsConsumed: [],
  }),
  buildPlayerCombatStats: vi.fn().mockReturnValue({
    maxHp: 100, currentHp: 80, attack: 15, accuracy: 10,
    armor: 5, magicDefence: 0, speed: 5, critChance: 0.05,
    critDamage: 1.5,
  }),
  mobToCombatantStats: vi.fn().mockReturnValue({
    maxHp: 50, currentHp: 50, attack: 8, accuracy: 8,
    armor: 3, magicDefence: 0, speed: 3, critChance: 0.02,
    critDamage: 1.3,
  }),
  applyMobPrefix: vi.fn().mockImplementation((mob: any) => mob),
}));

vi.mock('../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ttl: vi.fn(),
  },
}));

import { mockPrisma } from '../__test__/setup';
import { redis } from '../redis';
import { getCooldownRemaining, simulateFight } from './trainingService';

const mockRedis = redis as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCooldownRemaining', () => {
  it('returns 0 when no cooldown active (TTL = -2)', async () => {
    mockRedis.ttl.mockResolvedValue(-2);

    const result = await getCooldownRemaining('p1');

    expect(result).toBe(0);
  });

  it('returns 0 when key exists but no expiry (TTL = -1)', async () => {
    mockRedis.ttl.mockResolvedValue(-1);

    const result = await getCooldownRemaining('p1');

    expect(result).toBe(0);
  });

  it('returns remaining TTL when cooldown is active', async () => {
    mockRedis.ttl.mockResolvedValue(45);

    const result = await getCooldownRemaining('p1');

    expect(result).toBe(45);
  });
});

describe('simulateFight', () => {
  const mobTemplate = {
    id: 'mob-1',
    name: 'Goblin',
    level: 3,
    maxHp: 50,
    attack: 8,
    accuracy: 8,
    armor: 3,
    magicDefence: 0,
    speed: 3,
    critChance: 0.02,
    critDamage: 1.3,
  };

  beforeEach(() => {
    // No cooldown by default
    mockRedis.ttl.mockResolvedValue(-2);
    mockRedis.set.mockResolvedValue('OK');

    // Mob exists in bestiary
    mockPrisma.playerBestiary.findUnique.mockResolvedValue({
      playerId: 'p1',
      mobTemplateId: 'mob-1',
    });

    // Mob template exists
    mockPrisma.mobTemplate.findUnique.mockResolvedValue(mobTemplate);

    // No prefix by default
    mockPrisma.playerBestiaryPrefix.findUnique.mockResolvedValue(null);
  });

  it('runs combat and sets cooldown on success', async () => {
    const result = await simulateFight('p1', 'mob-1', null);

    expect(result.combat.outcome).toBe('victory');
    expect(result.cooldownSeconds).toBe(TRAINING_CONSTANTS.COOLDOWN_SECONDS);
    // Verify cooldown was set in Redis
    expect(mockRedis.set).toHaveBeenCalledWith(
      'training:cooldown:p1',
      '1',
      'EX',
      TRAINING_CONSTANTS.COOLDOWN_SECONDS,
    );
  });

  it('runs combat with prefix when specified', async () => {
    mockPrisma.playerBestiaryPrefix.findUnique.mockResolvedValue({
      playerId: 'p1',
      mobTemplateId: 'mob-1',
      prefix: 'Fierce',
    });

    const { applyMobPrefix } = await import('@adventure/game-engine');

    const result = await simulateFight('p1', 'mob-1', 'Fierce');

    expect(result.combat).toBeDefined();
    expect(applyMobPrefix).toHaveBeenCalled();
  });

  it('throws when mob not in bestiary', async () => {
    mockPrisma.playerBestiary.findUnique.mockResolvedValue(null);

    await expect(simulateFight('p1', 'mob-1', null)).rejects.toThrow(
      'You have not encountered this mob'
    );
  });

  it('throws when prefix not in bestiary', async () => {
    // Mob itself is in bestiary (set in beforeEach), but prefix is not
    mockPrisma.playerBestiaryPrefix.findUnique.mockResolvedValue(null);

    await expect(simulateFight('p1', 'mob-1', 'Ancient')).rejects.toThrow(
      'You have not encountered this prefix variant'
    );
  });

  it('throws 429 when cooldown is active', async () => {
    mockRedis.ttl.mockResolvedValue(30);

    await expect(simulateFight('p1', 'mob-1', null)).rejects.toThrow(
      'Training cooldown: 30s remaining'
    );
  });

  it('throws 404 when mob template not found', async () => {
    mockPrisma.mobTemplate.findUnique.mockResolvedValue(null);

    await expect(simulateFight('p1', 'mob-1', null)).rejects.toThrow('Mob not found');
  });
});
