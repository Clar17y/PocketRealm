import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../premiumService', () => ({
  grantPremiumDays: vi.fn(),
  listPremiumPurchases: vi.fn(),
}));
vi.mock('../stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn().mockResolvedValue({
    characterProgression: { characterLevel: 10, characterXp: 1000, attributePoints: 5 },
  }),
}));
vi.mock('./adminAuditService', () => ({
  adminAudit: vi.fn().mockResolvedValue(undefined),
  adminAuditTx: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@pocketrealm/game-engine', () => ({
  xpForLevel: vi.fn((level: number) => level * 100),
  characterLevelFromXp: vi.fn((xp: number) => Math.floor(xp / 100)),
}));
vi.mock('../attributesService', () => ({
  normalizePlayerAttributes: vi.fn((attrs: Record<string, number> | null) => attrs ?? {
    vitality: 1,
    strength: 1,
    dexterity: 1,
    intelligence: 1,
    luck: 1,
    evasion: 1,
  }),
}));

import { mockPrisma } from '../../__test__/setup';
import { grantPremiumDays } from '../premiumService';
import { buildStateUpdates } from '../stateUpdateHelpers';
import { adminAuditTx } from './adminAuditService';
import { grantAdminPremium, setAdminPlayerLevel } from './playerAdminService';

describe('playerAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets player level, xp, and attribute points based on level increase', async () => {
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ characterLevel: 5 });
    mockPrisma.player.update.mockResolvedValue({});

    const result = await setAdminPlayerLevel('admin-1', 10);

    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: {
        characterLevel: 10,
        characterXp: BigInt(1000),
        attributePoints: { increment: 5 },
      },
    });
    expect(buildStateUpdates).toHaveBeenCalledWith('admin-1', ['characterProgression']);
    expect(result).toEqual({
      level: 10,
      characterXp: 1000,
      stateUpdates: {
        characterProgression: { characterLevel: 10, characterXp: 1000, attributePoints: 5 },
      },
    });
  });

  it('grants premium days in a transaction and writes the audit payload', async () => {
    vi.mocked(grantPremiumDays).mockResolvedValue({
      id: 'purchase-1',
      playerId: 'target-1',
      championDaysGranted: 14,
    } as never);

    const purchase = await grantAdminPremium({
      adminId: 'admin-1',
      playerId: 'target-1',
      days: 14,
      reason: 'Support recovery',
    });

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(grantPremiumDays).toHaveBeenCalledWith({
      playerId: 'target-1',
      provider: 'admin',
      productType: 'admin_grant',
      amount: 0,
      currency: 'usd',
      days: 14,
      metadata: {
        grantedByAdminId: 'admin-1',
        reason: 'Support recovery',
      },
    }, mockPrisma);
    expect(adminAuditTx).toHaveBeenCalledWith(
      mockPrisma,
      'admin-1',
      'grant_premium',
      {
        targetPlayerId: 'target-1',
        days: 14,
        purchaseId: 'purchase-1',
        reason: 'Support recovery',
      },
    );
    expect(purchase).toEqual({
      id: 'purchase-1',
      playerId: 'target-1',
      championDaysGranted: 14,
    });
  });
});
