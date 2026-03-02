import { describe, expect, it } from 'vitest';
import type { ActionDefinition, CombatTemplateAction } from '@adventure/shared';
import {
  BASE_ACTION_DEFINITIONS,
  COMBAT_ACTION_CONSTANTS,
} from '@adventure/shared';
import {
  resolveAction,
  resolveInteraction,
  type ResolvedAction,
} from './actionResolver';

// --- Helpers ---

function templateOf(...actionIds: string[]): CombatTemplateAction[] {
  return actionIds.map((id) => ({ actionId: id }));
}

function resolved(actionId: string, wasExhausted = false): ResolvedAction {
  return {
    action: BASE_ACTION_DEFINITIONS[actionId],
    wasExhausted,
  };
}

// A magic-damage spell action for testing Ward and Counter interactions
const damageSpell: ActionDefinition = {
  id: 'damage_spell',
  name: 'Fireball',
  description: 'A magic damage spell.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: { stamina: 15, mana: 30 },
  damageMultiplier: 1.2,
  damageType: 'magic',
};

const customDefs: Record<string, ActionDefinition> = {
  ...BASE_ACTION_DEFINITIONS,
  damage_spell: damageSpell,
};

// A supportive channeling action for testing bonus damage vs channeling
const buffAction: ActionDefinition = {
  id: 'buff',
  name: 'Battle Cry',
  description: 'Buff yourself. Channeling.',
  actionType: 'buff',
  category: 'supportive',
  cost: { stamina: 10, mana: 0 },
  isChanneling: true,
};

const customDefsWithBuff: Record<string, ActionDefinition> = {
  ...customDefs,
  buff: buffAction,
};

// ---------------------------------------------------------------------------
// resolveAction
// ---------------------------------------------------------------------------

