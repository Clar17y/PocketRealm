import {
  ALWAYS_AVAILABLE_ACTION_IDS,
  BASE_ACTION_DEFINITIONS,
  type ActionDefinition,
} from '@pocketrealm/shared';

export interface TemplatePickerSection {
  key: 'combat-core' | 'utility';
  title: string;
  actions: ActionDefinition[];
}

const COMBAT_CORE_BASE_ACTION_IDS = [
  'light_attack',
  'normal_attack',
  'heavy_attack',
  'use_hp_potion',
] as const;

const UTILITY_ACTION_IDS = [
  'defend',
  'counter',
  'ward',
  'use_stamina_potion',
  'use_mana_potion',
  'use_cleanse_potion',
  'use_resist_potion',
  'use_elixir_of_power',
] as const;

const TALENT_ACTION_IDS = Object.keys(BASE_ACTION_DEFINITIONS).filter(
  (id) => !ALWAYS_AVAILABLE_ACTION_IDS.has(id),
);


function buildActions(ids: readonly string[]): ActionDefinition[] {
  return ids.flatMap((id) => {
    const action = BASE_ACTION_DEFINITIONS[id];
    return action ? [action] : [];
  });
}

export function getTemplatePickerSections(unlockedActions: string[]): TemplatePickerSection[] {
  const unlockedSet = new Set(unlockedActions);
  const combatCoreActions = buildActions([
    ...COMBAT_CORE_BASE_ACTION_IDS,
    ...TALENT_ACTION_IDS.filter((id) => unlockedSet.has(id)),
  ]);
  const utilityActions = buildActions(UTILITY_ACTION_IDS);

  return [
    {
      key: 'combat-core',
      title: 'Combat Core',
      actions: combatCoreActions,
    },
    {
      key: 'utility',
      title: 'Utility',
      actions: utilityActions,
    },
  ];
}

