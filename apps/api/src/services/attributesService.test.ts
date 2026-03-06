import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLAYER_ATTRIBUTES } from '@pocketrealm/shared';

import { mockPrisma } from '../__test__/setup';
import {
  normalizePlayerAttributes,
  getPlayerProgressionState,
  allocateAttributePoints,
} from './attributesService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizePlayerAttributes', () => {
  it('returns defaults for null input', () => {
    expect(normalizePlayerAttributes(null)).toEqual(DEFAULT_PLAYER_ATTRIBUTES);
  });

  it('returns defaults for non-object input', () => {
    expect(normalizePlayerAttributes('string')).toEqual(DEFAULT_PLAYER_ATTRIBUTES);
    expect(normalizePlayerAttributes(42)).toEqual(DEFAULT_PLAYER_ATTRIBUTES);
  });

  it('returns defaults for array input', () => {
    expect(normalizePlayerAttributes([1, 2, 3])).toEqual(DEFAULT_PLAYER_ATTRIBUTES);
  });

  it('coerces valid numeric attributes', () => {
    const result = normalizePlayerAttributes({ vitality: 5, strength: 3.7 });
    expect(result.vitality).toBe(5);
    expect(result.strength).toBe(3); // floored
  });

  it('clamps negative values to 0', () => {
    const result = normalizePlayerAttributes({ vitality: -5 });
    expect(result.vitality).toBe(0);
  });

  it('treats non-number fields as 0', () => {
    const result = normalizePlayerAttributes({ vitality: 'abc', strength: undefined });
    expect(result.vitality).toBe(0);
    expect(result.strength).toBe(0);
  });

  it('treats NaN/Infinity as 0', () => {
    const result = normalizePlayerAttributes({ vitality: NaN, strength: Infinity });
    expect(result.vitality).toBe(0);
    expect(result.strength).toBe(0);
  });
});

describe('getPlayerProgressionState', () => {
  it('returns progression state for existing player', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(500),
      characterLevel: 3,
      attributePoints: 2,
      attributes: { vitality: 1, strength: 2, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 },
    });

    const result = await getPlayerProgressionState('player-1');
    expect(result.characterXp).toBe(500);
    expect(result.characterLevel).toBe(3);
    expect(result.attributePoints).toBe(2);
    expect(result.attributes.vitality).toBe(1);
  });

  it('throws 404 for missing player', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(getPlayerProgressionState('missing')).rejects.toThrow('Player not found');
  });
});

describe('allocateAttributePoints', () => {
  it('throws for 0 points', async () => {
    await expect(allocateAttributePoints('p1', 'vitality', 0)).rejects.toThrow(
      'Points must be a positive integer'
    );
  });

  it('throws for negative points', async () => {
    await expect(allocateAttributePoints('p1', 'strength', -3)).rejects.toThrow(
      'Points must be a positive integer'
    );
  });

  it('throws 404 when player not found in transaction', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(allocateAttributePoints('missing', 'vitality', 1)).rejects.toThrow(
      'Player not found'
    );
  });

  it('throws when insufficient attribute points', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(0),
      characterLevel: 1,
      attributePoints: 0,
      attributes: DEFAULT_PLAYER_ATTRIBUTES,
    });

    await expect(allocateAttributePoints('p1', 'vitality', 1)).rejects.toThrow(
      'Not enough unspent attribute points'
    );
  });

  it('allocates points and returns updated state', async () => {
    const attrs = { ...DEFAULT_PLAYER_ATTRIBUTES };
    mockPrisma.player.findUnique.mockResolvedValue({
      characterXp: BigInt(100),
      characterLevel: 2,
      attributePoints: 5,
      attributes: attrs,
    });

    mockPrisma.player.update.mockResolvedValue({
      characterXp: BigInt(100),
      characterLevel: 2,
      attributePoints: 2,
      attributes: { ...attrs, vitality: 3 },
    });

    const result = await allocateAttributePoints('p1', 'vitality', 3);
    expect(result.attributePoints).toBe(2);
    expect(result.attributes.vitality).toBe(3);
  });
});
