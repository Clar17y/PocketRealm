'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { Coins, TrendingUp, MapPin, Sword, Pickaxe, Hammer, Heart, Crosshair, Sparkles, Dice5, Wind } from 'lucide-react';
import Image from 'next/image';
import { getStaggerDelay } from '@/lib/animations';
import { uiIconSrc } from '@/lib/assets';
import { ActivityLog } from '@/components/ActivityLog';
import { Divider } from '@/components/common/Divider';
import type { ActivityLogEntry } from '@/app/game/gameController.types';
import { ScreenContainer } from '../common/ScreenContainer';

interface DashboardProps {
  playerData: {
    turns: number;
    maxTurns: number;
    turnsRegenRate: number;
    gold: number;
    currentXP: number;
    nextLevelXP: number;
    currentLevelXp: number;
    requiredLevelXp: number;
    currentZone: string;
    isRecovering: boolean;
    recoveryCost: number | null;
    isOverEncumbered: boolean;
  };
  skills: Array<{ name: string; level: number; icon?: LucideIcon; imageSrc?: string }>;
  onNavigate: (screen: string) => void;
  characterProgression: {
    characterLevel: number;
    attributePoints: number;
    attributes: {
      vitality: number;
      strength: number;
      dexterity: number;
      intelligence: number;
      luck: number;
      evasion: number;
    };
  };
  activityLog: ActivityLogEntry[];
  onAllocateAttribute?: (
    attribute: 'vitality' | 'strength' | 'dexterity' | 'intelligence' | 'luck' | 'evasion',
    points?: number
  ) => Promise<void>;
}

const ATTRIBUTE_META = {
  vitality: { label: 'Vitality', description: 'HP and regen', icon: Heart, color: 'var(--rpg-green-light)' },
  strength: { label: 'Strength', description: 'Melee damage + accuracy', icon: Sword, color: 'var(--rpg-red)' },
  dexterity: { label: 'Dexterity', description: 'Ranged damage + accuracy', icon: Crosshair, color: 'var(--rpg-blue-light)' },
  intelligence: { label: 'Intelligence', description: 'Magic damage + accuracy', icon: Sparkles, color: 'var(--rpg-purple)' },
  luck: { label: 'Luck', description: 'Crits and drops', icon: Dice5, color: 'var(--rpg-gold)' },
  evasion: { label: 'Evasion', description: 'Dodge chance', icon: Wind, color: 'var(--rpg-blue-light)' },
} as const;

type AttributeType = keyof typeof ATTRIBUTE_META;

