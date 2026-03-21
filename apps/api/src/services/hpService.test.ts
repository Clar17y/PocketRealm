import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({
    attack: 0, rangedPower: 0, magicPower: 0, accuracy: 0,
    armor: 0, magicDefence: 0, health: 0, dodge: 0, luck: 0,
    critChance: 0, critDamage: 0,
  }),
  isSkillType: vi.fn(),
}));
vi.mock('./resourceService', () => ({
  getResourceState: vi.fn().mockResolvedValue({
    stamina: { current: 50, max: 100, regenPerRound: 10, regenPerSecond: 1.0, restHealPerTurn: 5 },
    mana: { current: 25, max: 50, regenPerRound: 5, regenPerSecond: 0.5, restHealPerTurn: 3 },
    lastStaminaRegenAt: new Date(),
    lastManaRegenAt: new Date(),
  }),
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
  getHpState,
  rest,
  recover,
  setHp,
  enterRecoveringState,
} from './hpService';
import { getEquipmentStats } from './equipmentService';
import { spendPlayerTurnsTx } from './turnBankService';
import {
  getPlayerTaxRateTx,
  applyGuildTaxTx,
  calculateInflatedCost,
  calculateEffectiveTurns,
} from './guildTaxService';

const now = new Date('2025-06-01T12:00:00Z');

function defaultPlayerAttrs(overrides: Record<string, unknown> = {}) {
  return {
    vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0,
    ...overrides,
  };
}

function defaultPlayer(overrides: Record<string, unknown> = {}) {
  return {
    currentHp: 80,
    lastHpRegenAt: now,
    isRecovering: false,
    recoveryCost: null,
    attributes: defaultPlayerAttrs(),
    currentStamina: 50,
    lastStaminaRegenAt: now,
    currentMana: 25,
    lastManaRegenAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.player.findUnique.mockResolvedValue(defaultPlayer());
  mockPrisma.player.update.mockResolvedValue({});
  mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
});

// ─── getHpState ──────────────────────────────────────────────────────────────

describe('getHpState', () => {
  it('returns HP state for existing player with 0 vitality', async () => {
    const result = await getHpState('p1', now);
    // BASE_HP=100 + 0*5 + 0 equipment = 100
    expect(result.currentHp).toBe(80);
    expect(result.maxHp).toBe(100);
    expect(result.isRecovering).toBe(false);
    expect(result.recoveryCost).toBeNull();
    expect(result.lastHpRegenAt).toBe(now.toISOString());
  });

  it('throws 404 when player not found (first findUnique)', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);
    await expect(getHpState('missing', now)).rejects.toThrow('Player not found');
  });

  it('accounts for vitality in maxHp', async () => {
    // vitality=10 → maxHp = 100 + 10*5 + 0 = 150
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ currentHp: 120, lastHpRegenAt: now, isRecovering: false, recoveryCost: null })
      .mockResolvedValueOnce({ attributes: defaultPlayerAttrs({ vitality: 10 }) });

    const result = await getHpState('p1', now);
    expect(result.maxHp).toBe(150);
    expect(result.currentHp).toBe(120);
  });

  it('accounts for equipment health bonus in maxHp', async () => {
    // health bonus=20 → maxHp = 100 + 0 + 20 = 120
    vi.mocked(getEquipmentStats).mockResolvedValueOnce({
      attack: 0, rangedPower: 0, magicPower: 0, accuracy: 0,
      armor: 0, magicDefence: 0, health: 20, dodge: 0, luck: 0,
      critChance: 0, critDamage: 0, inventorySlots: 0,
    });

    const result = await getHpState('p1', now);
    expect(result.maxHp).toBe(120);
  });

  it('calculates regenPerSecond from vitality', async () => {
    // vitality=5 → regen = 0.4 + 5*0.04 = 0.6
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ currentHp: 80, lastHpRegenAt: now, isRecovering: false, recoveryCost: null })
      .mockResolvedValueOnce({ attributes: defaultPlayerAttrs({ vitality: 5 }) });

    const result = await getHpState('p1', now);
    expect(result.regenPerSecond).toBeCloseTo(0.6);
  });

  it('applies passive regen to currentHp over elapsed time', async () => {
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    // vitality=0 → regen=0.4/s → 10s → floor(4.0) = 4 HP regen
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ currentHp: 80, lastHpRegenAt: tenSecondsAgo, isRecovering: false, recoveryCost: null })
      .mockResolvedValueOnce({ attributes: defaultPlayerAttrs() });

    const result = await getHpState('p1', now);
    expect(result.currentHp).toBe(84); // 80 + 4
  });

  it('caps currentHp at maxHp after regen', async () => {
    const longAgo = new Date(now.getTime() - 1_000_000);
    // Lots of time elapsed, so regen would overshoot
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ currentHp: 95, lastHpRegenAt: longAgo, isRecovering: false, recoveryCost: null })
      .mockResolvedValueOnce({ attributes: defaultPlayerAttrs() });

    const result = await getHpState('p1', now);
    expect(result.currentHp).toBe(100); // capped at maxHp
  });

  it('does not apply passive regen while recovering', async () => {
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ currentHp: 0, lastHpRegenAt: tenSecondsAgo, isRecovering: true, recoveryCost: 100 })
      .mockResolvedValueOnce({ attributes: defaultPlayerAttrs() });

    const result = await getHpState('p1', now);
    expect(result.currentHp).toBe(0); // no regen while recovering
    expect(result.isRecovering).toBe(true);
    expect(result.recoveryCost).toBe(100);
  });

  it('combines vitality and equipment for maxHp', async () => {
    // vitality=10, equipment health=15 → maxHp = 100 + 50 + 15 = 165
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ currentHp: 100, lastHpRegenAt: now, isRecovering: false, recoveryCost: null })
      .mockResolvedValueOnce({ attributes: defaultPlayerAttrs({ vitality: 10 }) });
    vi.mocked(getEquipmentStats).mockResolvedValueOnce({
      attack: 0, rangedPower: 0, magicPower: 0, accuracy: 0,
      armor: 0, magicDefence: 0, health: 15, dodge: 0, luck: 0,
      critChance: 0, critDamage: 0, inventorySlots: 0,
    });

    const result = await getHpState('p1', now);
    expect(result.maxHp).toBe(165);
  });

  it('throws when getVitalityLevel cannot find player', async () => {
    // First findUnique for hpService succeeds, second for getVitalityLevel fails
    mockPrisma.player.findUnique
      .mockResolvedValueOnce({ currentHp: 80, lastHpRegenAt: now, isRecovering: false, recoveryCost: null })
      .mockResolvedValueOnce(null);

    await expect(getHpState('p1', now)).rejects.toThrow('Player not found');
  });
});

