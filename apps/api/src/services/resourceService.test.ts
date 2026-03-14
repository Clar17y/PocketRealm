import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({
    attack: 0, rangedPower: 0, magicPower: 0, accuracy: 0,
    armor: 0, magicDefence: 0, health: 0, dodge: 0, luck: 0,
    critChance: 0, critDamage: 0,
  }),
  isSkillType: vi.fn(),
}));
vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({
    previousTurns: 1000, spent: 10, currentTurns: 990,
    lastRegenAt: new Date().toISOString(), timeToCapMs: 1000,
  }),
}));
vi.mock('./guildTaxService', () => ({
  getPlayerTaxRateTx: vi.fn().mockResolvedValue({ taxRate: 0, guildId: null }),
  applyGuildTaxTx: vi.fn().mockResolvedValue({
    preTaxAmount: 0, taxAmount: 0, postTaxAmount: 0, taxRatePercent: 0, guildId: null,
  }),
  calculateInflatedCost: vi.fn((cost: number, _rate: number) => cost),
  calculateEffectiveTurns: vi.fn((turns: number, _rate: number) => turns),
}));

import { mockPrisma } from '../__test__/setup';
import {
  getResourceState,
  restStamina,
  restMana,
  setStamina,
  setMana,
  setAllResources,
} from './resourceService';
import { getPlayerTaxRateTx, applyGuildTaxTx } from './guildTaxService';

const now = new Date('2025-06-01T12:00:00Z');

// Default skill levels: all at 1 → avgPhysical=1, magic=1
// maxStamina = 100 + 1*3 + 0 = 103
// maxMana = 50 + 1*3 + 0 = 53
const DEFAULT_STAMINA = 80;
const DEFAULT_MANA = 30;

