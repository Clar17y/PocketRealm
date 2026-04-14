import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('announces the message as an alert', () => {
    render(React.createElement(ErrorBanner, { message: 'Network error' }));

    expect(screen.getByRole('alert').textContent).toContain('Network error');
  });
});