// ─── rest ────────────────────────────────────────────────────────────────────

describe('rest', () => {
  it('throws INVALID_TURNS for 0 turns', async () => {
    await expect(rest('p1', 0, now)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws INVALID_TURNS for negative turns', async () => {
    await expect(rest('p1', -5, now)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws INVALID_TURNS for fractional turns', async () => {
    await expect(rest('p1', 1.5, now)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws NOT_FOUND when player missing', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);
    await expect(rest('missing', 10, now)).rejects.toThrow('Player not found');
  });

  it('throws IS_RECOVERING when player is recovering', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: 100 })
    );
    await expect(rest('p1', 10, now)).rejects.toThrow('Cannot rest while recovering');
  });

  it('throws FULLY_RESTED when HP, stamina, and mana are all full', async () => {
    const { getResourceState } = await import('./resourceService.js');
    vi.mocked(getResourceState).mockResolvedValueOnce({
      stamina: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1.0, restHealPerTurn: 5 },
      mana: { current: 50, max: 50, regenPerRound: 5, regenPerSecond: 0.5, restHealPerTurn: 3 },
      lastStaminaRegenAt: now,
      lastManaRegenAt: now,
    });
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ currentHp: 100 })
    );
    await expect(rest('p1', 10, now)).rejects.toThrow('Already fully rested');
  });

  it('allows rest when HP is full but stamina is not', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ currentHp: 100 })
    );
    // Default mock has stamina at 50/100 and mana at 25/50
    const result = await rest('p1', 10, now);
    expect(result.healedAmount).toBe(0); // No HP healing needed
    expect(result.currentHp).toBe(100);
  });

  it('heals player and returns correct result', async () => {
    // currentHp=80, maxHp=100, healPerTurn=2 (vitality 0), 100 turns
    // hpNeeded=20, maxHealAmount=200, healedAmount=20, turnsUsed=ceil(20/2)=10
    const result = await rest('p1', 100, now);
    expect(result.previousHp).toBe(80);
    expect(result.healedAmount).toBe(20);
    expect(result.currentHp).toBe(100);
    expect(result.maxHp).toBe(100);
  });

  it('partially heals when not enough turns to fully heal', async () => {
    // currentHp=80, healPerTurn=2, 5 turns → maxHealAmount=10, hpNeeded=20 → heals 10
    const result = await rest('p1', 5, now);
    expect(result.previousHp).toBe(80);
    expect(result.healedAmount).toBe(10);
    expect(result.currentHp).toBe(90);
  });

  it('calls getPlayerTaxRateTx inside transaction', async () => {
    await rest('p1', 10, now);
    expect(getPlayerTaxRateTx).toHaveBeenCalledWith(expect.anything(), 'p1');
  });

  it('calls calculateEffectiveTurns with turns and tax rate', async () => {
    await rest('p1', 50, now);
    expect(calculateEffectiveTurns).toHaveBeenCalledWith(50, 0);
  });

  it('calls calculateInflatedCost with turnsUsed and tax rate', async () => {
    await rest('p1', 100, now);
    // turnsUsed = ceil(20 / 2) = 10 (healing 20 HP from 80 to 100 at 2 hp/turn)
    expect(calculateInflatedCost).toHaveBeenCalledWith(10, 0);
  });

  it('calls spendPlayerTurnsTx with inflated cost', async () => {
    await rest('p1', 100, now);
    // inflated cost of 10 (no tax)
    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(expect.anything(), 'p1', 10, now);
  });

  it('calls applyGuildTaxTx with inflated cost', async () => {
    await rest('p1', 100, now);
    expect(applyGuildTaxTx).toHaveBeenCalledWith(expect.anything(), 'p1', 10);
  });

  it('returns turnsSpent from taxResult.preTaxAmount', async () => {
    vi.mocked(applyGuildTaxTx).mockResolvedValueOnce({
      preTaxAmount: 12, taxAmount: 2, postTaxAmount: 10, taxRatePercent: 10, guildId: 'g1',
    });
    const result = await rest('p1', 100, now);
    expect(result.turnsSpent).toBe(12);
    expect(result.taxResult.taxAmount).toBe(2);
    expect(result.taxResult.guildId).toBe('g1');
  });

  it('applies guild tax to reduce effective turns', async () => {
    // With 10% tax: effectiveTurns = floor(100*0.9) = 90
    vi.mocked(getPlayerTaxRateTx).mockResolvedValueOnce({ taxRate: 10, guildId: 'g1' });
    vi.mocked(calculateEffectiveTurns).mockReturnValueOnce(90);
    // With 90 effective turns and healPerTurn=2: maxHealAmount=180, hpNeeded=20, heals 20, turnsUsed=10
    vi.mocked(calculateInflatedCost).mockReturnValueOnce(12); // inflated 10 → 12
    vi.mocked(applyGuildTaxTx).mockResolvedValueOnce({
      preTaxAmount: 12, taxAmount: 2, postTaxAmount: 10, taxRatePercent: 10, guildId: 'g1',
    });

    const result = await rest('p1', 100, now);
    expect(result.healedAmount).toBe(20);
    expect(calculateInflatedCost).toHaveBeenCalledWith(10, 10);
    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(expect.anything(), 'p1', 12, now);
  });

  it('uses updateMany with optimistic lock conditions and updates all resources', async () => {
    // Default mock: stamina 50/100 at 5/turn, mana 25/50 at 3/turn, HP 80/100 at 2/turn
    // With 100 effective turns: stamina→100, mana→50, HP→100
    await rest('p1', 100, now);

    expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'p1',
        currentHp: 80,
        lastHpRegenAt: now,
        isRecovering: false,
        currentStamina: 50,
        lastStaminaRegenAt: now,
        currentMana: 25,
        lastManaRegenAt: now,
      },
      data: {
        currentHp: 100,
        lastHpRegenAt: now,
        currentStamina: 100,
        lastStaminaRegenAt: now,
        currentMana: 50,
        lastManaRegenAt: now,
      },
    });
  });

  it('throws HP_STATE_CHANGED when optimistic lock fails', async () => {
    mockPrisma.player.updateMany.mockResolvedValue({ count: 0 });
    await expect(rest('p1', 100, now)).rejects.toThrow('HP state changed; try again');
  });

  it('heals with high vitality', async () => {
    // vitality=10 → healPerTurn=2 + 10*0.2=4, maxHp=150
    // currentHp=80, hpNeeded=70, 20 turns → maxHealAmount=80 → heals 70
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ currentHp: 80, attributes: defaultPlayerAttrs({ vitality: 10 }) })
    );

    const result = await rest('p1', 20, now);
    expect(result.maxHp).toBe(150);
    expect(result.healedAmount).toBe(70);
    expect(result.currentHp).toBe(150);
  });

  it('accounts for passive regen before computing heal needed', async () => {
    // 10 seconds of passive regen (0.4/s → +4 HP), so currentHp = 80+4 = 84
    // hpNeeded = 100 - 84 = 16, healPerTurn=2, 100 turns → heals 16
    const tenSecondsAgo = new Date(now.getTime() - 10_000);
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ currentHp: 80, lastHpRegenAt: tenSecondsAgo })
    );

    const result = await rest('p1', 100, now);
    expect(result.previousHp).toBe(84);
    expect(result.healedAmount).toBe(16);
    expect(result.currentHp).toBe(100);
  });
});

