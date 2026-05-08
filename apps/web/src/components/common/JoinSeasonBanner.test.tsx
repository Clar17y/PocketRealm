import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoinSeasonBanner } from './JoinSeasonBanner';

afterEach(() => {
  cleanup();
});

describe('JoinSeasonBanner', () => {
  it('describes seasonal characters as separate from Preseason progress', () => {
    render(
      <JoinSeasonBanner
        seasonName="Season 1"
        seasonEndsAt="2099-01-01T00:00:00.000Z"
        suggestedUsername="Rook"
        isJoining={false}
        error={null}
        onJoin={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Create a fresh seasonal character to compete. Your Preseason character stays separate.'),
    ).toBeTruthy();
    expect(screen.queryByText(/permanent realm progress/i)).toBeNull();
  });
});
