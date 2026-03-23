import {
  CHARACTER_CONSTANTS,
  SKILL_CONSTANTS,
  SkillType,
  COMBAT_SKILLS,
  GATHERING_SKILLS,
  PROCESSING_SKILLS,
  CRAFTING_SKILLS,
  SkillXpResult,
} from '@pocketrealm/shared';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Calculate total XP required to reach a given level.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const base = Math.min(
    SKILL_CONSTANTS.XP_BASE,
    level * SKILL_CONSTANTS.XP_EARLY_LEVEL_SCALE,
  );
  return Math.floor(base * Math.pow(level, SKILL_CONSTANTS.XP_EXPONENT));
}

/**
 * Calculate level from total XP.
 */
export function levelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;

  let level = 1;
  while (level < SKILL_CONSTANTS.MAX_LEVEL && xpForLevel(level + 1) <= totalXp) {
    level++;
  }
  return level;
}

export function characterLevelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;

  let level = 1;
  while (level < CHARACTER_CONSTANTS.MAX_LEVEL && xpForLevel(level + 1) <= totalXp) {
    level++;
  }
  return level;
}

/**
 * Calculate XP needed to reach next level.
 */
export function xpToNextLevel(currentXp: number, currentLevel: number): number {
  if (currentLevel >= SKILL_CONSTANTS.MAX_LEVEL) return 0;
  const nextLevelXp = xpForLevel(currentLevel + 1);
  return Math.max(0, nextLevelXp - currentXp);
}

/**
 * Calculate efficiency based on XP gained in current window.
 * Returns value between 0 and 1.
 */
export function calculateEfficiency(
  windowXpGained: number,
  skillType: SkillType
): number {
  const cap = getWindowCap(skillType);

  if (windowXpGained >= cap) return 0;

  const ratio = windowXpGained / cap;
  const efficiency = Math.max(0, 1 - Math.pow(ratio, SKILL_CONSTANTS.EFFICIENCY_DECAY_POWER));
  return efficiency;
}

/**
 * Get number of XP windows per day.
 */
export function getWindowsPerDay(): number {
  return 24 / SKILL_CONSTANTS.XP_WINDOW_HOURS;
}

/**
 * Get per-window XP cap for a skill type.
 * Daily cap divided by number of windows (2 for 12-hour windows).
 */
export function getWindowCap(skillType: SkillType): number {
  const windowsPerDay = getWindowsPerDay();
  if (COMBAT_SKILLS.includes(skillType)) {
    return Math.floor(SKILL_CONSTANTS.DAILY_CAP_COMBAT / windowsPerDay);
  }
  if (GATHERING_SKILLS.includes(skillType)) {
    return Math.floor(SKILL_CONSTANTS.DAILY_CAP_GATHERING / windowsPerDay);
  }
  if (PROCESSING_SKILLS.includes(skillType)) {
    return Math.floor(SKILL_CONSTANTS.DAILY_CAP_PROCESSING / windowsPerDay);
  }
  if (CRAFTING_SKILLS.includes(skillType)) {
    return Math.floor(SKILL_CONSTANTS.DAILY_CAP_CRAFTING / windowsPerDay);
  }
  return Math.floor(SKILL_CONSTANTS.DAILY_CAP_COMBAT / windowsPerDay);
}

/**
 * Apply XP gain with efficiency modifier.
 * Returns details about the XP gain and any level ups.
 */
export function applyXpGain(
  currentXp: number,
  currentLevel: number,
  windowXpGained: number,
  rawXpGain: number,
  skillType: SkillType
): SkillXpResult {
  const efficiency = calculateEfficiency(windowXpGained, skillType);
  const xpAfterEfficiency = Math.round(rawXpGain * efficiency);

  const newTotalXp = currentXp + xpAfterEfficiency;
  const newLevel = levelFromXp(newTotalXp);
  const newWindowXpGained = windowXpGained + xpAfterEfficiency;
  const atDailyCap = calculateEfficiency(newWindowXpGained, skillType) === 0;

  return {
    xpGained: rawXpGain,
    xpAfterEfficiency,
    efficiency,
    leveledUp: newLevel > currentLevel,
    newLevel,
    atDailyCap,
  };
}

/**
 * Get the window index for a given time (0-(windowsPerDay-1)).
 * Note: window resets are rolling (based on last reset timestamp), so this is informational only.
 */
export function getWindowIndex(date: Date): number {
  const hours = date.getHours();
  return Math.floor(hours / SKILL_CONSTANTS.XP_WINDOW_HOURS);
}

/**
 * Check if window cap reset is needed (rolling window).
 */
export function shouldResetWindowCap(lastResetDate: Date, now: Date = new Date()): boolean {
  const lastResetMs = lastResetDate.getTime();
  const nowMs = now.getTime();
  const elapsedMs = nowMs - lastResetMs;
  if (elapsedMs < 0) return false;
  return elapsedMs >= SKILL_CONSTANTS.XP_WINDOW_HOURS * MS_PER_HOUR;
}

export function calculateCharacterXpGain(skillXpAfterEfficiency: number): number {
  return Math.floor(skillXpAfterEfficiency * CHARACTER_CONSTANTS.XP_RATIO);
}
