import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DUEL_ACTION_ICONS,
  DEFAULT_DUEL_EMOJI,
  DEFAULT_DUEL_RESULT_ICONS,
  renderResourceBar,
  roundResourceValue,
} from './duelEmoji.js';

describe('DEFAULT_DUEL_RESULT_ICONS', () => {
  it('provides a non-empty icon for victory and draw', () => {
    expect(DEFAULT_DUEL_RESULT_ICONS.victory).toBeTruthy();
    expect(DEFAULT_DUEL_RESULT_ICONS.draw).toBeTruthy();
  });
});

describe('DEFAULT_DUEL_ACTION_ICONS', () => {
  it('provides a non-empty icon for every action kind', () => {
    const kinds = [
      'physical', 'magic', 'crit', 'miss',
      'heal_hp', 'heal_sta', 'heal_mp',
      'defend', 'counter', 'ward', 'potion', 'cleanse', 'ko',
    ] as const;
    for (const kind of kinds) {
      expect(DEFAULT_DUEL_ACTION_ICONS[kind]).toBeTruthy();
    }
  });
});

describe('roundResourceValue', () => {
  it('rounds floating point regen values to whole numbers for display', () => {
    expect(roundResourceValue(10.80000000000002)).toBe(11);
    expect(roundResourceValue(62.65000000000002)).toBe(63);
  });

  it('leaves whole numbers untouched', () => {
    expect(roundResourceValue(83)).toBe(83);
    expect(roundResourceValue(0)).toBe(0);
  });
});

describe('renderResourceBar', () => {
  const style = DEFAULT_DUEL_EMOJI.hp;

  it('renders a full bar when current equals max', () => {
    const bar = renderResourceBar(100, 100, style, 10);
    expect(bar).toBe(style.full.repeat(10));
  });

  it('renders an empty bar at zero', () => {
    const bar = renderResourceBar(0, 100, style, 10);
    expect(bar).toBe(style.empty.repeat(10));
  });

  it('rounds partial fills to the nearest cell', () => {
    // 17/137 -> 1.24 cells -> rounds to 1 filled
    const bar = renderResourceBar(17, 137, style, 10);
    expect(bar).toBe(style.full.repeat(1) + style.empty.repeat(9));
  });

  it('never overflows when current exceeds max', () => {
    const bar = renderResourceBar(150, 100, style, 10);
    expect(bar).toBe(style.full.repeat(10));
  });

  it('never goes negative when current is below zero', () => {
    const bar = renderResourceBar(-5, 100, style, 10);
    expect(bar).toBe(style.empty.repeat(10));
  });
});
