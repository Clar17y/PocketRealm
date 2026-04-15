import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '@pocketrealm/shared';

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

function createAction(id: string, name: string): ActionDefinition {
  return {
    id,
    name,
    description: `${name} description`,
    cost: { stamina: 0, mana: 0 },
    target: 'enemy',
    type: 'attack',
    category: 'physical',
    scaling: { stat: 'strength', ratio: 1 },
    effects: [],
    cooldown: 0,
  };
}

function renderTemplates(unlockedActions: string[] = []) {
  return render(React.createElement(Templates, {
    templates: [],
    unlockedActions,
    staminaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 },
    manaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 },
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
        actions: [createAction('mock_action', 'Mock Slash')],
      },
      {
        key: 'utility',
        title: 'Custom Utility',
        actions: [createAction('support_action', 'Support Pulse')],
      },
    ]);

    renderTemplates(['minor_heal']);

    expect(getTemplatePickerSections).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /new template/i }));
    fireEvent.click(screen.getByRole('button', { name: /add action/i }));

    expect(getTemplatePickerSections).toHaveBeenCalledWith(['minor_heal']);
    expect(screen.getByText('Custom Combat')).toBeTruthy();
    expect(screen.getByText('Custom Utility')).toBeTruthy();
    expect(screen.getByText('Mock Slash')).toBeTruthy();
    expect(screen.getByText('Support Pulse')).toBeTruthy();
    expect(screen.queryByText('Light Attack')).toBeNull();
  });
});
