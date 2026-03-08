import type { ReactNode } from 'react';

type ItemIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const SIZE_CLASSES: Record<ItemIconSize, string> = {
  xs: 'w-6 h-6',
  sm: 'w-7 h-7',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
  xl: 'w-12 h-12',
  '2xl': 'w-14 h-14',
};

interface ItemIconProps {
  imageSrc?: string | null;
  name: string;
  size?: ItemIconSize;
  fallback?: ReactNode;
  className?: string;
}

export function ItemIcon({ imageSrc, name, size = 'md', fallback = '❓', className }: ItemIconProps) {
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={name}
        className={`${SIZE_CLASSES[size]} object-contain image-rendering-pixelated ${className ?? ''}`}
      />
    );
  }
  return <span className={className}>{fallback}</span>;
}
