import { useState } from 'react';
import type {
  ExhaustedActionEntry,
  ExhaustedActionReason,
  PlayerAttackEntry,
  PlayerRoundActionEntry,
} from '@pocketrealm/shared';

interface FormattedRoundLogAttackRow {
  isCurrentPlayer: boolean;
  actorNameText: string | null;
  actionText: string;
  targetText: string | null;
  rollText: string | null;
  outcomeText: 'CRIT' | 'HIT' | 'MISS';
  damageText: string | null;
}

function formatRoundLogAttackRow(
  attack: PlayerAttackEntry,
  currentPlayerId: string | null,
): FormattedRoundLogAttackRow {
  return {
    isCurrentPlayer: attack.playerId === currentPlayerId,
    actorNameText: attack.playerId === currentPlayerId ? null : attack.username,
    actionText: attack.actionLabel,
    targetText: attack.targetMobName,
    rollText: `${Math.round(attack.hitChance * 100)}% hit (${attack.attackerHitScore} vs ${attack.defenderAvoidScore})`,
    outcomeText: attack.hit ? (attack.crit ? 'CRIT' : 'HIT') : 'MISS',
    damageText: attack.hit && attack.totalDamage !== undefined ? `${attack.totalDamage} dmg` : null,
  };
}

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

export function RoundLogAttackRow({
  attack,
  currentPlayerId,
}: {
  attack: PlayerRoundActionEntry;
  currentPlayerId: string | null;
}) {
  if (isExhaustedActionEntry(attack)) {
    return (
      <div className="text-xs ml-2 text-[var(--rpg-text-secondary)]">
        <span className="text-[var(--rpg-text-primary)]">{attack.username}</span>
        {': '}
        {attack.intendedActionLabel}
        {' → '}
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

  const formattedAttack = formatRoundLogAttackRow(attack, currentPlayerId);
  const [expanded, setExpanded] = useState(formattedAttack.isCurrentPlayer);

  const outcomeNode = formattedAttack.outcomeText === 'MISS' ? (
    <span className="text-[var(--rpg-text-secondary)]">MISS</span>
  ) : (
    <>
      <span className={attack.crit ? 'text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-green-light)]'}>
        {formattedAttack.outcomeText}
      </span>
      {formattedAttack.damageText && (
        <span className="text-[var(--rpg-red)]"> {formattedAttack.damageText}</span>
      )}
    </>
  );

  if (formattedAttack.isCurrentPlayer) {
    return (
      <div className="text-xs ml-2 mb-0.5 p-1 rounded bg-[var(--rpg-surface)]">
        <span className="text-[var(--rpg-gold)] font-bold">{formattedAttack.actionText}</span>
        {formattedAttack.targetText && (
          <>
            {' → '}
            <span className="text-[var(--rpg-text-primary)]">{formattedAttack.targetText}</span>
          </>
        )}
        {formattedAttack.rollText && (
          <>
            {' | '}
            <span className="text-[var(--rpg-text-secondary)]">{formattedAttack.rollText}</span>
          </>
        )}
        {' | '}
        {outcomeNode}
      </div>
    );
  }

  return (
    <div
      className="text-xs ml-2 text-[var(--rpg-text-secondary)] cursor-pointer hover:bg-[var(--rpg-surface)]/50 rounded px-1 -mx-1"
      onClick={() => setExpanded(!expanded)}
    >
      <span className="text-[var(--rpg-text-primary)]">{formattedAttack.actorNameText}</span>
      {': '}
      {formattedAttack.actionText}
      {formattedAttack.targetText && (
        <>
          {' → '}
          {formattedAttack.targetText}
        </>
      )}
      {' | '}
      {outcomeNode}
      {expanded && formattedAttack.rollText && (
        <div className="ml-2 mt-0.5 text-[var(--rpg-text-secondary)] opacity-70">
          {formattedAttack.rollText}
        </div>
      )}
    </div>
  );
}