describe('resolveAction', () => {
  it('returns the correct action from template by round number', () => {
    const template = templateOf('light_attack', 'normal_attack', 'heavy_attack');

    const r1 = resolveAction(template, 1, 100, 100);
    expect(r1.action.id).toBe('light_attack');
    expect(r1.wasExhausted).toBe(false);

    const r2 = resolveAction(template, 2, 100, 100);
    expect(r2.action.id).toBe('normal_attack');

    const r3 = resolveAction(template, 3, 100, 100);
    expect(r3.action.id).toBe('heavy_attack');
  });

  it('loops template correctly (round 7 with 3-action template wraps to index 0)', () => {
    const template = templateOf('light_attack', 'normal_attack', 'heavy_attack');
    // round 7 → (7-1) % 3 = 0 → light_attack
    const result = resolveAction(template, 7, 100, 100);
    expect(result.action.id).toBe('light_attack');
  });

  it('loops to correct indices on various rounds', () => {
    const template = templateOf('light_attack', 'defend', 'counter');
    // round 4 → index 0
    expect(resolveAction(template, 4, 100, 100).action.id).toBe('light_attack');
    // round 5 → index 1
    expect(resolveAction(template, 5, 100, 100).action.id).toBe('defend');
    // round 6 → index 2
    expect(resolveAction(template, 6, 100, 100).action.id).toBe('counter');
  });

  it('falls back to Defend when stamina insufficient', () => {
    // heavy_attack costs 40 stamina
    const template = templateOf('heavy_attack');
    const result = resolveAction(template, 1, 10, 100);
    expect(result.action.id).toBe('defend');
    expect(result.wasExhausted).toBe(true);
  });

  it('falls back to Defend when mana insufficient', () => {
    // ward costs mana
    const template = templateOf('ward');
    const result = resolveAction(template, 1, 100, 0);
    expect(result.action.id).toBe('defend');
    expect(result.wasExhausted).toBe(true);
  });

  it('falls back to Defend when both stamina and mana insufficient', () => {
    const template = templateOf('damage_spell');
    const result = resolveAction(template, 1, 0, 0, customDefs);
    expect(result.action.id).toBe('defend');
    expect(result.wasExhausted).toBe(true);
  });

  it('falls back to Defend when action ID not found', () => {
    const template = templateOf('nonexistent_action');
    const result = resolveAction(template, 1, 100, 100);
    expect(result.action.id).toBe('defend');
    expect(result.wasExhausted).toBe(true);
  });

  it('Defend is always affordable (0 cost)', () => {
    const template = templateOf('defend');
    const result = resolveAction(template, 1, 0, 0);
    expect(result.action.id).toBe('defend');
    expect(result.wasExhausted).toBe(false);
  });

  it('uses custom action definitions when provided', () => {
    const template = templateOf('damage_spell');
    const result = resolveAction(template, 1, 100, 100, customDefs);
    expect(result.action.id).toBe('damage_spell');
    expect(result.wasExhausted).toBe(false);
  });

  it('falls back to defend when action ID is not in provided definitions', () => {
    const sparseCustom: Record<string, ActionDefinition> = {
      damage_spell: damageSpell,
    };
    const template = templateOf('light_attack');
    const result = resolveAction(template, 1, 100, 100, sparseCustom);
    expect(result.action.id).toBe('defend');
    expect(result.wasExhausted).toBe(true);
  });

  it('exactly at cost boundary is affordable', () => {
    // normal_attack costs 20 stamina, 0 mana
    const template = templateOf('normal_attack');
    const result = resolveAction(
      template,
      1,
      COMBAT_ACTION_CONSTANTS.NORMAL_ATTACK_STAMINA,
      0,
    );
    expect(result.action.id).toBe('normal_attack');
    expect(result.wasExhausted).toBe(false);
  });

  it('one stamina short of cost falls back', () => {
    const template = templateOf('normal_attack');
    const result = resolveAction(
      template,
      1,
      COMBAT_ACTION_CONSTANTS.NORMAL_ATTACK_STAMINA - 1,
      0,
    );
    expect(result.action.id).toBe('defend');
    expect(result.wasExhausted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveInteraction
// ---------------------------------------------------------------------------

describe('resolveInteraction', () => {
  it('Counter vs physical attack → attacker guaranteed miss', () => {
    const result = resolveInteraction(
      resolved('normal_attack'),
      resolved('counter'),
    );
    expect(result.attackerHitOverride).toBe('guaranteed_miss');
    // Defender (counter) does no offensive damage, so hit override stays normal
    expect(result.defenderHitOverride).toBe('normal');
  });

  it('Counter vs magic spell → counter wasted (normal hit for attacker)', () => {
    const magicAttacker: ResolvedAction = {
      action: damageSpell,
      wasExhausted: false,
    };
    const result = resolveInteraction(magicAttacker, resolved('counter'));
    // Counter only avoids physical; magic goes through
    expect(result.attackerHitOverride).toBe('normal');
  });

  it('Ward vs magic spell → attacker guaranteed miss', () => {
    const magicAttacker: ResolvedAction = {
      action: damageSpell,
      wasExhausted: false,
    };
    const result = resolveInteraction(magicAttacker, resolved('ward'));
    expect(result.attackerHitOverride).toBe('guaranteed_miss');
  });

  it('Ward vs physical attack → ward wasted (normal hit for attacker)', () => {
    const result = resolveInteraction(
      resolved('normal_attack'),
      resolved('ward'),
    );
    // Ward only resists magic; physical goes through
    expect(result.attackerHitOverride).toBe('normal');
  });

  it('Defend vs any → defender has damage reduction', () => {
    const result = resolveInteraction(
      resolved('normal_attack'),
      resolved('defend'),
    );
    expect(result.defenderDamageReduction).toBe(
      COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION,
    );
    // Attacker hit is normal (defend doesn't avoid, just reduces)
    expect(result.attackerHitOverride).toBe('normal');
  });

  it('Attack vs channeling target → bonus damage multiplier', () => {
    // heavy_attack has isChanneling: true in base definitions
    const result = resolveInteraction(
      resolved('normal_attack'),
      resolved('heavy_attack'),
    );
    // B is channeling, A is offensive → A gets bonus
    expect(result.attackerDamageMultiplier).toBe(
      COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE,
    );
    // A is not channeling → B gets normal multiplier
    // But B (heavy_attack) is also offensive, so A being non-channeling means no bonus for B
    // heavy_attack IS channeling but we're checking A being normal_attack (not channeling)
    expect(result.defenderDamageMultiplier).toBe(1.0);
  });

  it('Buff/heal (channeling) hit by attack → bonus damage on the channeler', () => {
    const buffAttacked: ResolvedAction = {
      action: buffAction,
      wasExhausted: false,
    };
    const result = resolveInteraction(
      resolved('normal_attack'),
      buffAttacked,
    );
    // B is channeling and A is offensive → A gets bonus damage
    expect(result.attackerDamageMultiplier).toBe(
      COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE,
    );
  });

  it('two offensive actions → both normal', () => {
    const result = resolveInteraction(
      resolved('normal_attack'),
      resolved('light_attack'),
    );
    expect(result.attackerHitOverride).toBe('normal');
    expect(result.defenderHitOverride).toBe('normal');
    expect(result.attackerDamageMultiplier).toBe(1.0);
    expect(result.defenderDamageMultiplier).toBe(1.0);
    expect(result.attackerDamageReduction).toBe(0);
    expect(result.defenderDamageReduction).toBe(0);
  });

  it('both defending → both have damage reduction, both normal hit', () => {
    const result = resolveInteraction(
      resolved('defend'),
      resolved('defend'),
    );
    expect(result.attackerHitOverride).toBe('normal');
    expect(result.defenderHitOverride).toBe('normal');
    expect(result.attackerDamageReduction).toBe(
      COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION,
    );
    expect(result.defenderDamageReduction).toBe(
      COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION,
    );
  });

  it('channeling attacker vs offensive defender → attacker takes bonus damage', () => {
    // A is heavy_attack (channeling + offensive), B is normal_attack (offensive)
    const result = resolveInteraction(
      resolved('heavy_attack'),
      resolved('normal_attack'),
    );
    // A is channeling, B is offensive → B gets bonus damage multiplier
    expect(result.defenderDamageMultiplier).toBe(
      COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE,
    );
    // B is not channeling, A is offensive → A gets normal multiplier
    expect(result.attackerDamageMultiplier).toBe(1.0);
  });

  it('both channeling, both offensive → both get bonus damage', () => {
    // Both heavy_attack: channeling + offensive
    const result = resolveInteraction(
      resolved('heavy_attack'),
      resolved('heavy_attack'),
    );
    expect(result.attackerDamageMultiplier).toBe(
      COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE,
    );
    expect(result.defenderDamageMultiplier).toBe(
      COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE,
    );
  });

  it('counter vs counter → neither takes effect (both defensive, no offensive)', () => {
    const result = resolveInteraction(
      resolved('counter'),
      resolved('counter'),
    );
    // Neither is offensive, so avoidsPhysical has nothing to dodge
    expect(result.attackerHitOverride).toBe('normal');
    expect(result.defenderHitOverride).toBe('normal');
  });

  it('magic spell vs ward on attacker side → defender misses', () => {
    // A has ward (resistsMagic), B casts a magic spell
    const wardUser: ResolvedAction = resolved('ward');
    const magicCaster: ResolvedAction = {
      action: damageSpell,
      wasExhausted: false,
    };
    const result = resolveInteraction(wardUser, magicCaster);
    // A has resistsMagic, B has magic damageType → B's hit is guaranteed_miss
    expect(result.defenderHitOverride).toBe('guaranteed_miss');
  });

  it('exhausted action still resolves interaction normally', () => {
    const exhausted: ResolvedAction = {
      action: BASE_ACTION_DEFINITIONS['defend'],
      wasExhausted: true,
    };
    const result = resolveInteraction(
      resolved('normal_attack'),
      exhausted,
    );
    // Exhausted defend still gives damage reduction
    expect(result.defenderDamageReduction).toBe(
      COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION,
    );
    expect(result.attackerHitOverride).toBe('normal');
  });

  it('preserves resolved action references in the result', () => {
    const a = resolved('normal_attack');
    const b = resolved('defend');
    const result = resolveInteraction(a, b);
    expect(result.attackerAction).toBe(a);
    expect(result.defenderAction).toBe(b);
  });
});
