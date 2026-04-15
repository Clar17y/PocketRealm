import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  activateTemplate: vi.fn(),
}));

vi.mock('@/components/common/TemplateTutorial', () => ({
  TemplateTutorial: () => null,
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
    staminaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 },
    manaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 },
    onLoadTemplates: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(),
    onTemplateSaved: vi.fn(),
  }));
}

describe('Templates picker', () => {
  it('renders only visible actions in the picker', () => {
    renderTemplates([]);

    fireEvent.click(screen.getByRole('button', { name: /new template/i }));
    fireEvent.click(screen.getByRole('button', { name: /add action/i }));

    expect(screen.getByText('Combat Core')).toBeTruthy();
    expect(screen.getByText('Utility')).toBeTruthy();
    expect(screen.getByText('Light Attack')).toBeTruthy();
    expect(screen.getByText('Use Health Potion')).toBeTruthy();
    expect(screen.queryByText('Power Strike')).toBeNull();
  });

  it('shows unlocked talent actions when they are available', () => {
    renderTemplates(['power_strike', 'minor_heal']);

    fireEvent.click(screen.getByRole('button', { name: /new template/i }));
    fireEvent.click(screen.getByRole('button', { name: /add action/i }));

    expect(screen.getByText('Power Strike')).toBeTruthy();
    expect(screen.getByText('Minor Heal')).toBeTruthy();
  });
});