// ─── recover ─────────────────────────────────────────────────────────────────

describe('recover', () => {
  it('throws NOT_FOUND when player missing', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);
    await expect(recover('missing', now)).rejects.toThrow('Player not found');
  });

  it('throws NOT_RECOVERING when not in recovering state', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: false })
    );
    await expect(recover('p1', now)).rejects.toThrow('Not in recovering state');
  });

  it('recovers player with expected exit HP and cost', async () => {
    // maxHp=100, recoveryCost=100 → exitHp=floor(100*0.25)=25
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: 100 })
    );

    const result = await recover('p1', now);
    expect(result.previousState).toBe('recovering');
    expect(result.currentHp).toBe(25);
    expect(result.maxHp).toBe(100);
    expect(result.turnsSpent).toBe(100);
  });

  it('defaults null recoveryCost to 0', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: null })
    );

    const result = await recover('p1', now);
    expect(result.turnsSpent).toBe(0);
    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(expect.anything(), 'p1', 0, now);
  });

  it('spends turns via spendPlayerTurnsTx', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: 50 })
    );

    await recover('p1', now);
    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(expect.anything(), 'p1', 50, now);
  });

  it('uses updateMany with optimistic lock conditions', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: 100 })
    );

    await recover('p1', now);
    expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'p1',
        isRecovering: true,
        recoveryCost: 100,
      },
      data: {
        currentHp: 25,
        lastHpRegenAt: now,
        isRecovering: false,
        recoveryCost: null,
      },
    });
  });

  it('throws RECOVERY_STATE_CHANGED when optimistic lock fails', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: 100 })
    );
    mockPrisma.player.updateMany.mockResolvedValue({ count: 0 });

    await expect(recover('p1', now)).rejects.toThrow('Recovery state changed; try again');
  });

  it('calculates exit HP from vitality-boosted maxHp', async () => {
    // vitality=20 → maxHp = 100 + 20*5 = 200 → exitHp = floor(200*0.25) = 50
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: 200, attributes: defaultPlayerAttrs({ vitality: 20 }) })
    );

    const result = await recover('p1', now);
    expect(result.maxHp).toBe(200);
    expect(result.currentHp).toBe(50);
  });

  it('calculates exit HP with equipment health bonus', async () => {
    // health bonus=50 → maxHp = 100 + 0 + 50 = 150 → exitHp = floor(150*0.25) = 37
    mockPrisma.player.findUnique.mockResolvedValue(
      defaultPlayer({ isRecovering: true, recoveryCost: 150 })
    );
    vi.mocked(getEquipmentStats).mockResolvedValueOnce({
      attack: 0, rangedPower: 0, magicPower: 0, accuracy: 0,
      armor: 0, magicDefence: 0, health: 50, dodge: 0, luck: 0,
      critChance: 0, critDamage: 0, inventorySlots: 0,
    });

    const result = await recover('p1', now);
    expect(result.maxHp).toBe(150);
    expect(result.currentHp).toBe(37);
  });
});

