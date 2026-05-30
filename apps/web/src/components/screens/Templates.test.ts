import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import type { ResourceState } from '@pocketrealm/shared';

vi.mock('@/lib/api', () => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  activateTemplate: vi.fn(),
}));

vi.mock('@/components/common/TemplateTutorial', () => ({
  TemplateTutorial: () => null,
}));

const { getTemplatePickerSections } = vi.hoisted(() => ({
  getTemplatePickerSections: vi.fn(),
}));

vi.mock('./templatePickerActions', () => ({
  getTemplatePickerSections,
}));

import { Templates } from './Templates';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const defaultResourceState: ResourceState = {
  current: 100,
  max: 100,
  regenPerRound: 10,
  regenPerSecond: 1,
  restHealPerTurn: 0,
};

function renderTemplates(
  unlockedActions: string[] = [],
  overrides: {
    staminaState?: ResourceState;
    manaState?: ResourceState;
    templates?: React.ComponentProps<typeof Templates>['templates'];
  } = {},
) {
  return render(React.createElement(Templates, {
    templates: overrides.templates ?? [],
    unlockedActions,
    staminaState: overrides.staminaState ?? defaultResourceState,
    manaState: overrides.manaState ?? defaultResourceState,
    onLoadTemplates: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(),
    onTemplateSaved: vi.fn(),
  }));
}

describe('Templates picker', () => {
  it('uses helper sections when the picker opens', () => {
    getTemplatePickerSections.mockReturnValue([
      {
        key: 'combat-core',
        title: 'Custom Combat',
        actions: [BASE_ACTION_DEFINITIONS.light_attack],
      },
      {
        key: 'utility',
        title: 'Custom Utility',
        actions: [BASE_ACTION_DEFINITIONS.minor_heal],
      },
    ]);

    renderTemplates(['minor_heal']);

    expect(getTemplatePickerSections).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /new template/i }));
    fireEvent.click(screen.getByRole('button', { name: /add action/i }));

    expect(getTemplatePickerSections).toHaveBeenCalledWith(['minor_heal']);
    expect(screen.getByText('Custom Combat')).toBeTruthy();
    expect(screen.getByText('Custom Utility')).toBeTruthy();
    expect(screen.getByText('Light Attack')).toBeTruthy();
    expect(screen.getByText('Minor Heal')).toBeTruthy();
    expect(screen.queryByText('Defend')).toBeNull();
  });

  it('limits resource preview decimals to two places', () => {
    getTemplatePickerSections.mockReturnValue([
      {
        key: 'combat-core',
        title: 'Custom Combat',
        actions: [BASE_ACTION_DEFINITIONS.light_attack],
      },
    ]);

    renderTemplates([], {
      staminaState: { ...defaultResourceState, regenPerRound: 1.2345 },
      manaState: { ...defaultResourceState, regenPerRound: 0.333333333 },
    });

    fireEvent.click(screen.getByRole('button', { name: /new template/i }));
    fireEvent.click(screen.getByRole('button', { name: /add action/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('1.23/cycle')).toBeTruthy();
    expect(screen.getByText('0.33/cycle')).toBeTruthy();
    expect(screen.queryByText(/1\.2345/)).toBeNull();
    expect(screen.queryByText(/0\.333333/)).toBeNull();
  });

  it('summarizes effect conditions with player-facing copy', () => {
    renderTemplates([], {
      templates: [
        {
          id: 'template-1',
          playerId: 'player-1',
          name: 'Cleanse Rotation',
          isActive: true,
          createdAt: '2026-05-29T00:00:00.000Z',
          updatedAt: '2026-05-29T00:00:00.000Z',
          slots: [
            {
              id: 'slot-1',
              sortOrder: 0,
              actionId: 'light_attack',
              condition: { type: 'has_debuff', effectName: 'Poison' },
              thenActionId: 'use_cleanse_potion',
            },
            {
              id: 'slot-2',
              sortOrder: 1,
              actionId: 'battle_cry',
              condition: { type: 'no_buff', effectName: 'Battle Cry' },
              thenActionId: 'battle_cry',
            },
          ],
        },
      ],
    });

    expect(screen.getByText(/If Poison is affecting you/)).toBeTruthy();
    expect(screen.getByText(/Battle Cry is not active/)).toBeTruthy();
    expect(screen.queryByText(/Poison active/)).toBeNull();
    expect(screen.queryByText(/Battle Cry missing/)).toBeNull();
  });
});
