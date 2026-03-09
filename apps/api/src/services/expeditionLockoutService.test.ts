import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { checkExpeditionLockout } from './expeditionLockoutService';

describe('checkExpeditionLockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws EXPEDITION_LOCKED when player is in an in_progress expedition', async () => {
    mockPrisma.guildExpeditionMember.findFirst.mockResolvedValue({ expeditionId: 'exp-1' });

    await expect(checkExpeditionLockout('p1')).rejects.toThrow('Cannot perform this action while on an active expedition');

    expect(mockPrisma.guildExpeditionMember.findFirst).toHaveBeenCalledWith({
      where: { playerId: 'p1', expedition: { status: 'in_progress' } },
      select: { expeditionId: true },
    });
  });

  it('does not throw when player is in a recruiting expedition', async () => {
    mockPrisma.guildExpeditionMember.findFirst.mockResolvedValue(null);

    await expect(checkExpeditionLockout('p1')).resolves.toBeUndefined();
  });

  it('does not throw when player is not in any expedition', async () => {
    mockPrisma.guildExpeditionMember.findFirst.mockResolvedValue(null);

    await expect(checkExpeditionLockout('p1')).resolves.toBeUndefined();
  });
});
