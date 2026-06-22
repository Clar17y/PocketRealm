import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExpeditionRoundLog } from '@pocketrealm/shared';
import { RoundLogContent } from './RoundLogContent';

afterEach(() => {
  cleanup();
});

function makeRoundLog(overrides: Partial<ExpeditionRoundLog['phases']> = {}): ExpeditionRoundLog {
  return {
    round: 1,
    roomIndex: 0,
    phases: {
      playerAttacks: [],
      defences: [],
      mobActions: [],
      healing: [],
      effectTicks: [],
      outcome: {
        mobsAlive: 0,
        mobsKilled: 0,
        playersAlive: 1,
        playersKnockedOut: 0,
      },
      ...overrides,
    },
    telegraphs: [],
  };
}

describe('RoundLogContent', () => {
  it('does not parse player effect tick names as promoted mob roles', () => {
    const { container } = render(
      <RoundLogContent
        playerId={null}
        log={makeRoundLog({
          effectTicks: [{
            targetType: 'player',
            targetId: 'player-1',
            targetName: 'Elite Hero',
            effectName: 'Burning',
            damage: 5,
            damageType: 'magic',
            hpAfter: 42,
          }],
        })}
      />,
    );

    expect(container.textContent).toContain('Elite Hero takes -5 HP from Burning');
    expect(screen.queryByTitle(/Elite/)).toBeNull();
  });
});
