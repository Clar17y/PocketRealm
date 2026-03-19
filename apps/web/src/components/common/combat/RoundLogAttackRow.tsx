import { useState } from 'react';
import type {
  ExhaustedActionEntry,
  ExhaustedActionReason,
  PlayerAttackEntry,
  PlayerRoundActionEntry,
} from '@pocketrealm/shared';
import { formatHitBreakdown } from '../../combat/combatLogEntryUtils';

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

  return (
    <div className="ml-2 mt-0.5 text-[var(--rpg-text-secondary)] opacity-80 space-y-0.5">
      {hitText && <div>{hitText}</div>}
      {attack.hit && attack.totalDamage !== undefined && (
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
  const outcomeNode = !attack.hit ? (
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
            <span className="text-[var(--rpg-text-primary)]">{attack.targetMobName}</span>
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
