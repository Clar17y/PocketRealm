'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Slider } from '@/components/ui/Slider';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { HpStatusBar } from '../common/HpStatusBar';
import { LowHpWarningDialog } from '../common/LowHpWarningDialog';
import { Loader2, Mountain, Play } from 'lucide-react';
import { EXPLORATION_CONSTANTS, HP_CONSTANTS, getUnlockedTiers, getTierName } from '@adventure/shared';
import { effectiveTurns as calcEffectiveTurns } from '@/lib/taxCalc';
import { xpRateColor } from '@/lib/format';
import { XpRateTooltip } from '@/components/common/XpRateTooltip';
import Image from 'next/image';
import { ActivityLog } from '@/components/ActivityLog';
import { TurnPlayback } from '@/components/playback/TurnPlayback';
import type { ActivityLogEntry, BestiarySkipEntry } from '@/app/game/useGameController';
import type { CombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';

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
    tiers: Record<string, number> | null;
  } | null;
  availableTurns: number;
  onStartExploration: (turns: number, tier?: number) => void;
  activityLog: ActivityLogEntry[];
  isRecovering?: boolean;
  recoveryCost?: number | null;
  currentHp?: number;
  maxHp?: number;
  regenPerSecond?: number;
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
  autoSkipKnownCombat?: boolean;
  bestiaryMobs?: BestiarySkipEntry[];
  defaultTurns?: number;
  tutorialLocked?: boolean;
  lowHpWarning?: boolean;
  onQuickRest?: () => Promise<void>;
  quickRestPercent?: number;
  busyAction?: string | null;
  onNavigateToRest?: () => void;
  guildTaxRate?: number;
  combatLogPrefetch?: CombatLogPrefetch;
  combatXpRate?: { skillName: string; rate: number };
}

export function Exploration({ currentZone, explorationProgress, availableTurns, onStartExploration, activityLog, isRecovering = false, recoveryCost, currentHp, maxHp, regenPerSecond, playbackData, onPlaybackComplete, onPlaybackSkip, onPushLog, combatSpeedMs, explorationSpeedMs, autoSkipKnownCombat, bestiaryMobs, defaultTurns, tutorialLocked = false, lowHpWarning, onQuickRest, quickRestPercent, busyAction, onNavigateToRest, guildTaxRate = 0, combatLogPrefetch, combatXpRate }: ExplorationProps) {
  const [turnInvestment, setTurnInvestment] = useState([tutorialLocked ? 100 : Math.min(defaultTurns ?? 100, availableTurns)]);
  const [showLowHpWarning, setShowLowHpWarning] = useState(false);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);

  const unlockedTierNumbers = getUnlockedTiers(
    explorationProgress?.percent ?? 0,
    explorationProgress?.tiers ?? null,
  );
  const unlockedTiers = unlockedTierNumbers.map(tier => ({
    tier,
    threshold: (explorationProgress?.tiers ?? {})[String(tier)] ?? 0,
  }));
  const maxUnlockedTier = unlockedTierNumbers.length > 0
    ? unlockedTierNumbers[unlockedTierNumbers.length - 1]!
    : null;
  const effectiveSelectedTier = selectedTier ?? maxUnlockedTier;

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

  const effective = calcEffectiveTurns(turnInvestment[0], guildTaxRate);
  const { expectedAmbushes, expectedSites, expectedResources, hiddenCacheChance } = calculateProbabilities(effective);

  return (
    <div className="space-y-4">
      {/* Low HP Warning Dialog */}
      {showLowHpWarning && typeof currentHp === 'number' && typeof maxHp === 'number' && (
        <LowHpWarningDialog
          currentHp={currentHp}
          maxHp={maxHp}
          onProceed={() => {
            setShowLowHpWarning(false);
            onStartExploration(turnInvestment[0], effectiveSelectedTier ?? undefined);
          }}
          onCancel={() => setShowLowHpWarning(false)}
        />
      )}

      {/* Knockout Banner */}
      {isRecovering && !playbackData && (
        <KnockoutBanner action="exploring" recoveryCost={recoveryCost} onClick={onNavigateToRest} />
      )}

      {/* HP Status */}
      {!playbackData && typeof currentHp === 'number' && typeof maxHp === 'number' && !isRecovering && (
        <HpStatusBar currentHp={currentHp} maxHp={maxHp} regenPerSecond={regenPerSecond} onQuickRest={onQuickRest} quickRestPercent={quickRestPercent} busyAction={busyAction} />
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
          autoSkipKnownCombat={autoSkipKnownCombat}
          bestiaryMobs={bestiaryMobs}
          onComplete={onPlaybackComplete!}
          onSkip={onPlaybackSkip!}
          onPushLog={onPushLog}
          combatLogPrefetch={combatLogPrefetch}
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

          {/* Tier Selector */}
          {unlockedTiers.length > 1 && !tutorialLocked && (
            <PixelCard>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-sm text-[var(--rpg-text-primary)]">Exploration Tier</h3>
                  {effectiveSelectedTier !== maxUnlockedTier && (
                    <span className="text-xs text-[var(--rpg-text-secondary)]">
                      No exploration progress at this tier
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {unlockedTiers.map(({ tier }) => (
                    <button
                      key={tier}
                      onClick={() => setSelectedTier(tier)}
                      className={`flex-1 px-3 py-1.5 text-sm rounded border transition-colors ${
                        (effectiveSelectedTier === tier)
                          ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)] border-[var(--rpg-gold)] font-bold'
                          : 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)] border-[var(--rpg-border)] hover:border-[var(--rpg-gold)]'
                      }`}
                    >
                      {getTierName(tier)}
                    </button>
                  ))}
                </div>
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
                  {guildTaxRate > 0 && (
                    <div className="text-xs text-[var(--rpg-text-secondary)]">
                      {effective.toLocaleString()} effective ({guildTaxRate}% tax)
                    </div>
                  )}
                  <div className="text-xs text-[var(--rpg-text-secondary)]">
                    of {availableTurns.toLocaleString()} available
                  </div>
                </div>
              </div>

              {combatXpRate && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--rpg-text-secondary)]">{combatXpRate.skillName} XP Rate:</span>
                  <span className="font-bold" style={{ color: xpRateColor(combatXpRate.rate) }}>
                    {combatXpRate.rate}%
                  </span>
                  <XpRateTooltip />
                </div>
              )}

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
            onClick={() => {
              if (
                lowHpWarning &&
                typeof currentHp === 'number' && typeof maxHp === 'number' &&
                maxHp > 0 && (currentHp / maxHp) < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD
              ) {
                setShowLowHpWarning(true);
              } else {
                onStartExploration(turnInvestment[0], effectiveSelectedTier ?? undefined);
              }
            }}
            disabled={isRecovering || turnInvestment[0] > availableTurns || !!busyAction}
          >
            <div className="flex items-center justify-center gap-2">
              {busyAction === 'exploration' ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Exploring...
                </>
              ) : (
                <>
                  <Play size={20} />
                  {isRecovering ? 'Recover First' : 'Start Exploration'}
                </>
              )}
            </div>
          </PixelButton>
        </>
      )}

      {/* Activity Log — always visible */}
      <ActivityLog entries={activityLog} />
    </div>
  );
}
