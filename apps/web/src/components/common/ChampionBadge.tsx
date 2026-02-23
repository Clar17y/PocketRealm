import { cn } from '@/lib/utils';

interface ChampionBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function ChampionBadge({ size = 'sm', className }: ChampionBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded font-bold',
        'bg-gradient-to-r from-yellow-600 via-amber-400 to-yellow-600',
        'text-[var(--rpg-background)]',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        className
      )}
    >
      Champion
    </span>
  );
}
