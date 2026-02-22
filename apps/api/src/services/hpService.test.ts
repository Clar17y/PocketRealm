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

import { mockPrisma } from '../__test__/setup';
import {
  getHpState,
  rest,
  recover,
  setHp,
  enterRecoveringState,
} from './hpService';
const now = new Date('2025-06-01T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  // Default: player with attributes
  mockPrisma.player.findUnique.mockResolvedValue({
    currentHp: 80,
    lastHpRegenAt: now,
    isRecovering: false,
    recoveryCost: null,
    attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
  });
});

describe('getHpState', () => {
  it('returns HP state for existing player', async () => {
    const result = await getHpState('p1', now);
    expect(result.currentHp).toBe(80);
    expect(result.maxHp).toBe(100); // BASE_HP + 0*HP_PER_VITALITY + 0 equipment
    expect(result.isRecovering).toBe(false);
  });

  it('throws 404 when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(getHpState('missing', now)).rejects.toThrow('Player not found');
  });
});

describe('rest', () => {
  it('throws for non-positive turns', async () => {
    await expect(rest('p1', 0, now)).rejects.toThrow('Turns must be a positive integer');
    await expect(rest('p1', -1, now)).rejects.toThrow('Turns must be a positive integer');
  });

  it('throws when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(rest('missing', 10, now)).rejects.toThrow('Player not found');
  });

  it('throws when recovering', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      currentHp: 0,
      lastHpRegenAt: now,
      isRecovering: true,
      recoveryCost: 100,
      attributes: { vitality: 0 },
    });

    await expect(rest('p1', 10, now)).rejects.toThrow('Cannot rest while recovering');
  });

  it('throws when already at full HP', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      currentHp: 100,
      lastHpRegenAt: now,
      isRecovering: false,
      recoveryCost: null,
      attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
    });

    await expect(rest('p1', 10, now)).rejects.toThrow('Already at full HP');
  });

  it('returns rest result with healed amount', async () => {
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });

    const result = await rest('p1', 100, now);
    expect(result.previousHp).toBe(80);
    expect(result.currentHp).toBe(100); // healed to full
    expect(result.healedAmount).toBe(20);
    expect(result.maxHp).toBe(100);
  });
});

describe('recover', () => {
  it('throws when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(recover('missing', now)).rejects.toThrow('Player not found');
  });

  it('throws when not in recovering state', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      isRecovering: false,
      recoveryCost: null,
      attributes: { vitality: 0 },
    });

    await expect(recover('p1', now)).rejects.toThrow('Not in recovering state');
  });

  it('recovers player and returns exit HP', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      isRecovering: true,
      recoveryCost: 100,
      attributes: { vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
    });
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });

    const result = await recover('p1', now);
    expect(result.previousState).toBe('recovering');
    expect(result.currentHp).toBe(25); // floor(100 * 0.25)
    expect(result.turnsSpent).toBe(100);
  });
});

describe('setHp', () => {
  it('updates player HP', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setHp('p1', 50, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentHp: 50 }),
      })
    );
  });

  it('clamps negative HP to 0', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await setHp('p1', -10, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentHp: 0 }),
      })
    );
  });
});

describe('enterRecoveringState', () => {
  it('sets player to recovering with calculated cost', async () => {
    mockPrisma.player.update.mockResolvedValue({});

    await enterRecoveringState('p1', 100, now);
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentHp: 0,
          isRecovering: true,
          recoveryCost: 100, // maxHp * 1
        }),
      })
    );
  });
});
