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

  const view = render(React.createElement(Exploration, {
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

  return { onStartExploration, ...view };
}

const prospectableResourceNodes = [
  { resourceNodeId: 'node-copper', resourceType: 'copper_ore', skillRequired: 'mining', levelRequired: 1 },
  { resourceNodeId: 'node-iron', resourceType: 'iron_ore', skillRequired: 'mining', levelRequired: 5 },
];

const skills = [
  { skillType: 'mining', level: 1 },
  { skillType: 'woodcutting', level: 1 },
  { skillType: 'foraging', level: 1 },
];

describe('Exploration', () => {
  it('shows the unlock message when no families are trackable', () => {
    renderExploration();

    expect(screen.getByText('Discover a mob family in this zone before you can track it.')).toBeTruthy();
  });

  it('shows tracking guidance from the info icon instead of inline helper text', () => {
    renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
    });

    expect(screen.queryByText('Reduce total yield to bias ambushes and sites toward one discovered mob family.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.focus(screen.getByRole('button', { name: 'Tracking info' }));

    expect(screen.getByText('Reduce total yield to bias ambushes and sites toward one discovered mob family.')).toBeTruthy();
    expect(screen.getByText('Tracking never bypasses unlocked tiers, and non-family outcomes still remain.')).toBeTruthy();
  });

  it('does not pass a tracking family while tracking is off', () => {
    const { onStartExploration } = renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(onStartExploration).toHaveBeenCalledWith(100, 2, undefined, undefined);
  });

  it('renders a mutually exclusive focus selector', () => {
    renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
      prospectableResourceNodes,
      skills,
    });

    expect(screen.getByRole('group', { name: 'Exploration focus' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'None' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Track' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Prospect' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('passes the selected tracking family when tracking is enabled', () => {
    const { onStartExploration } = renderExploration({
      trackableMobFamilies: [
        { mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 },
        { mobFamilyId: 'family-spider', name: 'Spiders', minTier: 2 },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track Spiders' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(screen.getByRole('button', { name: 'Track Spiders' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Track Wolves' }).getAttribute('aria-pressed')).toBe('false');
    expect(onStartExploration).toHaveBeenCalledWith(100, 2, 'family-spider', undefined);
  });

  it('keeps tier selection available while tracking and uses the selected tier', () => {
    const { onStartExploration } = renderExploration({
      trackableMobFamilies: [
        { mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 },
        { mobFamilyId: 'family-spider', name: 'Spiders', minTier: 2 },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Outskirts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));

    expect(screen.getByText('Exploration Tier')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Track Spiders' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Track Wolves' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(onStartExploration).toHaveBeenCalledWith(100, 1, 'family-wolf', undefined);
  });

  it('shows prospecting resource nodes and starts with the selected resource target', () => {
    const { onStartExploration } = renderExploration({
      prospectableResourceNodes,
      skills,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prospect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prospect Iron Ore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(screen.getByRole('button', { name: 'Prospect Copper Ore' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Prospect Iron Ore' }).getAttribute('aria-pressed')).toBe('true');
    expect(onStartExploration).toHaveBeenCalledWith(100, 2, undefined, 'node-iron');
  });

  it('keeps tier selection available while prospecting', () => {
    renderExploration({
      prospectableResourceNodes,
      skills,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prospect' }));

    expect(screen.getByText('Exploration Tier')).toBeTruthy();
  });

  it('clears prospecting when switching to tracking', () => {
    const { onStartExploration } = renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
      prospectableResourceNodes,
      skills,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prospect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prospect Iron Ore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(onStartExploration).toHaveBeenCalledWith(100, 2, 'family-wolf', undefined);
  });

  it('keeps ambushes unchanged while prospecting changes sites and resources', () => {
    renderExploration({
      prospectableResourceNodes,
      skills,
    });

    expect(screen.getByText('0.5')).toBeTruthy();
    expect(screen.getByText('0.15')).toBeTruthy();
    expect(screen.getByText('0.05')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Prospect' }));

    expect(screen.getByText('0.5')).toBeTruthy();
    expect(screen.getByText('0.05')).toBeTruthy();
    expect(screen.getByText('0.15')).toBeTruthy();
  });

  it('allows above-level resource targets and shows a gathering lock warning', () => {
    renderExploration({
      prospectableResourceNodes,
      skills,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prospect' }));

    expect(screen.getByRole('button', { name: 'Prospect Iron Ore' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('Gathering locked until mining 5')).toBeTruthy();
  });

  it('does not show tracking availability copy while prospecting', () => {
    renderExploration({
      prospectableResourceNodes,
      skills,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prospect' }));

    expect(screen.queryByText('Discover a mob family in this zone before you can track it.')).toBeNull();
  });

  it('drops an invalid selected tier after the zone tier set changes', () => {
    const { onStartExploration, rerender } = renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Interior' }));

    rerender(React.createElement(Exploration, {
      currentZone: { name: 'Cavern Mouth', description: 'Stone', minLevel: 1 },
      explorationProgress: {
        turnsExplored: 500,
        turnsToExplore: 30000,
        percent: 10,
        tiers: { '1': 0, '2': 10 },
      },
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
      availableTurns: 1000,
      onStartExploration,
      activityLog: [],
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Start Exploration' }));

    expect(onStartExploration).toHaveBeenCalledWith(100, 2, undefined, undefined);
  });

  it('updates the expected ambush and site preview while tracking is enabled', () => {
    renderExploration({
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
    });

    expect(screen.getByText('0.5')).toBeTruthy();
    expect(screen.getByText('0.15')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Track' }));

    expect(screen.getByText('0.4')).toBeTruthy();
    expect(screen.getByText('0.11')).toBeTruthy();
  });

  it('hides tracking controls during the tutorial flow', () => {
    renderExploration({
      tutorialLocked: true,
      trackableMobFamilies: [{ mobFamilyId: 'family-wolf', name: 'Wolves', minTier: 1 }],
    });

    expect(screen.queryAllByText('Tracking')).toHaveLength(0);
    expect(screen.queryAllByRole('group', { name: 'Exploration focus' })).toHaveLength(0);
  });
});
