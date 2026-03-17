import type { LucideIcon } from 'lucide-react';
import { Backpack, Crosshair, Heart, Shield, Sparkles, Sword, Target, Zap } from 'lucide-react';

export interface StatDisplayMeta {
  icon: LucideIcon;
  /** Tailwind class form: text-[var(--rpg-red)] */
  cssClass: string;
  /** Raw CSS var form: var(--rpg-red) */
  cssVar: string;
  label: string;
}

const META: Record<string, StatDisplayMeta> = {
  attack:      { icon: Sword,     cssClass: 'text-[var(--rpg-red)]',         cssVar: 'var(--rpg-red)',         label: 'Attack' },
  armor:       { icon: Shield,    cssClass: 'text-[var(--rpg-blue-light)]',  cssVar: 'var(--rpg-blue-light)',  label: 'Armor' },
  magicDefence:{ icon: Sparkles,  cssClass: 'text-[var(--rpg-purple)]',      cssVar: 'var(--rpg-purple)',      label: 'Magic Def' },
  health:      { icon: Heart,     cssClass: 'text-[var(--rpg-green-light)]', cssVar: 'var(--rpg-green-light)', label: 'HP' },
  dodge:       { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Dodge' },
  accuracy:    { icon: Crosshair, cssClass: 'text-[var(--rpg-blue-light)]',  cssVar: 'var(--rpg-blue-light)',  label: 'Accuracy' },
  magicPower:  { icon: Sparkles,  cssClass: 'text-[var(--rpg-purple)]',      cssVar: 'var(--rpg-purple)',      label: 'Magic Power' },
  rangedPower: { icon: Target,    cssClass: 'text-[var(--rpg-green-light)]', cssVar: 'var(--rpg-green-light)', label: 'Ranged Power' },
  luck:        { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Luck' },
  critChance:  { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Crit Chance' },
  critDamage:  { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Crit Damage' },
  evasion:     { icon: Zap,       cssClass: 'text-[var(--rpg-gold)]',        cssVar: 'var(--rpg-gold)',        label: 'Evasion' },
  inventorySlots: { icon: Backpack, cssClass: 'text-[var(--rpg-gold)]',      cssVar: 'var(--rpg-gold)',        label: 'Inventory Slots' },
};
// Aliases for Equipment.tsx total stats panel which uses different property names
META.defence = META.armor;
META.hp = META.health;

const FALLBACK_META: Omit<StatDisplayMeta, 'label'> = {
  icon: Zap,
  cssClass: 'text-[var(--rpg-text-secondary)]',
  cssVar: 'var(--rpg-text-secondary)',
};

export function statDisplayMeta(stat: string): StatDisplayMeta {
  return META[stat] ?? { ...FALLBACK_META, label: prettyStatName(stat) };
}

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
