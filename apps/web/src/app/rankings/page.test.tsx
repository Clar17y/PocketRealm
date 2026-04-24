import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/rankings/PublicRankings', () => ({
  PublicRankings: () => React.createElement('div', null, 'public rankings component'),
}));

import RankingsPage from './page';

describe('RankingsPage', () => {
  it('renders the public rankings component', () => {
    render(React.createElement(RankingsPage));

    expect(screen.getByText('public rankings component')).toBeTruthy();
  });
});
