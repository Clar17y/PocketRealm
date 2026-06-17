import { DUEL_CUSTOM_EMOJI } from './duelCustomEmoji.js';

/**
 * Resolve a duel emoji by name to its custom application-emoji form
 * (`<:name:id>`), falling back to a Unicode placeholder when the custom emoji
 * has not been uploaded yet (see duelCustomEmoji.ts). This is the single seam
 * that turns Codex's PNG pack into rendered emoji once uploaded.
 */
export function customEmoji(name: string, fallback: string): string {
  const id = DUEL_CUSTOM_EMOJI[name];
  return id ? `<:${name}:${id}>` : fallback;
}

/**
 * Emoji used to render duel resource bars in Discord messages. Each cell is a
 * named custom emoji with a Unicode fallback, so the bars render on every
 * platform with or without the uploaded art.
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
  hp: { full: customEmoji('hp_full', '🟩'), empty: customEmoji('bar_empty', '⬛') },
  mp: { full: customEmoji('mp_full', '🟦'), empty: customEmoji('bar_empty', '⬛') },
  sta: { full: customEmoji('sta_full', '🟨'), empty: customEmoji('bar_empty', '⬛') },
};

export const DEFAULT_DUEL_BAR_WIDTH = 10;

/**
 * Icons shown at the start of each replay log line, by action kind. Each is a
 * named custom emoji with a Unicode fallback (see `customEmoji`). Names match
 * the asset pack in docs/assets/discord-duel-emojis/icons.
 */
export interface DuelActionIcons {
  physical: string;
  magic: string;
  crit: string;
  miss: string;
  heal_hp: string;
  heal_sta: string;
  heal_mp: string;
  defend: string;
  counter: string;
  ward: string;
  potion: string;
  cleanse: string;
  ko: string;
}

/** Icons for the duel result card outcome line. Same swap-point convention. */
export interface DuelResultIcons {
  victory: string;
  draw: string;
}

export const DEFAULT_DUEL_RESULT_ICONS: DuelResultIcons = {
  victory: customEmoji('victory', '🏆'),
  draw: customEmoji('draw', '🤝'),
};

export const DEFAULT_DUEL_ACTION_ICONS: DuelActionIcons = {
  physical: customEmoji('physical', '⚔️'),
  magic: customEmoji('magic', '🔮'),
  crit: customEmoji('crit', '💥'),
  miss: customEmoji('miss', '💨'),
  heal_hp: customEmoji('heal_hp', '💚'),
  heal_sta: customEmoji('heal_sta', '💛'),
  heal_mp: customEmoji('heal_mp', '💙'),
  defend: customEmoji('defend', '🛡️'),
  counter: customEmoji('counter', '↩️'),
  ward: customEmoji('ward', '🔰'),
  potion: customEmoji('potion', '🧪'),
  cleanse: customEmoji('cleanse', '🫧'),
  ko: customEmoji('ko', '💀'),
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
