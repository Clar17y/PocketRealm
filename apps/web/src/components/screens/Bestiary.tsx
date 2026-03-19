'use client';

import { useMemo, useState } from 'react';
import { BookOpen, MapPin, Sword, Shield, Heart, Lock } from 'lucide-react';
import Image from 'next/image';
import { monsterImageSrc, uiIconSrc } from '@/lib/assets';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';
import { getMobPrefixDefinition, getTierName, BESTIARY_UNLOCK_CONSTANTS } from '@pocketrealm/shared';
import type { ExpeditionBestiaryTheme, WorldBossEntry } from '@/app/game/hooks/useBestiary';
import { StatBar } from '@/components/StatBar';
import { FeatureTutorial } from '@/components/common/FeatureTutorial';
import { CollapsibleLoreSection } from '../common/CollapsibleLoreSection';
import { ScreenContainer } from '../common/ScreenContainer';
import { BestiaryModalShell, RotationDisplay, MonsterStatBlock } from '../common/bestiary';

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
  flavorAppearance?: string | null;
  flavorBehavior?: string | null;
  flavorLore?: string | null;
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
  expeditionThemes: ExpeditionBestiaryTheme[];
  worldBosses: WorldBossEntry[];
  showBestiaryLore?: boolean;
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
      <span className={`text-[8px] font-pixel ${mastered ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)]'}`}>
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

const ROLE_LABELS: Record<string, string> = {
  trash: 'Trash',
  elite: 'Elite',
  caster: 'Caster',
  add: 'Add',
  mini_boss: 'Mini-Boss',
  final_boss: 'Final Boss',
};

const ROLE_COLORS: Record<string, string> = {
  trash: 'text-[var(--rpg-text-secondary)]',
  elite: 'text-[var(--rpg-blue-light)]',
  caster: 'text-[var(--rpg-purple)]',
  add: 'text-[var(--rpg-text-secondary)]',
  mini_boss: 'text-[var(--rpg-purple)]',
  final_boss: 'text-[var(--rpg-gold)]',
};