function setupDefaultMocks() {
  mockPrisma.player.findUnique.mockResolvedValue({
    currentStamina: DEFAULT_STAMINA,
    lastStaminaRegenAt: now,
    currentMana: DEFAULT_MANA,
    lastManaRegenAt: now,
  });
  mockPrisma.playerSkill.findMany.mockResolvedValue([
    { skillType: 'melee', level: 1 },
    { skillType: 'ranged', level: 1 },
    { skillType: 'magic', level: 1 },
    { skillType: 'evasion', level: 1 },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ---------------------------------------------------------------------------
// getResourceState
// ---------------------------------------------------------------------------

describe('getResourceState', () => {
  it('returns stamina and mana with lazy regen applied', async () => {
    const result = await getResourceState('p1', now);

    // maxStamina = BASE_POOL(100) + avgLevel(1) * PER_LEVEL(3) = 103
    expect(result.stamina.current).toBe(80);
    expect(result.stamina.max).toBe(103);
    // regenPerSecond = 1.0 + avg(1,1,1)*0.02 = 1.02
    expect(result.stamina.regenPerSecond).toBeCloseTo(1.02);
    expect(result.stamina.regenPerRound).toBeGreaterThan(0);

    // maxMana = BASE_POOL(50) + magicLevel(1) * PER_LEVEL(3) = 53
    expect(result.mana.current).toBe(30);
    expect(result.mana.max).toBe(53);
    // regenPerSecond = 0.5 + 1*0.015 = 0.515
    expect(result.mana.regenPerSecond).toBeCloseTo(0.515);
    expect(result.mana.regenPerRound).toBeGreaterThan(0);
  });

  it('applies passive regen from elapsed time', async () => {
    // 10 seconds ago → stamina regens 10*1.0=10, mana regens 10*0.5=5
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    mockPrisma.player.findUnique.mockResolvedValue({
      currentStamina: 80,
      lastStaminaRegenAt: tenSecondsAgo,
      currentMana: 30,
      lastManaRegenAt: tenSecondsAgo,
    });

    const result = await getResourceState('p1', now);
    expect(result.stamina.current).toBe(90); // 80 + 10
    expect(result.mana.current).toBe(35); // 30 + 5
  });

  it('caps regen at max values', async () => {
    // 200 seconds → stamina regens 200, mana regens 100 — both capped
    const longAgo = new Date(now.getTime() - 200_000);
    mockPrisma.player.findUnique.mockResolvedValue({
      currentStamina: 80,
      lastStaminaRegenAt: longAgo,
      currentMana: 30,
      lastManaRegenAt: longAgo,
    });

    const result = await getResourceState('p1', now);
    expect(result.stamina.current).toBe(103); // capped at max
    expect(result.mana.current).toBe(53); // capped at max
  });

  it('throws 404 when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(getResourceState('missing', now)).rejects.toThrow('Player not found');
  });
});

// ---------------------------------------------------------------------------
// restStamina
// ---------------------------------------------------------------------------

describe('restStamina', () => {
  it('throws for non-positive turns', async () => {
    await expect(restStamina('p1', 0, now)).rejects.toThrow('Turns must be a positive integer');
    await expect(restStamina('p1', -1, now)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws for non-integer turns', async () => {
    await expect(restStamina('p1', 1.5, now)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(restStamina('missing', 10, now)).rejects.toThrow('Player not found');
  });

  it('throws when stamina is already full', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      currentStamina: 103, // max for level 1 skills
      lastStaminaRegenAt: now,
      currentMana: 30,
      lastManaRegenAt: now,
    });

    await expect(restStamina('p1', 10, now)).rejects.toThrow('Stamina is already full');
  });

  it('restores stamina and returns result', async () => {
    // currentStamina = 80, max = 103, need = 23
    // REST_HEAL_PER_TURN = 5, turns = 100 → can heal 500, but only need 23
    // turnsUsed = ceil(23/5) = 5
    mockPrisma.player.update.mockResolvedValue({});

    const result = await restStamina('p1', 100, now);

    expect(result.previousValue).toBe(80);
    expect(result.healedAmount).toBe(23);
    expect(result.newValue).toBe(103);
    expect(result.max).toBe(103);
    expect(result.turnsUsed).toBe(5);
  });

  it('partially restores stamina when insufficient turns', async () => {
    // currentStamina = 80, max = 103, need = 23
    // healPerTurn = 5 + avg(1,1,1)*0.3 = 5.3
    // turnsToSpend = 2 → effectiveTurns = 2, heal = 2*5.3 = 10.6
    mockPrisma.player.update.mockResolvedValue({});

    const result = await restStamina('p1', 2, now);

    expect(result.healedAmount).toBeCloseTo(10.6);
    expect(result.newValue).toBeCloseTo(90.6);
    expect(result.turnsUsed).toBe(2);
  });

  it('handles guild tax by reducing effective turns', async () => {
    // 10% tax → effectiveTurns(100, 10) = 90, inflatedCost back
    vi.mocked(getPlayerTaxRateTx).mockResolvedValue({ taxRate: 10, guildId: 'g1' });
    vi.mocked(applyGuildTaxTx).mockResolvedValue({
      preTaxAmount: 6, taxAmount: 1, postTaxAmount: 5, taxRatePercent: 10, guildId: 'g1',
    });
    // calculateEffectiveTurns mock: with 10% tax, 100 turns → 90 effective
    const { calculateEffectiveTurns: mockEffective, calculateInflatedCost: mockInflated } = await import('./guildTaxService.js');
    vi.mocked(mockEffective).mockReturnValueOnce(90);
    vi.mocked(mockInflated).mockReturnValueOnce(6);

    mockPrisma.player.update.mockResolvedValue({});

    const result = await restStamina('p1', 100, now);

    expect(result.healedAmount).toBe(23); // still heals to full (90 effective >> 5 needed turns)
    expect(result.taxResult.guildId).toBe('g1');
  });
});

// ---------------------------------------------------------------------------
// restMana
// ---------------------------------------------------------------------------

describe('restMana', () => {
  it('throws for non-positive turns', async () => {
    await expect(restMana('p1', 0, now)).rejects.toThrow('Turns must be a positive integer');
    await expect(restMana('p1', -1, now)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(restMana('missing', 10, now)).rejects.toThrow('Player not found');
  });

  it('throws when mana is already full', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      currentStamina: 80,
      lastStaminaRegenAt: now,
      currentMana: 53, // max for magic level 1
      lastManaRegenAt: now,
    });

    await expect(restMana('p1', 10, now)).rejects.toThrow('Mana is already full');
  });

  it('restores mana and returns result', async () => {
    // currentMana = 30, max = 53, need = 23
    // REST_HEAL_PER_TURN = 3, turns = 100 → can heal 300, but only need 23
    // turnsUsed = ceil(23/3) = 8
    mockPrisma.player.update.mockResolvedValue({});

    const result = await restMana('p1', 100, now);

    expect(result.previousValue).toBe(30);
    expect(result.healedAmount).toBe(23);
    expect(result.newValue).toBe(53);
    expect(result.max).toBe(53);
    expect(result.turnsUsed).toBe(8);
  });

  it('partially restores mana when insufficient turns', async () => {
    // currentMana = 30, max = 53, need = 23
    // healPerTurn = 3 + 1*0.2 = 3.2
    // turnsToSpend = 2 → heal = 2*3.2 = 6.4
    mockPrisma.player.update.mockResolvedValue({});

    const result = await restMana('p1', 2, now);

    expect(result.healedAmount).toBeCloseTo(6.4);
    expect(result.newValue).toBeCloseTo(36.4);
    expect(result.turnsUsed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// setStamina / setMana
// ---------------------------------------------------------------------------

describe('setStamina', () => {
  it('updates player stamina', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setStamina('p1', 50, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStamina: 50, lastStaminaRegenAt: now }),
      }),
    );
  });

  it('clamps negative stamina to 0', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setStamina('p1', -10, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStamina: 0 }),
      }),
    );
  });

  it('floors fractional values', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setStamina('p1', 7.9, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStamina: 7 }),
      }),
    );
  });
});

describe('setMana', () => {
  it('updates player mana', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setMana('p1', 25, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentMana: 25, lastManaRegenAt: now }),
      }),
    );
  });

  it('clamps negative mana to 0', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setMana('p1', -5, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentMana: 0 }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// setAllResources
// ---------------------------------------------------------------------------

describe('setAllResources', () => {
  it('updates HP, stamina, and mana in one call', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setAllResources('p1', 75, 80, 40, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        currentHp: 75,
        lastHpRegenAt: now,
        currentStamina: 80,
        lastStaminaRegenAt: now,
        currentMana: 40,
        lastManaRegenAt: now,
      },
    });
  });

  it('clamps negative values to 0', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setAllResources('p1', -10, -5, -3, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentHp: 0,
          currentStamina: 0,
          currentMana: 0,
        }),
      }),
    );
  });

  it('floors fractional values', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setAllResources('p1', 10.7, 20.9, 5.1, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentHp: 10,
          currentStamina: 20,
          currentMana: 5,
        }),
      }),
    );
  });
});
