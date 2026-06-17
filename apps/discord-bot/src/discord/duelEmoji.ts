/**
 * Emoji used to render duel resource bars in Discord messages.
 *
 * The defaults below are Unicode squares so the bars render on every platform
 * (including mobile) without any server setup. To switch to custom server art,
 * upload emoji to the guild and replace the `full`/`empty` strings with the
 * `<:name:id>` (or `<a:name:id>` for animated) custom-emoji form — that is the
 * only change required; all rendering flows through this map.
 */
export interface DuelBarStyle {
  full: string;
  empty: string;
}

export interface DuelEmojiSet {
  hp: DuelBarStyle;
  mp: DuelBarStyle;
  sta: DuelBarStyle;
}

export const DEFAULT_DUEL_EMOJI: DuelEmojiSet = {
  hp: { full: '🟩', empty: '⬛' },
  mp: { full: '🟦', empty: '⬛' },
  sta: { full: '🟨', empty: '⬛' },
};

export const DEFAULT_DUEL_BAR_WIDTH = 10;

/**
 * Icons shown at the start of each replay log line, by action outcome.
 *
 * Like the bar emoji above, these are Unicode placeholders that render
 * everywhere. Swapping to a custom game-themed set is a one-place edit:
 * replace each value with its `<:name:id>` (or `<a:name:id>`) custom emoji.
 */
export interface DuelActionIcons {
  attack: string;
  crit: string;
  miss: string;
  heal: string;
  defend: string;
  potion: string;
  cleanse: string;
  spell: string;
  ko: string;
}

/** Icons for the duel result card outcome line. Same swap-point convention. */
export interface DuelResultIcons {
  victory: string;
  draw: string;
}

export const DEFAULT_DUEL_RESULT_ICONS: DuelResultIcons = {
  victory: '🏆',
  draw: '🤝',
};

export const DEFAULT_DUEL_ACTION_ICONS: DuelActionIcons = {
  attack: '⚔️',
  crit: '💥',
  miss: '💨',
  heal: '💚',
  defend: '🛡️',
  potion: '🧪',
  cleanse: '🫧',
  spell: '✨',
  ko: '💀',
};

/** Round a (possibly floating-point regen) resource value for display. */
export function roundResourceValue(value: number): number {
  return Math.round(value);
}

/** Render a fixed-width resource bar from filled/empty emoji cells. */
export function renderResourceBar(
  current: number,
  max: number,
  style: DuelBarStyle,
  width: number = DEFAULT_DUEL_BAR_WIDTH,
): string {
  if (max <= 0) {
    return style.empty.repeat(width);
  }

  const filled = Math.max(0, Math.min(width, Math.round((current / max) * width)));
  return style.full.repeat(filled) + style.empty.repeat(width - filled);
}
