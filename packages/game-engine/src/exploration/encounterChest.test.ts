import { describe, expect, it } from 'vitest';
import {
  getChestMaterialRollRangeForEncounterSize,
  getChestRarityForEncounterSize,
  getChestRecipeChanceForEncounterSize,
  getUpgradedChestSize,
  rollChestMaterialRolls,
  rollEncounterChestRecipeDrop,
} from './encounterChest';

describe('encounterChest', () => {
  it('maps site size to chest rarity', () => {
    expect(getChestRarityForEncounterSize('small')).toBe('common');
    expect(getChestRarityForEncounterSize('medium')).toBe('uncommon');
    expect(getChestRarityForEncounterSize('large')).toBe('rare');
  });

  it('maps site size to recipe chance', () => {
    expect(getChestRecipeChanceForEncounterSize('small')).toBe(0.005);
    expect(getChestRecipeChanceForEncounterSize('medium')).toBe(0.02);
    expect(getChestRecipeChanceForEncounterSize('large')).toBe(0.05);
  });

  it('maps site size to material roll ranges', () => {
    expect(getChestMaterialRollRangeForEncounterSize('small')).toEqual({ min: 1, max: 2 });
    expect(getChestMaterialRollRangeForEncounterSize('medium')).toEqual({ min: 2, max: 4 });
    expect(getChestMaterialRollRangeForEncounterSize('large')).toEqual({ min: 3, max: 6 });
  });

  it('rolls material counts within range', () => {
    expect(rollChestMaterialRolls('small', () => 0)).toBe(1);
    expect(rollChestMaterialRolls('small', () => 0.99)).toBe(2);
    expect(rollChestMaterialRolls('medium', () => 0.5)).toBeGreaterThanOrEqual(2);
    expect(rollChestMaterialRolls('medium', () => 0.5)).toBeLessThanOrEqual(4);
  });

  it('rolls recipe drop against chance', () => {
    expect(rollEncounterChestRecipeDrop('small', () => 0)).toBe(true);
    expect(rollEncounterChestRecipeDrop('small', () => 0.005)).toBe(false);
    expect(rollEncounterChestRecipeDrop('medium', () => 0.01)).toBe(true);
    expect(rollEncounterChestRecipeDrop('medium', () => 0.02)).toBe(false);
    expect(rollEncounterChestRecipeDrop('large', () => 0.049)).toBe(true);
  });
});

describe('getUpgradedChestSize', () => {
  it('upgrades small to medium', () => {
    expect(getUpgradedChestSize('small')).toBe('medium');
  });
  it('upgrades medium to large', () => {
    expect(getUpgradedChestSize('medium')).toBe('large');
  });
  it('keeps large as large', () => {
    expect(getUpgradedChestSize('large')).toBe('large');
  });
});
