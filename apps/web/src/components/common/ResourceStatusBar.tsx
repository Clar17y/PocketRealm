'use client';

import { HP_CONSTANTS } from '@adventure/shared';

interface ResourceStatusBarProps {
  currentHp: number;
  maxHp: number;
  currentStamina: number;
  maxStamina: number;
  currentMana: number;
  maxMana: number;
  hpRegenPerSecond?: number;
  staminaRegenPerSecond?: number;
  manaRegenPerSecond?: number;
  isRecovering?: boolean;
  recoveryCost?: number | null;
  onQuickRest?: () => Promise<void>;
  onRecover?: () => Promise<void>;
  quickRestPercent?: number;
  busyAction?: string | null;
  compact?: boolean;
}

function ResourceBar({
  current, max, label, color, regenPerSecond, textColor,
}: {
  current: number; max: number; label: string;
  color: string; regenPerSecond?: number; textColor?: string;
}) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  return (
    <div className="relative w-full h-5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 transition-all duration-300 ${color}`}
        style={{ width: `${pct}%` }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-1.5">
        <span className={`text-[8px] font-pixel ${textColor ?? 'text-white'} drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]`}>
          {label} {Math.floor(current)}/{max}
        </span>
        {typeof regenPerSecond === 'number' && regenPerSecond > 0 && (
          <span className="text-[8px] font-pixel text-white/70 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            +{parseFloat(regenPerSecond.toFixed(2))}/s
          </span>
        )}
      </div>
    </div>
  );
}

export function ResourceStatusBar({
  currentHp, maxHp,
  currentStamina, maxStamina,
  currentMana, maxMana,
  hpRegenPerSecond, staminaRegenPerSecond, manaRegenPerSecond,
  isRecovering, recoveryCost,
  onQuickRest, onRecover,
  quickRestPercent, busyAction,
  compact,
}: ResourceStatusBarProps) {
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;
  const showRestButton = onQuickRest && currentHp < maxHp && !isRecovering;
  const showRecoverButton = onRecover && isRecovering;

  const hpColor = isRecovering
    ? 'bg-[var(--rpg-red)]'
    : hpRatio < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD
      ? 'bg-[var(--rpg-red)]'
      : hpRatio < 0.5
        ? 'bg-yellow-400'
        : 'bg-[var(--rpg-green-light)]';

  return (
    <div className={`bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg ${compact ? 'p-2' : 'p-3'}`}>
      {(showRestButton || showRecoverButton) && (
        <div className="flex justify-end mb-1">
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
      )}
      <div className="space-y-1">
        <ResourceBar
          current={isRecovering ? 0 : currentHp}
          max={maxHp}
          label={isRecovering ? 'KO' : 'HP'}
          color={hpColor}
          regenPerSecond={isRecovering ? undefined : hpRegenPerSecond}
        />
        {maxStamina > 0 && (
          <ResourceBar
            current={currentStamina}
            max={maxStamina}
            label="STA"
            color="bg-teal-400"
            regenPerSecond={staminaRegenPerSecond}
          />
        )}
        {maxMana > 0 && (
          <ResourceBar
            current={currentMana}
            max={maxMana}
            label="MP"
            color="bg-[var(--rpg-blue-light)]"
            regenPerSecond={manaRegenPerSecond}
          />
        )}
      </div>
    </div>
  );
}
