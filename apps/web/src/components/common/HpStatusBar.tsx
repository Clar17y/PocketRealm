import { HP_CONSTANTS } from '@adventure/shared';
import { StatBar } from '@/components/StatBar';

interface HpStatusBarProps {
  currentHp: number;
  maxHp: number;
  regenPerSecond?: number;
  onQuickRest?: () => Promise<void>;
  quickRestPercent?: number;
  busyAction?: string | null;
}

export function HpStatusBar({ currentHp, maxHp, regenPerSecond, onQuickRest, quickRestPercent, busyAction }: HpStatusBarProps) {
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;
  const showRestButton = onQuickRest && currentHp < maxHp;

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
        <div className="flex items-center gap-2">
          {typeof regenPerSecond === 'number' && (
            <span className="text-xs text-[var(--rpg-text-secondary)]">+{regenPerSecond}/s</span>
          )}
          {showRestButton && (
            <button
              className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--rpg-green-light)] text-black hover:brightness-110 transition-all disabled:opacity-50"
              onClick={onQuickRest}
              disabled={busyAction != null}
            >
              {busyAction === 'quick_rest' ? 'Resting...' : `Rest ${quickRestPercent ?? 100}%`}
            </button>
          )}
        </div>
      </div>
      <StatBar current={currentHp} max={maxHp} color="health" size="sm" showNumbers={false} />
    </div>
  );
}
