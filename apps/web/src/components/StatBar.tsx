import { cn } from '@/lib/utils';

interface StatBarProps {
  current: number;
  max: number;
  label?: string;
  color?: 'health' | 'mana' | 'stamina' | 'xp' | 'gold' | 'durability';
  showNumbers?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatBar({
  current,
  max,
  label,
  color = 'health',
  showNumbers = true,
  size = 'md',
  className,
}: StatBarProps) {
  const percentage = Math.min((current / max) * 100, 100);

  const durabilityColor =
    current <= 0
      ? 'bg-[var(--rpg-red)]'
      : percentage < 10
        ? 'bg-[var(--rpg-gold)]'
        : 'bg-[var(--rpg-text-secondary)]';

  const colorClasses = {
    health: 'bg-[var(--rpg-green-light)]',
    mana: 'bg-[var(--rpg-blue-light)]',
    stamina: 'bg-teal-400',
    xp: 'bg-[var(--rpg-gold)]',
    gold: 'bg-[var(--rpg-gold)]',
    durability: durabilityColor,
  };

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  return (
    <div className={cn('w-full', className)}>
      {(label || showNumbers) && (
        <div className="flex justify-between items-center mb-1 text-xs text-[var(--rpg-text-secondary)]">
          {label && <span>{label}</span>}
          {showNumbers && (
            <span className="font-mono">
              {current.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div className={cn('w-full bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden', sizeClasses[size])}>
        <div
          className={cn('h-full transition-all duration-300', colorClasses[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