// ─── setHp ───────────────────────────────────────────────────────────────────

describe('setHp', () => {
  it('sets HP to the specified value', async () => {
    await setHp('p1', 50, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentHp: 50, lastHpRegenAt: now },
    });
  });

  it('clamps negative HP to 0', async () => {
    await setHp('p1', -10, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentHp: 0, lastHpRegenAt: now },
    });
  });

  it('sets HP to 0 when given 0', async () => {
    await setHp('p1', 0, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentHp: 0, lastHpRegenAt: now },
    });
  });

  it('allows large HP values', async () => {
    await setHp('p1', 99999, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentHp: 99999, lastHpRegenAt: now },
    });
  });

  it('updates lastHpRegenAt to provided date', async () => {
    const customDate = new Date('2025-12-31T23:59:59Z');
    await setHp('p1', 50, customDate);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentHp: 50, lastHpRegenAt: customDate },
    });
  });

  it('clamps large negative HP to 0', async () => {
    await setHp('p1', -99999, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentHp: 0, lastHpRegenAt: now },
    });
  });
});

// ─── enterRecoveringState ────────────────────────────────────────────────────

describe('enterRecoveringState', () => {
  it('sets player to recovering with recovery cost based on maxHp', async () => {
    // RECOVERY_TURNS_PER_MAX_HP=1 → recoveryCost = 100*1 = 100
    await enterRecoveringState('p1', 100, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        currentHp: 0,
        lastHpRegenAt: now,
        isRecovering: true,
        recoveryCost: 100,
      },
    });
  });

  it('scales recovery cost with large maxHp', async () => {
    // maxHp=500 → recoveryCost = 500*1 = 500
    await enterRecoveringState('p1', 500, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        currentHp: 0,
        lastHpRegenAt: now,
        isRecovering: true,
        recoveryCost: 500,
      },
    });
  });

  it('handles 0 maxHp', async () => {
    await enterRecoveringState('p1', 0, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        currentHp: 0,
        lastHpRegenAt: now,
        isRecovering: true,
        recoveryCost: 0,
      },
    });
  });

  it('sets currentHp to 0 regardless of input', async () => {
    await enterRecoveringState('p1', 200, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentHp: 0 }),
      })
    );
  });

  it('uses provided date for lastHpRegenAt', async () => {
    const customDate = new Date('2025-07-04T00:00:00Z');
    await enterRecoveringState('p1', 100, customDate);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastHpRegenAt: customDate }),
      })
    );
  });
});
