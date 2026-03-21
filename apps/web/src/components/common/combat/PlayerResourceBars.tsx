'use client';

import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
import { EffectPill } from './EffectPill';
import type { BossActiveEffect } from '@pocketrealm/shared';

export interface PlayerResourceState {
  playerId: string;
  username?: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  activeEffects: BossActiveEffect[];
  isKnockedOut?: boolean;
}

export interface PlayerResourceBarsProps {
  players: PlayerResourceState[];
  compact?: boolean;
}

export function PlayerResourceBars({ players, compact = true }: PlayerResourceBarsProps) {
  if (players.length === 0) return null;

  return (
    <div className="space-y-2">
      {players.map((p) => (
        <div key={p.playerId}>
          {p.username && players.length > 1 && (
            <span className="text-xs text-[var(--rpg-text-primary)] truncate mb-0.5 block">
              {p.username}
            </span>
          )}
          {p.activeEffects.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-0.5">
              {p.activeEffects.map((eff, idx) => (
                <EffectPill key={idx} effect={eff} />
              ))}
            </div>
          )}
          <ResourceStatusBar
            currentHp={p.hp}
            maxHp={p.maxHp}
            currentStamina={p.stamina}
            maxStamina={p.maxStamina}
            currentMana={p.mana}
            maxMana={p.maxMana}
            isRecovering={p.isKnockedOut}
            compact={compact}
          />
        </div>
      ))}
    </div>
  );
}
