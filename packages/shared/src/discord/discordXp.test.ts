import { describe, expect, it } from 'vitest';
import { highestRoleIdForLevel, levelForDiscordXp } from './discordXp';

describe('discord XP helpers', () => {
  it('maps Discord XP totals to community levels', () => {
    expect(levelForDiscordXp(0)).toBe(1);
    expect(levelForDiscordXp(99)).toBe(1);
    expect(levelForDiscordXp(100)).toBe(2);
    expect(levelForDiscordXp(400)).toBe(3);
  });

  it('selects the highest configured role at or below the current level', () => {
    const roles = new Map<number, string>([
      [2, 'role-level-2'],
      [5, 'role-level-5'],
      [10, 'role-level-10'],
    ]);

    expect(highestRoleIdForLevel(1, roles)).toBeNull();
    expect(highestRoleIdForLevel(2, roles)).toBe('role-level-2');
    expect(highestRoleIdForLevel(7, roles)).toBe('role-level-5');
    expect(highestRoleIdForLevel(50, roles)).toBe('role-level-10');
  });
});
