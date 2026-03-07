import type { LucideIcon } from 'lucide-react';
import { formatSignedStatValue, signedClass } from '@/lib/statFormat';

interface StatLineProps {
  icon: LucideIcon;
  label: string;
  statKey: string;
  value: number;
  color: string;
}

/** Inline stat row: icon + label + signed value. Renders nothing when value is 0. */
export function StatLine({ icon: Icon, label, statKey, value, color }: StatLineProps) {
  if (value === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} className={color} />
      <span className="text-[var(--rpg-text-secondary)]">{label}</span>
      <span className={`ml-auto font-pixel text-[12px] ${signedClass(value, color)}`}>
        {formatSignedStatValue(statKey, value)}
      </span>
    </div>
  );
}
