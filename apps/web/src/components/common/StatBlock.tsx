import type { LucideIcon } from 'lucide-react';

interface StatBlockProps {
  icon: LucideIcon;
  label: string;
  value: string;
  color: string;
}

/** Large stat display: icon in a box + label + big value. Used in Equipment total stats grid. */
export function StatBlock({ icon: Icon, label, value, color }: StatBlockProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center">
        <Icon size={20} color={color} />
      </div>
      <div>
        <div className="text-xs text-[var(--rpg-text-secondary)]">{label}</div>
        <div className="text-[24px] font-pixel" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}
