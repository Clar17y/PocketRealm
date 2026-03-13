import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@pocketrealm/shared', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getActionDefinition: vi.fn(),
  };
});

import { mapTemplateCombatLog } from './combatLogMapper';
import { getActionDefinition } from '@pocketrealm/shared';

const mockGetActionDef = vi.mocked(getActionDefinition);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('mapTemplateCombatLog', () => {
  // ── Empty / pass-through ───────────────────────────────────────────

  it('returns empty array for empty input', () => {
    expect(mapTemplateCombatLog([])).toEqual([]);
  });

  it('passes through entries with no combatant actions', () => {
    const entries = [
      { actor: 'combatantA', someField: 42 },
      { actor: 'combatantB', otherField: 'value' },
    ];
    const result = mapTemplateCombatLog(entries);
    expect(result).toEqual(entries);
    expect(mockGetActionDef).not.toHaveBeenCalled();
  });

  it('passes through entry with undefined combatant actions', () => {
    const entry = {
      actor: 'combatantA',
      combatantAAction: undefined,
      combatantBAction: undefined,
    };
    const result = mapTemplateCombatLog([entry]);
    expect(result).toEqual([entry]);
  });

  it('passes through entry with empty string combatant actions (falsy)', () => {
    const entry = {
      actor: 'combatantA',
      combatantAAction: '',
      combatantBAction: '',
    };
    // Both are falsy, so the early return triggers
    const result = mapTemplateCombatLog([entry]);
    expect(result).toEqual([entry]);
  });

  // ── Actor is combatantA ────────────────────────────────────────────

  describe('actor is combatantA', () => {
    it('uses combatantA action and resources', () => {
      mockGetActionDef.mockReturnValue({
        id: 'normal_attack',
        name: 'Normal Attack',
        description: 'A standard weapon strike.',
        actionType: 'normal_attack',
        category: 'offensive',
        scalingStat: 'weapon',
        cost: { stamina: 20, mana: 0 },
        damageMultiplier: 1.0,
      });

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'normal_attack',
        combatantBAction: 'defend',
        combatantAStaminaAfter: 80,
        combatantBStaminaAfter: 100,
        combatantAManaAfter: 50,
        combatantBManaAfter: 60,
      };

      const [result] = mapTemplateCombatLog([entry]);

      expect(result.actionId).toBe('normal_attack');
      expect(result.actionName).toBe('Normal Attack');
      expect(result.staminaAfter).toBe(80);
      expect(result.manaAfter).toBe(50);
      expect(result.staminaCost).toBe(20);
      expect(result.manaCost).toBe(0);
      expect(mockGetActionDef).toHaveBeenCalledWith('normal_attack');
    });

    it('preserves original fields via spread', () => {
      mockGetActionDef.mockReturnValue({
        id: 'light_attack',
        name: 'Light Attack',
        description: '',
        actionType: 'light_attack',
        category: 'offensive',
        scalingStat: 'weapon',
        cost: { stamina: 10, mana: 0 },
      });

      const entry = {
        round: 3,
        actor: 'combatantA',
        combatantAAction: 'light_attack',
        combatantBAction: 'defend',
        damageDealt: 15,
        customField: 'preserved',
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.round).toBe(3);
      expect(result.damageDealt).toBe(15);
      expect(result.customField).toBe('preserved');
    });
  });

  // ── Actor is combatantB ────────────────────────────────────────────

  describe('actor is combatantB', () => {
    it('uses combatantB action and resources', () => {
      mockGetActionDef.mockReturnValue({
        id: 'heavy_attack',
        name: 'Heavy Attack',
        description: '',
        actionType: 'heavy_attack',
        category: 'offensive',
        scalingStat: 'weapon',
        cost: { stamina: 40, mana: 0 },
      });

      const entry = {
        actor: 'combatantB',
        combatantAAction: 'defend',
        combatantBAction: 'heavy_attack',
        combatantAStaminaAfter: 100,
        combatantBStaminaAfter: 60,
        combatantAManaAfter: 90,
        combatantBManaAfter: 30,
      };

      const [result] = mapTemplateCombatLog([entry]);

      expect(result.actionId).toBe('heavy_attack');
      expect(result.actionName).toBe('Heavy Attack');
      expect(result.staminaAfter).toBe(60);
      expect(result.manaAfter).toBe(30);
      expect(result.staminaCost).toBe(40);
      expect(result.manaCost).toBe(0);
      expect(mockGetActionDef).toHaveBeenCalledWith('heavy_attack');
    });

    it('uses combatantB resources even with undefined A resources', () => {
      mockGetActionDef.mockReturnValue({
        id: 'ward',
        name: 'Ward',
        description: '',
        actionType: 'ward',
        category: 'defensive',
        scalingStat: 'weapon',
        cost: { stamina: 0, mana: 30 },
      });

      const entry = {
        actor: 'combatantB',
        combatantBAction: 'ward',
        combatantBStaminaAfter: 100,
        combatantBManaAfter: 70,
        // no A resources
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.staminaAfter).toBe(100);
      expect(result.manaAfter).toBe(70);
    });
  });

  // ── Unknown action ID ──────────────────────────────────────────────

  describe('unknown action ID', () => {
    it('returns undefined for actionName, staminaCost, manaCost', () => {
      mockGetActionDef.mockReturnValue(undefined);

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'nonexistent_action',
      };

      const [result] = mapTemplateCombatLog([entry]);

      expect(result.actionId).toBe('nonexistent_action');
      expect(result.actionName).toBeUndefined();
      expect(result.staminaCost).toBeUndefined();
      expect(result.manaCost).toBeUndefined();
      expect(mockGetActionDef).toHaveBeenCalledWith('nonexistent_action');
    });

    it('still maps staminaAfter and manaAfter even with unknown action', () => {
      mockGetActionDef.mockReturnValue(undefined);

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'unknown_action',
        combatantAStaminaAfter: 55,
        combatantAManaAfter: 33,
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.staminaAfter).toBe(55);
      expect(result.manaAfter).toBe(33);
    });
  });

  // ── wasExhausted and interactionResult ─────────────────────────────

  describe('wasExhausted field', () => {
    it('passes through wasExhausted=true', () => {
      mockGetActionDef.mockReturnValue(undefined);

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'some_action',
        wasExhausted: true,
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.wasExhausted).toBe(true);
    });

    it('converts wasExhausted=false to undefined via ?? operator', () => {
      mockGetActionDef.mockReturnValue(undefined);

      // false ?? undefined = false (not nullish)
      const entry = {
        actor: 'combatantA',
        combatantAAction: 'some_action',
        wasExhausted: false,
      };

      const [result] = mapTemplateCombatLog([entry]);
      // false is not null/undefined, so ?? preserves it
      expect(result.wasExhausted).toBe(false);
    });

    it('returns undefined when wasExhausted is undefined', () => {
      mockGetActionDef.mockReturnValue(undefined);

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'some_action',
        // wasExhausted not present
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.wasExhausted).toBeUndefined();
    });
  });

  describe('interactionResult field', () => {
    it('passes through interactionResult string', () => {
      mockGetActionDef.mockReturnValue(undefined);

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'some_action',
        interactionResult: 'hit',
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.interactionResult).toBe('hit');
    });

    it('returns undefined for null interactionResult', () => {
      mockGetActionDef.mockReturnValue(undefined);

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'some_action',
        interactionResult: null as unknown as string,
      };

      const [result] = mapTemplateCombatLog([entry]);
      // null ?? undefined = undefined
      expect(result.interactionResult).toBeUndefined();
    });

    it('returns undefined for missing interactionResult', () => {
      mockGetActionDef.mockReturnValue(undefined);

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'some_action',
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.interactionResult).toBeUndefined();
    });
  });

  // ── Action with mana cost ──────────────────────────────────────────

  it('maps mana cost from action definition', () => {
    mockGetActionDef.mockReturnValue({
      id: 'ward',
      name: 'Ward',
      description: '',
      actionType: 'ward',
      category: 'defensive',
      scalingStat: 'weapon',
      cost: { stamina: 0, mana: 30 },
    });

    const entry = {
      actor: 'combatantA',
      combatantAAction: 'ward',
      combatantAManaAfter: 70,
    };

    const [result] = mapTemplateCombatLog([entry]);
    expect(result.manaCost).toBe(30);
    expect(result.staminaCost).toBe(0);
  });

  // ── Only combatantB has an action (A is undefined) ─────────────────

  it('triggers mapping when only combatantBAction is present', () => {
    mockGetActionDef.mockReturnValue({
      id: 'defend',
      name: 'Defend',
      description: '',
      actionType: 'defend',
      category: 'defensive',
      scalingStat: 'weapon',
      cost: { stamina: 0, mana: 0 },
    });

    const entry = {
      actor: 'combatantB',
      combatantBAction: 'defend',
      combatantBStaminaAfter: 100,
      combatantBManaAfter: 100,
    };

    const [result] = mapTemplateCombatLog([entry]);
    expect(result.actionId).toBe('defend');
    expect(result.actionName).toBe('Defend');
    expect(result.staminaCost).toBe(0);
    expect(result.manaCost).toBe(0);
  });

  it('triggers mapping when only combatantAAction is present', () => {
    mockGetActionDef.mockReturnValue({
      id: 'counter',
      name: 'Counter',
      description: '',
      actionType: 'counter',
      category: 'defensive',
      scalingStat: 'weapon',
      cost: { stamina: 35, mana: 0 },
    });

    const entry = {
      actor: 'combatantA',
      combatantAAction: 'counter',
      combatantAStaminaAfter: 65,
    };

    const [result] = mapTemplateCombatLog([entry]);
    expect(result.actionId).toBe('counter');
    expect(result.actionName).toBe('Counter');
    expect(result.staminaCost).toBe(35);
  });

  // ── Actor mismatch: actor is combatantA but only B action populated ─

  it('returns undefined actionId when actor is A but only B action set', () => {
    // This tests the logic: isA=true, so actionId = combatantAAction (undefined)
    // getActionDefinition(undefined) should not be called because of the ? guard
    const entry = {
      actor: 'combatantA',
      combatantBAction: 'heavy_attack', // only B set, triggers mapping
      // combatantAAction: undefined
    };

    const [result] = mapTemplateCombatLog([entry]);
    expect(result.actionId).toBeUndefined();
    expect(result.actionName).toBeUndefined();
    expect(mockGetActionDef).not.toHaveBeenCalled();
  });

  // ── Actor is neither A nor B ───────────────────────────────────────

  it('treats non-combatantA actor as combatantB (uses B action)', () => {
    mockGetActionDef.mockReturnValue({
      id: 'normal_attack',
      name: 'Normal Attack',
      description: '',
      actionType: 'normal_attack',
      category: 'offensive',
      scalingStat: 'weapon',
      cost: { stamina: 20, mana: 0 },
    });

    const entry = {
      actor: 'someOtherActor',
      combatantAAction: 'light_attack',
      combatantBAction: 'normal_attack',
      combatantAStaminaAfter: 90,
      combatantBStaminaAfter: 80,
      combatantAManaAfter: 100,
      combatantBManaAfter: 50,
    };

    const [result] = mapTemplateCombatLog([entry]);
    // isA = false, so uses B's action and resources
    expect(result.actionId).toBe('normal_attack');
    expect(result.staminaAfter).toBe(80);
    expect(result.manaAfter).toBe(50);
  });

  it('uses B resources when actor is undefined', () => {
    mockGetActionDef.mockReturnValue({
      id: 'defend',
      name: 'Defend',
      description: '',
      actionType: 'defend',
      category: 'defensive',
      scalingStat: 'weapon',
      cost: { stamina: 0, mana: 0 },
    });

    const entry = {
      // actor is undefined (not 'combatantA')
      combatantAAction: 'light_attack',
      combatantBAction: 'defend',
      combatantAStaminaAfter: 90,
      combatantBStaminaAfter: 100,
    };

    const [result] = mapTemplateCombatLog([entry]);
    expect(result.actionId).toBe('defend');
    expect(result.staminaAfter).toBe(100);
  });

  // ── Multiple entries ───────────────────────────────────────────────

  describe('multiple entries', () => {
    it('processes each entry independently', () => {
      mockGetActionDef
        .mockReturnValueOnce({
          id: 'light_attack',
          name: 'Light Attack',
          description: '',
          actionType: 'light_attack',
          category: 'offensive',
          scalingStat: 'weapon',
          cost: { stamina: 10, mana: 0 },
        })
        .mockReturnValueOnce({
          id: 'heavy_attack',
          name: 'Heavy Attack',
          description: '',
          actionType: 'heavy_attack',
          category: 'offensive',
          scalingStat: 'weapon',
          cost: { stamina: 40, mana: 0 },
        });

      const entries = [
        {
          actor: 'combatantA',
          combatantAAction: 'light_attack',
          combatantAStaminaAfter: 90,
          combatantAManaAfter: 100,
        },
        {
          actor: 'combatantB',
          combatantBAction: 'heavy_attack',
          combatantBStaminaAfter: 60,
          combatantBManaAfter: 100,
        },
      ];

      const results = mapTemplateCombatLog(entries);

      expect(results).toHaveLength(2);
      expect(results[0].actionName).toBe('Light Attack');
      expect(results[0].staminaAfter).toBe(90);
      expect(results[1].actionName).toBe('Heavy Attack');
      expect(results[1].staminaAfter).toBe(60);
    });

    it('mixes pass-through and mapped entries', () => {
      mockGetActionDef.mockReturnValue({
        id: 'normal_attack',
        name: 'Normal Attack',
        description: '',
        actionType: 'normal_attack',
        category: 'offensive',
        scalingStat: 'weapon',
        cost: { stamina: 20, mana: 0 },
      });

      const entries = [
        { actor: 'combatantA', someData: 'no-action-fields' },
        {
          actor: 'combatantA',
          combatantAAction: 'normal_attack',
          combatantAStaminaAfter: 80,
        },
        { actor: 'combatantB', anotherField: 99 },
      ];

      const results = mapTemplateCombatLog(entries);

      expect(results).toHaveLength(3);
      // First: pass-through (no combatantXAction)
      expect(results[0]).toEqual(entries[0]);
      // Second: mapped
      expect(results[1].actionName).toBe('Normal Attack');
      // Third: pass-through
      expect(results[2]).toEqual(entries[2]);
    });
  });

  // ── Resource values ────────────────────────────────────────────────

  describe('resource values', () => {
    it('maps undefined stamina/mana when not present in entry', () => {
      mockGetActionDef.mockReturnValue({
        id: 'light_attack',
        name: 'Light Attack',
        description: '',
        actionType: 'light_attack',
        category: 'offensive',
        scalingStat: 'weapon',
        cost: { stamina: 10, mana: 0 },
      });

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'light_attack',
        // no staminaAfter or manaAfter
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.staminaAfter).toBeUndefined();
      expect(result.manaAfter).toBeUndefined();
    });

    it('maps zero resource values correctly', () => {
      mockGetActionDef.mockReturnValue({
        id: 'heavy_attack',
        name: 'Heavy Attack',
        description: '',
        actionType: 'heavy_attack',
        category: 'offensive',
        scalingStat: 'weapon',
        cost: { stamina: 40, mana: 0 },
      });

      const entry = {
        actor: 'combatantA',
        combatantAAction: 'heavy_attack',
        combatantAStaminaAfter: 0,
        combatantAManaAfter: 0,
      };

      const [result] = mapTemplateCombatLog([entry]);
      expect(result.staminaAfter).toBe(0);
      expect(result.manaAfter).toBe(0);
    });
  });

  // ── Generic type preservation ──────────────────────────────────────

  it('preserves all extra properties from extended type', () => {
    mockGetActionDef.mockReturnValue({
      id: 'normal_attack',
      name: 'Normal Attack',
      description: '',
      actionType: 'normal_attack',
      category: 'offensive',
      scalingStat: 'weapon',
      cost: { stamina: 20, mana: 0 },
    });

    const entry = {
      actor: 'combatantA',
      combatantAAction: 'normal_attack',
      combatantAStaminaAfter: 80,
      combatantAManaAfter: 100,
      round: 5,
      damageDealt: 42,
      isCrit: true,
      effectsApplied: ['bleed'],
    };

    const [result] = mapTemplateCombatLog([entry]);
    expect(result.round).toBe(5);
    expect(result.damageDealt).toBe(42);
    expect(result.isCrit).toBe(true);
    expect(result.effectsApplied).toEqual(['bleed']);
    // And the mapped fields
    expect(result.actionName).toBe('Normal Attack');
    expect(result.staminaAfter).toBe(80);
    expect(result.manaAfter).toBe(100);
  });

  // ── Edge: cost property missing from action definition ─────────────

  it('handles action definition with undefined cost gracefully', () => {
    // ActionDefinition type requires cost, but a weird edge case
    mockGetActionDef.mockReturnValue({
      id: 'test',
      name: 'Test',
      description: '',
      actionType: 'light_attack',
      category: 'offensive',
      scalingStat: 'weapon',
      cost: undefined as unknown as { stamina: number; mana: number },
    });

    const entry = {
      actor: 'combatantA',
      combatantAAction: 'test',
    };

    const [result] = mapTemplateCombatLog([entry]);
    // cost?.stamina is undefined when cost is undefined
    expect(result.staminaCost).toBeUndefined();
    expect(result.manaCost).toBeUndefined();
    expect(result.actionName).toBe('Test');
  });

  // ── Real-world integration: full combat round ──────────────────────

  it('correctly maps a full round with both A and B actions', () => {
    // Round where A attacks and B defends, mapped from A's perspective
    mockGetActionDef.mockReturnValue({
      id: 'normal_attack',
      name: 'Normal Attack',
      description: '',
      actionType: 'normal_attack',
      category: 'offensive',
      scalingStat: 'weapon',
      cost: { stamina: 20, mana: 0 },
    });

    const round = {
      round: 1,
      actor: 'combatantA',
      combatantAAction: 'normal_attack',
      combatantBAction: 'defend',
      combatantAStaminaAfter: 80,
      combatantBStaminaAfter: 100,
      combatantAManaAfter: 100,
      combatantBManaAfter: 100,
      wasExhausted: false,
      interactionResult: 'hit',
    };

    const [result] = mapTemplateCombatLog([round]);

    // All mapped fields
    expect(result.actionId).toBe('normal_attack');
    expect(result.actionName).toBe('Normal Attack');
    expect(result.staminaAfter).toBe(80);  // A's stamina
    expect(result.manaAfter).toBe(100);     // A's mana
    expect(result.staminaCost).toBe(20);
    expect(result.manaCost).toBe(0);
    expect(result.wasExhausted).toBe(false);
    expect(result.interactionResult).toBe('hit');
    // Preserved fields
    expect(result.round).toBe(1);
    // Original fields still present
    expect(result.combatantAAction).toBe('normal_attack');
    expect(result.combatantBAction).toBe('defend');
  });
});
