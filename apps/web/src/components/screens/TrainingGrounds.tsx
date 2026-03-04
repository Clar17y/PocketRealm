'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { CombatPlayback } from '@/components/combat/CombatPlayback';
import { startTrainingFight, getTrainingCooldown } from '@/lib/api';
import { Swords, Shield, AlertTriangle } from 'lucide-react';
import { FirstVisitHowTo } from '@/components/common/FirstVisitHowTo';
import { getMobPrefixDefinition } from '@adventure/shared';
import type { TrainingCombatResult } from '@/lib/api/training';
import { monsterImageSrc } from '@/lib/assets';
import { ScreenContainer } from '../common/ScreenContainer';

interface BestiaryMob {
  id: string;
  name: string;
  level: number;
  prefixesEncountered: string[];
}

interface TrainingGroundsProps {
  bestiary: BestiaryMob[];
  cooldownSeconds: number;
  onCooldownUpdate: (seconds: number) => void;
  isInTown: boolean;
  combatLogSpeedMs: number;
}

type TrainingState = 'idle' | 'fighting' | 'playback' | 'complete';

export function TrainingGrounds({
  bestiary,
  cooldownSeconds: initialCooldown,
  onCooldownUpdate,
  isInTown,
  combatLogSpeedMs,
}: TrainingGroundsProps) {
  const [selectedMobId, setSelectedMobId] = useState<string | null>(
    bestiary.length > 0 ? bestiary[0].id : null,
  );
  const [selectedPrefix, setSelectedPrefix] = useState<string>('none');
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [trainingState, setTrainingState] = useState<TrainingState>('idle');
  const [combatResult, setCombatResult] = useState<TrainingCombatResult | null>(null);
  const [mobDisplayName, setMobDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCooldownUpdateRef = useRef(onCooldownUpdate);
  onCooldownUpdateRef.current = onCooldownUpdate;

  const selectedMob = bestiary.find((m) => m.id === selectedMobId) ?? null;

  // Sync initial cooldown from props
  useEffect(() => {
    setCooldown(initialCooldown);
  }, [initialCooldown]);

  // Fetch cooldown on mount
  useEffect(() => {
    let cancelled = false;
    void getTrainingCooldown().then((res) => {
      if (!cancelled && res.data) {
        setCooldown(res.data.cooldownSeconds);
        onCooldownUpdateRef.current(res.data.cooldownSeconds);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Cooldown tick-down timer
  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      return;
    }

    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        const next = Math.max(0, prev - 1);
        // Notify parent outside the updater to avoid setState-during-render
        queueMicrotask(() => onCooldownUpdateRef.current(next));
        return next;
      });
    }, 1000);

    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset prefix when mob changes
  useEffect(() => {
    setSelectedPrefix('none');
  }, [selectedMobId]);

  const handleFight = useCallback(async () => {
    if (!selectedMob || cooldown > 0 || trainingState === 'fighting') return;

    setTrainingState('fighting');
    setError(null);
    setCombatResult(null);

    const prefix = selectedPrefix === 'none' ? null : selectedPrefix;
    const prefixDef = getMobPrefixDefinition(prefix);
    const displayName = prefixDef ? `${prefixDef.displayName} ${selectedMob.name}` : selectedMob.name;
    setMobDisplayName(displayName);

    const result = await startTrainingFight(selectedMob.id, prefix);

    if (result.error) {
      setError(result.error.message);
      setTrainingState('idle');
      return;
    }

    if (result.data) {
      setCombatResult(result.data.combat);
      setCooldown(result.data.cooldownSeconds);
      onCooldownUpdateRef.current(result.data.cooldownSeconds);
      setTrainingState('playback');
    }
  }, [selectedMob, cooldown, trainingState, selectedPrefix]);

  const handlePlaybackComplete = useCallback(() => {
    setTrainingState('complete');
  }, []);

  const handlePlaybackSkip = useCallback(() => {
    setTrainingState('complete');
  }, []);

  const handleDismiss = useCallback(() => {
    setTrainingState('idle');
    setCombatResult(null);
  }, []);

  // Not in town gate
  if (!isInTown) {
    return (
      <PixelCard>
        <div className="text-center py-8">
          <Shield size={32} className="mx-auto mb-3 text-[var(--rpg-text-secondary)]" />
          <p className="text-[var(--rpg-text-primary)] font-semibold mb-1">
            Training Grounds Unavailable
          </p>
          <p className="text-sm text-[var(--rpg-text-secondary)]">
            You must be in a town to use the training grounds.
          </p>
        </div>
      </PixelCard>
    );
  }

  // Combat playback phase
  if (trainingState === 'playback' && combatResult) {
    return (
      <div className="space-y-4">
        {/* Training banner */}
        <div className="bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg px-4 py-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Swords size={16} className="text-[var(--rpg-gold)]" />
            <span className="text-sm font-semibold text-[var(--rpg-gold)]">
              Training — No Rewards
            </span>
          </div>
        </div>

        <PixelCard>
          <CombatPlayback
            mobDisplayName={mobDisplayName}
            mobImageSrc={selectedMob ? monsterImageSrc(selectedMob.name) : undefined}
            outcome={combatResult.outcome}
            playerMaxHp={combatResult.combatantAMaxHp}
            playerStartHp={combatResult.combatantAMaxHp}
            playerMaxStamina={combatResult.combatantAMaxStamina}
            playerMaxMana={combatResult.combatantAMaxMana}
            mobMaxHp={combatResult.combatantBMaxHp}
            opponentMaxStamina={combatResult.combatantBMaxStamina}
            opponentMaxMana={combatResult.combatantBMaxMana}
            log={combatResult.log}
            speedMs={combatLogSpeedMs}
            onComplete={handlePlaybackComplete}
            onSkip={handlePlaybackSkip}
          />
        </PixelCard>
      </div>
    );
  }

  // Training complete phase
  if (trainingState === 'complete' && combatResult) {
    const outcomeLabel =
      combatResult.outcome === 'victory'
        ? 'Victory'
        : combatResult.outcome === 'draw'
          ? 'Draw'
          : 'Defeat';
    const outcomeColor =
      combatResult.outcome === 'victory'
        ? 'text-[var(--rpg-green-light)]'
        : combatResult.outcome === 'draw'
          ? 'text-[var(--rpg-gold)]'
          : 'text-[var(--rpg-red)]';

    return (
      <div className="space-y-4">
        <PixelCard>
          <div className="text-center py-4 space-y-3">
            <Swords size={32} className="mx-auto text-[var(--rpg-gold)]" />
            <div className={`text-xl font-bold ${outcomeColor}`}>
              {outcomeLabel}!
            </div>
            <div className="text-sm text-[var(--rpg-text-secondary)]">
              vs <span className="font-display">{mobDisplayName}</span> — <span className="font-pixel text-[16px]">{combatResult.log.length}</span> rounds
            </div>
            <div className="bg-[var(--rpg-background)] rounded-lg px-4 py-2 inline-block">
              <span className="text-sm text-[var(--rpg-text-secondary)]">
                Training Complete — No rewards earned
              </span>
            </div>
            <div className="pt-2">
              <PixelButton variant="secondary" onClick={handleDismiss}>
                Back to Training
              </PixelButton>
            </div>
          </div>
        </PixelCard>

        {cooldown > 0 && (
          <CooldownDisplay seconds={cooldown} />
        )}
      </div>
    );
  }

  // Idle / selection phase
  return (
    <ScreenContainer>
      <FirstVisitHowTo
        storageKey="howto_training"
        title="Training Grounds"
        sections={[
          { heading: 'Practice Fights', text: 'Fight any monster from your bestiary with no turn cost, no HP loss, and no rewards. Great for testing builds.' },
          { heading: 'Prefixes', text: 'Apply a mob prefix to increase difficulty. Prefixed mobs have boosted stats and different abilities.' },
          { heading: 'Cooldown', text: 'There is a short cooldown between fights to prevent spam.' },
        ]}
      />

      {/* Header */}
      <PixelCard>
        <div className="flex items-center gap-3 mb-1">
          <Swords size={28} className="text-[var(--rpg-gold)]" />
          <div>
            <h2 className="text-xl font-bold font-display text-[var(--rpg-text-primary)]">
              Training Grounds
            </h2>
            <p className="text-sm text-[var(--rpg-text-secondary)]">
              Practice against known foes — no rewards, no risk
            </p>
          </div>
        </div>
      </PixelCard>

      {/* Mob selector */}
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-text-primary)] mb-3">
          Select Opponent
        </h3>

        {bestiary.length === 0 ? (
          <div className="text-center py-4">
            <AlertTriangle size={24} className="mx-auto mb-2 text-[var(--rpg-text-secondary)]" />
            <p className="text-sm text-[var(--rpg-text-secondary)]">
              No mobs discovered yet. Explore the world to encounter enemies!
            </p>
          </div>
        ) : (
          <>
            {/* Mob list */}
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {bestiary.map((mob) => {
                const isSelected = selectedMobId === mob.id;
                return (
                  <button
                    key={mob.id}
                    type="button"
                    onClick={() => setSelectedMobId(mob.id)}
                    className="w-full text-left transition-all"
                  >
                    <div
                      className={`rounded-lg border p-2 transition-colors ${
                        isSelected
                          ? 'border-[var(--rpg-gold)] bg-[var(--rpg-background)]'
                          : 'border-[var(--rpg-border)] hover:border-[var(--rpg-text-secondary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold font-display text-[var(--rpg-text-primary)]">
                          {mob.name}
                        </span>
                        <span className="text-xs text-[var(--rpg-text-secondary)]">
                          Lv. <span className="font-pixel text-[8px]">{mob.level}</span>
                        </span>
                      </div>
                      {mob.prefixesEncountered.length > 0 && (
                        <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                          <span className="font-pixel text-[8px]">{mob.prefixesEncountered.length}</span> variant{mob.prefixesEncountered.length !== 1 ? 's' : ''} discovered
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Prefix selector */}
            {selectedMob && selectedMob.prefixesEncountered.length > 0 && (
              <div className="mb-4">
                <label className="text-xs text-[var(--rpg-text-secondary)] mb-1 block">
                  Variant
                </label>
                <select
                  value={selectedPrefix}
                  onChange={(e) => setSelectedPrefix(e.target.value)}
                  className="w-full rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--rpg-gold)]"
                >
                  <option value="none">{selectedMob.name} (base)</option>
                  {selectedMob.prefixesEncountered.map((prefix) => {
                    const def = getMobPrefixDefinition(prefix);
                    return (
                      <option key={prefix} value={prefix}>
                        {def?.displayName ?? prefix} {selectedMob.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </>
        )}
      </PixelCard>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-[var(--rpg-background)] border border-[var(--rpg-red)] text-[var(--rpg-red)] text-sm">
          {error}
        </div>
      )}

      {/* Cooldown display */}
      {cooldown > 0 && (
        <CooldownDisplay seconds={cooldown} />
      )}

      {/* Fight button */}
      <PixelButton
        variant="gold"
        size="lg"
        className="w-full"
        onClick={() => void handleFight()}
        disabled={
          !selectedMob ||
          cooldown > 0 ||
          trainingState === 'fighting' ||
          bestiary.length === 0
        }
      >
        {trainingState === 'fighting' ? (
          'Fighting...'
        ) : cooldown > 0 ? (
          `Cooldown — ${formatTime(cooldown)}`
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Swords size={18} />
            Train
          </span>
        )}
      </PixelButton>

      {/* No rewards reminder */}
      <div className="text-center text-xs text-[var(--rpg-text-secondary)]">
        Training fights grant no XP, loot, or gold
      </div>
    </ScreenContainer>
  );
}

function CooldownDisplay({ seconds }: { seconds: number }) {
  return (
    <div className="bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg p-3 text-center">
      <div className="text-xs text-[var(--rpg-text-secondary)] mb-1">Cooldown</div>
      <div className="text-[16px] font-pixel text-[var(--rpg-gold)]">
        {formatTime(seconds)}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${s.toString().padStart(2, '0')}`;
  return `${s}s`;
}
