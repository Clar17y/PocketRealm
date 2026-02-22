'use client';

import { useEffect, useRef, useState } from 'react';
import type { LastCombatLogEntry, LastCombat } from '@/app/game/useGameController';
import { CombatLogEntry } from '@/components/combat/CombatLogEntry';
import { CombatRewardsSummary } from '@/components/combat/CombatRewardsSummary';
import { PixelButton } from '@/components/PixelButton';

type Phase = 'playing' | 'finished-auto' | 'finished-manual';

interface CombatPlaybackProps {
  mobDisplayName: string;
  mobImageSrc?: string;
  outcome: string;
  playerMaxHp: number;
  playerStartHp: number;
  mobMaxHp: number;
  log: LastCombatLogEntry[];
  rewards?: LastCombat['rewards'];
  playerLabel?: string;
  defeatButtonLabel?: string;
  speedMs?: number;
  autoSkip?: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function CombatPlayback({
  mobDisplayName,
  mobImageSrc,
  outcome,
  playerMaxHp,
  playerStartHp,
  mobMaxHp,
  log,
  rewards,
  playerLabel = 'You',
  defeatButtonLabel,
  speedMs = 800,
  autoSkip = false,
  onComplete,
  onSkip,
}: CombatPlaybackProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('playing');
  const [shakeTarget, setShakeTarget] = useState<'combatantA' | 'combatantB' | null>(null);

  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Ensure minimum 2s total playback so short fights don't flash by after API delay
  const effectiveSpeedMs = log.length > 0 ? Math.max(speedMs, 2000 / log.length) : speedMs;

  // Auto-skip if the player has already seen this mob+prefix
  useEffect(() => {
    if (!autoSkip) return;
    setRevealedCount(log.length);
    if (outcome === 'victory') {
      setPhase('finished-auto');
      completeTimer.current = setTimeout(onComplete, 500);
    } else {
      setPhase('finished-manual');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Playback: reveal one entry every 800ms
  useEffect(() => {
    if (phase !== 'playing' || revealedCount >= log.length) return;

    playbackTimer.current = setTimeout(() => {
      setRevealedCount(prev => prev + 1);
    }, effectiveSpeedMs);

    return () => {
      if (playbackTimer.current) clearTimeout(playbackTimer.current);
    };
  }, [phase, revealedCount, log.length, effectiveSpeedMs]);

  // Transition to finished phase when all entries revealed
  useEffect(() => {
    if (phase !== 'playing' || revealedCount < log.length) return;

    if (outcome === 'victory') {
      setPhase('finished-auto');
      completeTimer.current = setTimeout(onComplete, 1500);
    } else {
      setPhase('finished-manual');
    }
  }, [phase, revealedCount, log.length, outcome, onComplete]);

  // Shake effect when a new entry with damage, heal, or effects is revealed
  useEffect(() => {
    if (revealedCount === 0) return;

    const entry = log[revealedCount - 1];
    if (!entry) return;

    let target: 'combatantA' | 'combatantB' | null = null;

    if (entry.damage && entry.damage > 0) {
      // Damage: shake the target (opposite of actor)
      target = entry.actor === 'combatantA' ? 'combatantB' : 'combatantA';
    } else if (entry.healAmount && entry.healAmount > 0) {
      // Heal: shake the caster
      target = entry.actor;
    } else if (entry.effectsApplied && entry.effectsApplied.length > 0) {
      // Buff/debuff: shake whoever is affected
      const effectTarget = entry.effectsApplied[0].target;
      target = effectTarget;
    }

    if (!target) return;

    setShakeTarget(target);
    shakeTimer.current = setTimeout(() => setShakeTarget(null), 300);

    return () => {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
    };
  }, [revealedCount, log]);

  // Auto-scroll combat log to bottom as entries are revealed
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [revealedCount]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (playbackTimer.current) clearTimeout(playbackTimer.current);
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      if (completeTimer.current) clearTimeout(completeTimer.current);
    };
  }, []);

  // Derive current HP from the last revealed entry
  const currentPlayerHp = revealedCount === 0
    ? playerStartHp
    : (log[revealedCount - 1].combatantAHpAfter ?? playerStartHp);
  const currentMobHp = revealedCount === 0
    ? mobMaxHp
    : (log[revealedCount - 1].combatantBHpAfter ?? mobMaxHp);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-center gap-2 font-bold text-[var(--rpg-text-primary)]">
        {mobImageSrc && (
          <img src={mobImageSrc} alt={mobDisplayName} className="w-10 h-10 rounded object-cover" />
        )}
        {mobDisplayName}
      </div>

      {/* HP Bars */}
      <div className="space-y-3 my-4">
        {/* Player HP */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--rpg-green-light)]">{playerLabel}</span>
            <span className="text-[var(--rpg-green-light)] font-mono">{currentPlayerHp}/{playerMaxHp}</span>
          </div>
          <div className={`h-4 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded overflow-hidden ${shakeTarget === 'combatantA' ? 'animate-shake' : ''}`}>
            <div
              className="h-full bg-[var(--rpg-green-light)]"
              style={{
                width: `${Math.max(0, (currentPlayerHp / playerMaxHp) * 100)}%`,
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>

        {/* Mob HP */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--rpg-red)]">{mobDisplayName}</span>
            <span className="text-[var(--rpg-red)] font-mono">{Math.max(0, currentMobHp)}/{mobMaxHp}</span>
          </div>
          <div className={`h-4 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded overflow-hidden ${shakeTarget === 'combatantB' ? 'animate-shake' : ''}`}>
            <div
              className="h-full bg-[var(--rpg-red)]"
              style={{
                width: `${Math.max(0, (currentMobHp / mobMaxHp) * 100)}%`,
                transition: 'width 0.4s ease-out',
              }}
            />
          </div>
        </div>
      </div>

      {/* Action flash */}
      {revealedCount > 0 && (
        <div className="text-center text-sm mb-2">
          {(() => {
            const lastEntry = log[revealedCount - 1];
            if (lastEntry.effectsExpired && lastEntry.effectsExpired.length > 0) {
              return <span className="text-[var(--rpg-text-secondary)] italic">
                {lastEntry.effectsExpired.map(e => `${e.name} wore off`).join(', ')}
              </span>;
            }
            if (lastEntry.action === 'potion') return <span className="text-[var(--rpg-green-light)]">🧪 {lastEntry.spellName}: +{lastEntry.healAmount} HP</span>;
            if (lastEntry.evaded) return <span className="text-[var(--rpg-blue-light)]">Dodged!</span>;
            if (lastEntry.isCritical) return <span className="text-[var(--rpg-gold)] font-bold">Critical Hit! {lastEntry.damage} dmg</span>;
            if (lastEntry.damage && lastEntry.damage > 0 && lastEntry.healAmount && lastEntry.healAmount > 0) {
              return <span className="text-[var(--rpg-text-primary)]">{lastEntry.spellName ? `${lastEntry.spellName}: ` : ''}{lastEntry.damage} dmg, +{lastEntry.healAmount} HP</span>;
            }
            if (lastEntry.damage && lastEntry.damage > 0) return <span className="text-[var(--rpg-text-primary)]">{lastEntry.spellName ? `${lastEntry.spellName}: ` : ''}{lastEntry.damage} dmg</span>;
            if (lastEntry.healAmount && lastEntry.healAmount > 0) return <span className="text-[var(--rpg-green-light)]">{lastEntry.spellName ? `${lastEntry.spellName}: ` : ''}+{lastEntry.healAmount} HP</span>;
            if (lastEntry.effectsApplied && lastEntry.effectsApplied.length > 0) {
              const e = lastEntry.effectsApplied[0];
              return <span className="text-[var(--rpg-blue-light)]">
                {lastEntry.spellName} ({e.stat} {e.modifier > 0 ? '+' : ''}{e.modifier})
              </span>;
            }
            if (lastEntry.roll && !lastEntry.damage) return <span className="text-[var(--rpg-text-secondary)]">Miss!</span>;
            if (lastEntry.spellName) return <span className="text-[var(--rpg-blue-light)]">{lastEntry.spellName}</span>;
            return null;
          })()}
        </div>
      )}

      {/* Combat log (revealed entries) */}
      <div ref={logScrollRef} className="max-h-40 overflow-y-auto space-y-0.5 border-t border-[var(--rpg-border)] pt-2">
        {log.slice(0, revealedCount).map((entry, idx) => (
          <CombatLogEntry
            key={idx}
            entry={entry}
            playerMaxHp={playerMaxHp}
            mobMaxHp={mobMaxHp}
            showDetailedBreakdown={false}
            playerLabel={playerLabel}
            opponentLabel={mobDisplayName}
          />
        ))}
      </div>

      {/* Outcome display */}
      {phase !== 'playing' && (
        <div className="text-center mt-4 space-y-3">
          <div className={`text-xl font-bold ${outcome === 'victory' ? 'text-[var(--rpg-gold)]'
              : outcome === 'fled' || outcome === 'draw' ? 'text-[var(--rpg-gold)]'
                : 'text-[var(--rpg-red)]'
            }`}>
            {outcome === 'victory' ? 'Victory!' : outcome === 'fled' ? 'Fled!' : outcome === 'draw' ? 'Draw!' : 'Defeated!'}
          </div>

          {outcome === 'victory' && rewards && (
            <CombatRewardsSummary rewards={rewards} outcome={outcome} />
          )}

          {phase === 'finished-manual' && (
            <PixelButton
              variant={outcome === 'defeat' ? 'danger' : 'secondary'}
              onClick={onComplete}
            >
              {outcome === 'defeat' ? (defeatButtonLabel ?? 'Return to Town') : 'Continue'}
            </PixelButton>
          )}
        </div>
      )}

      {/* Skip button */}
      {phase === 'playing' && (
        <div className="text-center mt-3">
          <button
            className="text-xs text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] underline"
            onClick={onSkip}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
