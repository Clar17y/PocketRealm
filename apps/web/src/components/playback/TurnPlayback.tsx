'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { ExplorationPlayback, type ExplorationPlaybackEvent } from '@/components/exploration/ExplorationPlayback';
import { CombatPlayback } from '@/components/combat/CombatPlayback';
import { monsterImageSrc } from '@/lib/assets';
import type { CombatLogEntryResponse } from '@/lib/api/combat';
import type { CombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';
import { isAmbushWithCombatLog } from '@/lib/explorationUtils';
import { isMobKnown, type BestiarySkipEntry } from '@/app/game/useGameController';

interface TurnPlaybackProps {
  totalTurns: number;
  label: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBefore: number;
  playerMaxHp: number;
  combatSpeedMs?: number;
  explorationSpeedMs?: number;
  onComplete: () => void;
  onSkip: () => void;
  onPushLog?: (...entries: Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>) => void;
  combatLogPrefetch?: CombatLogPrefetch;
  autoSkipKnownCombat?: boolean;
  bestiaryMobs?: BestiarySkipEntry[];
}

export function TurnPlayback({
  totalTurns,
  label,
  events,
  aborted,
  refundedTurns,
  playerHpBefore,
  playerMaxHp,
  combatSpeedMs,
  explorationSpeedMs,
  onComplete,
  onSkip,
  onPushLog,
  combatLogPrefetch,
  autoSkipKnownCombat,
  bestiaryMobs,
}: TurnPlaybackProps) {
  const [combatEvent, setCombatEvent] = useState<ExplorationPlaybackEvent | null>(null);
  const [resumeFromCombat, setResumeFromCombat] = useState(false);
  const [playerHpForNextCombat, setPlayerHpForNextCombat] = useState<number | null>(null);

  const [loadedCombatLog, setLoadedCombatLog] = useState<CombatLogEntryResponse[] | null>(null);

  // Reset tracked HP when playback data changes (new exploration/travel starts)
  useEffect(() => {
    setPlayerHpForNextCombat(null);
  }, [totalTurns, events]);

  // Pre-fetch the first ambush's combat log on mount
  useEffect(() => {
    if (!combatLogPrefetch) return;
    const firstAmbush = events.find(e =>
      (e.type === 'ambush_victory' || e.type === 'ambush_defeat') && e.details?.combatLogId
    );
    if (firstAmbush?.details?.combatLogId) {
      combatLogPrefetch.prefetch(firstAmbush.details.combatLogId as string);
    }
  }, [events, combatLogPrefetch]);

  // Load combat log when combatEvent changes (inline or fetched)
  useEffect(() => {
    if (!combatEvent) {
      setLoadedCombatLog(null);
      return;
    }
    if (combatEvent.details?.log) {
      setLoadedCombatLog(combatEvent.details.log as CombatLogEntryResponse[]);
      return;
    }
    const logId = combatEvent.details?.combatLogId as string | undefined;
    if (logId && combatLogPrefetch) {
      const cached = combatLogPrefetch.getLog(logId);
      if (cached) {
        setLoadedCombatLog(cached);
        return;
      }
      void combatLogPrefetch.fetchLog(logId).then(log => {
        setLoadedCombatLog(log);
      });
    }
  }, [combatEvent, combatLogPrefetch]);

  const shouldAutoSkip = autoSkipKnownCombat && combatEvent && (() => {
    const mobTemplateId = combatEvent.details?.mobTemplateId as string | undefined;
    if (!mobTemplateId || !bestiaryMobs) return false;
    return isMobKnown(mobTemplateId, combatEvent.details?.mobPrefix as string | undefined, bestiaryMobs);
  })();

  return (
    <>
      {/* Exploration/Travel Playback — stays mounted during combat to preserve state */}
      <PixelCard className={combatEvent ? 'hidden' : ''}>
        <ExplorationPlayback
          totalTurns={totalTurns}
          label={label}
          events={events}
          aborted={aborted}
          refundedTurns={refundedTurns}
          speedMs={explorationSpeedMs}
          resumeFromCombat={resumeFromCombat}
          onEventRevealed={(event) => {
            if (isAmbushWithCombatLog(event)) return;

            const typeMap: Record<string, 'info' | 'success' | 'danger'> = {
              ambush_defeat: 'danger',
              ambush_victory: 'success',
              encounter_site: 'success',
              resource_node: 'success',
            };
            onPushLog?.({
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              type: typeMap[event.type] ?? 'info',
              message: `Turn ${event.turn}: ${event.description}`,
            });
          }}
          onCombatStart={(event) => {
            // Auto-skip known mobs: bypass fetch entirely, resume exploration
            if (autoSkipKnownCombat && bestiaryMobs) {
              const mobId = event.details?.mobTemplateId as string | undefined;
              const prefix = event.details?.mobPrefix as string | undefined;
              if (mobId && isMobKnown(mobId, prefix, bestiaryMobs)) {
                // Track HP from event summary (no log needed)
                const hpRemaining = event.details?.playerHpRemaining as number | undefined;
                if (hpRemaining !== undefined) setPlayerHpForNextCombat(hpRemaining);

                const typeMap: Record<string, 'info' | 'success' | 'danger'> = {
                  ambush_defeat: 'danger',
                  ambush_victory: 'success',
                };
                onPushLog?.({
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: typeMap[event.type] ?? 'info',
                  message: `Turn ${event.turn}: ${event.description}`,
                });

                if (event.type === 'ambush_defeat') {
                  onComplete();
                } else {
                  setResumeFromCombat(true);
                  setTimeout(() => setResumeFromCombat(false), 100);
                }
                return;
              }
            }

            setCombatEvent(event);
            if (combatLogPrefetch) {
              const currentIdx = events.findIndex(e => e === event);
              const nextAmbush = events.slice(currentIdx + 1).find(e =>
                (e.type === 'ambush_victory' || e.type === 'ambush_defeat') && e.details?.combatLogId
              );
              if (nextAmbush?.details?.combatLogId) {
                combatLogPrefetch.prefetch(nextAmbush.details.combatLogId as string);
              }
            }
          }}
          onComplete={() => {
            onComplete();
          }}
          onSkip={() => {
            onSkip();
          }}
        />
      </PixelCard>

      {/* Combat Playback — embedded combat animation during exploration/travel */}
      {combatEvent && (
        <PixelCard>
          {loadedCombatLog ? (
            <CombatPlayback
              key={combatEvent.turn}
              mobDisplayName={(combatEvent.details?.mobDisplayName as string) ?? 'Unknown'}
              mobImageSrc={combatEvent.details?.mobName ? monsterImageSrc(combatEvent.details.mobName as string) : undefined}
              outcome={
                (combatEvent.details?.fleeResult as { outcome?: string } | undefined)?.outcome === 'fled'
                  ? 'fled'
                  : (combatEvent.details?.outcome as string) ?? 'defeat'
              }
              playerMaxHp={playerMaxHp}
              playerStartHp={playerHpForNextCombat ?? playerHpBefore}
              mobMaxHp={(combatEvent.details?.mobMaxHp as number) ?? 100}
              log={loadedCombatLog}
              autoSkip={!!shouldAutoSkip}
              speedMs={combatSpeedMs}
              onComplete={() => {
                if (loadedCombatLog.length > 0) {
                  const lastEntry = loadedCombatLog[loadedCombatLog.length - 1];
                  if (lastEntry.combatantAHpAfter !== undefined) {
                    setPlayerHpForNextCombat(lastEntry.combatantAHpAfter);
                  }
                }

                const typeMap: Record<string, 'info' | 'success' | 'danger'> = {
                  ambush_defeat: 'danger',
                  ambush_victory: 'success',
                };
                onPushLog?.({
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  type: typeMap[combatEvent.type] ?? 'info',
                  message: `Turn ${combatEvent.turn}: ${combatEvent.description}`,
                });

                setCombatEvent(null);
                if (combatEvent.type === 'ambush_defeat') {
                  onComplete();
                } else {
                  setResumeFromCombat(true);
                  setTimeout(() => setResumeFromCombat(false), 100);
                }
              }}
              onSkip={() => {
                setCombatEvent(null);
                onSkip();
              }}
            />
          ) : (
            <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
              <div className="animate-pulse">Loading combat data...</div>
            </div>
          )}
        </PixelCard>
      )}
    </>
  );
}
