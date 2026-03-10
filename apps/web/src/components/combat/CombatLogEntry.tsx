'use client';

import { useState } from 'react';
import type { LastCombatLogEntry } from '@/app/game/gameController.types';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared';
import { ACTION_CATEGORY_COLORS } from '@/lib/categoryColors';
import { formatHitBreakdown } from './combatLogEntryUtils';

function isMagicDamage(entry: LastCombatLogEntry): boolean {
  return entry.targetMagicDefence !== undefined || entry.magicDefenceReduction !== undefined || entry.action === 'spell';
}

function getActionIcon(entry: LastCombatLogEntry): string {
  if (entry.action === 'potion') return '🧪';
  if (entry.effectsExpired && entry.effectsExpired.length > 0) return '✨';
  if (entry.evaded) return '💨';
  if (entry.isCritical) return '💥';
  if (entry.healAmount && entry.healAmount > 0 && !entry.damage) return '💚';
  if (entry.effectsApplied && entry.effectsApplied.length > 0 && !entry.damage) return '🔮';
  if (entry.damage && entry.damage > 0) return isMagicDamage(entry) ? '✨' : '⚔️';
  if (entry.action === 'spell') return '🔮';
  if (entry.roll && !entry.damage) return '❌';
  return '';
}

function formatHp(hp: number | undefined, maxHp?: number): string {
  if (hp === undefined) return '';
  if (maxHp !== undefined) return `${hp}/${maxHp}`;
  return `${hp}`;
}

function getActionCategoryColor(entry: LastCombatLogEntry): string {
  // Look up in BASE_ACTION_DEFINITIONS first
  if (entry.actionId && BASE_ACTION_DEFINITIONS[entry.actionId]) {
    const category = BASE_ACTION_DEFINITIONS[entry.actionId].category;
    return `text-[${ACTION_CATEGORY_COLORS[category]}]`;
  }
  // Infer from action field
  const action = entry.action;
  if (action === 'defend' || action === 'counter' || action === 'ward') return `text-[${ACTION_CATEGORY_COLORS.defensive}]`;
  if (action === 'potion' || action === 'heal') return `text-[${ACTION_CATEGORY_COLORS.supportive}]`;
  return `text-[${ACTION_CATEGORY_COLORS.offensive}]`;
}

interface CombatLogEntryProps {
  entry: LastCombatLogEntry;
  playerMaxHp?: number;
  mobMaxHp?: number;
  showDetailedBreakdown?: boolean;
  playerLabel?: string;
  opponentLabel?: string;
}

