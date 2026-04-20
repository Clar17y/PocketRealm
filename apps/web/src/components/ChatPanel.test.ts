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

describe('ChatPanel', () => {
  it('renders styled titles with their titleStyle variant', () => {
    render(
      React.createElement(ChatPanel, {
        isOpen: true,
        toggleChat: vi.fn(),
        activeChannel: 'world',
        setActiveChannel: vi.fn(),
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
        zoneMessages: [],
        casinoMessages: [],
        presence: { worldOnline: 1, zoneOnline: {} },
        unreadWorld: 0,
        unreadZone: 0,
        unreadCasino: 0,
        casinoActive: false,
        sendMessage: vi.fn(),
        rateLimitError: null,
        currentZoneId: null,
        currentZoneName: null,
        playerId: 'p2',
        pinnedMessage: null,
      }),
    );

    const title = screen.getByText('<Champion>');
    expect(title.className).toContain('rainbow-title');
  });
});
