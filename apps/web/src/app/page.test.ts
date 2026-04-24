import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from './page';

vi.mock('next/image', () => ({
  default: ({ fill: _fill, priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) =>
    React.createElement('img', props),
}));

vi.mock('@/components/rankings/LandingRankingsPreview', () => ({
  LandingRankingsPreview: () => React.createElement('div', null, 'landing rankings preview'),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Home page', () => {
  it('frames Champion as Support Pocketrealm one-time purchase copy', () => {
    render(React.createElement(Home));

    expect(screen.getByRole('heading', { name: 'Support Pocketrealm' })).toBeTruthy();
    expect(screen.getByText('£4.99 one-time')).toBeTruthy();
    expect(screen.getByText(/One-time purchase\. Grants 30 days of Champion\./i)).toBeTruthy();
    expect(screen.getByText(/Helps cover the server bill and gently pressures me into shipping more content\./i)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Support Pocketrealm' }).length).toBeGreaterThan(0);
    expect(screen.getByText('landing rankings preview')).toBeTruthy();
  });
});
