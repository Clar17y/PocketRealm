import type {
  ActionDefinition,
  EquipmentActionModifier,
  EquipmentActionModifierEntry,
} from '@pocketrealm/shared';

export function applyEquipmentActionModifiers(input: {
  action: ActionDefinition;
  modifiers: EquipmentActionModifier[];
}): ActionDefinition {
  let action = copyAction(input.action);

  for (const modifier of input.modifiers) {
    if (!matchesAction(action, modifier)) {
      continue;
    }

    for (const entry of modifier.benefits) {
      action = applyModifierEntry(action, entry);
    }
    for (const entry of modifier.drawbacks) {
      action = applyModifierEntry(action, entry);
    }
  }

  return action;
}

function matchesAction(action: ActionDefinition, modifier: EquipmentActionModifier): boolean {
  return (
    modifier.actionTypes.includes(action.actionType) ||
    (modifier.actionIds ?? []).includes(action.id)
  );
}

function applyModifierEntry(action: ActionDefinition, entry: EquipmentActionModifierEntry): ActionDefinition {
  if (entry.stat === 'damage') {
    return {
      ...action,
      damageMultiplier: applyPercentOrFlat(action.damageMultiplier ?? 1, entry),
    };
  }

  if (entry.stat === 'accuracy') {
    return {
      ...action,
      accuracyModifier: (action.accuracyModifier ?? 0) + accuracyDelta(entry),
    };
  }

  if (entry.stat === 'resourceCost') {
    return {
      ...action,
      cost: {
        stamina: applyResourceCostDelta(action.cost.stamina, entry),
        mana: applyResourceCostDelta(action.cost.mana, entry),
      },
    };
  }

  if (entry.stat === 'durabilityWear') {
    return {
      ...action,
      durabilityWearMultiplier: applyPercentOrFlat(action.durabilityWearMultiplier ?? 1, entry),
    };
  }

  return action;
}

function copyAction(action: ActionDefinition): ActionDefinition {
  const actionCopy = {
    ...action,
    cost: { ...action.cost },
  };

  return action.effect
    ? { ...actionCopy, effect: { ...action.effect } }
    : actionCopy;
}

function applyPercentOrFlat(currentValue: number, entry: EquipmentActionModifierEntry): number {
  return entry.isPercent
    ? currentValue * (1 + entry.value)
    : currentValue + entry.value;
}

function accuracyDelta(entry: EquipmentActionModifierEntry): number {
  return entry.isPercent ? entry.value * 100 : entry.value;
}

function applyResourceCostDelta(currentCost: number, entry: EquipmentActionModifierEntry): number {
  const updatedCost = entry.isPercent
    ? currentCost * (1 + entry.value)
    : currentCost + entry.value;

  return Math.max(0, Math.round(updatedCost));
}
