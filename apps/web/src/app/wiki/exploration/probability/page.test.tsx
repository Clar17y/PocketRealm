import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProbabilityPage from './page';

describe('ProbabilityPage', () => {
  it('formats tiny per-turn chances as meaningful percentages', () => {
    render(<ProbabilityPage />);

    expect(screen.getByText('0.15%')).toBeTruthy();
    expect(screen.getAllByText('0.01%').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.0015')).toBeNull();
    expect(screen.queryByText('0.0001')).toBeNull();
  });
});
