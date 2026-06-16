import { describe, it, expect } from 'vitest';
import { DISCORD_NOTIFICATION_QUEUE, parseNotification } from './notificationContract.js';

describe('notificationContract', () => {
  it('uses the agreed queue key', () => {
    expect(DISCORD_NOTIFICATION_QUEUE).toBe('discord:notifications');
  });

  it('parses a valid message', () => {
    const raw = JSON.stringify({
      discordUserId: 'discord-99',
      type: 'pvpAttack',
      title: 'PvP Attack!',
      body: 'You are under attack',
    });

    expect(parseNotification(raw)).toEqual({
      discordUserId: 'discord-99',
      type: 'pvpAttack',
      title: 'PvP Attack!',
      body: 'You are under attack',
    });
  });

  it('returns null for invalid JSON', () => {
    expect(parseNotification('not json')).toBeNull();
  });

  it('returns null for a message missing required fields', () => {
    expect(parseNotification(JSON.stringify({ discordUserId: 'd', title: 't' }))).toBeNull();
  });
});
