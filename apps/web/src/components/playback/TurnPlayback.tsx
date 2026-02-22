'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { ExplorationPlayback, type ExplorationPlaybackEvent } from '@/components/exploration/ExplorationPlayback';
import { CombatPlayback } from '@/components/combat/CombatPlayback';
import { monsterImageSrc } from '@/lib/assets';

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
}: TurnPlaybackProps) {
  const [combatEvent, setCombatEvent] = useState<ExplorationPlaybackEvent | null>(null);
  const [resumeFromCombat, setResumeFromCombat] = useState(false);
  const [playerHpForNextCombat, setPlayerHpForNextCombat] = useState<number | null>(null);

  // Reset tracked HP when playback data changes (new exploration/travel starts)
  useEffect(() => {
    setPlayerHpForNextCombat(null);
  }, [totalTurns, events]);

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
            // Skip logging ambush events here — they'll be logged after combat playback
            const isAmbushWithCombat = (event.type === 'ambush_defeat' || event.type === 'ambush_victory') && event.details?.log;
            if (isAmbushWithCombat) return;

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
            setCombatEvent(event);
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
          <CombatPlayback
            key={combatEvent.turn}
            mobDisplayName={(combatEvent.details?.mobDisplayName as string) ?? 'Unknown'}
            mobImageSrc={combatEvent.details?.mobName ? monsterImageSrc(combatEvent.details.mobName as string) : undefined}
            outcome={
              // Distinguish fled vs knockout: fleeResult.outcome is 'knockout' or 'fled'
              (combatEvent.details?.fleeResult as { outcome?: string } | undefined)?.outcome === 'fled'
                ? 'fled'
                : (combatEvent.details?.outcome as string) ?? 'defeat'
            }
            playerMaxHp={playerMaxHp}
            playerStartHp={playerHpForNextCombat ?? playerHpBefore}
            mobMaxHp={(combatEvent.details?.mobMaxHp as number) ?? 100}
            log={(combatEvent.details?.log as Array<{
              round: number;
              actor: 'combatantA' | 'combatantB';
              actorName?: string;
              action: string;
              message: string;
              roll?: number;
              damage?: number;
              evaded?: boolean;
              attackModifier?: number;
              accuracyModifier?: number;
              targetDodge?: number;
              targetEvasion?: number;
              targetDefence?: number;
              targetMagicDefence?: number;
              rawDamage?: number;
              armorReduction?: number;
              magicDefenceReduction?: number;
              isCritical?: boolean;
              critMultiplier?: number;
              combatantAHpAfter?: number;
              combatantBHpAfter?: number;
              spellName?: string;
              healAmount?: number;
              effectsApplied?: Array<{ stat: string; modifier: number; duration: number; target: 'combatantA' | 'combatantB' }>;
              effectsExpired?: Array<{ name: string; target: 'combatantA' | 'combatantB' }>;
            }>) ?? []}
            speedMs={combatSpeedMs}
            onComplete={() => {
              // Track player HP after this fight for the next combat
              const combatLog = (combatEvent.details?.log as Array<{ combatantAHpAfter?: number }>) ?? [];
              if (combatLog.length > 0) {
                const lastEntry = combatLog[combatLog.length - 1];
                if (lastEntry.combatantAHpAfter !== undefined) {
                  setPlayerHpForNextCombat(lastEntry.combatantAHpAfter);
                }
              }

              // Now that combat playback is done, log the ambush result
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
                // Knockout — playback is done
                onComplete();
              } else {
                // Victory — resume exploration/travel playback
                setResumeFromCombat(true);
                setTimeout(() => setResumeFromCombat(false), 100);
              }
            }}
            onSkip={() => {
              setCombatEvent(null);
              onSkip();
            }}
          />
        </PixelCard>
      )}
    </>
  );
}
