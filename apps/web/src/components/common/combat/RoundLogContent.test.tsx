import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  it('expands enemy damage-roll details for guaranteed-hit attacks', () => {
    render(
      <RoundLogContent
        log={makeRoundLog({
          mobActions: [
            {
              mobId: 'mob-1',
              mobName: 'Goblin',
              actionId: 'claw',
              actionLabel: 'Claw',
              targetMode: 'single_target',
              wasTelegraphed: false,
              targets: [
                {
                  playerId: 'self',
                  username: 'Hero',
                  damageTaken: 5,
                  blocked: false,
                  dodged: false,
                  knockedOut: false,
                  damageRoll: 8,
                },
              ],
            },
          ],
          outcome: {
            mobsAlive: 1,
            mobsKilled: 0,
            playersAlive: 1,
            playersKnockedOut: 0,
            roomCleared: false,
            wipe: false,
          },
        })}
        playerId="self"
      />,
    );

    expect(screen.queryByText('Damage: 8 raw = 5 final')).toBeNull();

    fireEvent.click(screen.getByText(/Hero:/));

    expect(screen.getByText('Damage: 8 raw = 5 final')).toBeTruthy();
  });

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
