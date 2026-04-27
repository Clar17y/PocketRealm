import type { TitleStyleVariant } from '@pocketrealm/shared';

export interface LeaderboardCrownCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export interface ParsedLeaderboardMeta {
  username?: string;
  characterLevel?: number;
  isBot?: boolean;
  isAdmin?: boolean;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns?: LeaderboardCrownCounts;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCrownCounts(value: unknown): value is LeaderboardCrownCounts {
  return isRecord(value) &&
    typeof value.gold === 'number' &&
    typeof value.silver === 'number' &&
    typeof value.bronze === 'number';
}

export function parseLeaderboardMeta(raw: unknown): ParsedLeaderboardMeta | null {
  if (typeof raw !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }

    return {
      ...(typeof parsed.username === 'string' ? { username: parsed.username } : {}),
      ...(typeof parsed.characterLevel === 'number' && Number.isFinite(parsed.characterLevel)
        ? { characterLevel: parsed.characterLevel }
        : {}),
      ...(typeof parsed.isBot === 'boolean' ? { isBot: parsed.isBot } : {}),
      ...(typeof parsed.isAdmin === 'boolean' ? { isAdmin: parsed.isAdmin } : {}),
      ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
      ...(typeof parsed.titleTier === 'number' ? { titleTier: parsed.titleTier } : {}),
      ...(typeof parsed.titleStyle === 'string' ? { titleStyle: parsed.titleStyle as TitleStyleVariant } : {}),
      ...(isCrownCounts(parsed.crowns) ? { crowns: parsed.crowns } : {}),
    };
  } catch {
    return null;
  }
}
