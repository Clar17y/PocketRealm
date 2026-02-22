'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface ExplorationPlaybackEvent {
  turn: number;
  type: string;
  description: string;
  details?: Record<string, unknown>;
}

interface ExplorationPlaybackProps {
  totalTurns: number;
  label: string;
  events: ExplorationPlaybackEvent[];
  aborted: boolean;
  refundedTurns: number;
  onEventRevealed: (event: ExplorationPlaybackEvent) => void;
  onCombatStart: (event: ExplorationPlaybackEvent) => void;
  onComplete: () => void;
  onSkip: () => void;
  speedMs?: number;
  resumeFromCombat?: boolean;
}

function getEventDisplay(type: string): { icon: string; color: string } {
  switch (type) {
    case 'ambush_victory':
    case 'ambush_defeat':
      return { icon: '\u2694\uFE0F', color: 'text-[var(--rpg-red)]' };
    case 'encounter_site':
      return { icon: '\uD83E\uDDED', color: 'text-[var(--rpg-blue-light)]' };
    case 'resource_node':
      return { icon: '\u26CF\uFE0F', color: 'text-[var(--rpg-gold)]' };
    case 'hidden_cache':
      return { icon: '\uD83C\uDF81', color: 'text-[var(--rpg-purple)]' };
    case 'zone_exit':
      return { icon: '\uD83D\uDEAA', color: 'text-[var(--rpg-green-light)]' };
    default:
      return { icon: '\u2753', color: 'text-[var(--rpg-text-secondary)]' };
  }
}

export function ExplorationPlayback({
  totalTurns,
  label,
  events,
  aborted,
  refundedTurns,
  onEventRevealed,
  onCombatStart,
  onComplete,
  onSkip,
  speedMs = 800,
  resumeFromCombat,
}: ExplorationPlaybackProps) {
  const [currentTurn, setCurrentTurn] = useState(0);
  const [revealedEventCount, setRevealedEventCount] = useState(0);
  const [phase, setPhase] = useState<'running' | 'paused-event' | 'paused-combat' | 'complete'>('running');
  const [activeEventLabel, setActiveEventLabel] = useState<{ icon: string; text: string; color: string } | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.turn - b.turn),
    [events],
  );

  const addTimer = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => clearAllTimers, [clearAllTimers]);

  // Resume after combat
  useEffect(() => {
    if (resumeFromCombat && phase === 'paused-combat') {
      setActiveEventLabel(null);
      setPhase('running');
    }
  }, [resumeFromCombat, phase]);

  // Main playback loop
  useEffect(() => {
    if (phase !== 'running') return;

    const nextEvent = sortedEvents[revealedEventCount];

    if (nextEvent) {
      setCurrentTurn(nextEvent.turn);

      const barTimer = addTimer(() => {
        const display = getEventDisplay(nextEvent.type);
        setActiveEventLabel({ icon: display.icon, text: nextEvent.description, color: display.color });
        onEventRevealed(nextEvent);
        setRevealedEventCount(prev => prev + 1);

        // All ambush types with combat log data trigger full combat playback
        const isAmbush = nextEvent.type === 'ambush_defeat' || nextEvent.type === 'ambush_victory';
        if (isAmbush && nextEvent.details?.log) {
          setPhase('paused-combat');
          onCombatStart(nextEvent);
          return;
        }

        setPhase('paused-event');
        addTimer(() => {
          setActiveEventLabel(null);
          setPhase('running');
        }, Math.round(speedMs * 2500 / 800));
      }, speedMs);

      return () => clearTimeout(barTimer);
    }

    // No more events - fill bar to end
    setCurrentTurn(totalTurns);
    const completeTimer = addTimer(() => {
      setPhase('complete');
      onComplete();
    }, Math.round(speedMs * 2000 / 800));

    return () => clearTimeout(completeTimer);
  }, [phase, revealedEventCount, sortedEvents, totalTurns, onEventRevealed, onCombatStart, onComplete, addTimer, speedMs]);

  const progressPercent = totalTurns > 0 ? (currentTurn / totalTurns) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <div className="text-sm text-[var(--rpg-text-secondary)]">{label}</div>
        <div className="text-xs text-[var(--rpg-text-secondary)] font-mono mt-1">
          Turn {currentTurn.toLocaleString()} / {totalTurns.toLocaleString()}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="h-3 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded overflow-hidden">
          <div
            className="h-full bg-[var(--rpg-gold)] transition-[width] duration-700 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Event markers on bar */}
        <div className="relative h-4 mt-1">
          {sortedEvents.slice(0, revealedEventCount).map((event, idx) => {
            const display = getEventDisplay(event.type);
            return (
              <span
                key={idx}
                className="absolute -translate-x-1/2 text-xs"
                style={{ left: `${(event.turn / totalTurns) * 100}%` }}
                title={event.description}
              >
                {display.icon}
              </span>
            );
          })}
        </div>
      </div>

      {/* Event popup — below bar with reserved space */}
      <div className="min-h-[2.5rem]">
        {activeEventLabel && (
          <div className="text-center animate-fadeIn">
            <span className={`text-sm font-semibold ${activeEventLabel.color}`}>
              {activeEventLabel.icon} {activeEventLabel.text}
            </span>
          </div>
        )}
      </div>

      {/* Status text */}
      <div className="text-center text-xs text-[var(--rpg-text-secondary)]">
        {phase === 'complete' && aborted && refundedTurns > 0 && (
          <span>Exploration aborted. {refundedTurns.toLocaleString()} turns refunded.</span>
        )}
        {phase === 'complete' && !aborted && (
          <span>Exploration complete.</span>
        )}
        {phase === 'paused-combat' && (
          <span className="text-[var(--rpg-red)]">Ambush!</span>
        )}
      </div>

      {/* Skip button */}
      {phase !== 'complete' && (
        <div className="text-center">
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
