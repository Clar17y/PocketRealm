import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TUTORIAL_STEP_WELCOME } from '@/lib/tutorial';
import { TutorialDialog } from './TutorialDialog';

describe('TutorialDialog', () => {
  it('delays display while disabled without replaying dismissed dialogs', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <TutorialDialog tutorialStep={TUTORIAL_STEP_WELCOME} onDismiss={onDismiss} disabled />,
    );

    expect(screen.queryByText('Welcome, Adventurer!')).toBeNull();

    rerender(
      <TutorialDialog tutorialStep={TUTORIAL_STEP_WELCOME} onDismiss={onDismiss} disabled={false} />,
    );

    expect(screen.getByText('Welcome, Adventurer!')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Welcome, Adventurer!')).toBeNull();

    rerender(
      <TutorialDialog tutorialStep={TUTORIAL_STEP_WELCOME} onDismiss={onDismiss} disabled />,
    );
    rerender(
      <TutorialDialog tutorialStep={TUTORIAL_STEP_WELCOME} onDismiss={onDismiss} disabled={false} />,
    );

    expect(screen.queryByText('Welcome, Adventurer!')).toBeNull();
  });
});
