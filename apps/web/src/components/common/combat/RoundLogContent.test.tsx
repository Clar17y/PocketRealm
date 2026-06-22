import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExpeditionRoundLog } from '@pocketrealm/shared';
import { RoundLogContent } from './RoundLogContent';

describe('RoundLogContent', () => {
  it('expands enemy damage-roll details for guaranteed-hit attacks', () => {
    const log: ExpeditionRoundLog = {
      round: 1,
      roomIndex: 0,
      phases: {
        playerAttacks: [],
        defences: [],
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
        healing: [],
        effectTicks: [],
        outcome: {
          mobsAlive: 1,
          mobsKilled: 0,
          playersAlive: 1,
          playersKnockedOut: 0,
          roomCleared: false,
          wipe: false,
        },
      },
      telegraphs: [],
    };

    render(<RoundLogContent log={log} playerId="self" />);

    expect(screen.queryByText('Damage: 8 raw = 5 final')).toBeNull();

    fireEvent.click(screen.getByText(/Hero:/));

    expect(screen.getByText('Damage: 8 raw = 5 final')).toBeTruthy();
  });
});
