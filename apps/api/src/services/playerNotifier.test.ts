import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendPush: vi.fn(),
  enqueueDiscordNotificationEvent: vi.fn(),
}));

vi.mock('./pushNotificationService', () => ({ sendPush: mocks.sendPush }));
vi.mock('./discordNotificationService', () => ({
  enqueueDiscordNotificationEvent: mocks.enqueueDiscordNotificationEvent,
}));

import { notifyPlayer } from './playerNotifier';

const PUSH = { title: 'PvP Attack!', body: 'Rook challenged you!', tag: 'pvp-attack' };

describe('notifyPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendPush.mockResolvedValue(undefined);
    mocks.enqueueDiscordNotificationEvent.mockResolvedValue(undefined);
  });

  it('sends web push and enqueues a Discord event for a mapped type', () => {
    notifyPlayer('player-1', 'pvpAttack', PUSH, { attackerName: 'Rook' });

    expect(mocks.sendPush).toHaveBeenCalledWith('player-1', 'pvpAttack', PUSH);
    expect(mocks.enqueueDiscordNotificationEvent).toHaveBeenCalledWith('player-1', 'pvp_attack', { attackerName: 'Rook' });
  });

  it('only sends web push for an unmapped type (turnBankFull)', () => {
    notifyPlayer('player-1', 'turnBankFull', PUSH);

    expect(mocks.sendPush).toHaveBeenCalledWith('player-1', 'turnBankFull', PUSH);
    expect(mocks.enqueueDiscordNotificationEvent).not.toHaveBeenCalled();
  });

  it('does not enqueue a mapped type when no Discord payload is supplied', () => {
    notifyPlayer('player-1', 'pvpAttack', PUSH);

    expect(mocks.enqueueDiscordNotificationEvent).not.toHaveBeenCalled();
  });
});
