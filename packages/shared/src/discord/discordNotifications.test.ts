import { describe, expect, it } from 'vitest';
import {
  DISCORD_NOTIFICATION_TYPES,
  DISCORD_NOTIFICATION_TYPE_LABELS,
  isDiscordNotificationType,
} from './discordNotifications';

describe('discordNotifications', () => {
  it('exposes turns_capped as a known type', () => {
    expect(DISCORD_NOTIFICATION_TYPES).toContain('turns_capped');
  });

  it('has a label for every type', () => {
    for (const type of DISCORD_NOTIFICATION_TYPES) {
      expect(DISCORD_NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it('narrows arbitrary strings to notification types', () => {
    expect(isDiscordNotificationType('turns_capped')).toBe(true);
    expect(isDiscordNotificationType('boss_spawned')).toBe(false);
  });
});
