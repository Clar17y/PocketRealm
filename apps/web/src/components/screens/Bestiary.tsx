'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { BookOpen, X, MapPin, Sword, Shield, Heart, Lock } from 'lucide-react';
import Image from 'next/image';
import { uiIconSrc } from '@/lib/assets';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { getMobPrefixDefinition, getTierName } from '@adventure/shared';
import { StatBar } from '@/components/StatBar';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { ScreenContainer } from '../common/ScreenContainer';

interface MonsterDrop {
  name: string;
  imageSrc?: string;
  dropRate: number;
  rarity: Rarity;
}

interface Monster {
  id: string;
  name: string;
  imageSrc?: string;
  level: number;
  isDiscovered: boolean;
  killCount: number;
  stats: {
    hp: number;
    accuracy: number;
    defence: number;
  };
  drops: MonsterDrop[];
  zones: string[];
  description: string;
  prefixesEncountered: string[];
  explorationTier?: number;
  tierLocked?: boolean;
  bossRotation?: {
    totalRounds: number;
    revealedRounds: number;
    actions: Array<{
      round: number;
      actionName: string;
      targetMode: 'single_target' | 'aoe';
      isTelegraphed: boolean;
    }>;
  };
}

interface PrefixSummaryEntry {
  prefix: string;
  displayName: string;
  totalKills: number;
  discovered: boolean;
}

interface BestiaryProps {
  monsters: Monster[];
  prefixSummary: PrefixSummaryEntry[];
}

const PREFIX_ORDER = ['weak', 'frail', 'tough', 'gigantic', 'swift', 'ferocious', 'shaman', 'venomous', 'ancient', 'spectral'];
const TOTAL_PREFIXES = PREFIX_ORDER.length;

function PrefixPipRow({ encountered }: { encountered: string[] }) {
  const encounteredSet = new Set(encountered);
  const count = encounteredSet.size;
  const mastered = count === TOTAL_PREFIXES;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {PREFIX_ORDER.map((prefix) => {
          const found = encounteredSet.has(prefix);
          return (
            <div
              key={prefix}
              title={found ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : '???'}
              className={`w-2 h-2 rounded-full ${
                mastered
                  ? 'bg-[var(--rpg-gold)]'
                  : found
                    ? 'bg-[var(--rpg-blue-light)]'
                    : 'bg-[var(--rpg-border)]'
              }`}
            />
          );
        })}
      </div>
      <span className={`text-[10px] font-pixel ${mastered ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)]'}`}>
        {count}/{TOTAL_PREFIXES}
      </span>
      {mastered && <span className="text-[10px] text-[var(--rpg-gold)] font-bold">Mastered</span>}
    </div>
  );
}

