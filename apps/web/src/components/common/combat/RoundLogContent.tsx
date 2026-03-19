'use client';

import type { ExpeditionRoundLog } from '@pocketrealm/shared';
import { RoundLogAttackRow } from './RoundLogAttackRow';

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
                <span className="text-[var(--rpg-red)] font-bold">{ma.mobName}</span>
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
                    <div key={k} className="text-[var(--rpg-text-secondary)]">
                      {t.username}: {t.blocked ? (
                        <span className="text-[var(--rpg-blue-light)]">BLOCKED</span>
                      ) : t.dodged ? (
                        <span className="text-[var(--rpg-green-light)]">DODGED</span>
                      ) : (
                        <>
                          <span className="text-[var(--rpg-red)]">-{t.damageTaken} HP</span>
                          {t.knockedOut && <span className="text-[var(--rpg-red)] font-bold"> KO!</span>}
                        </>
                      )}
                    </div>
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
                {tick.targetName}
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
