'use client';

import { useState } from 'react';
import type { ExpeditionRoundLog, MobActionLogEntry } from '@pocketrealm/shared';
import { formatHitBreakdown } from '../../combat/combatLogEntryUtils';
import { RoundLogAttackRow } from './RoundLogAttackRow';
import { handleKeyActivate } from '@/lib/utils';
import { RoleAwareMobName } from './RoleAwareMobName';

function MobTargetRow({ target }: { target: MobActionLogEntry['targets'][number] }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = target.hitChance !== undefined || target.blocked || target.damageRoll !== undefined;
  const toggleExpanded = () => setExpanded((prev) => !prev);

  const hitText = !target.blocked ? formatHitBreakdown({
    hitChance: target.hitChance,
    hitRollValue: target.hitRollValue,
    attackerHitScore: target.mobHitScore,
    defenderAvoidScore: target.playerAvoidScore,
  }) : null;

  return (
    <div
      className={`text-[var(--rpg-text-secondary)] ${hasDetail ? 'cursor-pointer hover:bg-[var(--rpg-surface)]/50 rounded px-1 -mx-1' : ''}`}
      onClick={hasDetail ? toggleExpanded : undefined}
      onKeyDown={hasDetail ? handleKeyActivate(toggleExpanded) : undefined}
      role={hasDetail ? 'button' : undefined}
      tabIndex={hasDetail ? 0 : undefined}
    >
      <div className="flex items-center gap-0.5">
        <span>
          {target.username}: {target.blocked ? (
            <span className="text-[var(--rpg-blue-light)]">BLOCKED</span>
          ) : target.dodged ? (
            <span className="text-[var(--rpg-green-light)]">DODGED</span>
          ) : (
            <>
              <span className="text-[var(--rpg-red)]">-{target.damageTaken} HP</span>
              {target.knockedOut && <span className="text-[var(--rpg-red)] font-bold"> KO!</span>}
            </>
          )}
        </span>
        {hasDetail && (
          <span className="text-[var(--rpg-text-secondary)] ml-auto text-[10px]">{expanded ? '▲' : '▼'}</span>
        )}
      </div>
      {expanded && (
        <div className="ml-2 mt-0.5 text-[var(--rpg-text-secondary)] opacity-80 space-y-0.5">
          {target.blocked && <div>Blocked (hit check skipped)</div>}
          {hitText && <div>{hitText}</div>}
          {!target.blocked && !hitText && target.damageTaken > 0 && <div>Guaranteed Hit</div>}
          {target.damageTaken > 0 && target.damageRoll !== undefined && (
            <div>Damage: {target.damageRoll} raw = {target.damageTaken} final</div>
          )}
        </div>
      )}
    </div>
  );
}

export interface RoundLogContentProps {
  log: ExpeditionRoundLog;
  playerId: string | null;
}

export function RoundLogContent({ log, playerId }: RoundLogContentProps) {
  const outcome = log.phases.outcome;
  return (
    <div className="space-y-2">
      {/* Player Attacks */}
      {log.phases.playerAttacks.length > 0 && (
        <div>
          <p className="text-xs text-[var(--rpg-text-secondary)] font-bold mb-0.5">Attacks</p>
          {log.phases.playerAttacks.map((atk, j) => (
            <RoundLogAttackRow key={j} attack={atk} currentPlayerId={playerId} />
          ))}
        </div>
      )}

      {/* Defences */}
      {log.phases.defences?.length > 0 && (
        <div>
          <p className="text-xs text-[var(--rpg-text-secondary)] font-bold mb-0.5">Defences</p>
          {log.phases.defences.map((d, j) => (
            <div key={j} className="text-xs ml-2 text-[var(--rpg-blue-light)]">
              {d.username}: {d.actionLabel}
            </div>
          ))}
        </div>
      )}

      {/* Healing */}
      {log.phases.healing.length > 0 && (
        <div>
          <p className="text-xs text-[var(--rpg-text-secondary)] font-bold mb-0.5">Healing</p>
          {log.phases.healing.map((h, j) => (
            <div key={j} className="text-xs ml-2 text-[var(--rpg-green-light)]">
              {h.username}: {h.actionLabel} → {h.targetUsername} +{h.amountHealed} HP
            </div>
          ))}
        </div>
      )}

      {/* Mob Actions */}
      {log.phases.mobActions.length > 0 && (
        <div>
          <p className="text-xs text-[var(--rpg-text-secondary)] font-bold mb-0.5">Enemy Actions</p>
          {log.phases.mobActions.map((ma, j) => (
            <div
              key={j}
              className={`text-xs ml-2 mb-0.5 p-1 rounded ${
                ma.wasTelegraphed
                  ? 'border border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/5'
                  : ''
              }`}
            >
              <div className="flex items-center gap-1 flex-wrap">
                <RoleAwareMobName name={ma.mobName} className="text-[var(--rpg-red)] font-bold" />
                <span className="text-[var(--rpg-text-secondary)]">uses</span>
                <span className="text-[var(--rpg-text-primary)]">{ma.actionLabel}</span>
                {ma.wasTelegraphed && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
                    TELEGRAPHED
                  </span>
                )}
                {ma.targetMode === 'aoe' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]">
                    AOE
                  </span>
                )}
              </div>
              {ma.targets.length > 0 && (
                <div className="ml-2 mt-0.5">
                  {ma.targets.map((t, k) => (
                    <MobTargetRow key={k} target={t} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Effect Ticks (DoT damage) */}
      {log.phases.effectTicks?.length > 0 && (
        <div>
          <p className="text-xs text-[var(--rpg-text-secondary)] font-bold mb-0.5">Effect Ticks</p>
          {log.phases.effectTicks.map((tick, j) => (
            <div key={j} className="text-xs ml-2">
              <span className={tick.targetType === 'mob' ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-primary)]'}>
                {tick.targetType === 'mob'
                  ? <RoleAwareMobName name={tick.targetName} />
                  : tick.targetName}
              </span>
              <span className="text-[var(--rpg-text-secondary)]"> takes </span>
              <span className="text-[var(--rpg-red)]">-{tick.damage} HP</span>
              <span className="text-[var(--rpg-text-secondary)]"> from {tick.effectName}</span>
              <span className="text-[var(--rpg-text-secondary)] opacity-60"> ({tick.hpAfter} HP)</span>
            </div>
          ))}
        </div>
      )}

      {/* Telegraphs */}
      {log.telegraphs.length > 0 && (
        <div className="border border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/5 rounded p-1.5">
          <p className="text-xs text-[var(--rpg-gold)] font-bold mb-0.5">Next Round Warning</p>
          {log.telegraphs.map((t, j) => (
            <div key={j} className="text-xs text-[var(--rpg-gold)]">
              {t.warningText}
            </div>
          ))}
        </div>
      )}

      {/* Outcome */}
      <div className="text-xs text-[var(--rpg-text-secondary)] border-t border-[var(--rpg-border)] pt-1">
        Mobs: {outcome.mobsAlive} alive, {outcome.mobsKilled} killed
        {' | '}
        Players: {outcome.playersAlive} alive{outcome.playersKnockedOut > 0 && `, ${outcome.playersKnockedOut} KO`}
      </div>
    </div>
  );
}
