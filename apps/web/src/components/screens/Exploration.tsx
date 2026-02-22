'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Slider } from '@/components/ui/Slider';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { Mountain, Play } from 'lucide-react';
import { EXPLORATION_CONSTANTS } from '@adventure/shared';
import Image from 'next/image';
import { ActivityLog } from '@/components/ActivityLog';
import { TurnPlayback } from '@/components/playback/TurnPlayback';
import type { ActivityLogEntry } from '@/app/game/useGameController';

interface ExplorationProps {
  currentZone: {
    name: string;
    description: string;
    minLevel: number;
    imageSrc?: string;
  };
  explorationProgress: {
    turnsExplored: number;
    turnsToExplore: number | null;
    percent: number;
  } | null;
  availableTurns: number;
  onStartExploration: (turns: number) => void;
  activityLog: ActivityLogEntry[];
  isRecovering?: boolean;
  recoveryCost?: number | null;
  playbackData?: {
    totalTurns: number;
    zoneName: string;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    aborted: boolean;
    refundedTurns: number;
    playerHpBeforeExploration: number;
    playerMaxHp: number;
  } | null;
  onPlaybackComplete?: () => void;
  onPlaybackSkip?: () => void;
  onPushLog?: (...entries: Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>) => void;
  combatSpeedMs?: number;
  explorationSpeedMs?: number;
  defaultTurns?: number;
  tutorialLocked?: boolean;
}

