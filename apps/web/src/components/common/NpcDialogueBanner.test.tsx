// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NpcDialogueBanner } from './NpcDialogueBanner';

vi.mock('../../lib/npcLineRotation', () => ({
  getNextNpcLine: vi.fn(() => 'Normal line'),
}));

vi.mock('../../hooks/useSessionStorageToggle', () => ({
  useSessionStorageToggle: () => [true, vi.fn()] as const,
}));

vi.mock('../../hooks/useNpcActivityReaction', () => ({
  useNpcActivityReaction: vi.fn(() => null),
}));

afterEach(() => cleanup());

describe('NpcDialogueBanner', () => {
  it('renders an activity priority line before normal rotation', () => {
    render(
      <NpcDialogueBanner
        npcKey="millbrook-blacksmith"
        event="greeting"
        showDialogue
        activityLine="An Epic Steel Greatsword, was it? Good."
      />,
    );

    expect(screen.getByText(/Epic Steel Greatsword/)).toBeTruthy();
    expect(screen.queryByText(/Normal line/)).toBeNull();
  });
});