export function CombatLogEntry({
  entry,
  playerMaxHp,
  mobMaxHp,
  showDetailedBreakdown = true,
  playerLabel = 'You',
  opponentLabel = 'Mob',
}: CombatLogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const icon = getActionIcon(entry);
  const hasDetails = entry.accuracyModifier !== undefined || entry.rawDamage !== undefined || entry.spellName !== undefined;
  const hitBreakdown = formatHitBreakdown(entry);

  const isPlayerAction = entry.actor === 'combatantA';
  const actorColor = isPlayerAction ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]';

  return (
    <div
      className={`${hasDetails ? 'cursor-pointer' : ''}`}
      onClick={hasDetails ? () => setExpanded((p) => !p) : undefined}
    >
      {/* Collapsed view */}
      <div className="flex items-center gap-2 text-sm py-0.5">
        {entry.round === 0 ? (
          <>
            <span className="text-[var(--rpg-gold)] font-pixel text-[12px] w-7 shrink-0">Init</span>
            <span className="text-[var(--rpg-text-primary)] text-xs">
              {isPlayerAction ? `${playerLabel} go${playerLabel === 'You' ? '' : 'es'} first` : `${opponentLabel} goes first`}
            </span>
          </>
        ) : (
          <>{entry.effectsExpired && entry.effectsExpired.length > 0 ? (
            <>
              <span className="text-[var(--rpg-gold)] font-pixel text-[12px] w-7 shrink-0">R{entry.round}</span>
              <span className="shrink-0 text-xs">✨</span>
              <span className="text-[var(--rpg-text-secondary)] text-xs italic">
                {entry.effectsExpired.map(e => `${e.name} wore off`).join(', ')}
              </span>
            </>
          ) : (
            <>
              <span className="text-[var(--rpg-gold)] font-pixel text-[12px] w-7 shrink-0">R{entry.round}</span>
              <span className={`shrink-0 font-almendra ${actorColor}`}>{isPlayerAction ? playerLabel : opponentLabel}</span>
              {icon && <span className="shrink-0 text-xs">{icon}</span>}
              {entry.actionName ? (
                <span className={`text-xs font-semibold font-almendra ${getActionCategoryColor(entry)}`}>{entry.actionName}</span>
              ) : entry.spellName ? (
                <span className="text-[var(--rpg-blue-light)] text-xs font-semibold font-almendra">{entry.spellName}</span>
              ) : null}
              {entry.damage !== undefined && entry.damage > 0 && (
                <span className={`font-pixel text-[12px] ${entry.isCritical ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-red)]'}`}>{entry.damage} dmg</span>
              )}
              {entry.healAmount !== undefined && entry.healAmount > 0 && (
                <span className={`font-pixel text-[12px] ${entry.healResourceType === 'stamina' ? 'text-teal-400' : entry.healResourceType === 'mana' ? 'text-[var(--rpg-blue-light)]' : 'text-[var(--rpg-green-light)]'}`}>
                  +{entry.healAmount} {entry.healResourceType === 'stamina' ? 'STA' : entry.healResourceType === 'mana' ? 'MP' : 'HP'}
                </span>
              )}
              {entry.effectsApplied && entry.effectsApplied.length > 0 && !entry.damage && !entry.healAmount && (
                <span className="text-[var(--rpg-blue-light)] text-xs">
                  {entry.effectsApplied.map(e =>
                    `${e.stat} ${e.modifier > 0 ? '+' : ''}${e.modifier}`
                  ).join(', ')}
                  {` (${entry.effectsApplied[0].duration} rds)`}
                </span>
              )}
              {entry.interactionResult === 'countered' && (
                <span className="text-[var(--rpg-gold)] text-xs font-bold">Countered!</span>
              )}
              {entry.interactionResult === 'warded' && (
                <span className="text-purple-400 text-xs font-bold">Warded!</span>
              )}
              {entry.wasExhausted && (
                <span className="text-[var(--rpg-text-secondary)] text-xs italic">(Exhausted &rarr; Defend)</span>
              )}
              {entry.evaded && <span className="text-[var(--rpg-blue-light)] text-xs">Dodged</span>}
              {entry.roll !== undefined && !entry.damage && !entry.evaded && !entry.effectsApplied && !entry.healAmount && (
                <span className="text-[var(--rpg-text-secondary)] text-xs">Miss</span>
              )}
            </>
          )}</>
        )}
        <span className="ml-auto flex gap-2 text-[8px] font-pixel text-[var(--rpg-text-secondary)]">
          {entry.combatantAHpAfter !== undefined && (
            <span className="text-[var(--rpg-green-light)]">{formatHp(entry.combatantAHpAfter, playerMaxHp)}</span>
          )}
          {entry.combatantBHpAfter !== undefined && (
            <span className="text-[var(--rpg-red)]">{formatHp(entry.combatantBHpAfter, mobMaxHp)}</span>
          )}
        </span>
        {hasDetails && (
          <span className="text-[var(--rpg-text-secondary)] text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="pl-9 pb-1 text-xs text-[var(--rpg-text-secondary)] space-y-0.5">
          {hitBreakdown && <div>{hitBreakdown}</div>}
          {entry.rawDamage !== undefined && entry.damage !== undefined && (
            <div>
              {(() => {
                const critMultiplier = entry.isCritical ? (entry.critMultiplier ?? 1.5) : 1;
                const preMitigation = Math.floor(entry.rawDamage * critMultiplier);
                const mitigated = Math.max(0, preMitigation - entry.damage);

                const isMagic = isMagicDamage(entry);
                const defLabel = isMagic ? 'magic def' : 'defence';
                let mitigationLabel = '';
                if (entry.targetDefence !== undefined || entry.targetMagicDefence !== undefined) {
                  mitigationLabel = showDetailedBreakdown
                    ? mitigated > 0
                      ? ` (-${mitigated} ${defLabel})`
                      : ` (${defLabel})`
                    : ` (${defLabel})`;
                }

                return (
                  <>
                    Damage: {entry.rawDamage} raw
                    {entry.isCritical && ` × ${critMultiplier} crit`}
                    {' = '}{preMitigation} pre-mitigation
                    {' → '}{entry.damage} final
                    {mitigationLabel}
                  </>
                );
              })()}
            </div>
          )}
          {entry.spellName && !hitBreakdown && entry.rawDamage === undefined && (
            <div>Spell: {entry.spellName}</div>
          )}
          {entry.effectsApplied && entry.effectsApplied.length > 0 && (
            <div>
              {entry.effectsApplied.map((e, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {e.target === 'combatantA' ? playerLabel : opponentLabel}: {e.stat} {e.modifier > 0 ? '+' : ''}{e.modifier} ({e.duration} rds)
                </span>
              ))}
            </div>
          )}
          {entry.healAmount !== undefined && entry.healAmount > 0 && (
            <div>Restores {entry.healAmount} {entry.healResourceType === 'stamina' ? 'Stamina' : entry.healResourceType === 'mana' ? 'Mana' : 'HP'}</div>
          )}
          {(entry.staminaCost !== undefined || entry.manaCost !== undefined) && (
            <div>
              {entry.staminaCost !== undefined && entry.staminaCost > 0 && (
                <span className="text-teal-400">-{entry.staminaCost} STA</span>
              )}
              {entry.staminaCost !== undefined && entry.staminaCost > 0 && entry.manaCost !== undefined && entry.manaCost > 0 && ' / '}
              {entry.manaCost !== undefined && entry.manaCost > 0 && (
                <span className="text-[var(--rpg-blue-light)]">-{entry.manaCost} MP</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
