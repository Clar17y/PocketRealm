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

const barColorHexMap: Record<string, string> = {
  'bg-[var(--rpg-green-light)]': '#6aaa5a',
  'bg-[var(--rpg-hp-warning)]': '#d4943a',
  'bg-[var(--rpg-red)]': '#aa3a3a',
  'bg-[var(--rpg-blue-light)]': '#5aaad4',
  'bg-teal-400': '#2dd4bf',
  'bg-[var(--rpg-gold)]': '#d4a84b',
  'bg-[var(--rpg-text-secondary)]': '#8a8878',
};

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

  // HP uses tiered color: green > 60%, amber 40-60%, red < 40%
  const healthColor =
    percentage > 60
      ? 'bg-[var(--rpg-green-light)]'
      : percentage >= 40
        ? 'bg-[var(--rpg-hp-warning)]'
        : 'bg-[var(--rpg-red)]';

  const colorClasses: Record<string, string> = {
    health: healthColor,
    mana: 'bg-[var(--rpg-blue-light)]',
    stamina: 'bg-teal-400',
    xp: 'bg-[var(--rpg-gold)]',
    gold: 'bg-[var(--rpg-gold)]',
    durability: durabilityColor,
  };

  const barColorClass = colorClasses[color];
  const barColorHex = barColorHexMap[barColorClass] ?? '#6aaa5a';

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  // HP glow: dynamic box-shadow that scales with fill percentage
  const fillStyle: React.CSSProperties = {
    width: `${percentage}%`,
    ...(color === 'health' && {
      boxShadow: `0 0 ${Math.round(percentage * 0.08)}px ${barColorHex}33`,
    }),
  };

  return (
    <div className={cn('w-full', className)}>
      {(label || showNumbers) && (
        <div className="flex justify-between items-center mb-1 text-xs text-[var(--rpg-text-secondary)]">
          {label && <span>{label}</span>}
          {showNumbers && (
            <span className="font-pixel">
              {current.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div className={cn('relative w-full bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden', sizeClasses[size])}>
        <div
          className={cn('h-full transition-all duration-300 rpg-bar-shimmer', barColorClass)}
          style={fillStyle}
        />
        {color === 'xp' && [25, 50, 75].map(pct => (
          <div key={pct} className="absolute top-0 bottom-0 w-px bg-[var(--rpg-text-secondary)]/30" style={{ left: `${pct}%` }} />
        ))}
      </div>
    </div>
  );
}
