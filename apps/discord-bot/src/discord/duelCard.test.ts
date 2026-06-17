import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import {
  buildChallengeCard,
  buildDeclineCard,
  buildReplayCard,
  buildResultCard,
} from './duelCard.js';
import { DEFAULT_DUEL_EMOJI } from './duelEmoji.js';

function componentJson(card: { components: Array<{ toJSON: () => unknown }> }): string {
  return JSON.stringify(card.components.map((component) => component.toJSON()));
}

describe('buildChallengeCard', () => {
  const card = buildChallengeCard({
    duelId: 'duel-123',
    challengerMention: '<@123456789012345678>',
    opponentMention: '<@333333333333333333>',
    opponentDiscordUserId: '333333333333333333',
  });

  it('uses the Components V2 flag and carries no plain content', () => {
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect('content' in card).toBe(false);
  });

  it('renders both mentions and pings only the opponent', () => {
    const json = componentJson(card);
    expect(json).toContain('<@333333333333333333>');
    expect(json).toContain('<@123456789012345678>');
    expect(json).toContain('challenged you to a friendly simulation');
    expect(card.allowedMentions).toEqual({ users: ['333333333333333333'] });
  });

  it('includes accept and decline buttons', () => {
    const json = componentJson(card);
    expect(json).toContain('duel:accept:duel-123:333333333333333333');
    expect(json).toContain('duel:decline:duel-123:333333333333333333');
  });
});

describe('buildDeclineCard', () => {
  it('renders the decline notice with the Components V2 flag', () => {
    const card = buildDeclineCard({ declinerMention: '<@444444444444444444>' });
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(componentJson(card)).toContain('declined by <@444444444444444444>');
  });

  it('suppresses mentions so the decline notice never pings', () => {
    const card = buildDeclineCard({ declinerMention: '<@444444444444444444>' });
    expect(card.allowedMentions).toEqual({ parse: [] });
  });
});

describe('buildResultCard', () => {
  const card = buildResultCard({
    id: 'duel-123',
    challengerUsername: 'Astra',
    targetUsername: 'Borin',
    winnerUsername: 'Astra',
    isDraw: false,
    summary: { totalRounds: 3, challengerHpRemaining: 42, targetHpRemaining: 0 },
  });

  it('announces the winner and summary with the Components V2 flag', () => {
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    const json = componentJson(card);
    expect(json).toContain('Astra');
    expect(json).toContain('3 rounds');
  });

  it('includes replay, builds, and rematch buttons', () => {
    const json = componentJson(card);
    expect(json).toContain('duel:replay:duel-123:1');
    expect(json).toContain('duel:builds:duel-123');
    expect(json).toContain('duel:rematch:duel-123');
  });

  it('suppresses mentions so interpolated usernames never ping', () => {
    expect(card.allowedMentions).toEqual({ parse: [] });
  });
});

describe('buildReplayCard', () => {
  const replay = {
    id: 'duel-123',
    status: 'resolved',
    page: 1,
    pageSize: 3,
    hasMore: true,
    summary: {
      challengerUsername: 'Astra',
      targetUsername: 'Borin',
      challengerMaxHp: 100,
      targetMaxHp: 100,
      challengerMaxStamina: 100,
      targetMaxStamina: 100,
      challengerMaxMana: 50,
      targetMaxMana: 50,
    },
    entries: [
      {
        round: 1,
        actor: 'combatantA',
        actorName: 'Astra',
        actionName: 'Crippling Shot',
        damage: 12,
        hitChance: 0.75,
        hitRollValue: 0.1,
        attackerHitScore: 55,
        defenderAvoidScore: 20,
        combatantAHpAfter: 80,
        combatantBHpAfter: 88,
        combatantAStaminaAfter: 10.80000000000002,
        combatantBStaminaAfter: 20,
        combatantAManaAfter: 35,
        combatantBManaAfter: 15,
      },
      {
        round: 2,
        actor: 'combatantA',
        actorName: 'Astra',
        action: 'regen',
        message: 'Resources regenerate.',
        combatantAHpAfter: 80,
        combatantBHpAfter: 88,
        combatantAStaminaAfter: 20,
        combatantBStaminaAfter: 30,
        combatantAManaAfter: 40,
        combatantBManaAfter: 20,
      },
    ],
  };

  const card = buildReplayCard(replay);

  it('uses the Components V2 flag', () => {
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
  });

  it('renders fighter names and emoji health bars with rounded values', () => {
    const json = componentJson(card);
    expect(json).toContain('Astra');
    expect(json).toContain('Borin');
    expect(json).toContain(DEFAULT_DUEL_EMOJI.hp.full);
    expect(json).toContain('80/100');
    // 10.80000000000002 must display as a whole number, never the raw float
    expect(json).toContain('11/100');
    expect(json).not.toContain('10.80000000000002');
  });

  it('renders the action log and filters redundant regen entries', () => {
    const json = componentJson(card);
    expect(json).toContain('12 damage');
    expect(json).toContain('HIT 75%');
    expect(json).not.toContain('Resources regenerate.');
  });

  it('includes a next-page button when more pages remain', () => {
    expect(componentJson(card)).toContain('duel:replay:duel-123:2');
  });

  it('shows previous and next buttons on middle pages', () => {
    const middle = buildReplayCard({
      id: 'duel-123',
      status: 'resolved',
      page: 2,
      pageSize: 3,
      hasMore: true,
      summary: {},
      entries: [{ round: 4, message: 'Borin makes a final stand.' }],
    });
    const json = componentJson(middle);
    expect(json).toContain('duel:replay:duel-123:1');
    expect(json).toContain('duel:replay:duel-123:3');
  });

  it('keeps pagination buttons when every entry on the page is filtered out', () => {
    const allFiltered = buildReplayCard({
      id: 'duel-123',
      status: 'resolved',
      page: 2,
      pageSize: 3,
      hasMore: true,
      summary: {},
      // A regen tick with no damage/heal/effects is filtered as redundant.
      entries: [{ round: 4, action: 'regen' }],
    });
    const json = componentJson(allFiltered);
    expect(json).toContain('No replay entries are available.');
    expect(json).toContain('duel:replay:duel-123:1');
    expect(json).toContain('duel:replay:duel-123:3');
  });
});
