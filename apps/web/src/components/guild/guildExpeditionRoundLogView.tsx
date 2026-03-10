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
    rollText: attack.playerId === currentPlayerId
      ? `${Math.round(attack.hitChance * 100)}% hit (${attack.attackerHitScore} vs ${attack.defenderAvoidScore})`
      : null,
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
      <div className="text-[10px] ml-2 text-[var(--rpg-text-secondary)]">
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

  const formattedAttack = formatRoundLogAttackRow(attack, currentPlayerId);

  if (formattedAttack.isCurrentPlayer) {
    return (
      <div className="text-[10px] ml-2 mb-0.5 p-1 rounded bg-[var(--rpg-surface)]">
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
        {formattedAttack.outcomeText === 'MISS' ? (
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
        )}
      </div>
    );
  }

  return (
    <div className="text-[10px] ml-2 text-[var(--rpg-text-secondary)]">
      <span className="text-[var(--rpg-text-primary)]">{formattedAttack.actorNameText}</span>
      {': '}
      {formattedAttack.actionText}
      {' → '}
      {formattedAttack.targetText && (
        <>
          {formattedAttack.targetText}
          {' | '}
        </>
      )}
      {formattedAttack.outcomeText === 'MISS' ? (
        'MISS'
      ) : (
        <>
          <span className={attack.crit ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-green-light)]'}>
            {formattedAttack.outcomeText}
          </span>
          {formattedAttack.damageText && ` ${formattedAttack.damageText}`}
        </>
      )}
    </div>
  );
}
