import type { ReactNode } from 'react';

interface StatEntry {
  /** Icon element shown when stat is visible */
  icon: ReactNode;
  /** Icon element shown when stat is hidden (defaults to icon) */
  hiddenIcon?: ReactNode;
  label: string;
  value: string | number;
  /** Tailwind color class for the value text, e.g. "text-[var(--rpg-green-light)]" */
  valueColor?: string;
  hidden?: boolean;
  /** Hint text shown when hidden, e.g. "(Defeat 5+ times)" */
  hiddenHint?: string;
}

interface MonsterStatBlockProps {
  stats: StatEntry[];
  /** Text size for labels/values — expedition/boss modals use 'sm', main modal uses 'base' */
  size?: 'sm' | 'base';
}

export function MonsterStatBlock({ stats, size = 'sm' }: MonsterStatBlockProps) {
  const textClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const pixelClass = size === 'sm' ? 'text-[8px]' : 'text-[12px]';

  return (
    <div className={size === 'sm' ? 'space-y-1' : 'space-y-2'}>
      {stats.map((stat) =>
        stat.hidden ? (
          <div key={stat.label} className="flex items-center gap-3 opacity-50">
            {stat.hiddenIcon ?? stat.icon}
            <span className={`${textClass} text-[var(--rpg-text-secondary)]`}>
              {stat.label}: ???{stat.hiddenHint && <span className="text-xs"> {stat.hiddenHint}</span>}
            </span>
          </div>
        ) : (
          <div key={stat.label} className="flex items-center gap-3">
            {stat.icon}
            <span className={`${textClass} text-[var(--rpg-text-primary)]`}>
              {stat.label}: <span className={`font-pixel ${pixelClass} ${stat.valueColor ?? ''}`}>{stat.value}</span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}
