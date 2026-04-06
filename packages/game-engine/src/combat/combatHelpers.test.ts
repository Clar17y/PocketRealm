import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionDefinition } from '@pocketrealm/shared';
import type { ThreatEntry } from './threatSystem';
import type {
  CombatParticipantInput,
  CombatParticipantState,
} from './combatHelpers';

// Mock resolveAction so resolveParticipantActions tests are isolated
vi.mock('./actionResolver', () => ({
  resolveAction: vi.fn(),
}));

// Must import AFTER vi.mock so the mock is active
import { resolveAction } from './actionResolver';
import {
  resolveParticipantActions,
  resolveSupportiveActions,
  applyResourceCosts,
} from './combatHelpers';

const mockedResolveAction = vi.mocked(resolveAction);

// ---------------------------------------------------------------------------
// Helpers to build test fixtures
// ---------------------------------------------------------------------------

function makeActionDef(overrides: Partial<ActionDefinition> & { id: string }): ActionDefinition {
  return {
    name: overrides.id,
    description: '',
    actionType: 'normal_attack',
    category: 'offensive',
    cost: { stamina: 0, mana: 0 },
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<CombatParticipantInput> = {}): CombatParticipantInput {
  return {
    playerId: 'p1',
    template: [],
    actionDefinitions: {},
    maxHp: 100,
    maxStamina: 50,
    maxMana: 30,
    staminaRegenPerRound: 5,
    manaRegenPerRound: 3,
    ...overrides,
  };
}

function makeState(overrides: Partial<CombatParticipantState> = {}): CombatParticipantState {
  return {
    playerId: 'p1',
    hp: 100,
    stamina: 50,
    mana: 30,
    templateRound: 0,
    healingDone: 0,
    actionId: 'defend',
    wasExhausted: false,
    actionDef: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// resolveParticipantActions
// ===========================================================================

describe('resolveParticipantActions', () => {
  it('skips dead participants (hp <= 0)', () => {
    const participants = [makeParticipant()];
    const pState = [makeState({ hp: 0 })];

    resolveParticipantActions(participants, pState);

    expect(mockedResolveAction).not.toHaveBeenCalled();
    expect(pState[0].actionId).toBe('defend'); // unchanged
  });

  it('calls resolveAction for alive participants and updates state', () => {
    const attackDef = makeActionDef({ id: 'heavy_attack', cost: { stamina: 15, mana: 0 } });
    mockedResolveAction.mockReturnValue({
      action: attackDef,
      wasExhausted: false,
      intendedActionId: 'heavy_attack',
      intendedAction: attackDef,
      exhaustedReason: undefined,
      alternateAction: undefined,
    });

    const participants = [makeParticipant({ playerId: 'p1' })];
    const pState = [makeState({ playerId: 'p1', hp: 80 })];

    resolveParticipantActions(participants, pState);

    expect(mockedResolveAction).toHaveBeenCalledOnce();
    expect(pState[0].actionId).toBe('heavy_attack');
    expect(pState[0].wasExhausted).toBe(false);
    expect(pState[0].actionDef).toBe(attackDef);
    expect(pState[0].intendedActionId).toBe('heavy_attack');
    expect(pState[0].intendedActionDef).toBe(attackDef);
    expect(pState[0].exhaustedReason).toBeNull();
    expect(pState[0].alternateActionDef).toBeNull();
  });

  it('records exhaustion info when resolveAction says the action was exhausted', () => {
    const defendDef = makeActionDef({ id: 'defend', category: 'defensive', cost: { stamina: 0, mana: 0 } });
    const heavyDef = makeActionDef({ id: 'heavy_attack', cost: { stamina: 15, mana: 0 } });

    mockedResolveAction.mockReturnValue({
      action: defendDef,
      wasExhausted: true,
      intendedActionId: 'heavy_attack',
      intendedAction: heavyDef,
      exhaustedReason: 'not_enough_stamina',
      alternateAction: undefined,
    });

    const participants = [makeParticipant()];
    const pState = [makeState({ stamina: 2 })];

    resolveParticipantActions(participants, pState);

    expect(pState[0].actionId).toBe('defend');
    expect(pState[0].wasExhausted).toBe(true);
    expect(pState[0].intendedActionId).toBe('heavy_attack');
    expect(pState[0].intendedActionDef).toBe(heavyDef);
    expect(pState[0].exhaustedReason).toBe('not_enough_stamina');
  });

  it('stores alternateAction when present', () => {
    const thenDef = makeActionDef({ id: 'heal_self', category: 'supportive' });
    const elseDef = makeActionDef({ id: 'normal_attack' });
    mockedResolveAction.mockReturnValue({
      action: thenDef,
      wasExhausted: false,
      intendedActionId: 'heal_self',
      intendedAction: thenDef,
      alternateAction: elseDef,
    });

    const participants = [makeParticipant()];
    const pState = [makeState()];

    resolveParticipantActions(participants, pState);

    expect(pState[0].alternateActionDef).toBe(elseDef);
  });

  it('handles multiple participants, only calls resolveAction for alive ones', () => {
    const atkDef = makeActionDef({ id: 'light_attack' });
    mockedResolveAction.mockReturnValue({
      action: atkDef,
      wasExhausted: false,
    });

    const participants = [
      makeParticipant({ playerId: 'p1' }),
      makeParticipant({ playerId: 'p2' }),
      makeParticipant({ playerId: 'p3' }),
    ];
    const pState = [
      makeState({ playerId: 'p1', hp: 50 }),  // alive
      makeState({ playerId: 'p2', hp: 0 }),   // dead
      makeState({ playerId: 'p3', hp: 1 }),   // alive
    ];

    resolveParticipantActions(participants, pState);

    expect(mockedResolveAction).toHaveBeenCalledTimes(2);
    // Dead participant's state unchanged
    expect(pState[1].actionId).toBe('defend');
    expect(pState[1].actionDef).toBeNull();
    // Alive participants updated
    expect(pState[0].actionId).toBe('light_attack');
    expect(pState[2].actionId).toBe('light_attack');
  });

  it('normalises template slots that lack id field', () => {
    const atkDef = makeActionDef({ id: 'normal_attack' });
    mockedResolveAction.mockReturnValue({
      action: atkDef,
      wasExhausted: false,
    });

    // Template without `id` field — uses the alternate shape
    const participants = [makeParticipant({
      template: [{ actionId: 'normal_attack', sortOrder: 0 }],
    })];
    const pState = [makeState({ hp: 50 })];

    resolveParticipantActions(participants, pState);

    expect(mockedResolveAction).toHaveBeenCalledOnce();
    // The first arg to resolveAction should be the normalized slots
    const slotsArg = mockedResolveAction.mock.calls[0][0];
    expect(slotsArg).toHaveLength(1);
    expect(slotsArg[0]).toMatchObject({
      id: 'slot-0',
      sortOrder: 0,
      actionId: 'normal_attack',
    });
  });

  it('passes through CombatTemplateSlotData that already has id field', () => {
    const atkDef = makeActionDef({ id: 'normal_attack' });
    mockedResolveAction.mockReturnValue({
      action: atkDef,
      wasExhausted: false,
    });

    const slot = {
      id: 'existing-slot',
      sortOrder: 1,
      actionId: 'normal_attack',
      condition: undefined,
      thenActionId: undefined,
    };
    const participants = [makeParticipant({ template: [slot] })];
    const pState = [makeState({ hp: 50 })];

    resolveParticipantActions(participants, pState);

    const slotsArg = mockedResolveAction.mock.calls[0][0];
    expect(slotsArg[0]).toBe(slot); // same reference, not re-constructed
  });

  it('uses intendedActionId from resolveAction result, falls back to action.id', () => {
    const atkDef = makeActionDef({ id: 'normal_attack' });
    // No intendedActionId in the result
    mockedResolveAction.mockReturnValue({
      action: atkDef,
      wasExhausted: false,
    });

    const participants = [makeParticipant()];
    const pState = [makeState({ hp: 50 })];

    resolveParticipantActions(participants, pState);

    // Falls back to action.id when intendedActionId is undefined
    expect(pState[0].intendedActionId).toBe('normal_attack');
  });

  it('passes participant activeEffects to resolveAction for condition evaluation', () => {
    const atkDef = makeActionDef({ id: 'normal_attack' });
    mockedResolveAction.mockReturnValue({
      action: atkDef,
      wasExhausted: false,
    });

    const participantEffects = [
      { name: 'Poison', stat: 'attack', modifier: -5, roundsRemaining: 3 },
    ];
    const participants = [makeParticipant({
      activeEffects: participantEffects,
    })];
    const pState = [makeState({ hp: 50 })];

    resolveParticipantActions(participants, pState);

    expect(mockedResolveAction).toHaveBeenCalledOnce();
    // activeEffects is the 9th argument (index 8) to resolveAction
    // Effects are mapped to ActiveEffect shape with target='combatantA'
    const activeEffectsArg = mockedResolveAction.mock.calls[0][8];
    expect(activeEffectsArg).toHaveLength(1);
    expect(activeEffectsArg[0]).toMatchObject({
      name: 'Poison',
      stat: 'attack',
      modifier: -5,
      target: 'combatantA',
      remainingRounds: 3,
    });
  });

  it('defaults to empty activeEffects when participant has none', () => {
    const atkDef = makeActionDef({ id: 'normal_attack' });
    mockedResolveAction.mockReturnValue({
      action: atkDef,
      wasExhausted: false,
    });

    const participants = [makeParticipant()];
    const pState = [makeState({ hp: 50 })];

    resolveParticipantActions(participants, pState);

    expect(mockedResolveAction).toHaveBeenCalledOnce();
    const activeEffectsArg = mockedResolveAction.mock.calls[0][8];
    expect(activeEffectsArg).toEqual([]);
  });
});

// ===========================================================================
// resolveSupportiveActions
// ===========================================================================

describe('resolveSupportiveActions', () => {
  // -- heal_self -------------------------------------------------------

  describe('heal_self', () => {
    it('heals based on healFlat + healPercent of maxHp', () => {
      const healDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 10,
        healPercent: 0.2,
      });

      const participants = [makeParticipant({ maxHp: 100 })];
      const pState = [makeState({ hp: 50, actionDef: healDef })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      // healAmount = 10 + floor(0.2 * 100) = 30
      // actualHeal = min(30, 100 - 50) = 30
      expect(pState[0].hp).toBe(80);
      expect(pState[0].healingDone).toBe(30);
    });

    it('caps healing at maxHp', () => {
      const healDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 0,
        healPercent: 0.5,
      });

      const participants = [makeParticipant({ maxHp: 100 })];
      const pState = [makeState({ hp: 90, actionDef: healDef })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      // healAmount = 0 + floor(0.5 * 100) = 50
      // actualHeal = min(50, 100 - 90) = 10
      expect(pState[0].hp).toBe(100);
      expect(pState[0].healingDone).toBe(10);
    });

    it('heals 0 when already at max HP', () => {
      const healDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 20,
        healPercent: 0,
      });

      const participants = [makeParticipant({ maxHp: 100 })];
      const pState = [makeState({ hp: 100, actionDef: healDef })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      expect(pState[0].hp).toBe(100);
      expect(pState[0].healingDone).toBe(0);
    });

    it('adds heal threat', () => {
      const healDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 20,
        healPercent: 0,
      });

      const participants = [makeParticipant({ maxHp: 100 })];
      const pState = [makeState({ hp: 50, actionDef: healDef })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      // THREAT_PER_HEAL = 0.5, actualHeal = 20 => 10 threat
      expect(threatTable[0].threat).toBe(10);
    });

    it('skips dead participants', () => {
      const healDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 50,
        healPercent: 0,
      });

      const participants = [makeParticipant({ maxHp: 100 })];
      const pState = [makeState({ hp: 0, actionDef: healDef })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      expect(pState[0].hp).toBe(0); // no healing for dead
      expect(pState[0].healingDone).toBe(0);
    });

    it('skips non-supportive actions', () => {
      const atkDef = makeActionDef({
        id: 'normal_attack',
        category: 'offensive',
      });

      const participants = [makeParticipant({ maxHp: 100 })];
      const pState = [makeState({ hp: 50, actionDef: atkDef })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      expect(pState[0].hp).toBe(50); // unchanged
      expect(pState[0].healingDone).toBe(0);
    });

    it('handles undefined healFlat and healPercent (defaults to 0)', () => {
      const healDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        // healFlat and healPercent intentionally undefined
      });

      const participants = [makeParticipant({ maxHp: 100 })];
      const pState = [makeState({ hp: 50, actionDef: healDef })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      expect(pState[0].hp).toBe(50); // 0 + floor(0 * 100) = 0
      expect(pState[0].healingDone).toBe(0);
    });
  });

  // -- heal_ally -------------------------------------------------------

  describe('heal_ally', () => {
    it('heals a manual target when healTargetPlayerId is set and alive', () => {
      const healDef = makeActionDef({
        id: 'heal_ally',
        actionType: 'heal_ally',
        category: 'supportive',
        healFlat: 0,
        healPercent: 0.3,
      });

      const participants = [
        makeParticipant({ playerId: 'healer', maxHp: 100, healTargetPlayerId: 'tank' }),
        makeParticipant({ playerId: 'tank', maxHp: 200 }),
      ];
      const pState = [
        makeState({ playerId: 'healer', hp: 80, actionDef: healDef }),
        makeState({ playerId: 'tank', hp: 100 }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'healer', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'tank', threat: 50, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      // healAmount = 0 + floor(0.3 * 100) = 30 (based on healer's maxHp)
      // actualHeal = min(30, 200 - 100) = 30
      expect(pState[1].hp).toBe(130);
      expect(pState[0].healingDone).toBe(30);
      expect(pState[0].healTargetPlayerId).toBe('tank');
    });

    it('targets lowest HP ally when no manual target set', () => {
      const healDef = makeActionDef({
        id: 'heal_ally',
        actionType: 'heal_ally',
        category: 'supportive',
        healFlat: 25,
        healPercent: 0,
      });

      const participants = [
        makeParticipant({ playerId: 'healer', maxHp: 100 }),
        makeParticipant({ playerId: 'dps', maxHp: 80 }),
        makeParticipant({ playerId: 'tank', maxHp: 200 }),
      ];
      const pState = [
        makeState({ playerId: 'healer', hp: 80, actionDef: healDef }),
        makeState({ playerId: 'dps', hp: 30 }),
        makeState({ playerId: 'tank', hp: 50 }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'healer', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'dps', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'tank', threat: 0, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      // dps has lowest HP (30), should be healed
      expect(pState[1].hp).toBe(55); // 30 + 25
      expect(pState[0].healTargetPlayerId).toBe('dps');
      expect(pState[0].healingDone).toBe(25);
    });

    it('falls back to self when no other ally is alive', () => {
      const healDef = makeActionDef({
        id: 'heal_ally',
        actionType: 'heal_ally',
        category: 'supportive',
        healFlat: 20,
        healPercent: 0,
      });

      const participants = [
        makeParticipant({ playerId: 'healer', maxHp: 100 }),
        makeParticipant({ playerId: 'dead_dps', maxHp: 80 }),
      ];
      const pState = [
        makeState({ playerId: 'healer', hp: 60, actionDef: healDef }),
        makeState({ playerId: 'dead_dps', hp: 0 }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'healer', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'dead_dps', threat: 0, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      // Only alive player besides healer is dead, so healer heals self
      expect(pState[0].hp).toBe(80); // 60 + 20
      expect(pState[0].healTargetPlayerId).toBe('healer');
    });

    it('falls back to lowest HP ally when manual target is dead', () => {
      const healDef = makeActionDef({
        id: 'heal_ally',
        actionType: 'heal_ally',
        category: 'supportive',
        healFlat: 15,
        healPercent: 0,
      });

      const participants = [
        makeParticipant({ playerId: 'healer', maxHp: 100, healTargetPlayerId: 'dead_tank' }),
        makeParticipant({ playerId: 'dead_tank', maxHp: 200 }),
        makeParticipant({ playerId: 'dps', maxHp: 80 }),
      ];
      const pState = [
        makeState({ playerId: 'healer', hp: 80, actionDef: healDef }),
        makeState({ playerId: 'dead_tank', hp: 0 }),
        makeState({ playerId: 'dps', hp: 40 }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'healer', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'dead_tank', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'dps', threat: 0, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      // Manual target dead, falls to lowest HP ally (dps at 40)
      expect(pState[2].hp).toBe(55); // 40 + 15
      expect(pState[0].healTargetPlayerId).toBe('dps');
    });

    it('caps healing at target maxHp', () => {
      const healDef = makeActionDef({
        id: 'heal_ally',
        actionType: 'heal_ally',
        category: 'supportive',
        healFlat: 100,
        healPercent: 0,
      });

      const participants = [
        makeParticipant({ playerId: 'healer', maxHp: 100, healTargetPlayerId: 'tank' }),
        makeParticipant({ playerId: 'tank', maxHp: 80 }),
      ];
      const pState = [
        makeState({ playerId: 'healer', hp: 90, actionDef: healDef }),
        makeState({ playerId: 'tank', hp: 75 }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'healer', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'tank', threat: 0, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      // healAmount = 100, but tank maxHp is 80, hp is 75 => actual = min(100, 80-75) = 5
      expect(pState[1].hp).toBe(80);
      expect(pState[0].healingDone).toBe(5);
    });

    it('adds heal threat for the healer', () => {
      const healDef = makeActionDef({
        id: 'heal_ally',
        actionType: 'heal_ally',
        category: 'supportive',
        healFlat: 40,
        healPercent: 0,
      });

      const participants = [
        makeParticipant({ playerId: 'healer', maxHp: 100, healTargetPlayerId: 'tank' }),
        makeParticipant({ playerId: 'tank', maxHp: 200 }),
      ];
      const pState = [
        makeState({ playerId: 'healer', hp: 90, actionDef: healDef }),
        makeState({ playerId: 'tank', hp: 100 }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'healer', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'tank', threat: 0, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      // healAmount = 40, actual = 40 => threat = 40 * 0.5 = 20
      expect(threatTable[0].threat).toBe(20);
      // Tank's threat unchanged
      expect(threatTable[1].threat).toBe(0);
    });
  });

  // -- mixed participants --------------------------------------------------

  describe('mixed scenarios', () => {
    it('only processes supportive actions, ignores offensive/defensive', () => {
      const atkDef = makeActionDef({ id: 'normal_attack', category: 'offensive' });
      const defDef = makeActionDef({ id: 'defend', category: 'defensive' });
      const healDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 10,
        healPercent: 0,
      });

      const participants = [
        makeParticipant({ playerId: 'dps', maxHp: 100 }),
        makeParticipant({ playerId: 'tank', maxHp: 100 }),
        makeParticipant({ playerId: 'healer', maxHp: 100 }),
      ];
      const pState = [
        makeState({ playerId: 'dps', hp: 50, actionDef: atkDef }),
        makeState({ playerId: 'tank', hp: 50, actionDef: defDef }),
        makeState({ playerId: 'healer', hp: 50, actionDef: healDef }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'dps', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'tank', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'healer', threat: 0, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      expect(pState[0].hp).toBe(50); // unchanged
      expect(pState[1].hp).toBe(50); // unchanged
      expect(pState[2].hp).toBe(60); // healed +10
    });

    it('handles null actionDef gracefully', () => {
      const participants = [makeParticipant()];
      const pState = [makeState({ hp: 50, actionDef: null })];
      const threatTable: ThreatEntry[] = [{ playerId: 'p1', threat: 0, tauntRoundsRemaining: 0 }];

      resolveSupportiveActions(participants, pState, threatTable);

      expect(pState[0].hp).toBe(50); // unchanged
    });

    it('processes multiple healers in the same round', () => {
      const healSelfDef = makeActionDef({
        id: 'heal_self',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 10,
        healPercent: 0,
      });
      const healAllyDef = makeActionDef({
        id: 'heal_ally',
        actionType: 'heal_ally',
        category: 'supportive',
        healFlat: 15,
        healPercent: 0,
      });

      const participants = [
        makeParticipant({ playerId: 'h1', maxHp: 100 }),
        makeParticipant({ playerId: 'h2', maxHp: 100, healTargetPlayerId: 'tank' }),
        makeParticipant({ playerId: 'tank', maxHp: 200 }),
      ];
      const pState = [
        makeState({ playerId: 'h1', hp: 60, actionDef: healSelfDef }),
        makeState({ playerId: 'h2', hp: 80, actionDef: healAllyDef }),
        makeState({ playerId: 'tank', hp: 100 }),
      ];
      const threatTable: ThreatEntry[] = [
        { playerId: 'h1', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'h2', threat: 0, tauntRoundsRemaining: 0 },
        { playerId: 'tank', threat: 0, tauntRoundsRemaining: 0 },
      ];

      resolveSupportiveActions(participants, pState, threatTable);

      expect(pState[0].hp).toBe(70);  // h1 healed self +10
      expect(pState[2].hp).toBe(115); // tank healed +15 by h2
      expect(pState[0].healingDone).toBe(10);
      expect(pState[1].healingDone).toBe(15);
    });
  });
});

// ===========================================================================
// applyResourceCosts
// ===========================================================================

describe('applyResourceCosts', () => {
  it('deducts stamina and mana cost for a non-exhausted action', () => {
    const atkDef = makeActionDef({
      id: 'heavy_attack',
      cost: { stamina: 15, mana: 0 },
    });

    const participants = [makeParticipant({ maxStamina: 50, maxMana: 30, staminaRegenPerRound: 5, manaRegenPerRound: 3 })];
    const pState = [makeState({ stamina: 40, mana: 20, actionDef: atkDef, wasExhausted: false, templateRound: 0 })];

    applyResourceCosts(participants, pState);

    // stamina: 40 - 15 + 5 = 30
    // mana: 20 - 0 + 3 = 23
    expect(pState[0].stamina).toBe(30);
    expect(pState[0].mana).toBe(23);
    expect(pState[0].templateRound).toBe(1);
  });

  it('does not deduct cost when action was exhausted', () => {
    const atkDef = makeActionDef({
      id: 'heavy_attack',
      cost: { stamina: 15, mana: 0 },
    });

    const participants = [makeParticipant({ maxStamina: 50, maxMana: 30, staminaRegenPerRound: 5, manaRegenPerRound: 3 })];
    const pState = [makeState({ stamina: 40, mana: 20, actionDef: atkDef, wasExhausted: true, templateRound: 0 })];

    applyResourceCosts(participants, pState);

    // No deduction, only regen applied
    // stamina: 40 + 5 = 45
    // mana: 20 + 3 = 23
    expect(pState[0].stamina).toBe(45);
    expect(pState[0].mana).toBe(23);
  });

  it('caps resources at max after regen', () => {
    const atkDef = makeActionDef({
      id: 'light_attack',
      cost: { stamina: 2, mana: 0 },
    });

    const participants = [makeParticipant({ maxStamina: 50, maxMana: 30, staminaRegenPerRound: 10, manaRegenPerRound: 10 })];
    const pState = [makeState({ stamina: 48, mana: 28, actionDef: atkDef, wasExhausted: false, templateRound: 0 })];

    applyResourceCosts(participants, pState);

    // stamina: 48 - 2 + 10 = 56, capped at 50
    // mana: 28 - 0 + 10 = 38, capped at 30
    expect(pState[0].stamina).toBe(50);
    expect(pState[0].mana).toBe(30);
  });

  it('applies regen even when actionDef is null', () => {
    const participants = [makeParticipant({ maxStamina: 50, maxMana: 30, staminaRegenPerRound: 5, manaRegenPerRound: 3 })];
    const pState = [makeState({ stamina: 20, mana: 10, actionDef: null, wasExhausted: false, templateRound: 0 })];

    applyResourceCosts(participants, pState);

    // No cost to deduct, only regen
    expect(pState[0].stamina).toBe(25);
    expect(pState[0].mana).toBe(13);
    expect(pState[0].templateRound).toBe(1);
  });

  it('advances templateRound for all participants', () => {
    const participants = [
      makeParticipant({ playerId: 'p1', staminaRegenPerRound: 0, manaRegenPerRound: 0 }),
      makeParticipant({ playerId: 'p2', staminaRegenPerRound: 0, manaRegenPerRound: 0 }),
    ];
    const pState = [
      makeState({ playerId: 'p1', templateRound: 3, actionDef: null }),
      makeState({ playerId: 'p2', templateRound: 7, actionDef: null }),
    ];

    applyResourceCosts(participants, pState);

    expect(pState[0].templateRound).toBe(4);
    expect(pState[1].templateRound).toBe(8);
  });

  it('handles both stamina and mana costs', () => {
    const spellDef = makeActionDef({
      id: 'damage_spell',
      cost: { stamina: 5, mana: 20 },
    });

    const participants = [makeParticipant({ maxStamina: 50, maxMana: 100, staminaRegenPerRound: 3, manaRegenPerRound: 5 })];
    const pState = [makeState({ stamina: 30, mana: 50, actionDef: spellDef, wasExhausted: false, templateRound: 0 })];

    applyResourceCosts(participants, pState);

    // stamina: 30 - 5 + 3 = 28
    // mana: 50 - 20 + 5 = 35
    expect(pState[0].stamina).toBe(28);
    expect(pState[0].mana).toBe(35);
  });

  it('allows resources to go below zero from cost before regen', () => {
    // Edge case: if cost exceeds current stamina, it goes negative, then regen brings it up
    const expensiveDef = makeActionDef({
      id: 'expensive_move',
      cost: { stamina: 30, mana: 0 },
    });

    const participants = [makeParticipant({ maxStamina: 50, maxMana: 30, staminaRegenPerRound: 5, manaRegenPerRound: 0 })];
    const pState = [makeState({ stamina: 10, mana: 0, actionDef: expensiveDef, wasExhausted: false, templateRound: 0 })];

    applyResourceCosts(participants, pState);

    // stamina: 10 - 30 + 5 = -15, NOT capped at 0 (Math.min with max only caps upper)
    expect(pState[0].stamina).toBe(-15);
    expect(pState[0].templateRound).toBe(1);
  });

  it('processes multiple participants independently', () => {
    const atk1 = makeActionDef({ id: 'light', cost: { stamina: 5, mana: 0 } });
    const atk2 = makeActionDef({ id: 'spell', cost: { stamina: 0, mana: 10 } });

    const participants = [
      makeParticipant({ playerId: 'p1', maxStamina: 40, maxMana: 20, staminaRegenPerRound: 3, manaRegenPerRound: 2 }),
      makeParticipant({ playerId: 'p2', maxStamina: 60, maxMana: 80, staminaRegenPerRound: 4, manaRegenPerRound: 6 }),
    ];
    const pState = [
      makeState({ playerId: 'p1', stamina: 30, mana: 15, actionDef: atk1, wasExhausted: false, templateRound: 2 }),
      makeState({ playerId: 'p2', stamina: 50, mana: 40, actionDef: atk2, wasExhausted: false, templateRound: 5 }),
    ];

    applyResourceCosts(participants, pState);

    // p1: stamina = 30 - 5 + 3 = 28, mana = 15 - 0 + 2 = 17
    expect(pState[0].stamina).toBe(28);
    expect(pState[0].mana).toBe(17);
    expect(pState[0].templateRound).toBe(3);

    // p2: stamina = 50 - 0 + 4 = 54, mana = 40 - 10 + 6 = 36
    expect(pState[1].stamina).toBe(54);
    expect(pState[1].mana).toBe(36);
    expect(pState[1].templateRound).toBe(6);
  });

  it('zero regen means only cost is applied', () => {
    const atkDef = makeActionDef({ id: 'attack', cost: { stamina: 10, mana: 5 } });

    const participants = [makeParticipant({ maxStamina: 50, maxMana: 30, staminaRegenPerRound: 0, manaRegenPerRound: 0 })];
    const pState = [makeState({ stamina: 40, mana: 20, actionDef: atkDef, wasExhausted: false, templateRound: 0 })];

    applyResourceCosts(participants, pState);

    expect(pState[0].stamina).toBe(30);
    expect(pState[0].mana).toBe(15);
  });
});
