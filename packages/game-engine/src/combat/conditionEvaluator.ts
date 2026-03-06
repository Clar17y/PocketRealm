import type { ActiveEffect, CombatActor, SlotCondition, ConditionResourceType } from '@adventure/shared';

function getResourcePercent(
  resource: ConditionResourceType,
  hp: number, maxHp: number,
  stamina: number, maxStamina: number,
  mana: number, maxMana: number,
): number {
  switch (resource) {
    case 'hp': return maxHp > 0 ? (hp / maxHp) * 100 : 0;
    case 'stamina': return maxStamina > 0 ? (stamina / maxStamina) * 100 : 0;
    case 'mana': return maxMana > 0 ? (mana / maxMana) * 100 : 0;
  }
}

export function evaluateCondition(
  condition: SlotCondition | undefined,
  hp: number, maxHp: number,
  stamina: number, maxStamina: number,
  mana: number, maxMana: number,
  activeEffects: ActiveEffect[],
  actorKey: CombatActor,
): boolean {
  if (!condition) return false;

  switch (condition.type) {
    case 'resource_below': {
      const pct = getResourcePercent(condition.resource!, hp, maxHp, stamina, maxStamina, mana, maxMana);
      return pct < condition.threshold!;
    }
    case 'resource_above': {
      const pct = getResourcePercent(condition.resource!, hp, maxHp, stamina, maxStamina, mana, maxMana);
      return pct > condition.threshold!;
    }
    case 'has_buff':
      return activeEffects.some(e => e.target === actorKey && e.name === condition.effectName && e.modifier > 0);
    case 'has_debuff':
      return activeEffects.some(e => e.target === actorKey && e.name === condition.effectName);
    case 'no_buff':
      return !activeEffects.some(e => e.target === actorKey && e.name === condition.effectName && e.modifier > 0);
    case 'no_debuff':
      return !activeEffects.some(e => e.target === actorKey && e.name === condition.effectName);
  }
}
