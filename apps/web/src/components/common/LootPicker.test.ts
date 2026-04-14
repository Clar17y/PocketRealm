import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LootPicker } from './LootPicker';

describe('LootPicker', () => {
  it('labels the dismiss control for assistive tech', () => {
    render(React.createElement(LootPicker, {
      sessionId: 'session-1',
      items: [{ templateName: 'Iron Ore', rarity: 'common', quantity: 1 }],
      availableSlots: 1,
      onClaim: vi.fn(),
      onDismiss: vi.fn(),
    }));

    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
