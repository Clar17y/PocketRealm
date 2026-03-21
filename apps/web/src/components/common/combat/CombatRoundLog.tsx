'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { RoundLogContent } from './RoundLogContent';
import type { ExpeditionRoundLog } from '@pocketrealm/shared';

export interface CombatRoundLogProps {
  roundLogs: ExpeditionRoundLog[];
  playerId: string | null;
  multiRoom?: boolean;
}

export function CombatRoundLog({ roundLogs, playerId, multiRoom }: CombatRoundLogProps) {
  if (roundLogs.length === 0) return null;

  const latestLog = roundLogs[roundLogs.length - 1];
  const previousLogs = roundLogs.slice(0, -1);

  return (
    <>
      <LatestRoundLog log={latestLog} playerId={playerId} multiRoom={multiRoom ?? false} />
      {previousLogs.length > 0 && (
        <PreviousRoundsLog logs={previousLogs} playerId={playerId} />
      )}
    </>
  );
}

function LatestRoundLog({ log, playerId, multiRoom }: {
  log: ExpeditionRoundLog;
  playerId: string | null;
  multiRoom: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const outcome = log.phases.outcome;

  return (
    <PixelCard>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-center text-xs"
      >
        <span className="font-bold text-[var(--rpg-text-primary)]">
          {multiRoom ? `R${log.roomIndex + 1} · ` : ''}Round {log.round}
        </span>
        <div className="flex gap-2">
          {outcome.mobsKilled > 0 && (
            <span className="text-[var(--rpg-green-light)]">{outcome.mobsKilled} killed</span>
          )}
          {outcome.playersKnockedOut > 0 && (
            <span className="text-[var(--rpg-red)]">{outcome.playersKnockedOut} KO</span>
          )}
          {outcome.roomCleared && (
            <span className="text-[var(--rpg-gold)]">CLEARED</span>
          )}
          {outcome.wipe && (
            <span className="text-[var(--rpg-red)]">WIPE</span>
          )}
          <span className="text-[var(--rpg-text-secondary)]">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>
      {expanded && (
        <div className="mt-2">
          <RoundLogContent log={log} playerId={playerId} />
        </div>
      )}
    </PixelCard>
  );
}

function PreviousRoundsLog({ logs, playerId }: {
  logs: ExpeditionRoundLog[];
  playerId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  const reversedLogs = logs.map((log, i) => ({ log, idx: i })).reverse();

  return (
    <PixelCard>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-center text-xs"
      >
        <span className="font-bold text-[var(--rpg-text-secondary)]">
          Previous Rounds ({logs.length})
        </span>
        <span className="text-[var(--rpg-text-secondary)]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {reversedLogs.map(({ log, idx }) => {
            const key = String(idx);
            const isOpen = expandedRound === key;
            const outcome = log.phases.outcome;
            return (
              <div key={key}>
                <button
                  onClick={() => setExpandedRound(isOpen ? null : key)}
                  className="w-full flex justify-between items-center px-2 py-1 rounded text-xs hover:bg-[var(--rpg-surface)]"
                >
                  <span className="text-[var(--rpg-text-primary)] font-bold">
                    {logs.some(l => l.roomIndex !== logs[0]?.roomIndex) ? `R${log.roomIndex + 1} · ` : ''}Round {log.round}
                  </span>
                  <div className="flex gap-2 text-xs">
                    {outcome.mobsKilled > 0 && (
                      <span className="text-[var(--rpg-green-light)]">{outcome.mobsKilled} killed</span>
                    )}
                    {outcome.playersKnockedOut > 0 && (
                      <span className="text-[var(--rpg-red)]">{outcome.playersKnockedOut} KO</span>
                    )}
                    {outcome.roomCleared && (
                      <span className="text-[var(--rpg-gold)]">CLEARED</span>
                    )}
                    {outcome.wipe && (
                      <span className="text-[var(--rpg-red)]">WIPE</span>
                    )}
                    <span className="text-[var(--rpg-text-secondary)]">{isOpen ? '\u25B2' : '\u25BC'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-2 pb-2">
                    <RoundLogContent log={log} playerId={playerId} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PixelCard>
  );
}