export function Dashboard({ playerData, skills, onNavigate, characterProgression, activityLog, onAllocateAttribute }: DashboardProps) {
  const [allocating, setAllocating] = useState<AttributeType | null>(null);

  const handleAllocate = async (attribute: AttributeType) => {
    if (!onAllocateAttribute || characterProgression.attributePoints <= 0 || allocating) return;
    setAllocating(attribute);
    try {
      await onAllocateAttribute(attribute, 1);
    } finally {
      setAllocating(null);
    }
  };

  return (
    <ScreenContainer>
      {/* Knockout Banner */}
      {playerData.isRecovering && (
        <KnockoutBanner action="taking any actions" recoveryCost={playerData.recoveryCost} />
      )}

      {/* Over-Encumbered Banner */}
      {playerData.isOverEncumbered && !playerData.isRecovering && (
        <PixelCard className="border-[var(--rpg-gold)]">
          <div className="text-center text-sm text-[var(--rpg-gold)]">
            You are <span className="font-bold">over-encumbered</span> and cannot explore, mine, or craft until you free up inventory space.
          </div>
        </PixelCard>
      )}

      {/* Turn Counter */}
      <PixelCard variant="ornate">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center">
              <Image
                src={uiIconSrc('turn')}
                alt="Turns"
                width={48}
                height={48}
                className="image-rendering-pixelated"
              />
            </div>
            <div>
              <div className="text-sm text-[var(--rpg-text-secondary)]">Available Turns</div>
              <div className="text-2xl font-bold text-[var(--rpg-gold)] font-pixel">
                {playerData.turns.toLocaleString()}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--rpg-text-secondary)]">Regen Rate</div>
            <div className="text-sm text-[var(--rpg-green-light)] font-pixel">
              +{playerData.turnsRegenRate}/min
            </div>
          </div>
        </div>
        <div className="mt-3">
          <StatBar
            current={playerData.turns}
            max={playerData.maxTurns}
            color="gold"
            size="sm"
            showNumbers={false}
          />
        </div>
      </PixelCard>

      {/* Action Buttons */}
      <div>
        <h2 className="text-lg font-semibold font-display mb-3 text-[var(--rpg-text-primary)]">Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative group">
            <PixelButton
              variant="primary"
              className="w-full"
              onClick={() => onNavigate('explore')}
              disabled={playerData.isOverEncumbered || playerData.isRecovering}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  <Sword size={18} />
                </span>
                Explore
              </div>
            </PixelButton>
            {(playerData.isOverEncumbered || playerData.isRecovering) && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-xs text-[var(--rpg-text-secondary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {playerData.isOverEncumbered ? 'Over-encumbered' : 'Recover first'}
              </div>
            )}
          </div>
          <div className="relative group">
            <PixelButton
              variant="primary"
              className="w-full"
              onClick={() => onNavigate('gathering')}
              disabled={playerData.isOverEncumbered || playerData.isRecovering}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  <Pickaxe size={18} />
                </span>
                Mine
              </div>
            </PixelButton>
            {(playerData.isOverEncumbered || playerData.isRecovering) && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-xs text-[var(--rpg-text-secondary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {playerData.isOverEncumbered ? 'Over-encumbered' : 'Recover first'}
              </div>
            )}
          </div>
          <div className="relative group">
            <PixelButton
              variant="secondary"
              className="w-full"
              onClick={() => onNavigate('crafting')}
              disabled={playerData.isOverEncumbered || playerData.isRecovering}
            >
              <div className="flex items-center justify-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center">
                  <Hammer size={18} />
                </span>
                Craft
              </div>
            </PixelButton>
            {(playerData.isOverEncumbered || playerData.isRecovering) && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-xs text-[var(--rpg-text-secondary)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {playerData.isOverEncumbered ? 'Over-encumbered' : 'Recover first'}
              </div>
            )}
          </div>
          <PixelButton
            variant={playerData.isRecovering ? 'primary' : 'secondary'}
            className="w-full"
            onClick={() => onNavigate('rest')}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center">
                <Heart size={18} />
              </span>
              {playerData.isRecovering ? 'Recover' : 'Rest'}
            </div>
          </PixelButton>
        </div>
      </div>

      <Divider className="my-1" />

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <PixelCard padding="sm">
          <div className="flex flex-col items-center text-center">
            <Coins size={20} color="var(--rpg-gold)" className="mb-1" />
            <div className="text-xs text-[var(--rpg-text-secondary)]">Gold</div>
            <div className="text-lg font-bold text-[var(--rpg-gold)] font-pixel">
              {playerData.gold.toLocaleString()}
            </div>
          </div>
        </PixelCard>

        <PixelCard padding="sm">
          <div className="flex flex-col items-center text-center">
            <TrendingUp size={20} color="var(--rpg-blue-light)" className="mb-1" />
            <div className="text-xs text-[var(--rpg-text-secondary)]">Total XP</div>
            <div className="text-lg font-bold text-[var(--rpg-blue-light)] font-pixel">
              {playerData.currentXP.toLocaleString()}
            </div>
          </div>
        </PixelCard>

        <PixelCard padding="sm">
          <div className="flex flex-col items-center text-center">
            <MapPin size={20} color="var(--rpg-purple)" className="mb-1" />
            <div className="text-xs text-[var(--rpg-text-secondary)]">Zone</div>
            <div className="text-xs font-semibold font-display text-[var(--rpg-text-primary)] mt-1">
              {playerData.currentZone}
            </div>
          </div>
        </PixelCard>
      </div>

      {/* Attributes */}
      <PixelCard variant="framed">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-[var(--rpg-text-secondary)]">Character Level</div>
            <div className="text-2xl font-bold text-[var(--rpg-gold)] font-pixel">{characterProgression.characterLevel}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-[var(--rpg-text-secondary)]">Unspent Points</div>
            <div className="text-2xl font-bold text-[var(--rpg-blue-light)] font-pixel">{characterProgression.attributePoints}</div>
          </div>
        </div>
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-[var(--rpg-text-secondary)] mb-1">
            <span>Level Progress</span>
            <span className="font-pixel">
              {playerData.currentLevelXp.toLocaleString()} / {playerData.requiredLevelXp.toLocaleString()} XP
            </span>
          </div>
          <StatBar
            current={playerData.currentLevelXp}
            max={Math.max(1, playerData.requiredLevelXp)}
            color="xp"
            size="sm"
            showNumbers={false}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(ATTRIBUTE_META).map(([key, meta], index) => {
            const attribute = key as AttributeType;
            const Icon = meta.icon;
            const disabled = characterProgression.attributePoints <= 0 || allocating !== null;
            return (
              <div
                key={attribute}
                className="rpg-stagger-item rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 flex items-center justify-between gap-2"
                style={{ animationDelay: getStaggerDelay(index) }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon size={16} color={meta.color} />
                    <span className="font-semibold text-[var(--rpg-text-primary)]">{meta.label}</span>
                    <span className="text-sm font-bold text-[var(--rpg-gold)] font-pixel">
                      {characterProgression.attributes[attribute]}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--rpg-text-secondary)]">{meta.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAllocate(attribute)}
                  disabled={disabled}
                  className="px-2 py-1 rounded text-sm font-bold bg-[var(--rpg-gold)] text-[var(--rpg-background)] disabled:opacity-50"
                >
                  +1
                </button>
              </div>
            );
          })}
        </div>
      </PixelCard>

      <Divider className="my-1" />

      {/* Skills Grid */}
      <div>
        <h2 className="text-lg font-semibold font-display mb-3 text-[var(--rpg-text-primary)]">Skills</h2>
        <div className="grid grid-cols-4 gap-3">
          {skills.map((skill, index) => {
            const Icon = skill.icon;
            return (
              <button
                key={index}
                onClick={() => onNavigate('skills')}
                className="rpg-stagger-item aspect-square bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg flex flex-col items-center justify-center gap-1 hover:border-[var(--rpg-gold)] transition-all active:scale-95"
                style={{ animationDelay: getStaggerDelay(index) }}
              >
                {skill.imageSrc ? (
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <Image
                      src={skill.imageSrc}
                      alt={skill.name}
                      fill
                      sizes="56px"
                      className="object-contain image-rendering-pixelated"
                    />
                  </div>
                ) : Icon ? (
                  <Icon size={56} color="var(--rpg-gold)" />
                ) : null}
                <span className="text-xs text-[var(--rpg-text-secondary)]">{skill.name}</span>
                <span className="text-sm font-bold text-[var(--rpg-gold)] font-pixel">{skill.level}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity Log */}
      <ActivityLog entries={activityLog} />

    </ScreenContainer>
  );
}
