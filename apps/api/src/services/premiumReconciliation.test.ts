import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { prisma } from '@pocketrealm/database';
import { reconcileExpiredPremium } from './premiumReconciliation';

describe('reconcileExpiredPremium', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables expired premium accounts without deleting purchase history', async () => {
    const now = new Date('2026-04-17T12:00:00.000Z');
    vi.mocked(prisma.player.updateMany).mockResolvedValue({ count: 3 } as never);

    const result = await reconcileExpiredPremium(now);

    expect(result).toEqual({ updatedCount: 3 });
    expect(prisma.player.updateMany).toHaveBeenCalledWith({
      where: {
        isPremium: true,
        premiumExpiresAt: {
          lte: now,
        },
      },
      data: {
        isPremium: false,
      },
    });
    expect(prisma.premiumPurchase.deleteMany).not.toHaveBeenCalled();
  });
});
