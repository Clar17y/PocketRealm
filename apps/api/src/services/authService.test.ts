import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('./premiumService', () => ({
  grantPremiumDays: vi.fn(),
}));
vi.mock('./authTokenService', () => ({
  createEmailVerificationToken: vi.fn(),
}));
vi.mock('./emailService', () => ({
  sendVerificationEmail: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { prisma } from '@pocketrealm/database';
import { AUTH_CONSTANTS } from '@pocketrealm/shared';
import { verifyPlayerEmail } from './authService';
import { grantPremiumDays } from './premiumService';

const NOW = new Date('2026-04-17T12:00:00.000Z');

describe('verifyPlayerEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(prisma.$queryRaw).mockResolvedValue(undefined);
    vi.mocked(prisma.emailVerificationToken.delete).mockResolvedValue({ id: 'token-1' } as never);
    vi.mocked(prisma.player.update).mockResolvedValue({ id: 'player-1' } as never);
  });

  it('grants a trial through the shared premium service when the player has not claimed it yet', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      premiumTrialClaimed: false,
    } as never);
    vi.mocked(grantPremiumDays).mockResolvedValue({ id: 'purchase-1' } as never);

    const result = await verifyPlayerEmail({
      id: 'token-1',
      playerId: 'player-1',
    });

    expect(result).toBe(true);
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: {
        emailVerified: true,
        premiumTrialClaimed: true,
      },
    });
    expect(grantPremiumDays).toHaveBeenCalledWith({
      playerId: 'player-1',
      provider: 'email_verification',
      productType: 'email_verification_trial',
      days: AUTH_CONSTANTS.CHAMPION_TRIAL_DAYS,
      amount: 0,
      currency: 'usd',
      metadata: {
        source: 'email_verification',
      },
      now: NOW,
    }, prisma);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.player.findUnique).mock.invocationCallOrder[0],
    );
    expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({
      where: { id: 'token-1' },
    });
  });

  it('verifies the email without granting another trial when it was already claimed', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      premiumTrialClaimed: true,
    } as never);

    const result = await verifyPlayerEmail({
      id: 'token-2',
      playerId: 'player-2',
    });

    expect(result).toBe(false);
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 'player-2' },
      data: {
        emailVerified: true,
      },
    });
    expect(grantPremiumDays).not.toHaveBeenCalled();
    expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({
      where: { id: 'token-2' },
    });
  });
});
