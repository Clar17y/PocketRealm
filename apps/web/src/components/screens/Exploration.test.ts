import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/Slider', () => ({
  Slider: () => React.createElement('div', { 'data-testid': 'slider' }),
}));

import { Exploration } from './Exploration';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderExploration(props: Partial<React.ComponentProps<typeof Exploration>> = {}) {
  const onStartExploration = vi.fn();

  render(React.createElement(Exploration, {
    currentZone: { name: 'Forest Edge', description: 'Trees', minLevel: 1 },
    explorationProgress: {
      turnsExplored: 7500,
      turnsToExplore: 30000,
      percent: 25,
      tiers: { '1': 0, '2': 25, '3': 50, '4': 75 },
    },
    trackableMobFamilies: [],
    availableTurns: 1000,
    onStartExploration,
    activityLog: [],
    ...props,
  }));

  return { onStartExploration };
}

describe('Exploration', () => {
  it('shows the unlock message when no families are trackable', () => {
    renderExploration();

    expect(screen.getByText('Discover a mob family in this zone before you can track it.')).toBeTruthy();
  });

  it('does not pass a tracking family while tracking is off', () => {
    const { onStartExploration } = renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(onStartExploration).toHaveBeenCalledWith(100, 2, undefined);
  });

  it('passes the selected tracking family when tracking is enabled', () => {
    const { onStartExploration } = renderExploration({
      trackableMobFamilies: [
        { mobFamilyId: 'family-wolf', name: 'Wolves' },
        { mobFamilyId: 'family-spider', name: 'Spiders' },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enable tracking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track Spiders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(screen.getByRole('button', { name: 'Track Spiders' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Track Wolves' }).getAttribute('aria-pressed')).toBe('false');
    expect(onStartExploration).toHaveBeenCalledWith(100, 2, 'family-spider');
  });

  it('uses the highest unlocked tier while tracking is enabled', () => {
    const { onStartExploration } = renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Outskirts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable tracking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(onStartExploration).toHaveBeenCalledWith(100, 2, 'family-wolf');
    expect(screen.getByText('Tracking uses your highest unlocked tier')).toBeTruthy();
  });

  it('updates the expected ambush and site preview while tracking is enabled', () => {
    renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves' }],
    });

    expect(screen.getByText('0.5')).toBeTruthy();
    expect(screen.getByText('0.15')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Enable tracking' }));

    expect(screen.getByText('0.4')).toBeTruthy();
    expect(screen.getByText('0.11')).toBeTruthy();
  });

  it('hides tracking controls during the tutorial flow', () => {
    renderExploration({
      tutorialLocked: true,
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves' }],
    });

    expect(screen.queryAllByText('Tracking')).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Enable tracking' })).toHaveLength(0);
  });
});
