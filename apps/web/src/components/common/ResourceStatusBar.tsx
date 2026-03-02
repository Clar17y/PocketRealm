'use client';

import { HP_CONSTANTS } from '@adventure/shared';
import { StatBar } from '@/components/StatBar';

interface ResourceStatusBarProps {
  currentHp: number;
  maxHp: number;
  currentStamina: number;
  maxStamina: number;
  currentMana: number;
  maxMana: number;
  hpRegenPerSecond?: number;
  isRecovering?: boolean;
  recoveryCost?: number | null;
  onQuickRest?: () => Promise<void>;
  onRecover?: () => Promise<void>;
  quickRestPercent?: number;
  busyAction?: string | null;
  compact?: boolean;
}

export function ResourceStatusBar({
  currentHp, maxHp,
  currentStamina, maxStamina,
  currentMana, maxMana,
  hpRegenPerSecond,
  isRecovering, recoveryCost,
  onQuickRest, onRecover,
  quickRestPercent, busyAction,
  compact,
}: ResourceStatusBarProps) {
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;
  const showRestButton = onQuickRest && currentHp < maxHp && !isRecovering;
  const showRecoverButton = onRecover && isRecovering;

  return (
    <div className={`bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-bold font-mono ${
          isRecovering ? 'text-[var(--rpg-red)]'
          : hpRatio < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD ? 'text-[var(--rpg-red)]'
          : hpRatio < 0.5 ? 'text-yellow-400'
          : 'text-[var(--rpg-green-light)]'
        }`}>
          {isRecovering ? 'KO' : `${Math.floor(currentHp)} / ${maxHp} HP`}
        </span>
        <div className="flex items-center gap-2">
          {typeof hpRegenPerSecond === 'number' && !isRecovering && (
            <span className="text-xs text-[var(--rpg-text-secondary)]">+{hpRegenPerSecond}/s</span>
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
          {showRecoverButton && (
            <button
              className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--rpg-red)] text-white hover:brightness-110 transition-all disabled:opacity-50"
              onClick={onRecover}
              disabled={busyAction != null}
            >
              {busyAction === 'recovering' ? 'Recovering...' : `Recover (${recoveryCost ?? '?'} turns)`}
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <StatBar current={isRecovering ? 0 : currentHp} max={maxHp} color="health" size="sm" showNumbers={false} />
        <StatBar current={currentStamina} max={maxStamina} color="stamina" size="sm" showNumbers={false} />
        <StatBar current={currentMana} max={maxMana} color="mana" size="sm" showNumbers={false} />
      </div>
    </div>
  );
}
