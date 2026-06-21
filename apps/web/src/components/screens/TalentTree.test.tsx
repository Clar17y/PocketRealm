import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import { TALENT_TREE_DEFINITIONS } from '@pocketrealm/shared/constants/talentTreeDefinitions';
import type { TalentNodeDefinition, TalentTree as TalentTreeName } from '@pocketrealm/shared';
import { TalentTree } from './TalentTree';

vi.mock('@/components/common/SkillTreeTutorial', () => ({
  SkillTreeTutorial: () => null,
}));

afterEach(() => {
  cleanup();
});

function getUnlockNode(tree: TalentTreeName, actionId: string): TalentNodeDefinition {
  const node = TALENT_TREE_DEFINITIONS[tree].find(candidate => candidate.unlocksAction === actionId);
  if (!node) throw new Error(`Missing ${tree} talent node for ${actionId}`);
  return node;
}

function renderTalentTree(
  initialTree: TalentTreeName = 'melee',
  treeOverrides: Partial<Record<TalentTreeName, TalentNodeDefinition[]>> = {},
) {
  return render(
    <TalentTree
      skillPointState={{
        totalPointsEarned: 20,
        totalPointsSpent: 0,
        availablePoints: 20,
        allocations: {},
        unlockedActions: [],
        trees: {
          ...TALENT_TREE_DEFINITIONS,
          ...treeOverrides,
        },
      }}
      skills={[
        { skillType: 'melee', level: 1 },
        { skillType: 'ranged', level: 1 },
        { skillType: 'magic', level: 1 },
      ]}
      onAllocate={vi.fn().mockResolvedValue(undefined)}
      onRespec={vi.fn().mockResolvedValue(undefined)}
      onNavigate={vi.fn()}
      initialTree={initialTree}
    />,
  );
}

describe('TalentTree', () => {
  it('shows stamina and hybrid resource costs from the unlocked action definition', () => {
    renderTalentTree('melee', {
      melee: [
        getUnlockNode('melee', 'power_strike'),
        getUnlockNode('melee', 'flame_sword'),
      ],
    });

    expect(screen.getByText(
      `Stamina ${BASE_ACTION_DEFINITIONS.power_strike.cost.stamina} · ${BASE_ACTION_DEFINITIONS.power_strike.damageMultiplier}x dmg`,
    )).toBeTruthy();
    expect(screen.getByText(
      `Stamina ${BASE_ACTION_DEFINITIONS.flame_sword.cost.stamina} · Mana ${BASE_ACTION_DEFINITIONS.flame_sword.cost.mana} · ${BASE_ACTION_DEFINITIONS.flame_sword.damageMultiplier}x dmg`,
    )).toBeTruthy();
  });

  it('shows AoE damage metadata for multi-target action unlocks', () => {
    renderTalentTree('melee', {
      melee: [getUnlockNode('melee', 'cleave')],
    });

    expect(screen.getByText(
      `Stamina ${BASE_ACTION_DEFINITIONS.cleave.cost.stamina} · ${BASE_ACTION_DEFINITIONS.cleave.damageMultiplier}x AoE dmg`,
    )).toBeTruthy();
  });

  it('shows mana costs from the unlocked action definition', () => {
    renderTalentTree('magic', {
      magic: [getUnlockNode('magic', 'fire_bolt')],
    });

    expect(screen.getByText(
      `Mana ${BASE_ACTION_DEFINITIONS.fire_bolt.cost.mana} · ${BASE_ACTION_DEFINITIONS.fire_bolt.damageMultiplier}x dmg`,
    )).toBeTruthy();
  });

  it('keeps the unlock label when an action definition is missing', () => {
    renderTalentTree('melee', {
      melee: [
        {
          id: 'melee_missing_action',
          tree: 'melee',
          tier: 1,
          name: 'Missing Action',
          description: 'Unlocks a placeholder action.',
          pointCost: 1,
          prerequisites: [],
          unlocksAction: 'missing_action',
        },
      ],
    });

    expect(screen.getByText('Unlocks: Missing Action')).toBeTruthy();
    expect(screen.queryByText(/Stamina|Mana|Free|dmg/)).toBeNull();
  });
});
