'use client';

import { GUILD_MODIFIER_LABELS } from '@/lib/api/guild';

interface Perk {
  effectType: string;
  value: number;
}

interface PerkBadgesProps {
  perks: readonly Perk[];
  variant: 'gold' | 'surface' | 'custom';
  color?: string;
  bgColor?: string;
  size?: 'xs' | 'sm' | 'md';
  goldOpacity?: 10 | 20;
}

export function PerkBadges({ perks, variant, color, bgColor, size = 'xs', goldOpacity = 20 }: PerkBadgesProps) {
  const sizeClasses = {
    xs: 'text-[10px] px-1 py-0.5',
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  }[size];

  const getStyle = (): { className: string; style?: React.CSSProperties } => {
    switch (variant) {
      case 'gold':
        return { className: `${sizeClasses} rounded bg-[var(--rpg-gold)]/${goldOpacity} text-[var(--rpg-gold)]` };
      case 'surface':
        return { className: `${sizeClasses} rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]` };
      case 'custom':
        return {
          className: `${sizeClasses} rounded`,
          style: { backgroundColor: `${bgColor}20`, color },
        };
    }
  };

  const { className, style } = getStyle();

  return (
    <>
      {perks.map((perk, i) => (
        <span key={i} className={className} style={style}>
          +{Math.round(perk.value * 100)}% {GUILD_MODIFIER_LABELS[perk.effectType] ?? perk.effectType}
        </span>
      ))}
    </>
  );
}