export function Exploration({ currentZone, explorationProgress, availableTurns, onStartExploration, activityLog, isRecovering = false, recoveryCost, playbackData, onPlaybackComplete, onPlaybackSkip, onPushLog, combatSpeedMs, explorationSpeedMs, defaultTurns, tutorialLocked = false }: ExplorationProps) {
  const [turnInvestment, setTurnInvestment] = useState([tutorialLocked ? 100 : Math.min(defaultTurns ?? 100, availableTurns)]);

  const calculateProbabilities = (turns: number) => {
    const expectedAmbushes = turns * EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN;
    const expectedSites = turns * EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN;
    const expectedResources = turns * EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE;
    // Cumulative probability of at least one hidden cache: 1 - (1 - p)^n
    const hiddenCacheChance = Math.min(
      Math.round((1 - Math.pow(1 - EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE, turns)) * 100),
      99
    );
    return { expectedAmbushes, expectedSites, expectedResources, hiddenCacheChance };
  };

  const { expectedAmbushes, expectedSites, expectedResources, hiddenCacheChance } = calculateProbabilities(turnInvestment[0]);

  return (
    <div className="space-y-4">
      {/* Knockout Banner */}
      {isRecovering && !playbackData && (
        <KnockoutBanner action="exploring" recoveryCost={recoveryCost} />
      )}

      {/* Zone Header — always visible */}
      <PixelCard className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full bg-gradient-to-br from-[var(--rpg-purple)] to-transparent" />
        </div>
        <div className="relative flex items-start gap-3">
          <div className="w-16 h-16 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center flex-shrink-0">
            {currentZone.imageSrc ? (
              <Image
                src={currentZone.imageSrc}
                alt={currentZone.name}
                width={56}
                height={56}
                className="object-contain image-rendering-pixelated"
              />
            ) : (
              <Mountain size={32} color="var(--rpg-purple)" />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[var(--rpg-text-primary)] mb-1">
              {currentZone.name}
            </h2>
            <p className="text-sm text-[var(--rpg-text-secondary)] mb-2">
              {currentZone.description}
            </p>
            <div className="inline-flex items-center gap-1 text-xs bg-[var(--rpg-background)] px-2 py-1 rounded">
              <span className="text-[var(--rpg-text-secondary)]">Min Level:</span>
              <span className="text-[var(--rpg-gold)] font-bold">{currentZone.minLevel}</span>
            </div>
          </div>
        </div>
      </PixelCard>

      {/* Exploration Playback (with embedded combat) */}
      {playbackData && (
        <TurnPlayback
          totalTurns={playbackData.totalTurns}
          label={`Exploring ${playbackData.zoneName}`}
          events={playbackData.events}
          aborted={playbackData.aborted}
          refundedTurns={playbackData.refundedTurns}
          playerHpBefore={playbackData.playerHpBeforeExploration}
          playerMaxHp={playbackData.playerMaxHp}
          combatSpeedMs={combatSpeedMs}
          explorationSpeedMs={explorationSpeedMs}
          onComplete={onPlaybackComplete!}
          onSkip={onPlaybackSkip!}
          onPushLog={onPushLog}
        />
      )}

      {/* Normal exploration UI — hide during playback */}
      {!playbackData && (
        <>
          {/* Zone exploration progress */}
          {explorationProgress && explorationProgress.turnsToExplore && (
            <PixelCard>
              <div className="flex justify-between text-sm text-[var(--rpg-text-secondary)] mb-1">
                <span>Zone Exploration: {Math.floor(explorationProgress.percent)}%</span>
                <span>{explorationProgress.turnsExplored.toLocaleString()} / {explorationProgress.turnsToExplore.toLocaleString()} turns</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--rpg-background)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--rpg-gold)] transition-all"
                  style={{ width: `${Math.min(100, explorationProgress.percent)}%` }}
                />
              </div>
            </PixelCard>
          )}

          {/* Turn Investment */}
          <PixelCard>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-[var(--rpg-text-primary)]">Turn Investment</h3>
                <div className="text-right">
                  <div className="text-2xl font-bold text-[var(--rpg-gold)] font-mono">
                    {turnInvestment[0].toLocaleString()}
                  </div>
                  <div className="text-xs text-[var(--rpg-text-secondary)]">
                    of {availableTurns.toLocaleString()} available
                  </div>
                </div>
              </div>

              <Slider
                value={tutorialLocked ? [100] : turnInvestment}
                onValueChange={tutorialLocked ? undefined : setTurnInvestment}
                min={tutorialLocked ? 100 : 10}
                max={tutorialLocked ? 100 : Math.min(10000, availableTurns)}
                step={10}
                disabled={tutorialLocked}
                className="w-full"
              />

              {tutorialLocked && (
                <p className="text-xs text-[var(--rpg-gold)] text-center">
                  Spend 100 turns exploring
                </p>
              )}

              {!tutorialLocked && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setTurnInvestment([Math.min(100, availableTurns)])}
                    className="flex-1 px-3 py-1.5 text-sm bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded hover:border-[var(--rpg-gold)] transition-colors text-[var(--rpg-text-primary)]"
                  >
                    100
                  </button>
                  <button
                    onClick={() => setTurnInvestment([Math.min(500, availableTurns)])}
                    className="flex-1 px-3 py-1.5 text-sm bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded hover:border-[var(--rpg-gold)] transition-colors text-[var(--rpg-text-primary)]"
                  >
                    500
                  </button>
                  <button
                    onClick={() => setTurnInvestment([Math.min(1000, availableTurns)])}
                    className="flex-1 px-3 py-1.5 text-sm bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded hover:border-[var(--rpg-gold)] transition-colors text-[var(--rpg-text-primary)]"
                  >
                    1K
                  </button>
                  <button
                    onClick={() => setTurnInvestment([Math.min(5000, availableTurns)])}
                    className="flex-1 px-3 py-1.5 text-sm bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded hover:border-[var(--rpg-gold)] transition-colors text-[var(--rpg-text-primary)]"
                  >
                    5K
                  </button>
                </div>
              )}
            </div>
          </PixelCard>

          {/* Probability Preview */}
          <PixelCard className="bg-[var(--rpg-background)]">
            <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3">Expected Results</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--rpg-red)] font-mono">
                  {expectedAmbushes < 1 ? expectedAmbushes.toFixed(1) : `~${Math.round(expectedAmbushes)}`}
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">Ambushes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--rpg-blue-light)] font-mono">
                  {expectedSites < 1 ? expectedSites.toFixed(2) : `~${Math.round(expectedSites)}`}
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">Sites</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--rpg-gold)] font-mono">
                  {expectedResources < 1 ? expectedResources.toFixed(2) : `~${Math.round(expectedResources)}`}
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">Resources</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-[var(--rpg-purple)] font-mono">{hiddenCacheChance}%</div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">Rare Find</div>
              </div>
            </div>
          </PixelCard>

          {/* Start Button */}
          <PixelButton
            variant="gold"
            size="lg"
            className="w-full"
            onClick={() => onStartExploration(turnInvestment[0])}
            disabled={isRecovering || turnInvestment[0] > availableTurns}
          >
            <div className="flex items-center justify-center gap-2">
              <Play size={20} />
              {isRecovering ? 'Recover First' : 'Start Exploration'}
            </div>
          </PixelButton>
        </>
      )}

      {/* Activity Log — always visible */}
      <ActivityLog entries={activityLog} />
    </div>
  );
}
