import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorFallback } from './ErrorFallback';

describe('ErrorFallback', () => {
  it('renders the provided message and action label', () => {
    const onAction = vi.fn();

    render(
      React.createElement(ErrorFallback, {
        message: 'An unexpected error occurred. Try again.',
        actionLabel: 'Try again',
        onAction,
      }),
    );

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(screen.getByRole('alert').textContent).toContain('An unexpected error occurred. Try again.');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
