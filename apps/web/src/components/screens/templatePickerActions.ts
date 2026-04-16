import {
  ALWAYS_AVAILABLE_ACTION_IDS,
  BASE_ACTION_DEFINITIONS,
  getAllTalentNodes,
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

const EXPLICIT_ACTION_IDS = new Set<string>([
  ...COMBAT_CORE_BASE_ACTION_IDS,
  ...UTILITY_ACTION_IDS,
]);

const ORDERED_TALENT_ACTION_IDS = getAllTalentNodes()
  .map((node) => node.unlocksAction)
  .filter((id): id is string => Boolean(id))
  .filter((id) => !ALWAYS_AVAILABLE_ACTION_IDS.has(id));

function isCombatCoreAction(action: ActionDefinition): boolean {
  return action.category === 'offensive';
}

function buildActions(ids: readonly string[]): ActionDefinition[] {
  return ids.flatMap((id) => {
    const action = BASE_ACTION_DEFINITIONS[id];
    return action ? [action] : [];
  });
}

function partitionActionIds(ids: readonly string[]): { combatCore: string[]; utility: string[] } {
  return ids.reduce<{ combatCore: string[]; utility: string[] }>(
    (sections, id) => {
      const action = BASE_ACTION_DEFINITIONS[id];
      if (!action) {
        return sections;
      }

      if (isCombatCoreAction(action)) {
        sections.combatCore.push(id);
      } else {
        sections.utility.push(id);
      }

      return sections;
    },
    { combatCore: [], utility: [] },
  );
}

export function getTemplatePickerSections(unlockedActions: string[]): TemplatePickerSection[] {
  const unlockedSet = new Set(unlockedActions);
  const visibleTalentActionIds = ORDERED_TALENT_ACTION_IDS.filter((id) => unlockedSet.has(id));
  const visibleTalentActionIdSet = new Set(visibleTalentActionIds);
  const visibleUnlockedFallbackActionIds = unlockedActions.filter((id) => {
    if (EXPLICIT_ACTION_IDS.has(id) || ALWAYS_AVAILABLE_ACTION_IDS.has(id)) {
      return false;
    }

    if (visibleTalentActionIdSet.has(id)) {
      return false;
    }

    return Boolean(BASE_ACTION_DEFINITIONS[id]);
  });
  const remainingAlwaysAvailableActionIds = Array.from(ALWAYS_AVAILABLE_ACTION_IDS).filter(
    (id) => !EXPLICIT_ACTION_IDS.has(id),
  );
  const visibleTalentSections = partitionActionIds(visibleTalentActionIds);
  const visibleUnlockedFallbackSections = partitionActionIds(visibleUnlockedFallbackActionIds);
  const remainingAlwaysAvailableSections = partitionActionIds(remainingAlwaysAvailableActionIds);
  const combatCoreActions = buildActions([
    ...COMBAT_CORE_BASE_ACTION_IDS,
    ...remainingAlwaysAvailableSections.combatCore,
    ...visibleTalentSections.combatCore,
    ...visibleUnlockedFallbackSections.combatCore,
  ]);
  const utilityActions = buildActions([
    ...UTILITY_ACTION_IDS,
    ...remainingAlwaysAvailableSections.utility,
    ...visibleTalentSections.utility,
    ...visibleUnlockedFallbackSections.utility,
  ]);

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

