'use client';

import { useState, useEffect, useRef } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { Slider } from '@/components/ui/Slider';
import { TurnPresets } from '@/components/common/TurnPresets';
import { Heart, AlertTriangle } from 'lucide-react';
import * as api from '@/lib/api';
import { HP_CONSTANTS } from '@pocketrealm/shared';
import { ScreenContainer } from '../common/ScreenContainer';

interface RestProps {
  onComplete: () => void;
  onTurnsUpdate: (turns: number) => void;
  onHpUpdate: (hp: { currentHp: number; maxHp: number; regenPerSecond: number; isRecovering: boolean; recoveryCost: number | null }) => void;
  availableTurns: number;
}

export function Rest({ onComplete, onTurnsUpdate, onHpUpdate, availableTurns }: RestProps) {
  const [hpState, setHpState] = useState<{
    currentHp: number;
    maxHp: number;
    regenPerSecond: number;
    isRecovering: boolean;
    recoveryCost: number | null;
  } | null>(null);

  const [turns, setTurns] = useState(10);
  const [healPerTurn, setHealPerTurn] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<{
    healAmount: number;
    resultingHp: number;
    turnsNeeded: number;
    effectiveTurns?: number;
    taxRate?: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs for callbacks to avoid dependency issues
  const onHpUpdateRef = useRef(onHpUpdate);
  onHpUpdateRef.current = onHpUpdate;
  const turnsInitialized = useRef(false);

  // Fetch HP state once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await api.getHpState();
      if (!cancelled && result.data) {
        setHpState(result.data);
        onHpUpdateRef.current(result.data);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch estimate when turns or currentHp changes (debounced)
  useEffect(() => {
    if (!hpState || hpState.isRecovering) return;

    const timer = setTimeout(async () => {
      const result = await api.restEstimate(turns);
      if (result.data && !result.data.isRecovering) {
        if (result.data.healPerTurn) setHealPerTurn(result.data.healPerTurn);
        setEstimate({
          healAmount: result.data.healAmount ?? 0,
          resultingHp: result.data.resultingHp ?? 0,
          turnsNeeded: result.data.turnsNeeded ?? 0,
          effectiveTurns: result.data.effectiveTurns,
          taxRate: result.data.taxRate,
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [turns, hpState?.currentHp, hpState?.isRecovering]);

  // Default to "Full" when healPerTurn first loads
  useEffect(() => {
    if (!healPerTurn || !hpState || hpState.currentHp >= hpState.maxHp || turnsInitialized.current) return;
    turnsInitialized.current = true;
    const full = Math.ceil((hpState.maxHp - hpState.currentHp) / healPerTurn);
    const rounded = Math.ceil(full / 10) * 10;
    setTurns(Math.max(10, Math.min(rounded, availableTurns)));
  }, [healPerTurn, hpState, availableTurns]);

  const handleRest = async () => {
    if (!hpState) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.rest(turns);
      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (result.data) {
        onTurnsUpdate(result.data.turns.currentTurns);
        const newHpState = {
          ...hpState,
          currentHp: result.data.currentHp,
          maxHp: result.data.maxHp,
        };
        setHpState(newHpState);
        onHpUpdate(newHpState);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rest failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecover = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.recoverFromKnockout();
      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (result.data) {
        onTurnsUpdate(result.data.turns.currentTurns);
        // Fetch fresh HP state after recovery
        const hpResult = await api.getHpState();
        if (hpResult.data) {
          setHpState(hpResult.data);
          onHpUpdateRef.current(hpResult.data);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!hpState) {
    return (
      <PixelCard>
        <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
          Loading...
        </div>
      </PixelCard>
    );
  }

  // Recovering mode
  if (hpState.isRecovering) {
    return (
      <ScreenContainer>
        <PixelCard>
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle size={32} color="var(--rpg-red)" />
            <div>
              <h2 className="text-xl font-bold font-almendra text-[var(--rpg-red)]">Knocked Out</h2>
              <p className="text-sm text-[var(--rpg-text-secondary)]">
                You must recover before taking any actions
              </p>
            </div>
          </div>

          <div className="bg-[var(--rpg-background)] rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-[var(--rpg-text-secondary)]">Recovery Cost</span>
              <span className="text-[24px] text-[var(--rpg-gold)] font-pixel">
                {hpState.recoveryCost?.toLocaleString()} turns
              </span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-[var(--rpg-text-secondary)]">HP After Recovery</span>
              <span className="text-[12px] text-[var(--rpg-green-light)] font-pixel">
                {Math.floor(hpState.maxHp * HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT)} / {hpState.maxHp}
              </span>
            </div>
          </div>

          {error && (
            <div className="text-[var(--rpg-red)] text-sm mb-4">{error}</div>
          )}

          <PixelButton
            variant="primary"
            onClick={handleRecover}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Recovering...' : 'Recover'}
          </PixelButton>
        </PixelCard>
      </ScreenContainer>
    );
  }

  // Normal rest mode
  const isFullHp = hpState.currentHp >= hpState.maxHp;

  // Percentage-based presets
  const roundUp10 = (n: number) => Math.ceil(n / 10) * 10;
  const turnsToFull = healPerTurn && !isFullHp
    ? roundUp10(Math.ceil((hpState.maxHp - hpState.currentHp) / healPerTurn))
    : 0;
  const sliderMax = healPerTurn && turnsToFull > 0
    ? Math.max(10, Math.min(turnsToFull, availableTurns))
    : Math.min(1000, availableTurns);

  const missingHp = hpState.maxHp - hpState.currentHp;
  const presets = healPerTurn && !isFullHp ? [
    { label: 'Full', pct: 1.0 },
    { label: '75%', pct: 0.75 },
    { label: '50%', pct: 0.50 },
    { label: `${Math.round(HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT * 100)}%`, pct: HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT },
  ].map(({ label, pct }) => {
    const rawTurns = roundUp10(Math.ceil((missingHp * pct) / healPerTurn));
    return { label, turns: Math.min(Math.max(10, rawTurns), availableTurns) };
  }) : null;

  return (
    <ScreenContainer>
      <PixelCard>
        <div className="flex items-center gap-3 mb-4">
          <Heart size={32} color="var(--rpg-green-light)" />
          <div>
            <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Rest</h2>
            <p className="text-sm text-[var(--rpg-text-secondary)]">
              Spend turns to restore health
            </p>
          </div>
        </div>

        {/* Current HP */}
        <div className="mb-4">
          <div className="flex justify-between mb-1">
            <span className="text-sm text-[var(--rpg-text-secondary)]">Current HP</span>
            <span className="text-[12px] font-pixel text-[var(--rpg-green-light)]">
              {hpState.currentHp} / {hpState.maxHp}
            </span>
          </div>
          <StatBar
            current={hpState.currentHp}
            max={hpState.maxHp}
            color="health"
            size="md"
            showNumbers={false}
          />
          <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
            Passive regen: <span className="font-pixel text-[8px]">+{hpState.regenPerSecond.toFixed(1)}</span> HP/sec
          </div>
        </div>

        {/* Turn Slider */}
        {!isFullHp && (
          <>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-[var(--rpg-text-secondary)]">Turns to spend</span>
                <div className="text-right">
                  <div className="text-[24px] text-[var(--rpg-gold)] font-pixel">{turns}</div>
                  {estimate?.taxRate != null && estimate.taxRate > 0 && estimate.effectiveTurns != null && (
                    <div className="text-xs text-[var(--rpg-text-secondary)]">
                      {estimate.effectiveTurns} effective ({estimate.taxRate}% tax)
                    </div>
                  )}
                  <div className="text-xs text-[var(--rpg-text-secondary)]">of {availableTurns.toLocaleString()} available</div>
                </div>
              </div>
              <Slider
                min={10}
                max={sliderMax}
                step={10}
                value={[Math.min(turns, sliderMax)]}
                onValueChange={(val) => setTurns(val[0])}
              />
              {presets && (
                <TurnPresets
                  presets={presets}
                  currentValue={turns}
                  onChange={setTurns}
                  className="mt-3"
                />
              )}
            </div>

            {/* Estimate */}
            {estimate && (
              <div className="bg-[var(--rpg-background)] rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--rpg-text-secondary)]">HP Restored</span>
                  <span className="text-[12px] text-[var(--rpg-green-light)] font-pixel">
                    +{Math.floor(estimate.healAmount)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[var(--rpg-text-secondary)]">Result</span>
                  <span className="font-pixel text-[12px]">
                    {hpState.currentHp} → {Math.floor(estimate.resultingHp)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[var(--rpg-text-secondary)]">Turns Used</span>
                  <span className="font-pixel text-[12px] text-[var(--rpg-gold)]">
                    {estimate.turnsNeeded}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-[var(--rpg-red)] text-sm mb-4">{error}</div>
            )}

            <PixelButton
              variant="primary"
              onClick={handleRest}
              disabled={isLoading || isFullHp}
              className="w-full"
            >
              {isLoading ? 'Resting...' : 'Rest'}
            </PixelButton>
          </>
        )}

        {isFullHp && (
          <div className="text-center py-4 text-[var(--rpg-green-light)]">
            You are at full health!
          </div>
        )}
      </PixelCard>
    </ScreenContainer>
  );
}
