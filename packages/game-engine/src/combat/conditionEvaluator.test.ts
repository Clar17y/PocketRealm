import { describe, expect, it } from 'vitest';
import type { ActiveEffect, SlotCondition } from '@pocketrealm/shared';
import { evaluateCondition } from './conditionEvaluator';

describe('evaluateCondition', () => {
  // Defaults used across most tests
  const noEffects: ActiveEffect[] = [];

  it('returns false when condition is undefined', () => {
    expect(
      evaluateCondition(undefined, 100, 100, 50, 50, 50, 50, noEffects, 'combatantA'),
    ).toBe(false);
  });

  // --- resource_below ---

  it('resource_below: true when HP at 40% with threshold 50', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'hp', threshold: 50 };
    // 40/100 = 40%
    expect(evaluateCondition(cond, 40, 100, 50, 50, 50, 50, noEffects, 'combatantA')).toBe(true);
  });

  it('resource_below: false when HP at 60% with threshold 50', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'hp', threshold: 50 };
    // 60/100 = 60%
    expect(evaluateCondition(cond, 60, 100, 50, 50, 50, 50, noEffects, 'combatantA')).toBe(false);
  });

  it('resource_below: false when exactly at threshold (strict less-than)', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'hp', threshold: 50 };
    // 50/100 = 50%, not strictly below
    expect(evaluateCondition(cond, 50, 100, 50, 50, 50, 50, noEffects, 'combatantA')).toBe(false);
  });

  it('resource_below: works for stamina', () => {
    const cond: SlotCondition = { type: 'resource_below', resource: 'stamina', threshold: 30 };
    // stamina = 20/100 = 20%
    expect(evaluateCondition(cond, 100, 100, 20, 100, 50, 50, noEffects, 'combatantA')).toBe(true);
  });

  // --- resource_above ---

  it('resource_above: true when mana at 80% with threshold 50', () => {
    const cond: SlotCondition = { type: 'resource_above', resource: 'mana', threshold: 50 };
    // mana = 80/100 = 80%
    expect(evaluateCondition(cond, 100, 100, 50, 50, 80, 100, noEffects, 'combatantA')).toBe(true);
  });

  it('resource_above: false when exactly at threshold (strict greater-than)', () => {
    const cond: SlotCondition = { type: 'resource_above', resource: 'mana', threshold: 50 };
    // mana = 50/100 = 50%, not strictly above
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 100, noEffects, 'combatantA')).toBe(false);
  });

  // --- has_debuff ---

  it('has_debuff: true when actor has the named debuff', () => {
    const cond: SlotCondition = { type: 'has_debuff', effectName: 'poison' };
    const effects: ActiveEffect[] = [
      { name: 'poison', target: 'combatantA', stat: 'attack', modifier: -5, remainingRounds: 3 },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(true);
  });

  it('has_debuff: false when debuff belongs to other combatant', () => {
    const cond: SlotCondition = { type: 'has_debuff', effectName: 'poison' };
    const effects: ActiveEffect[] = [
      { name: 'poison', target: 'combatantB', stat: 'attack', modifier: -5, remainingRounds: 3 },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(false);
  });

  // --- has_buff ---

  it('has_buff: true when actor has named buff (positive modifier)', () => {
    const cond: SlotCondition = { type: 'has_buff', effectName: 'strength' };
    const effects: ActiveEffect[] = [
      { name: 'strength', target: 'combatantA', stat: 'attack', modifier: 10, remainingRounds: 2 },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(true);
  });

  // --- no_debuff ---

  it('no_debuff: true when actor does NOT have the debuff', () => {
    const cond: SlotCondition = { type: 'no_debuff', effectName: 'poison' };
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, noEffects, 'combatantA')).toBe(true);
  });

  it('no_debuff: false when actor HAS the debuff', () => {
    const cond: SlotCondition = { type: 'no_debuff', effectName: 'poison' };
    const effects: ActiveEffect[] = [
      { name: 'poison', target: 'combatantA', stat: 'attack', modifier: -5, remainingRounds: 3 },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(false);
  });

  // --- no_buff ---

  it('no_buff: true when actor does NOT have the buff', () => {
    const cond: SlotCondition = { type: 'no_buff', effectName: 'strength' };
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, noEffects, 'combatantA')).toBe(true);
  });

  // --- any_debuff ---

  it('any_debuff: true when actor has a negative modifier effect', () => {
    const cond: SlotCondition = { type: 'any_debuff' };
    const effects: ActiveEffect[] = [
      { name: 'Crippled', target: 'combatantA', stat: 'speed', modifier: -20, remainingRounds: 3 },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(true);
  });

  it('any_debuff: true when actor has a magic DOT', () => {
    const cond: SlotCondition = { type: 'any_debuff' };
    const effects: ActiveEffect[] = [
      { name: 'Poison', target: 'combatantA', stat: 'attack', modifier: 0, remainingRounds: 3, resolvedDamagePerRound: 10, dotDamageType: 'magic' },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(true);
  });

  it('any_debuff: false when only potion sickness is active', () => {
    const cond: SlotCondition = { type: 'any_debuff' };
    const effects: ActiveEffect[] = [
      { name: 'Potion Sickness', target: 'combatantA', stat: 'potionSickness', modifier: 0, remainingRounds: 3 },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(false);
  });

  it('any_debuff: false when no debuffs active', () => {
    const cond: SlotCondition = { type: 'any_debuff' };
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, noEffects, 'combatantA')).toBe(false);
  });

  // --- any_magic_dot ---

  it('any_magic_dot: true when actor has a magic DOT', () => {
    const cond: SlotCondition = { type: 'any_magic_dot' };
    const effects: ActiveEffect[] = [
      { name: 'Poison', target: 'combatantA', stat: 'attack', modifier: 0, remainingRounds: 3, resolvedDamagePerRound: 10, dotDamageType: 'magic' },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(true);
  });

  it('any_magic_dot: false when only physical DOT active', () => {
    const cond: SlotCondition = { type: 'any_magic_dot' };
    const effects: ActiveEffect[] = [
      { name: 'Bleed', target: 'combatantA', stat: 'attack', modifier: 0, remainingRounds: 3, resolvedDamagePerRound: 5, dotDamageType: 'physical' },
    ];
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, effects, 'combatantA')).toBe(false);
  });

  it('any_magic_dot: false when no DOTs active', () => {
    const cond: SlotCondition = { type: 'any_magic_dot' };
    expect(evaluateCondition(cond, 100, 100, 50, 50, 50, 50, noEffects, 'combatantA')).toBe(false);
  });
});
