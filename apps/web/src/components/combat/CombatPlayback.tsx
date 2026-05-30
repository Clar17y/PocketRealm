'use client';

import { useEffect, useRef, useState } from 'react';
import type { LastCombatLogEntry, LastCombat } from '@/app/game/gameController.types';
import type { CombatActiveEvent } from '@/lib/api';
import { CombatLogEntry } from '@/components/combat/CombatLogEntry';
import { CombatRewardsSummary } from '@/components/combat/CombatRewardsSummary';
import { EventBadges } from '@/components/common/EventBadge';
import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
import { PixelButton } from '@/components/PixelButton';
import { formatCombatEffectDescription } from '@pocketrealm/shared/constants/combatEffectNames';

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
  activeEvents?: CombatActiveEvent[];
  playerLabel?: string;
  playerStartStamina?: number;
  playerStartMana?: number;
  playerMaxStamina?: number;
  playerMaxMana?: number;
  opponentMaxStamina?: number;
  opponentMaxMana?: number;
  showOpponentResources?: boolean;
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
  activeEvents,
  playerLabel = 'You',
  playerStartStamina,
  playerStartMana,
  playerMaxStamina = 100,
  playerMaxMana = 50,
  opponentMaxStamina = 100,
  opponentMaxMana = 50,
  showOpponentResources = false,
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
      completeTimer.current = setTimeout(onComplete, 0);
    } else {
      setPhase('finished-manual');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Playback: reveal one entry at a time
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

  // Don't render anything when auto-skipping victories — prevents a flash of HP bars
  if (autoSkip && phase === 'finished-auto') return null;

  // Derive current HP from the last revealed entry (damage is always visible immediately)
  const currentPlayerHp = revealedCount === 0
    ? playerStartHp
    : (log[revealedCount - 1].combatantAHpAfter ?? playerStartHp);
  const currentMobHp = revealedCount === 0
    ? mobMaxHp
    : (log[revealedCount - 1].combatantBHpAfter ?? mobMaxHp);

  // Stamina/mana only update on entries where that combatant is the actor
  // (or on regen entries which affect both), so resource costs appear exactly
  // when the action is revealed — not a round early/late.
  let currentStamina = playerStartStamina ?? playerMaxStamina;
  let currentMana = playerStartMana ?? playerMaxMana;
  let opponentStamina = opponentMaxStamina;
  let opponentMana = opponentMaxMana;
  let foundA = false;
  let foundB = false;
  for (let i = revealedCount - 1; i >= 0; i--) {
    const entry = log[i];
    const isRegen = entry.action === 'regen';
    if (!foundA && (entry.actor === 'combatantA' || isRegen)) {
      currentStamina = entry.combatantAStaminaAfter ?? playerMaxStamina;
      currentMana = entry.combatantAManaAfter ?? playerMaxMana;
      foundA = true;
    }
    if (!foundB && (entry.actor === 'combatantB' || isRegen)) {
      opponentStamina = entry.combatantBStaminaAfter ?? opponentMaxStamina;
      opponentMana = entry.combatantBManaAfter ?? opponentMaxMana;
      foundB = true;
    }
    if (foundA && foundB) break;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-center gap-2 font-bold text-[var(--rpg-text-primary)] flex-wrap font-almendra">
        {mobImageSrc && (
          <img src={mobImageSrc} alt={mobDisplayName} className="w-10 h-10 rounded object-cover" />
        )}
        {mobDisplayName}
        {activeEvents && activeEvents.some(e => e.appliedToThisMob && !e.effectType.startsWith('player_') && e.effectType !== 'durability_shield') && (
          <EventBadges inline modifiers={activeEvents.filter(e => e.appliedToThisMob && !e.effectType.startsWith('player_') && e.effectType !== 'durability_shield').map(e => ({
            title: e.title, effectType: e.effectType, effectValue: e.effectValue, isGlobal: false,
          }))} />
        )}
      </div>

      {/* HP Bars */}
      <div className="space-y-3 my-4">
        {/* Player HP + resources */}
        <div className={shakeTarget === 'combatantA' ? 'animate-shake' : ''}>
          <div className="text-xs mb-1 flex items-center gap-2">
            <span className="text-[var(--rpg-green-light)]">{playerLabel}</span>
            {activeEvents && (
              <EventBadges inline modifiers={activeEvents.filter(e => e.effectType.startsWith('player_') || e.effectType === 'durability_shield').map(e => ({
                title: e.title, effectType: e.effectType, effectValue: e.effectValue, isGlobal: false,
              }))} />
            )}
          </div>
          <ResourceStatusBar
            currentHp={currentPlayerHp}
            maxHp={playerMaxHp}
            currentStamina={currentStamina}
            maxStamina={playerMaxStamina}
            currentMana={currentMana}
            maxMana={playerMaxMana}
            compact
          />
        </div>

        {/* Opponent HP + optional resources */}
        <div className={shakeTarget === 'combatantB' ? 'animate-shake' : ''}>
          <div className="text-xs mb-1">
            <span className="text-[var(--rpg-red)]">{mobDisplayName}</span>
          </div>
          <ResourceStatusBar
            currentHp={Math.max(0, currentMobHp)}
            maxHp={mobMaxHp}
            currentStamina={showOpponentResources ? opponentStamina : 0}
            maxStamina={showOpponentResources ? opponentMaxStamina : 0}
            currentMana={showOpponentResources ? opponentMana : 0}
            maxMana={showOpponentResources ? opponentMaxMana : 0}
            compact
          />
        </div>
      </div>

      {/* Action flash */}
      {revealedCount > 0 && (
        <div className="text-center text-sm mb-2">
          {(() => {
            const lastEntry = log[revealedCount - 1];
            if (lastEntry.action === 'regen') {
              return <span className="text-teal-400 italic">Resources regenerate</span>;
            }
            const displayLabel = lastEntry.actionName ?? lastEntry.spellName;
            if (lastEntry.effectsExpired && lastEntry.effectsExpired.length > 0) {
              return <span className="text-[var(--rpg-text-secondary)] italic">
                {lastEntry.effectsExpired.map(e => `${e.name} wore off`).join(', ')}
              </span>;
            }
            if (lastEntry.interactionResult === 'countered') return <span className="text-[var(--rpg-gold)] font-bold">Countered!</span>;
            if (lastEntry.interactionResult === 'warded') return <span className="text-purple-400 font-bold">Warded!</span>;
            if (lastEntry.wasExhausted) return <span className="text-[var(--rpg-text-secondary)] italic">Exhausted &rarr; Defend</span>;
            if (lastEntry.action === 'potion') {
              const rt = lastEntry.healResourceType;
              const color = rt === 'stamina' ? 'text-teal-400' : rt === 'mana' ? 'text-[var(--rpg-blue-light)]' : 'text-[var(--rpg-green-light)]';
              const label = rt === 'stamina' ? 'STA' : rt === 'mana' ? 'MP' : 'HP';
              return <span className={color}>🧪 {displayLabel ?? 'Potion'}: +{lastEntry.healAmount} {label}</span>;
            }
            if (lastEntry.evaded) return <span className="text-[var(--rpg-blue-light)]">Dodged!</span>;
            if (lastEntry.isCritical) return <span className="text-[var(--rpg-gold)] font-bold">Critical Hit! <span className="font-pixel font-normal text-[12px]">{lastEntry.damage}</span> dmg</span>;
            if (lastEntry.damage && lastEntry.damage > 0 && lastEntry.healAmount && lastEntry.healAmount > 0) {
              const rl = lastEntry.healResourceType === 'stamina' ? 'STA' : lastEntry.healResourceType === 'mana' ? 'MP' : 'HP';
              return <span className="text-[var(--rpg-text-primary)]">{displayLabel ? `${displayLabel}: ` : ''}<span className="font-pixel text-[12px] text-[var(--rpg-red)]">{lastEntry.damage}</span> dmg, <span className="font-pixel text-[12px] text-[var(--rpg-green-light)]">+{lastEntry.healAmount}</span> {rl}</span>;
            }
            if (lastEntry.damage && lastEntry.damage > 0) return <span className="text-[var(--rpg-red)]">{displayLabel ? `${displayLabel}: ` : ''}<span className="font-pixel text-[12px]">{lastEntry.damage}</span> dmg</span>;
            if (lastEntry.healAmount && lastEntry.healAmount > 0) {
              const rt2 = lastEntry.healResourceType;
              const c2 = rt2 === 'stamina' ? 'text-teal-400' : rt2 === 'mana' ? 'text-[var(--rpg-blue-light)]' : 'text-[var(--rpg-green-light)]';
              const l2 = rt2 === 'stamina' ? 'STA' : rt2 === 'mana' ? 'MP' : 'HP';
              return <span className={c2}>{displayLabel ? `${displayLabel}: ` : ''}<span className="font-pixel text-[12px]">+{lastEntry.healAmount}</span> {l2}</span>;
            }
            if (lastEntry.effectsApplied && lastEntry.effectsApplied.length > 0) {
              const e = lastEntry.effectsApplied[0];
              return <span className="text-[var(--rpg-blue-light)]">
                {displayLabel} ({formatCombatEffectDescription(e)})
              </span>;
            }
            if (lastEntry.roll && !lastEntry.damage) return <span className="text-[var(--rpg-text-secondary)]">Miss!</span>;
            if (displayLabel) return <span className="text-[var(--rpg-blue-light)]">{displayLabel}</span>;
            return null;
          })()}
        </div>
      )}

      {/* Combat log (revealed entries) */}
      <div ref={logScrollRef} className="max-h-40 overflow-y-auto space-y-0.5 border-t border-[var(--rpg-border)] pt-2">
        {log.slice(0, revealedCount).filter(e => e.action !== 'regen').map((entry, idx) => (
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
        <div className={`text-center mt-4 space-y-3 rounded-lg p-3 ${outcome === 'victory' ? 'rpg-victory-pulse' : ''}`}>
          <div className={`text-xl font-bold font-almendra ${outcome === 'victory' ? 'text-[var(--rpg-gold)]'
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
