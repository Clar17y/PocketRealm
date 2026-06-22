import { useState } from 'react';
import type {
  ExhaustedActionEntry,
  ExhaustedActionReason,
  PlayerAttackEntry,
  PlayerRoundActionEntry,
} from '@pocketrealm/shared';
import { formatHitBreakdown } from '../../combat/combatLogEntryUtils';
import { RoleAwareMobName } from './RoleAwareMobName';

function isExhaustedActionEntry(action: PlayerRoundActionEntry): action is ExhaustedActionEntry {
  return action.entryType === 'exhausted';
}

function exhaustedReasonLabel(reason: ExhaustedActionReason): string {
  switch (reason) {
    case 'stamina':
      return 'stamina';
    case 'mana':
      return 'mana';
    case 'stamina_and_mana':
      return 'stamina + mana';
    case 'invalid_action':
      return 'invalid action';
    default:
      return reason;
  }
}

function AttackDetail({ attack }: { attack: PlayerAttackEntry }) {
  const hitText = formatHitBreakdown({
    hitChance: attack.hitChance,
    hitRollValue: attack.hitRollValue,
    attackerHitScore: attack.attackerHitScore,
    defenderAvoidScore: attack.defenderAvoidScore,
  });
  const cascade = attack.splashCascade;
  const cascadeHit = cascade?.find(c => c.hit);

  return (
    <div className="ml-2 mt-0.5 text-[var(--rpg-text-secondary)] opacity-80 space-y-0.5">
      {hitText && <div>{hitText}</div>}
      {cascade && cascade.length > 0 && (
        <div className="space-y-0.5">
          {cascade.map((c, i) => {
            const cascadeHitText = formatHitBreakdown({
              hitChance: c.hitChance,
              hitRollValue: c.hitRollValue,
              attackerHitScore: c.attackerHitScore,
              defenderAvoidScore: c.defenderAvoidScore,
            });
            return (
              <div key={i} className="ml-1 border-l border-[var(--rpg-border)] pl-1.5">
                <div>
                  Splash {i + 1} {'>'} <RoleAwareMobName name={c.targetMobName} /> |{' '}
                  {c.hit ? (
                    <>
                      <span className={c.crit ? 'text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-green-light)]'}>
                        {c.crit ? 'CRIT' : 'HIT'}
                      </span>
                      {c.totalDamage !== undefined && <span className="text-[var(--rpg-red)]"> {c.totalDamage} dmg</span>}
                    </>
                  ) : (
                    <span className="text-[var(--rpg-text-secondary)]">MISS</span>
                  )}
                </div>
                {cascadeHitText && <div className="ml-2">{cascadeHitText}</div>}
                {c.hit && c.totalDamage !== undefined && c.damageRoll !== undefined && (
                  <div className="ml-2">
                    Damage: {c.damageRoll} raw{c.crit && ' \u00d7 1.5 crit'} = {c.totalDamage} final
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!cascade && attack.hit && attack.totalDamage !== undefined && (
        <div>
          Damage: {attack.damageRoll ?? attack.totalDamage} raw
          {attack.crit && ' \u00d7 1.5 crit'}
          {' = '}{attack.totalDamage} final
        </div>
      )}
      {(attack.staminaCost > 0 || attack.manaCost > 0) && (
        <div>
          {attack.staminaCost > 0 && <span className="text-teal-400">-{attack.staminaCost} STA</span>}
          {attack.staminaCost > 0 && attack.manaCost > 0 && ' / '}
          {attack.manaCost > 0 && <span className="text-[var(--rpg-blue-light)]">-{attack.manaCost} MP</span>}
        </div>
      )}
    </div>
  );
}

export function RoundLogAttackRow({
  attack,
  currentPlayerId,
}: {
  attack: PlayerRoundActionEntry;
  currentPlayerId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (isExhaustedActionEntry(attack)) {
    return (
      <div className="text-xs ml-2 text-[var(--rpg-text-secondary)]">
        <span className="text-[var(--rpg-text-primary)]">{attack.username}</span>
        {': '}
        {attack.intendedActionLabel}
        {' \u2192 '}
        {attack.fallbackActionLabel}
        {' '}
        <span className="text-[var(--rpg-gold)]">(Exhausted: {exhaustedReasonLabel(attack.reason)})</span>
      </div>
    );
  }

  if (attack.entryType === 'defensive') {
    const isMe = attack.playerId === currentPlayerId;
    return (
      <div className={`text-xs ml-2 ${isMe ? 'mb-0.5 p-1 rounded bg-[var(--rpg-surface)]' : 'text-[var(--rpg-text-secondary)]'}`}>
        <span className={isMe ? 'text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-text-primary)]'}>{attack.username}</span>
        {': '}
        {attack.actionLabel}
      </div>
    );
  }

  const isMe = attack.playerId === currentPlayerId;
  const hasCascade = attack.splashCascade && attack.splashCascade.length > 0;
  const cascadeHit = attack.splashCascade?.find(c => c.hit);

  const outcomeNode = hasCascade ? (
    // Cascade: original target was missed, show cascade result
    cascadeHit ? (
      <>
        <span className="text-[var(--rpg-text-secondary)]">MISS</span>
        <span className="text-[var(--rpg-text-secondary)]"> {'>'} </span>
        <span className={cascadeHit.crit ? 'text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-green-light)]'}>
          <RoleAwareMobName name={cascadeHit.targetMobName} />
        </span>
        {cascadeHit.totalDamage !== undefined && (
          <span className="text-[var(--rpg-red)]"> {cascadeHit.totalDamage} dmg</span>
        )}
        <span className="text-[var(--rpg-text-secondary)] text-[9px]"> (splash)</span>
      </>
    ) : (
      <span className="text-[var(--rpg-text-secondary)]">MISS</span>
    )
  ) : !attack.hit ? (
    <span className="text-[var(--rpg-text-secondary)]">MISS</span>
  ) : (
    <>
      <span className={attack.crit ? 'text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-green-light)]'}>
        {attack.crit ? 'CRIT' : 'HIT'}
      </span>
      {attack.totalDamage !== undefined && (
        <span className="text-[var(--rpg-red)]"> {attack.totalDamage} dmg</span>
      )}
    </>
  );

  return (
    <div
      className={`text-xs ml-2 cursor-pointer rounded ${
        isMe
          ? 'mb-0.5 p-1 bg-[var(--rpg-surface)]'
          : 'text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-surface)]/50 px-1 -mx-1'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-0.5 flex-wrap">
        <span className={isMe ? 'text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-text-primary)]'}>
          {isMe ? 'You' : attack.username}
        </span>
        {': '}
        <span className={isMe ? 'text-[var(--rpg-gold)]' : ''}>{attack.actionLabel}</span>
        {attack.targetMobName && (
          <>
            {' \u2192 '}
            <RoleAwareMobName name={attack.targetMobName} className="text-[var(--rpg-text-primary)]" />
          </>
        )}
        {' | '}
        {outcomeNode}
        <span className="text-[var(--rpg-text-secondary)] ml-auto text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>
      {expanded && <AttackDetail attack={attack} />}
    </div>
  );
}
