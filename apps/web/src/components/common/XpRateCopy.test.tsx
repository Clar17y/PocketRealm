import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SKILL_CONSTANTS } from '@pocketrealm/shared';

import { XpRateTooltip } from './XpRateTooltip';
import { XpRateTutorial } from './XpRateTutorial';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
});

describe('XP Rate copy', () => {
  it('shows the configured XP window duration in the tooltip', () => {
    render(<XpRateTooltip />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'XP Rate info' }));

    expect(
      screen.getByText(
        `Your XP rate decreases as you train a skill during its ${SKILL_CONSTANTS.XP_WINDOW_HOURS}-hour rolling window. Take a break or train other skills!`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/6-hour window/i)).toBeNull();
  });

  it('shows the configured XP window duration in the tutorial popup', async () => {
    render(<XpRateTutorial skillName="Alchemy" rate={40} />);

    expect(
      await screen.findByText(
        `Uses a ${SKILL_CONSTANTS.XP_WINDOW_HOURS}-hour rolling window per skill`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Resets every 6 hours/i)).toBeNull();
  });
});
