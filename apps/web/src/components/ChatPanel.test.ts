import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from './ChatPanel';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

afterEach(() => {
  cleanup();
});

const baseProps: React.ComponentProps<typeof ChatPanel> = {
  isOpen: true,
  toggleChat: vi.fn(),
  activeChannel: 'world',
  setActiveChannel: vi.fn(),
  worldMessages: [],
  globalActivityMessages: [],
  zoneMessages: [],
  guildMessages: [],
  casinoMessages: [],
  presence: { worldOnline: 1, zoneOnline: {} },
  unreadWorld: 0,
  unreadZone: 0,
  unreadGuild: 0,
  unreadCasino: 0,
  guildChatLabel: null,
  casinoActive: false,
  sendMessage: vi.fn(),
  rateLimitError: null,
  currentZoneId: null,
  currentZoneName: null,
  playerId: 'p2',
  pinnedMessage: null,
};

function renderChatPanel(overrides: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  return render(React.createElement(ChatPanel, { ...baseProps, ...overrides }));
}

describe('ChatPanel', () => {
  it('renders styled titles with their titleStyle variant', () => {
    renderChatPanel({
      worldMessages: [
        {
          id: 'm1',
          channelType: 'world',
          channelId: 'world',
          playerId: 'p1',
          username: 'Supporter',
          title: 'Champion',
          titleTier: 5,
          titleStyle: 'rainbow',
          message: 'hello',
          createdAt: new Date('2026-04-18T12:00:00.000Z').toISOString(),
        },
      ],
    });

    const title = screen.getByText('<Champion>');
    expect(title.className).toContain('rainbow-title');
  });

  it('renders world activity messages in the activity shelf, not the main world stream', () => {
    renderChatPanel({
      worldMessages: [
        {
          id: 'm1',
          channelType: 'world',
          channelId: 'world',
          playerId: 'p1',
          username: 'Player',
          message: 'hello',
          createdAt: new Date('2026-04-18T12:00:00.000Z').toISOString(),
        },
      ],
      globalActivityMessages: [
        {
          id: 'a1',
          channelType: 'world',
          channelId: 'world',
          playerId: 'system',
          username: 'System',
          message: 'The Ashen Herald has been defeated.',
          messageType: 'activity',
          createdAt: new Date('2026-04-18T12:01:00.000Z').toISOString(),
        },
      ],
    });

    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('The Ashen Herald has been defeated.')).toBeTruthy();
    expect(screen.getByLabelText('Chat activity')).toBeTruthy();
  });

  it('keeps non-tab controls outside the channel tablist', () => {
    renderChatPanel();

    const channelTablist = screen.getByRole('tablist', { name: 'Chat channels' });

    expect(channelTablist.querySelector('[aria-label="Close chat"]')).toBeNull();
  });

  it('renders the guild tab only when guild chat is available', () => {
    const { rerender } = renderChatPanel({ guildChatLabel: null });

    expect(screen.queryByRole('tab', { name: /guild/i })).toBeNull();

    rerender(React.createElement(ChatPanel, {
      ...baseProps,
      guildChatLabel: '[RUN] Realm Runners',
      unreadGuild: 2,
    }));

    const guildTab = screen.getByRole('tab', { name: /guild/i });
    expect(guildTab.textContent).toContain('Guild');
    expect(guildTab.textContent).toContain('2');
  });
});
