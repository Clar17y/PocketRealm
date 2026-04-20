'use client';

import type { TitleStyleVariant } from '@pocketrealm/shared';
import { RARITY_COLORS, rarityFromTier } from '@/lib/rarity';

interface PlayerTitleProps {
  title: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  className?: string;
  bracketed?: boolean;
}

function getTitleStyleClass(titleStyle?: TitleStyleVariant): string | null {
  switch (titleStyle) {
    case 'rainbow':
      return 'rainbow-title';
    default:
      return null;
  }
}

export function PlayerTitle({
  title,
  titleTier,
  titleStyle,
  className,
  bracketed = false,
}: PlayerTitleProps) {
  const styleClass = getTitleStyleClass(titleStyle);
  const classes = [className, styleClass].filter(Boolean).join(' ');

  return (
    <span
      className={classes || undefined}
      style={styleClass ? undefined : { color: RARITY_COLORS[rarityFromTier(titleTier ?? 1)] }}
    >
      {bracketed ? `<${title}>` : title}
    </span>
  );
}
