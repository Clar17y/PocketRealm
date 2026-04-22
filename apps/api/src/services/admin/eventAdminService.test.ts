import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../worldEventService', () => ({
  getEventById: vi.fn(),
  spawnWorldEvent: vi.fn(),
}));
vi.mock('./adminAuditService', () => ({
  adminAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../roundTimerRegistry', () => ({
  roundTimerRegistry: {
    cancel: vi.fn(),
    schedule: vi.fn(),
    rehydrate: vi.fn(),
    clearAll: vi.fn(),
    size: vi.fn().mockReturnValue(0),
    keys: vi.fn().mockReturnValue([]),
  },
}));

import { mockPrisma } from '../../__test__/setup';
import { getEventById } from '../worldEventService';
import { roundTimerRegistry } from '../roundTimerRegistry';
import { cancelAdminEvent } from './eventAdminService';

describe('eventAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expires a boss encounter and cancels its timer when cancelling a boss world event', async () => {
    vi.mocked(getEventById).mockResolvedValue({
      id: 'evt-boss',
      type: 'boss',
      status: 'active',
      title: 'Boss',
    } as never);
    mockPrisma.worldEvent.update.mockResolvedValue({});
    mockPrisma.bossEncounter.findUnique.mockResolvedValue({
      id: 'enc-1',
      status: 'waiting',
    });
    mockPrisma.bossEncounter.update.mockResolvedValue({});

    await cancelAdminEvent('evt-boss', 'admin-1');

    expect(mockPrisma.worldEvent.update).toHaveBeenCalledWith({
      where: { id: 'evt-boss' },
      data: {
        status: 'expired',
        expiresAt: expect.any(Date),
      },
    });
    expect(mockPrisma.bossEncounter.findUnique).toHaveBeenCalledWith({
      where: { eventId: 'evt-boss' },
      select: { id: true, status: true },
    });
    expect(mockPrisma.bossEncounter.update).toHaveBeenCalledWith({
      where: { eventId: 'evt-boss' },
      data: {
        status: 'expired',
        nextRoundAt: null,
      },
    });
    expect(roundTimerRegistry.cancel).toHaveBeenCalledWith('bossEncounter', 'enc-1');
  });

  it('returns null when the target event does not exist', async () => {
    vi.mocked(getEventById).mockResolvedValue(null);

    await expect(cancelAdminEvent('missing')).resolves.toBeNull();
  });
});