function ExpeditionBestiaryTab({ themes }: { themes: ExpeditionBestiaryTheme[] }) {
  const [selectedMob, setSelectedMob] = useState<ExpeditionBestiaryTheme['mobs'][number] | null>(null);

  const attemptedThemes = themes.filter(t => t.attempted);
  const unattemptedThemes = themes.filter(t => !t.attempted);

  return (
    <div className="space-y-4">
      {attemptedThemes.map(theme => {
        const discovered = theme.mobs.filter(m => m.killCount > 0).length;
        return (
          <div key={theme.theme}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[var(--rpg-text-primary)]">{theme.themeName}</h3>
              <span className="text-xs text-[var(--rpg-text-secondary)]">{discovered}/{theme.mobs.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {theme.mobs.map(mob => {
                const isDiscovered = mob.killCount > 0;
                return (
                  <button
                    key={mob.mobTemplateId}
                    onClick={() => isDiscovered && setSelectedMob(mob)}
                    disabled={!isDiscovered}
                    className="aspect-square"
                  >
                    <div className={`w-full h-full rounded-lg border-2 flex flex-col items-center justify-center p-1 ${
                      isDiscovered
                        ? 'bg-[var(--rpg-surface)] border-[var(--rpg-border)] hover:border-[var(--rpg-gold)]'
                        : 'bg-[var(--rpg-background)] border-[var(--rpg-border)] border-dashed'
                    }`}>
                      {isDiscovered ? (
                        <>
                          <Image
                            src={monsterImageSrc(mob.name)}
                            alt={mob.name}
                            width={40}
                            height={40}
                            className="image-rendering-pixelated mb-0.5"
                          />
                          <span className="text-[9px] text-[var(--rpg-text-secondary)] text-center leading-tight line-clamp-1">{mob.name}</span>
                          <span className={`text-[8px] ${ROLE_COLORS[mob.role]}`}>{ROLE_LABELS[mob.role]}</span>
                          <span className="text-[8px] text-[var(--rpg-gold)] font-pixel">x{mob.killCount}</span>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 bg-[var(--rpg-surface)] rounded-lg mb-0.5 flex items-center justify-center">
                            <span className="text-xs text-[var(--rpg-text-secondary)]">???</span>
                          </div>
                          <span className={`text-[8px] ${ROLE_COLORS[mob.role]}`}>{ROLE_LABELS[mob.role]}</span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {unattemptedThemes.length > 0 && (
        <div className="opacity-40">
          <h3 className="text-xs font-bold text-[var(--rpg-text-secondary)] mb-2 uppercase">Undiscovered Themes</h3>
          {unattemptedThemes.map(theme => (
            <div key={theme.theme} className="rounded-lg border-2 border-dashed border-[var(--rpg-border)] p-3 mb-2">
              <span className="text-sm text-[var(--rpg-text-secondary)]">{theme.themeName}</span>
              <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">({theme.mobs.length} mobs)</span>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedMob && (
        <BestiaryModalShell
          imageSlot={
            <Image
              src={monsterImageSrc(selectedMob.name)}
              alt={selectedMob.name}
              width={56}
              height={56}
              className="image-rendering-pixelated"
            />
          }
          headerInfo={
            <>
              <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">{selectedMob.name}</h3>
              <span className={`text-xs ${ROLE_COLORS[selectedMob.role]}`}>{ROLE_LABELS[selectedMob.role]}</span>
              <div className="text-xs text-[var(--rpg-gold)] mt-1 font-pixel">x{selectedMob.killCount} defeated</div>
            </>
          }
          onClose={() => setSelectedMob(null)}
        >
          {selectedMob.stats ? (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-[var(--rpg-text-primary)] mb-1">Stats</h4>
              <MonsterStatBlock
                stats={[
                  { icon: <Heart size={14} color="var(--rpg-green-light)" />, label: 'HP', value: selectedMob.stats.hp, valueColor: 'text-[var(--rpg-green-light)]' },
                  { icon: <Sword size={14} color="var(--rpg-red)" />, label: 'ATK', value: selectedMob.stats.attack, valueColor: 'text-[var(--rpg-red)]' },
                  { icon: <Shield size={14} color="var(--rpg-blue-light)" />, label: 'DEF', value: selectedMob.stats.defence, valueColor: 'text-[var(--rpg-blue-light)]' },
                ]}
              />
            </div>
          ) : (
            <div className="mb-3 text-xs text-[var(--rpg-text-secondary)]">Defeat {3 - selectedMob.killCount} more to reveal stats.</div>
          )}

          {selectedMob.rotation ? (
            <RotationDisplay rotation={selectedMob.rotation} />
          ) : selectedMob.stats ? (
            <div className="mb-3 text-xs text-[var(--rpg-text-secondary)]">Defeat {5 - selectedMob.killCount} more to reveal rotation.</div>
          ) : null}
        </BestiaryModalShell>
      )}
    </div>
  );
}

function WorldBossBestiaryTab({ bosses }: { bosses: WorldBossEntry[] }) {
  const [selectedBoss, setSelectedBoss] = useState<WorldBossEntry | null>(null);

  const encountered = bosses.filter(b => b.defeatCount > 0);
  const unencountered = bosses.filter(b => b.defeatCount === 0);

  return (
    <div className="space-y-3">
      {encountered.map(boss => (
        <button
          key={boss.bossTemplateId}
          onClick={() => setSelectedBoss(boss)}
          className="w-full rounded-lg border-2 bg-[var(--rpg-surface)] border-[var(--rpg-border)] hover:border-[var(--rpg-gold)] p-3 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <Image
              src={monsterImageSrc(boss.name)}
              alt={boss.name}
              width={48}
              height={48}
              className="image-rendering-pixelated"
            />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-[var(--rpg-text-primary)]">{boss.name}</h3>
              <div className="text-xs text-[var(--rpg-gold)] font-pixel">x{boss.defeatCount} defeated</div>
              {boss.hpPerParticipant !== null && (
                <div className="text-xs text-[var(--rpg-text-secondary)]">{boss.hpPerParticipant} HP / participant</div>
              )}
            </div>
            <div className="text-right">
              <StatBar current={Math.min(boss.defeatCount, 5)} max={5} color="xp" size="sm" showNumbers={false} />
              <span className="text-[8px] text-[var(--rpg-text-secondary)]">{Math.min(boss.defeatCount, 5)}/5</span>
            </div>
          </div>
        </button>
      ))}

      {unencountered.map(boss => (
        <div
          key={boss.bossTemplateId}
          className="rounded-lg border-2 border-dashed border-[var(--rpg-border)] p-3 opacity-40"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[var(--rpg-surface)] rounded-lg flex items-center justify-center">
              <span className="text-lg text-[var(--rpg-text-secondary)]">???</span>
            </div>
            <span className="text-sm text-[var(--rpg-text-secondary)]">{boss.name}</span>
          </div>
        </div>
      ))}

      {bosses.length === 0 && (
        <div className="text-center text-sm text-[var(--rpg-text-secondary)] py-8">
          No world bosses available yet.
        </div>
      )}

      {/* Boss Detail Modal */}
      {selectedBoss && (
        <BestiaryModalShell
          imageSlot={
            <Image
              src={monsterImageSrc(selectedBoss.name)}
              alt={selectedBoss.name}
              width={56}
              height={56}
              className="image-rendering-pixelated"
            />
          }
          headerInfo={
            <>
              <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">{selectedBoss.name}</h3>
              <div className="text-xs text-[var(--rpg-gold)] font-pixel">x{selectedBoss.defeatCount} defeated</div>
            </>
          }
          onClose={() => setSelectedBoss(null)}
        >
          {selectedBoss.hpPerParticipant !== null && (
            <div className="mb-2 text-xs text-[var(--rpg-text-secondary)]">{selectedBoss.hpPerParticipant} HP / participant</div>
          )}

          {selectedBoss.stats ? (
            <div className="mb-3">
              <h4 className="text-sm font-semibold text-[var(--rpg-text-primary)] mb-1">Stats</h4>
              <MonsterStatBlock
                stats={[
                  { icon: <Sword size={14} color="var(--rpg-red)" />, label: 'ACC', value: selectedBoss.stats.accuracy, valueColor: 'text-[var(--rpg-red)]' },
                  { icon: <Shield size={14} color="var(--rpg-blue-light)" />, label: 'DEF', value: selectedBoss.stats.defence, valueColor: 'text-[var(--rpg-blue-light)]' },
                ]}
              />
            </div>
          ) : (
            <div className="mb-3 text-xs text-[var(--rpg-text-secondary)]">Defeat {3 - selectedBoss.defeatCount} more to reveal stats.</div>
          )}

          {selectedBoss.rotation ? (
            <RotationDisplay rotation={selectedBoss.rotation} />
          ) : selectedBoss.stats ? (
            <div className="mb-3 text-xs text-[var(--rpg-text-secondary)]">Defeat {5 - selectedBoss.defeatCount} more to reveal rotation.</div>
          ) : null}
        </BestiaryModalShell>
      )}
    </div>
  );
}

export function Bestiary({ monsters, prefixSummary, expeditionThemes, worldBosses, showBestiaryLore = true }: BestiaryProps) {
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [activeView, setActiveView] = useState<'monsters' | 'expeditions' | 'bosses' | 'prefixes'>('monsters');
  const sortedMonsters = useMemo(
    () => [...monsters].sort((a, b) => Number(b.isDiscovered) - Number(a.isDiscovered)),
    [monsters],
  );

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
      <FeatureTutorial storageKey="howto_bestiary" title="Bestiary">
        <p>
          The Bestiary tracks every monster you&apos;ve encountered. Discover new mobs by
          exploring different zones and tiers.
        </p>
        <p>
          Each entry shows the mob&apos;s stats, drops, and which zones it appears in.
          <strong> Prefixes</strong> are variant modifiers that make mobs stronger with
          unique abilities.
        </p>
        <p className="text-[var(--rpg-green-light)]">
          <strong>Tip:</strong> Fight boss encounters to progressively reveal their attack
          rotation in the Bestiary.
        </p>
      </FeatureTutorial>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Bestiary</h2>
          <BookOpen size={20} color="var(--rpg-gold)" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['monsters', 'expeditions', 'bosses', 'prefixes'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                activeView === view
                  ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-bold'
                  : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
              }`}
            >
              {view === 'monsters' ? `Monsters ${discoveredCount}/${totalCount}`
                : view === 'expeditions' ? 'Expeditions'
                : view === 'bosses' ? 'World Bosses'
                : 'Prefixes'}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'expeditions' ? (
        <ExpeditionBestiaryTab themes={expeditionThemes} />
      ) : activeView === 'bosses' ? (
        <WorldBossBestiaryTab bosses={worldBosses} />
      ) : activeView === 'monsters' ? (
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
                        <span className="text-[8px] text-[var(--rpg-gold)] font-pixel mt-1">x{monster.killCount}</span>
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
            <BestiaryModalShell
              imageSlot={
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
              }
              headerInfo={
                <>
                  <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">{selectedMonster.name}</h3>
                  <div className="text-xs text-[var(--rpg-text-secondary)]">Level <span className="font-pixel text-[8px]">{selectedMonster.level}</span></div>
                  <div className="text-xs text-[var(--rpg-gold)] mt-1">Defeated <span className="font-pixel text-[8px]">{selectedMonster.killCount}</span> times</div>
                  {selectedMonster.explorationTier && (
                    <span className="inline-flex items-center gap-1 text-xs bg-[var(--rpg-background)] px-2 py-0.5 rounded mt-1">
                      {getTierName(selectedMonster.explorationTier)}
                    </span>
                  )}
                </>
              }
              headerGap="mb-4"
              onClose={() => setSelectedMonster(null)}
            >
              {/* Progressive flavour text reveal */}
              {showBestiaryLore ? (
                <div className="space-y-3 mb-4">
                  <CollapsibleLoreSection title="Appearance" storageKey={`bestiary-appearance:${selectedMonster.id}`}>
                    <p className="text-sm text-[var(--rpg-text-secondary)]">
                      {selectedMonster.flavorAppearance ?? (
                        <span className="opacity-50 flex items-center gap-1">
                          <Lock size={12} />
                          ??? (Defeat {BESTIARY_UNLOCK_CONSTANTS.FLAVOR_APPEARANCE_THRESHOLD}+)
                        </span>
                      )}
                    </p>
                  </CollapsibleLoreSection>
                  <CollapsibleLoreSection title="Behaviour" storageKey={`bestiary-behaviour:${selectedMonster.id}`}>
                    <p className="text-sm text-[var(--rpg-text-secondary)]">
                      {selectedMonster.flavorBehavior ?? (
                        <span className="opacity-50 flex items-center gap-1">
                          <Lock size={12} />
                          ??? (Defeat {BESTIARY_UNLOCK_CONSTANTS.FLAVOR_BEHAVIOR_THRESHOLD}+)
                        </span>
                      )}
                    </p>
                  </CollapsibleLoreSection>
                  <CollapsibleLoreSection title="Lore" storageKey={`bestiary-lore:${selectedMonster.id}`}>
                    <p className="text-sm text-[var(--rpg-text-secondary)]">
                      {selectedMonster.flavorLore ?? (
                        <span className="opacity-50 flex items-center gap-1">
                          <Lock size={12} />
                          ??? (Defeat {BESTIARY_UNLOCK_CONSTANTS.FLAVOR_LORE_THRESHOLD}+)
                        </span>
                      )}
                    </p>
                  </CollapsibleLoreSection>
                </div>
              ) : (
                <p className="text-sm text-[var(--rpg-text-secondary)] mb-4">{selectedMonster.description}</p>
              )}

              {/* Stats */}
              <div className="mb-4">
                <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm mb-2">
                  Stats{' '}
                  {selectedMonster.killCount < 10 && (
                    <span className="text-xs text-[var(--rpg-text-secondary)]">(Partial)</span>
                  )}
                </h4>
                <MonsterStatBlock
                  size="base"
                  stats={[
                    {
                      icon: <Heart size={16} color="var(--rpg-green-light)" />,
                      hiddenIcon: <Heart size={16} color="var(--rpg-text-secondary)" />,
                      label: 'HP',
                      value: selectedMonster.stats.hp,
                      valueColor: 'text-[var(--rpg-green-light)]',
                      hidden: !getStatsVisibility(selectedMonster.killCount).showHP,
                    },
                    {
                      icon: <Sword size={16} color="var(--rpg-red)" />,
                      hiddenIcon: <Sword size={16} color="var(--rpg-text-secondary)" />,
                      label: 'Accuracy',
                      value: selectedMonster.stats.accuracy,
                      valueColor: 'text-[var(--rpg-red)]',
                      hidden: !getStatsVisibility(selectedMonster.killCount).showAccuracy,
                      hiddenHint: '(Defeat 5+ times)',
                    },
                    {
                      icon: <Shield size={16} color="var(--rpg-blue-light)" />,
                      hiddenIcon: <Shield size={16} color="var(--rpg-text-secondary)" />,
                      label: 'Defence',
                      value: selectedMonster.stats.defence,
                      valueColor: 'text-[var(--rpg-blue-light)]',
                      hidden: !getStatsVisibility(selectedMonster.killCount).showDefence,
                      hiddenHint: '(Defeat 10+ times)',
                    },
                  ]}
                />
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

              {/* Boss Rotation — kept inline due to unique totalRounds/revealed pattern */}
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
            </BestiaryModalShell>
          )}
        </>
      ) : (
        <PrefixEncyclopedia prefixSummary={prefixSummary} />
      )}
    </ScreenContainer>
  );
}
