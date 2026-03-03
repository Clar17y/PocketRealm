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

vi.mock('./combatTemplateService', () => ({
  getActiveTemplate: vi.fn().mockResolvedValue([{ actionId: 'basic_attack' }]),
}));

vi.mock('./resourceService', () => ({
  getResourceState: vi.fn().mockResolvedValue({
    stamina: { current: 100, max: 100, regenPerRound: 5, regenPerSecond: 0.1 },
    mana: { current: 50, max: 50, regenPerRound: 3, regenPerSecond: 0.05 },
  }),
}));

vi.mock('./skillPointService', () => ({
  getSkillPoints: vi.fn().mockResolvedValue({
    playerId: 'p1',
    totalPointsEarned: 0,
    totalPointsSpent: 0,
    availablePoints: 0,
    allocations: {},
    unlockedActions: [],
  }),
}));

vi.mock('./combatOrchestrationService', () => ({
  buildPlayerTemplateCombatant: vi.fn().mockReturnValue({
    id: 'p1',
    name: 'TestPlayer',
    stats: { maxHp: 100, hp: 80, attack: 15, accuracy: 10, defence: 5, magicDefence: 0, speed: 5, critChance: 0.05, critDamage: 1.5, damageMin: 10, damageMax: 20 },
    template: [{ actionId: 'basic_attack' }],
    stamina: 100,
    maxStamina: 100,
    staminaRegenPerRound: 5,
    mana: 50,
    maxMana: 50,
    manaRegenPerRound: 3,
    actionDefinitions: {},
  }),
}));

vi.mock('./combatLogMapper', () => ({
  mapTemplateCombatLog: vi.fn().mockImplementation((log: unknown[]) => log),
}));

vi.mock('@adventure/game-engine', () => ({
  runTemplateCombat: vi.fn().mockReturnValue({
    outcome: 'victory',
    log: [],
    combatantAMaxHp: 100,
    combatantBMaxHp: 50,
    combatantAHpRemaining: 60,
    combatantBHpRemaining: 0,
    combatantAStaminaRemaining: 80,
    combatantBStaminaRemaining: 0,
    combatantAManaRemaining: 40,
    combatantBManaRemaining: 0,
    potionsConsumed: [],
    totalRounds: 5,
  }),
  buildPlayerCombatStats: vi.fn().mockReturnValue({
    maxHp: 100, hp: 80, attack: 15, accuracy: 10,
    defence: 5, magicDefence: 0, speed: 5, critChance: 0.05,
    critDamage: 1.5, damageMin: 10, damageMax: 20,
  }),
  mobToTemplateCombatant: vi.fn().mockReturnValue({
    id: 'mob-1',
    name: 'Goblin',
    stats: { maxHp: 50, hp: 50, attack: 8, accuracy: 8, defence: 3, magicDefence: 0, speed: 3, critChance: 0.02, critDamage: 1.3, damageMin: 5, damageMax: 10 },
    template: [{ actionId: 'mob_attack' }],
    stamina: Infinity,
    maxStamina: Infinity,
    staminaRegenPerRound: 0,
    mana: Infinity,
    maxMana: Infinity,
    manaRegenPerRound: 0,
    actionDefinitions: {},
  }),
  applyMobPrefix: vi.fn().mockImplementation((mob: unknown) => mob),
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

    // Player exists
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'p1',
      username: 'TestPlayer',
    });

    // No prefix by default
    mockPrisma.playerBestiaryPrefix.findUnique.mockResolvedValue(null);
  });

  it('runs combat and sets cooldown on success', async () => {
    const result = await simulateFight('p1', 'mob-1', null);

    expect(result.combat.outcome).toBe('victory');
    expect(result.combat.combatantAStaminaRemaining).toBe(80);
    expect(result.combat.combatantAManaRemaining).toBe(40);
    expect(result.combat.totalRounds).toBe(5);
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

  it('maps combat log through mapTemplateCombatLog', async () => {
    const { mapTemplateCombatLog } = await import('./combatLogMapper.js');

    await simulateFight('p1', 'mob-1', null);

    expect(mapTemplateCombatLog).toHaveBeenCalled();
  });

  it('calls buildPlayerTemplateCombatant with correct params', async () => {
    const { buildPlayerTemplateCombatant } = await import('./combatOrchestrationService.js');

    await simulateFight('p1', 'mob-1', null);

    expect(buildPlayerTemplateCombatant).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'p1',
        username: 'TestPlayer',
      }),
    );
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
