import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExhaustedActionEntry, PlayerAttackEntry, PlayerRoundActionEntry } from '@pocketrealm/shared';
import { RoundLogAttackRow } from './guildExpeditionRoundLog';

function buildAttack(overrides: Partial<PlayerAttackEntry>): PlayerAttackEntry {
  return {
    playerId: 'player-1',
    username: 'RangerOne',
    actionId: 'power-strike',
    actionLabel: 'Power Strike',
    targetMobId: 'mob-1',
    targetMobName: 'Crystal Golem',
    hitChance: 0.75,
    hitRollValue: 0.3,
    attackerHitScore: 22,
    defenderAvoidScore: 13,
    hit: true,
    crit: false,
    totalDamage: 12,
    staminaCost: 4,
    manaCost: 0,
    ...overrides,
  };
}

function buildExhaustedAction(overrides: Partial<ExhaustedActionEntry>): ExhaustedActionEntry {
  return {
    entryType: 'exhausted',
    playerId: 'bot-1',
    username: 'GuardBot',
    intendedActionId: 'counter',
    intendedActionLabel: 'Counter',
    fallbackActionId: 'defend',
    fallbackActionLabel: 'Defend',
    reason: 'mana',
    ...overrides,
  };
}

function renderAttackRowText(attack: PlayerRoundActionEntry, currentPlayerId: string | null): string {
  return renderToStaticMarkup(createElement(RoundLogAttackRow, { attack, currentPlayerId }))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('RoundLogAttackRow', () => {
  it('renders the current-player and compact non-player attack rows with target names and null-target safety', () => {
    const currentPlayerAttack = buildAttack({});
    const otherPlayerAttack = buildAttack({
      playerId: 'player-2',
      username: 'SinStalker',
      actionId: 'aimed-shot',
      actionLabel: 'aimed shot',
      totalDamage: 8,
    });
    const nullTargetAttack = buildAttack({
      playerId: 'bot-1',
      username: 'AutoTurret',
      actionId: 'suppressing-fire',
      actionLabel: 'suppressing fire',
      targetMobId: null,
      targetMobName: null,
      hit: false,
      totalDamage: undefined,
    });
    const currentPlayerNullTargetAttack = buildAttack({
      targetMobId: null,
      targetMobName: null,
    });
    const exhaustedAction = buildExhaustedAction({});

    // Current player: "You: Action → Target | outcome ▼" (hit details collapsed)
    expect(renderAttackRowText(currentPlayerAttack, 'player-1')).toBe(
      'You: Power Strike \u2192 Crystal Golem | HIT 12 dmg\u25BC',
    );
    // Other player: "Username: Action → Target | outcome ▼"
    expect(renderAttackRowText(otherPlayerAttack, 'player-1')).toBe(
      'SinStalker: aimed shot \u2192 Crystal Golem | HIT 8 dmg\u25BC',
    );
    // Null target, miss
    expect(renderAttackRowText(nullTargetAttack, 'player-1')).toBe(
      'AutoTurret: suppressing fire | MISS\u25BC',
    );
    // Current player, null target
    expect(renderAttackRowText(currentPlayerNullTargetAttack, 'player-1')).toBe(
      'You: Power Strike | HIT 12 dmg\u25BC',
    );
    // Exhausted action (no expand toggle)
    expect(renderAttackRowText(exhaustedAction, 'player-1')).toBe(
      'GuardBot: Counter \u2192 Defend (Exhausted: mana)',
    );
  });
});
