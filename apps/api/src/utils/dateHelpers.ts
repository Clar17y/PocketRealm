/** Start of the current UTC day (midnight). */
export function getDayStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Start of the current UTC week (Monday midnight). */
export function getWeekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/** Next UTC midnight after `now`. */
export function getNextDayStart(now: Date): Date {
  const d = getDayStart(now);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** End of the UTC week (next Monday midnight). */
export function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

/** Level bracket for scaling targets/rewards. */
export function getLevelBracket(level: number): 'low' | 'mid' | 'high' {
  if (level <= 10) return 'low';
  if (level <= 25) return 'mid';
  return 'high';
}

/** Shuffle array in place (Fisher-Yates). */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Select `count` items from `pool` ensuring at least `minCategories` distinct categories.
 * Items must have a `category` string field.
 */
export function selectWithCategorySpread<T extends { category: string }>(
  pool: T[],
  count: number,
  minCategories: number,
): T[] {
  const shuffled = shuffle([...pool]);
  const selected: T[] = [];
  const usedCategories = new Set<string>();

  // First pass: pick from different categories
  for (const def of shuffled) {
    if (selected.length >= count) break;
    if (!usedCategories.has(def.category) && usedCategories.size < minCategories) {
      selected.push(def);
      usedCategories.add(def.category);
    }
  }

  // Second pass: fill remaining slots
  for (const def of shuffled) {
    if (selected.length >= count) break;
    if (!selected.includes(def)) {
      selected.push(def);
      usedCategories.add(def.category);
    }
  }

  // Safety: if still under min categories, swap last pick
  if (usedCategories.size < minCategories && selected.length >= minCategories) {
    const differentCatDef = shuffled.find(
      (d) => !usedCategories.has(d.category) && !selected.includes(d),
    );
    if (differentCatDef) {
      selected[selected.length - 1] = differentCatDef;
    }
  }

  return selected;
}
