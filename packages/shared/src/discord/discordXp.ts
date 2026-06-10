import { DISCORD_XP_CONSTANTS } from '../constants/gameConstants';

const { LEVEL_CURVE_XP_DIVISOR } = DISCORD_XP_CONSTANTS;

export function levelForDiscordXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  return Math.floor(Math.sqrt(safeXp / LEVEL_CURVE_XP_DIVISOR)) + 1;
}

export function highestRoleIdForLevel(level: number, levelRoleMap: Map<number, string>): string | null {
  let selectedLevel = 0;
  let selectedRoleId: string | null = null;

  for (const [roleLevel, roleId] of levelRoleMap.entries()) {
    if (level >= roleLevel && roleLevel > selectedLevel) {
      selectedLevel = roleLevel;
      selectedRoleId = roleId;
    }
  }

  return selectedRoleId;
}
