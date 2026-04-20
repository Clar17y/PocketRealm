import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import { Achievements } from './Achievements';

afterEach(() => {
  cleanup();
});

vi.mock('@/components/common/FeatureTutorial', () => ({
  FeatureTutorial: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

describe('Achievements', () => {
  it('renders the Support Pocketrealm Champion title with rainbow styling', () => {
    render(
      React.createElement(Achievements, {
        achievements: [
          {
            id: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID,
            category: 'shop',
            title: 'Support Pocketrealm',
            description: 'Support Pocketrealm and unlock the Champion title.',
            titleReward: PREMIUM_CONSTANTS.SUPPORT_TITLE,
            titleStyle: 'rainbow',
            threshold: 0,
            tier: 5,
            progress: 0,
            unlocked: true,
            rewardClaimed: true,
          },
        ],
        unclaimedCount: 0,
        activeTitle: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID,
        onClaim: vi.fn(),
        onSetTitle: vi.fn(),
      }),
    );

    const championTitle = screen.getAllByText(PREMIUM_CONSTANTS.SUPPORT_TITLE)[0];
    expect(championTitle.className).toContain('rainbow-title');
  });
});
