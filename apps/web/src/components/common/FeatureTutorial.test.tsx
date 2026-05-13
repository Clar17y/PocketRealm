import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FeatureTutorial } from './FeatureTutorial';
import { OnboardingUiProvider } from './OnboardingUiContext';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
});

describe('FeatureTutorial', () => {
  it('does not show or mark storage when feature tutorials are disabled', async () => {
    render(
      <OnboardingUiProvider featureTutorialsEnabled={false}>
        <FeatureTutorial storageKey="feature-tutorial-disabled" title="Disabled Tutorial">
          <p>Suppressed content</p>
        </FeatureTutorial>
      </OnboardingUiProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText('Disabled Tutorial')).toBeNull();
    });
    expect(localStorage.getItem('feature-tutorial-disabled')).toBeNull();
  });

  it('shows when enabled and stores dismissal', async () => {
    render(
      <OnboardingUiProvider featureTutorialsEnabled>
        <FeatureTutorial storageKey="feature-tutorial-enabled" title="Enabled Tutorial">
          <p>Visible content</p>
        </FeatureTutorial>
      </OnboardingUiProvider>,
    );

    expect(await screen.findByText('Enabled Tutorial')).toBeTruthy();
    expect(screen.getByText('Visible content')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    await waitFor(() => {
      expect(screen.queryByText('Enabled Tutorial')).toBeNull();
    });
    expect(localStorage.getItem('feature-tutorial-enabled')).toBe('1');
  });

  it('hides immediately without marking storage when feature tutorials become disabled', async () => {
    const { rerender } = render(
      <OnboardingUiProvider featureTutorialsEnabled>
        <FeatureTutorial storageKey="feature-tutorial-rerender" title="Rerender Tutorial">
          <p>Visible before disabling</p>
        </FeatureTutorial>
      </OnboardingUiProvider>,
    );

    expect(await screen.findByText('Rerender Tutorial')).toBeTruthy();

    rerender(
      <OnboardingUiProvider featureTutorialsEnabled={false}>
        <FeatureTutorial storageKey="feature-tutorial-rerender" title="Rerender Tutorial" condition={false}>
          <p>Visible before disabling</p>
        </FeatureTutorial>
      </OnboardingUiProvider>,
    );

    expect(screen.queryByText('Rerender Tutorial')).toBeNull();
    expect(localStorage.getItem('feature-tutorial-rerender')).toBeNull();
  });

  it('hides immediately without marking storage when the condition becomes false', async () => {
    const { rerender } = render(
      <FeatureTutorial storageKey="feature-tutorial-condition" title="Conditional Tutorial">
        <p>Visible before condition changes</p>
      </FeatureTutorial>,
    );

    expect(await screen.findByText('Conditional Tutorial')).toBeTruthy();

    rerender(
      <FeatureTutorial storageKey="feature-tutorial-condition" title="Conditional Tutorial" condition={false}>
        <p>Visible before condition changes</p>
      </FeatureTutorial>,
    );

    expect(screen.queryByText('Conditional Tutorial')).toBeNull();
    expect(localStorage.getItem('feature-tutorial-condition')).toBeNull();
  });
});
