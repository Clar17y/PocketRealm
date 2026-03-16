export const PERCENT_STATS = new Set(['critChance', 'critDamage']);

export const STAT_ORDER = [
  'attack', 'armor', 'magicDefence', 'health', 'dodge',
  'accuracy', 'magicPower', 'rangedPower', 'luck', 'evasion', 'critChance', 'critDamage',
];

export function prettyStatName(stat: string): string {
  if (stat === 'magicDefence') return 'Magic Defence';
  if (stat === 'magicPower') return 'Magic Power';
  if (stat === 'critChance') return 'Crit Chance';
  if (stat === 'critDamage') return 'Crit Damage';
  return stat
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

export function formatStatValue(stat: string, value: number): string {
  if (PERCENT_STATS.has(stat)) return `${Math.round(value * 100)}%`;
  return String(value);
}

export function formatSignedStatValue(stat: string, value: number): string {
  const formatted = formatStatValue(stat, Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

export function signedClass(value: number, positiveClass: string): string {
  if (value < 0) return 'text-[var(--rpg-red)]';
  return positiveClass;
}

export function numStat(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function statEntries(stats: Record<string, unknown> | null | undefined): Array<[string, number]> {
  return Object.entries(stats ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] !== 0)
    .sort((a, b) => {
      const aOrder = STAT_ORDER.indexOf(a[0]);
      const bOrder = STAT_ORDER.indexOf(b[0]);
      if (aOrder === -1 && bOrder === -1) return a[0].localeCompare(b[0]);
      if (aOrder === -1) return 1;
      if (bOrder === -1) return -1;
      return aOrder - bOrder;
    });
}

export function prettyWeightClass(weightClass?: 'heavy' | 'medium' | 'light' | null): string | null {
  if (!weightClass) return null;
  return `${weightClass[0].toUpperCase()}${weightClass.slice(1)} Armor`;
}
