import type {
  CraftApplicationRule,
  CraftMarkDefinition,
  EquipmentActionApplicationRule,
  EquipmentActionModifierEntry,
  GatheringApplicationRule,
  ItemStatModifier,
  VocationTechniqueDefinition,
  VocationTechniqueEffect,
} from '../types/vocation.types';

export function describeVocationTechnique(technique: VocationTechniqueDefinition | null | undefined): string {
  if (!technique) return '';

  const target = describeApplicationRule(technique.applicationRule);
  const effects = technique.effects.map(describeEffect).filter((effect) => effect.length > 0);

  return [target, effects.join('; ')].filter(Boolean).join(': ');
}

function describeApplicationRule(rule: VocationTechniqueDefinition['applicationRule']): string {
  if (rule.type === 'craft') {
    return describeCraftRule(rule);
  }
  if (rule.type === 'gathering') {
    return describeGatheringRule(rule);
  }

  return describeEquipmentActionRule(rule);
}

function describeCraftRule(rule: CraftApplicationRule): string {
  const itemTypes = rule.itemTypes.map(formatLowerLabel).join(', ');
  const slots = rule.equipmentSlots?.map(formatLowerLabel).join(', ');

  return [formatTitleLabel(rule.skill), itemTypes, slots].filter(Boolean).join(' ');
}

function describeGatheringRule(rule: GatheringApplicationRule): string {
  return [formatTitleLabel(rule.skill), rule.resourceCategories.map(formatLowerLabel).join(', ')].filter(Boolean).join(' ');
}

function describeEquipmentActionRule(rule: EquipmentActionApplicationRule): string {
  return [
    rule.equipmentSlots.map(formatLowerLabel).join(', '),
    rule.actionTypes.map(formatCombatAction).join(', '),
  ].filter(Boolean).join(' ');
}

function describeEffect(effect: VocationTechniqueEffect): string {
  if (effect.type === 'craft_mark') {
    return describeCraftMark(effect.mark);
  }
  if (effect.type === 'craft_flow_modifier') {
    const parts: string[] = [];
    if (effect.turnCostMultiplier !== undefined) {
      parts.push(`${formatMultiplierDelta(effect.turnCostMultiplier)} turn cost`);
    }
    if (effect.materialCostMultiplier !== undefined) {
      parts.push(`${formatMultiplierDelta(effect.materialCostMultiplier)} material cost`);
    }
    if (effect.outputQuantityDelta !== undefined) {
      parts.push(`${formatSignedNumber(effect.outputQuantityDelta)} output`);
    }
    return `${parts.join(', ')}. ${effect.condition} Drawback: ${effect.drawback}`;
  }
  if (effect.type === 'craft_crit_rule') {
    return `${formatSignedPercent(effect.critChanceDelta)} ${formatLowerLabel(effect.critType)} chance. ${effect.condition} Drawback: ${effect.drawback}`;
  }
  if (effect.type === 'inventory_pressure_yield_rule') {
    return `${formatSignedNumber(effect.outputQuantityDelta)} output when you have at least ${effect.minFreeSlots} free inventory slots; bonus is ${formatLowerLabel(effect.overflowBehavior)} if it would overflow`;
  }
  if (effect.type === 'repeat_node_turn_discount') {
    return `${formatMultiplierDelta(effect.turnCostMultiplier)} turn cost when repeating the same node within ${effect.repeatWindowTurns} turns, up to ${effect.maxStacks} stacks`;
  }
  if (effect.type === 'node_state_turn_discount') {
    return `${formatMultiplierDelta(effect.turnCostMultiplier)} turn cost on ${formatLowerLabel(effect.nodeState)} nodes`;
  }
  if (effect.type === 'preserve_node_capacity_chance') {
    return `${formatChance(effect.chance)} chance to preserve node capacity. ${effect.condition}`;
  }
  if (effect.type === 'crit_chance_delta') {
    return `${formatSignedPercent(effect.value)} ${formatLowerLabel(effect.critType)} chance. ${effect.condition}`;
  }
  if (effect.type === 'tool_durability_loss_multiplier') {
    return `${formatMultiplierDelta(effect.multiplier)} matching tool durability loss. ${effect.condition}`;
  }

  return `${effect.actionTypes.map(formatCombatAction).join(', ')}: ${describeModifierEntries(effect.benefits)}, ${describeModifierEntries(effect.drawbacks)}`;
}

function describeCraftMark(mark: CraftMarkDefinition): string {
  const parts = [
    describeItemStatModifiers(mark.itemStatBenefits),
    describeItemStatModifiers(mark.itemStatDrawbacks),
    ...(mark.actionModifiers ?? []).map((modifier) => (
      `${modifier.actionTypes.map(formatCombatAction).join(', ')}: ${describeModifierEntries(modifier.benefits)}, ${describeModifierEntries(modifier.drawbacks)}`
    )),
  ].filter(Boolean);

  return `applies ${mark.name}${parts.length > 0 ? ` (${parts.join('; ')})` : ''}`;
}

function describeItemStatModifiers(modifiers: readonly ItemStatModifier[]): string {
  return modifiers.map((modifier) => (
    `${formatSignedModifierValue(modifier)} ${formatLowerLabel(modifier.stat)}`
  )).join(', ');
}

function describeModifierEntries(entries: readonly EquipmentActionModifierEntry[]): string {
  return entries.map((entry) => `${formatSignedModifierValue(entry)} ${formatLowerLabel(entry.stat)}`).join(', ');
}

function formatSignedModifierValue(entry: { value: number; isPercent: boolean }): string {
  return entry.isPercent ? formatSignedPercent(entry.value) : formatSignedNumber(entry.value);
}

function formatMultiplierDelta(multiplier: number): string {
  return formatSignedPercent(multiplier - 1);
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
}

function formatChance(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function formatCombatAction(value: string): string {
  return formatLowerLabel(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTitleLabel(value: string): string {
  const label = formatLowerLabel(value);
  return label.replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatLowerLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
}
