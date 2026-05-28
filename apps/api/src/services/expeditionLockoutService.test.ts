import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { checkActivityLockout, checkExpeditionLockout } from './expeditionLockoutService';

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

describe('checkActivityLockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears a stale encounter-site lock when the player was respawned outside the site zone', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      activeEncounterSiteId: 'site-1',
      currentZoneId: 'town-1',
    });
    mockPrisma.encounterSite.findFirst.mockResolvedValue({
      zoneId: 'forest-1',
    });
    mockPrisma.guildExpeditionMember.findFirst.mockResolvedValue(null);

    await expect(checkActivityLockout('p1')).resolves.toBeUndefined();

    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { activeEncounterSiteId: null },
    });
  });

  it('keeps blocking activity while the player is still in the active encounter site zone', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      activeEncounterSiteId: 'site-1',
      currentZoneId: 'forest-1',
    });
    mockPrisma.encounterSite.findFirst.mockResolvedValue({
      zoneId: 'forest-1',
    });
    mockPrisma.guildExpeditionMember.findFirst.mockResolvedValue(null);

    await expect(checkActivityLockout('p1')).rejects.toThrow('Cannot perform this action while in an active encounter site');

    expect(mockPrisma.player.update).not.toHaveBeenCalled();
  });
});
