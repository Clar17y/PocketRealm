import { HP_CONSTANTS } from '@adventure/shared';
import { StatBar } from '@/components/StatBar';

interface HpStatusBarProps {
  currentHp: number;
  maxHp: number;
  regenPerSecond?: number;
}

export function HpStatusBar({ currentHp, maxHp, regenPerSecond }: HpStatusBarProps) {
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;

  return (
    <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-bold font-mono ${
          hpRatio < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD ? 'text-[var(--rpg-red)]'
          : hpRatio < 0.5 ? 'text-yellow-400'
          : 'text-[var(--rpg-green-light)]'
        }`}>
          {Math.floor(currentHp)} / {maxHp} HP
        </span>
        {typeof regenPerSecond === 'number' && (
          <span className="text-xs text-[var(--rpg-text-secondary)]">+{regenPerSecond}/s</span>
        )}
      </div>
      <StatBar current={currentHp} max={maxHp} color="health" size="sm" showNumbers={false} />
    </div>
  );
}
