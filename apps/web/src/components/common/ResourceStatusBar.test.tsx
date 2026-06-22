import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceStatusBar } from './ResourceStatusBar';

const defaultProps = {
  currentHp: 100,
  maxHp: 100,
  currentStamina: 100,
  maxStamina: 100,
  currentMana: 50,
  maxMana: 50,
  onQuickRest: vi.fn(),
};

describe('ResourceStatusBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows rest when HP is full but stamina is missing', () => {
    render(<ResourceStatusBar {...defaultProps} currentStamina={40} />);

    expect(screen.getByRole('button', { name: 'Rest 100%' })).toBeDefined();
  });

  it('shows rest when HP is full but mana is missing', () => {
    render(<ResourceStatusBar {...defaultProps} currentMana={10} />);

    expect(screen.getByRole('button', { name: 'Rest 100%' })).toBeDefined();
  });

  it('hides rest when HP, stamina, and mana are full', () => {
    render(<ResourceStatusBar {...defaultProps} />);

    expect(screen.queryByRole('button', { name: 'Rest 100%' })).toBeNull();
  });
});