function PrefixEncyclopedia({ prefixSummary }: { prefixSummary: PrefixSummaryEntry[] }) {
  const formatMultiplier = (value: number) => `${Number(value.toFixed(2))}x`;

  return (
    <div className="space-y-3">
      {prefixSummary.map((entry) => {
        const definition = getMobPrefixDefinition(entry.prefix);
        const showName = entry.totalKills >= 1;
        const showMultipliers = entry.totalKills >= 3;
        const showSpell = entry.totalKills >= 10;

        return (
          <div
            key={entry.prefix}
            className="rounded-lg border-2 bg-[var(--rpg-surface)] border-[var(--rpg-border)] p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-[var(--rpg-text-primary)]">
                {showName ? entry.displayName : '???'}
              </span>
              {showName && (
                <span className="text-[8px] text-[var(--rpg-gold)] font-pixel">
                  {entry.totalKills} defeated
                </span>
              )}
            </div>

            {showName && definition && (
              <p className="text-xs text-[var(--rpg-text-secondary)] mb-2">{definition.description}</p>
            )}

            {showMultipliers && definition ? (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-2 text-xs">
                  {definition.statMultipliers.hp !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-green-light)]">HP {formatMultiplier(definition.statMultipliers.hp)}</span>
                  )}
                  {definition.statMultipliers.accuracy !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-red)]">ACC {formatMultiplier(definition.statMultipliers.accuracy)}</span>
                  )}
                  {definition.statMultipliers.defence !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-blue-light)]">DEF {formatMultiplier(definition.statMultipliers.defence)}</span>
                  )}
                  {definition.statMultipliers.evasion !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)]">EVA {formatMultiplier(definition.statMultipliers.evasion)}</span>
                  )}
                  {(definition.statMultipliers.damageMin !== undefined || definition.statMultipliers.damageMax !== undefined) && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-red)]">DMG {formatMultiplier(definition.statMultipliers.damageMin ?? 1)}</span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-gold)]">XP {formatMultiplier(definition.xpMultiplier)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-gold)]">LOOT {formatMultiplier(definition.dropChanceMultiplier)}</span>
                </div>

                {showSpell && definition.spellTemplate && (
                  <div className="mt-2 text-xs text-[var(--rpg-text-secondary)] border-t border-[var(--rpg-border)] pt-2">
                    Casts <span className="text-[var(--rpg-text-primary)] font-semibold">{definition.spellTemplate.actionName}</span> starting round {definition.spellTemplate.startRound}, every {definition.spellTemplate.interval} rounds ({formatMultiplier(definition.spellTemplate.damageMultiplier)} damage)
                  </div>
                )}
              </div>
            ) : showName ? (
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Defeat {3 - entry.totalKills} more to reveal effects.
              </div>
            ) : (
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Encounter this prefix to learn about it.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Bestiary({ monsters, prefixSummary }: BestiaryProps) {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [activeView, setActiveView] = useState<'monsters' | 'prefixes'>('monsters');
  const sortedMonsters = [...monsters].sort((a, b) => Number(b.isDiscovered) - Number(a.isDiscovered));

  const discoveredCount = monsters.filter((m) => m.isDiscovered).length;
  const totalCount = monsters.length;

  const getStatsVisibility = (killCount: number) => ({
    showHP: killCount >= 1,
    showAccuracy: killCount >= 5,
    showDefence: killCount >= 10,
    showDrops: killCount >= 3,
  });

  return (
    <ScreenContainer>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Bestiary</h2>
          <BookOpen size={20} color="var(--rpg-gold)" />
        </div>
        <div className="flex gap-1">
          {(['monsters', 'prefixes'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeView === view
                  ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-bold'
                  : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
              }`}
            >
              {view === 'monsters' ? `Monsters ${discoveredCount}/${totalCount}` : 'Prefixes'}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'monsters' ? (
        <>
          {/* Monster Grid */}
          <div className="grid grid-cols-3 gap-3">
            {sortedMonsters.map((monster) => {
              const isTierLocked = monster.tierLocked && !monster.isDiscovered;

              return (
                <button
                  key={monster.id}
                  onClick={() => monster.isDiscovered && setSelectedMonster(monster)}
                  disabled={!monster.isDiscovered}
                  className="aspect-square"
                >
                  <div
                    className={`w-full h-full rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                      monster.isDiscovered
                        ? 'bg-[var(--rpg-surface)] border-[var(--rpg-border)] hover:border-[var(--rpg-gold)]'
                        : isTierLocked
                          ? 'bg-[var(--rpg-background)] border-[var(--rpg-border)] opacity-40'
                          : 'bg-[var(--rpg-background)] border-[var(--rpg-border)] border-dashed'
                    }`}
                  >
                    {monster.isDiscovered ? (
                      <>
                        {monster.imageSrc ? (
                          <Image
                            src={monster.imageSrc}
                            alt={monster.name}
                            width={48}
                            height={48}
                            className="image-rendering-pixelated mb-1"
                          />
                        ) : (
                          <Image
                            src={uiIconSrc('attack')}
                            alt={monster.name}
                            width={48}
                            height={48}
                            className="image-rendering-pixelated mb-1"
                          />
                        )}
                        <span className="text-[10px] text-[var(--rpg-text-secondary)] text-center px-1 leading-tight">
                          {monster.name}
                        </span>
                        <span className="text-[10px] text-[var(--rpg-gold)] font-pixel mt-1">x{monster.killCount}</span>
                      </>
                    ) : isTierLocked ? (
                      <>
                        <div className="w-12 h-12 bg-[var(--rpg-surface)] rounded-lg mb-1 flex items-center justify-center">
                          <Lock size={20} color="var(--rpg-text-secondary)" className="opacity-40" />
                        </div>
                        <span className="text-[10px] text-[var(--rpg-text-secondary)] text-center px-1 leading-tight">
                          Locked — {getTierName(monster.explorationTier ?? 1)}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-[var(--rpg-surface)] rounded-lg mb-1 flex items-center justify-center">
                          <Image
                            src={uiIconSrc('scroll')}
                            alt="Unknown monster"
                            width={24}
                            height={24}
                            className="image-rendering-pixelated opacity-30"
                          />
                        </div>
                        <span className="text-xs text-[var(--rpg-text-secondary)]">???</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Monster Detail Modal */}
          {selectedMonster && (
            <ModalOverlay opacity={80} onClose={() => setSelectedMonster(null)}>
              <div className="max-w-sm w-full max-h-[80vh] overflow-y-auto">
                <PixelCard>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-lg bg-[var(--rpg-background)] border-2 border-[var(--rpg-red)] flex items-center justify-center text-3xl">
                        {selectedMonster.imageSrc ? (
                          <Image
                            src={selectedMonster.imageSrc}
                            alt={selectedMonster.name}
                            width={56}
                            height={56}
                            className="image-rendering-pixelated"
                          />
                        ) : (
                          <Image
                            src={uiIconSrc('attack')}
                            alt={selectedMonster.name}
                            width={56}
                            height={56}
                            className="image-rendering-pixelated"
                          />
                        )}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">{selectedMonster.name}</h3>
                        <div className="text-xs text-[var(--rpg-text-secondary)]">Level <span className="font-pixel text-[8px]">{selectedMonster.level}</span></div>
                        <div className="text-xs text-[var(--rpg-gold)] mt-1">Defeated <span className="font-pixel text-[8px]">{selectedMonster.killCount}</span> times</div>
                        {selectedMonster.explorationTier && (
                          <span className="inline-flex items-center gap-1 text-xs bg-[var(--rpg-background)] px-2 py-0.5 rounded mt-1">
                            {getTierName(selectedMonster.explorationTier)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedMonster(null)}
                      className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <p className="text-sm text-[var(--rpg-text-secondary)] mb-4">{selectedMonster.description}</p>

                  {/* Stats */}
                  <div className="mb-4">
                    <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm mb-2">
                      Stats{' '}
                      {selectedMonster.killCount < 10 && (
                        <span className="text-xs text-[var(--rpg-text-secondary)]">(Partial)</span>
                      )}
                    </h4>
                    <div className="space-y-2">
                      {getStatsVisibility(selectedMonster.killCount).showHP ? (
                        <div className="flex items-center gap-3">
                          <Heart size={16} color="var(--rpg-green-light)" />
                          <span className="text-sm text-[var(--rpg-text-primary)]">HP:</span>
                          <span className="text-[16px] font-pixel text-[var(--rpg-green-light)]">{selectedMonster.stats.hp}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 opacity-50">
                          <Heart size={16} color="var(--rpg-text-secondary)" />
                          <span className="text-sm text-[var(--rpg-text-secondary)]">HP: ???</span>
                        </div>
                      )}

                      {getStatsVisibility(selectedMonster.killCount).showAccuracy ? (
                        <div className="flex items-center gap-3">
                          <Sword size={16} color="var(--rpg-red)" />
                          <span className="text-sm text-[var(--rpg-text-primary)]">Accuracy:</span>
                          <span className="text-[16px] font-pixel text-[var(--rpg-red)]">{selectedMonster.stats.accuracy}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 opacity-50">
                          <Sword size={16} color="var(--rpg-text-secondary)" />
                          <span className="text-sm text-[var(--rpg-text-secondary)]">
                            Accuracy: ??? <span className="text-xs">(Defeat 5+ times)</span>
                          </span>
                        </div>
                      )}

                      {getStatsVisibility(selectedMonster.killCount).showDefence ? (
                        <div className="flex items-center gap-3">
                          <Shield size={16} color="var(--rpg-blue-light)" />
                          <span className="text-sm text-[var(--rpg-text-primary)]">Defence:</span>
                          <span className="text-[16px] font-pixel text-[var(--rpg-blue-light)]">
                            {selectedMonster.stats.defence}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 opacity-50">
                          <Shield size={16} color="var(--rpg-text-secondary)" />
                          <span className="text-sm text-[var(--rpg-text-secondary)]">
                            Defence: ??? <span className="text-xs">(Defeat 10+ times)</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Locations */}
                  <div className="mb-4">
                    <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm mb-2">Found In</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedMonster.zones.map((zone, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1 px-2 py-1 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-xs text-[var(--rpg-text-secondary)]"
                        >
                          <MapPin size={12} />
                          {zone}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Known Drops */}
                  {getStatsVisibility(selectedMonster.killCount).showDrops && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm mb-2">Known Drops</h4>
                      <div className="space-y-2">
                        {selectedMonster.drops.map((drop, idx) => {
                          return (
                            <div key={idx} className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded border-2 flex items-center justify-center text-lg"
                                style={{ borderColor: RARITY_COLORS[drop.rarity] }}
                              >
                                {drop.imageSrc ? (
                                  <Image
                                    src={drop.imageSrc}
                                    alt={drop.name}
                                    width={24}
                                    height={24}
                                    className="image-rendering-pixelated"
                                  />
                                ) : (
                                  <span className="text-sm">❓</span>
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm text-[var(--rpg-text-primary)]">{drop.name}</div>
                                <div className="text-xs text-[var(--rpg-text-secondary)]"><span className="font-pixel text-[8px]">{drop.dropRate}%</span> drop rate</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Boss Rotation */}
                  {selectedMonster.bossRotation && (
                    <div className="mb-4">
                      <h4 className="text-sm font-bold text-[var(--rpg-gold)] mb-2">
                        Boss Rotation ({selectedMonster.bossRotation.revealedRounds}/{selectedMonster.bossRotation.totalRounds} revealed)
                      </h4>
                      <StatBar
                        current={selectedMonster.bossRotation.revealedRounds}
                        max={selectedMonster.bossRotation.totalRounds}
                        color="xp" size="sm"
                        showNumbers={false}
                      />
                      <div className="mt-2 space-y-1">
                        {Array.from({ length: selectedMonster.bossRotation.totalRounds }, (_, i) => {
                          const action = selectedMonster.bossRotation!.actions.find(a => a.round === i + 1);
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-[var(--rpg-text-secondary)] w-8">R{i + 1}</span>
                              {action ? (
                                <>
                                  <span className={action.isTelegraphed ? 'text-[var(--rpg-red)] font-bold' : 'text-[var(--rpg-text)]'}>
                                    {action.actionName}
                                  </span>
                                  <span className="text-[var(--rpg-text-secondary)]">
                                    ({action.targetMode === 'aoe' ? 'AoE' : 'Single'})
                                  </span>
                                </>
                              ) : (
                                <span className="text-[var(--rpg-text-secondary)]">???</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Prefix Completion */}
                  {selectedMonster.killCount > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm mb-2">Prefix Variants</h4>
                      <PrefixPipRow encountered={selectedMonster.prefixesEncountered} />
                    </div>
                  )}

                  <PixelButton variant="secondary" className="w-full" onClick={() => setSelectedMonster(null)}>
                    Close
                  </PixelButton>
                </PixelCard>
              </div>
            </ModalOverlay>
          )}
        </>
      ) : (
        <PrefixEncyclopedia prefixSummary={prefixSummary} />
      )}
    </ScreenContainer>
  );
}
