'use client';

import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { Skull, Trophy, Coins, Sparkles } from 'lucide-react';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { ScreenContainer } from '../common/ScreenContainer';

interface CombatLogProps {
  enemy: {
    name: string;
    icon: string;
    level: number;
    health: number;
    maxHealth: number;
  };
  player: {
    health: number;
    maxHealth: number;
  };
  combatLog: Array<{
    round: number;
    messages: Array<{ text: string; type: 'player' | 'enemy' | 'system' }>;
  }>;
  status: 'ongoing' | 'victory' | 'defeat';
  rewards?: {
    gold: number;
    xp: number;
    items: Array<{ name: string; icon: string; rarity: string }>;
  };
  onContinue?: () => void;
}

export function CombatLog({ enemy, player, combatLog, status, rewards, onContinue }: CombatLogProps) {
  return (
    <ScreenContainer>
      {/* Enemy Portrait */}
      <PixelCard className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-[var(--rpg-red)] to-transparent" />
        <div className="relative flex items-center gap-4">
          <div className="w-24 h-24 rounded-lg bg-[var(--rpg-background)] border-2 border-[var(--rpg-red)] flex items-center justify-center text-5xl flex-shrink-0">
            {enemy.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="text-xl font-bold font-display text-[var(--rpg-text-primary)]">{enemy.name}</h2>
              <span className="text-[16px] text-[var(--rpg-red)] font-pixel">Lv. {enemy.level}</span>
            </div>
            <StatBar
              current={enemy.health}
              max={enemy.maxHealth}
              color="health"
              size="md"
              showNumbers={true}
              label="Enemy HP"
            />
          </div>
        </div>
      </PixelCard>

      {/* Player Health */}
      <PixelCard>
        <StatBar
          current={player.health}
          max={player.maxHealth}
          color="health"
          size="md"
          showNumbers={true}
          label="Your HP"
        />
      </PixelCard>

      {/* Combat Log */}
      <PixelCard>
        <h3 className="font-semibold font-display text-[var(--rpg-text-primary)] mb-3 flex items-center gap-2">
          <Skull size={18} />
          Combat Log
        </h3>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {combatLog.map((round) => (
            <div key={round.round} className="space-y-1">
              <div className="text-xs font-semibold text-[var(--rpg-gold)] border-b border-[var(--rpg-border)] pb-1">
                Round {round.round}
              </div>
              {round.messages.map((msg, idx) => {
                const typeStyles = {
                  player: 'text-[var(--rpg-green-light)]',
                  enemy: 'text-[var(--rpg-red)]',
                  system: 'text-[var(--rpg-text-secondary)]',
                };
                return (
                  <div key={idx} className={`text-sm ${typeStyles[msg.type]} pl-2`}>
                    {msg.text}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </PixelCard>

      {/* Victory Modal */}
      {status === 'victory' && rewards && (
        <ModalOverlay opacity={90}>
          <PixelCard className="max-w-sm w-full rpg-victory-pulse">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <Trophy size={56} color="var(--rpg-gold)" />
              </div>
              <h3 className="text-3xl font-bold font-display text-[var(--rpg-gold)] mb-2">Victory!</h3>

              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 rounded-lg bg-[var(--rpg-background)] border-2 border-[var(--rpg-gold)] flex items-center justify-center text-4xl">
                  {enemy.icon}
                </div>
              </div>
              <p className="text-sm text-[var(--rpg-text-secondary)] mb-6">Defeated {enemy.name}</p>

              <div className="space-y-4">
                <div className="bg-[var(--rpg-background)] rounded-lg p-4">
                  <h4 className="text-xs font-semibold text-[var(--rpg-text-secondary)] mb-3">REWARDS</h4>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-[var(--rpg-surface)] rounded-lg p-3">
                      <Coins size={24} color="var(--rpg-gold)" className="mx-auto mb-1" />
                      <div className="text-[24px] text-[var(--rpg-gold)] font-pixel">{rewards.gold}</div>
                      <div className="text-xs text-[var(--rpg-text-secondary)]">Gold</div>
                    </div>
                    <div className="bg-[var(--rpg-surface)] rounded-lg p-3">
                      <Sparkles size={24} color="var(--rpg-blue-light)" className="mx-auto mb-1" />
                      <div className="text-[24px] text-[var(--rpg-blue-light)] font-pixel">{rewards.xp}</div>
                      <div className="text-xs text-[var(--rpg-text-secondary)]">XP</div>
                    </div>
                  </div>

                  {rewards.items.length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--rpg-text-secondary)] mb-2">Items Dropped:</div>
                      <div className="flex gap-2 justify-center flex-wrap">
                        {rewards.items.map((item, idx) => {
                          const borderColor = RARITY_COLORS[(item.rarity as Rarity) ?? 'common'] ?? RARITY_COLORS.common;
                          return (
                            <div
                              key={idx}
                              className="w-14 h-14 bg-[var(--rpg-surface)] border-2 rounded-lg flex items-center justify-center text-2xl"
                              style={{ borderColor }}
                              title={item.name}
                            >
                              {item.icon}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {onContinue && (
                  <PixelButton variant="gold" size="lg" className="w-full" onClick={onContinue}>
                    Continue
                  </PixelButton>
                )}
              </div>
            </div>
          </PixelCard>
        </ModalOverlay>
      )}

      {/* Defeat Modal */}
      {status === 'defeat' && (
        <ModalOverlay opacity={90}>
          <PixelCard className="max-w-sm w-full">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <Skull size={56} color="var(--rpg-red)" />
              </div>
              <h3 className="text-3xl font-bold font-display text-[var(--rpg-red)] mb-2">Defeated...</h3>

              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 rounded-lg bg-[var(--rpg-background)] border-2 border-[var(--rpg-red)] flex items-center justify-center text-4xl">
                  {enemy.icon}
                </div>
              </div>
              <p className="text-sm text-[var(--rpg-text-secondary)] mb-6">You were defeated by {enemy.name}</p>

              <div className="bg-[var(--rpg-background)] rounded-lg p-4 mb-4">
                <h4 className="text-xs font-semibold text-[var(--rpg-text-secondary)] mb-3">DAMAGE TAKEN</h4>
                <div className="text-4xl text-[var(--rpg-red)] font-pixel mb-1">
                  {player.maxHealth - player.health}
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)]">HP Lost in Battle</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {onContinue && (
                  <>
                    <PixelButton variant="danger" className="w-full" onClick={onContinue}>
                      Try Again
                    </PixelButton>
                    <PixelButton variant="secondary" className="w-full" onClick={onContinue}>
                      Retreat
                    </PixelButton>
                  </>
                )}
              </div>
            </div>
          </PixelCard>
        </ModalOverlay>
      )}
    </ScreenContainer>
  );
}
