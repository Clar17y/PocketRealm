import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';

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

function renderTemplates(unlockedActions: string[] = []) {
  return render(React.createElement(Templates, {
    templates: [],
    unlockedActions,
    staminaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1, restHealPerTurn: 0 },
    manaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1, restHealPerTurn: 0 },
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
});
