import { BASE_ACTION_DEFINITIONS } from '../constants/combatActionDefinitions';
import type { CombatActionType } from '../types/combatAction.types';
import { ALL_EQUIPMENT_SLOTS, type EquipmentSlot } from '../types/player.types';
import type {
  CraftMark,
  EquipmentActionModifier,
  EquipmentActionModifierEntry,
  EquipmentActionModifierStat,
  ItemStatModifier,
} from '../types/vocation.types';

const VALID_ACTION_TYPES = new Set<CombatActionType>([
  'light_attack',
  'normal_attack',
  'heavy_attack',
  'skill_attack',
  'damage_spell',
  'debuff_spell',
  'buff',
  'heal_self',
  'heal_ally',
  'taunt',
  'use_potion',
  'use_cleanse_potion',
  'use_buff_potion',
  'defend',
  'counter',
  'ward',
]);

const VALID_ACTION_IDS = new Set(Object.keys(BASE_ACTION_DEFINITIONS));
const VALID_EQUIPMENT_SLOTS = new Set<string>(ALL_EQUIPMENT_SLOTS);
const VALID_ACTION_MODIFIER_STATS = new Set<EquipmentActionModifierStat>([
  'damage',
  'accuracy',
  'defence',
  'dodge',
  'healing',
  'resourceCost',
  'durabilityWear',
]);
const VALID_ITEM_STATS = new Set<ItemStatModifier['stat']>([
  'attack',
  'rangedPower',
  'magicPower',
  'accuracy',
  'dodge',
  'armor',
  'magicDefence',
  'health',
  'critChance',
  'critDamage',
  'luck',
]);

export function parseCraftMarks(value: unknown): CraftMark[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const mark = parseCraftMark(entry);
    return mark ? [mark] : [];
  });
}

export function getEquipmentActionModifiers(input: {
  slot: string;
  craftMarks: CraftMark[];
}): EquipmentActionModifier[] {
  if (!VALID_EQUIPMENT_SLOTS.has(input.slot)) {
    return [];
  }

  return input.craftMarks.flatMap((mark) => (
    (mark.actionModifiers ?? []).filter((modifier) => (
      modifier.equipmentSlots.includes(input.slot as EquipmentSlot) &&
      targetsKnownAction(modifier)
    ))
  ));
}

function parseCraftMark(value: unknown): CraftMark | null {
  if (!isRecord(value)) {
    return null;
  }

  const markId = readString(value.markId);
  const name = readString(value.name);
  const sourceTechniqueId = readString(value.sourceTechniqueId);
  const description = readString(value.description);
  if (!markId || !name || !sourceTechniqueId || !description) {
    return null;
  }

  const itemStatBenefits = parseItemStatModifiers(value.itemStatBenefits);
  const itemStatDrawbacks = parseItemStatModifiers(value.itemStatDrawbacks);
  const actionModifiers = parseActionModifiers(value.actionModifiers);
  if (itemStatBenefits === null || itemStatDrawbacks === null || actionModifiers === null) {
    return null;
  }

  return {
    markId,
    name,
    sourceTechniqueId,
    description,
    ...(itemStatBenefits.length > 0 ? { itemStatBenefits } : {}),
    ...(itemStatDrawbacks.length > 0 ? { itemStatDrawbacks } : {}),
    ...(actionModifiers.length > 0 ? { actionModifiers } : {}),
  };
}

function parseActionModifiers(value: unknown): EquipmentActionModifier[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const modifiers: EquipmentActionModifier[] = [];
  for (const entry of value) {
    const modifier = parseActionModifier(entry);
    if (!modifier) {
      return null;
    }
    modifiers.push(modifier);
  }

  return modifiers;
}

function parseActionModifier(value: unknown): EquipmentActionModifier | null {
  if (!isRecord(value)) {
    return null;
  }

  const modifierId = readString(value.modifierId);
  const equipmentSlots = readStringArray(value.equipmentSlots);
  const actionTypes = readStringArray(value.actionTypes);
  const actionIds = value.actionIds === undefined ? undefined : readStringArray(value.actionIds);
  const benefits = parseActionModifierEntries(value.benefits);
  const drawbacks = parseActionModifierEntries(value.drawbacks);

  if (
    !modifierId ||
    !equipmentSlots ||
    equipmentSlots.some((slot) => !VALID_EQUIPMENT_SLOTS.has(slot)) ||
    !actionTypes ||
    actionIds === null ||
    benefits === null ||
    drawbacks === null
  ) {
    return null;
  }

  return {
    modifierId,
    equipmentSlots: equipmentSlots as EquipmentSlot[],
    actionTypes: actionTypes as CombatActionType[],
    ...(actionIds ? { actionIds } : {}),
    benefits,
    drawbacks,
  };
}

function parseActionModifierEntries(value: unknown): EquipmentActionModifierEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries: EquipmentActionModifierEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !VALID_ACTION_MODIFIER_STATS.has(entry.stat as EquipmentActionModifierStat)) {
      return null;
    }
    const valueNumber = readNumber(entry.value);
    const isPercent = readBoolean(entry.isPercent);
    if (valueNumber === null || isPercent === null) {
      return null;
    }

    entries.push({
      stat: entry.stat as EquipmentActionModifierStat,
      value: valueNumber,
      isPercent,
    });
  }

  return entries;
}

function parseItemStatModifiers(value: unknown): ItemStatModifier[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const modifiers: ItemStatModifier[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !VALID_ITEM_STATS.has(entry.stat as ItemStatModifier['stat'])) {
      return null;
    }
    const valueNumber = readNumber(entry.value);
    const isPercent = readBoolean(entry.isPercent);
    if (valueNumber === null || isPercent === null) {
      return null;
    }

    modifiers.push({
      stat: entry.stat as ItemStatModifier['stat'],
      value: valueNumber,
      isPercent,
    });
  }

  return modifiers;
}

function targetsKnownAction(modifier: EquipmentActionModifier): boolean {
  return (
    modifier.actionTypes.some((actionType) => VALID_ACTION_TYPES.has(actionType)) ||
    (modifier.actionIds ?? []).some((actionId) => VALID_ACTION_IDS.has(actionId))
  );
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return null;
  }

  return value;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
