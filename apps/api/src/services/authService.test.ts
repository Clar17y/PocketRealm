import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
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

const NOW = new Date('2026-04-17T12:00:00.000Z');

describe('verifyPlayerEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(prisma.emailVerificationToken.delete).mockResolvedValue({ id: 'token-1' } as never);
    vi.mocked(prisma.account.update).mockResolvedValue({ id: 'account-1' } as never);
  });

  it('grants a trial on the account when it has not been claimed yet', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      premiumTrialClaimed: false,
    } as never);

    const result = await verifyPlayerEmail({
      id: 'token-1',
      accountId: 'account-1',
    });

    expect(result).toBe(true);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: {
        emailVerified: true,
        premiumTrialClaimed: true,
        isPremium: true,
        premiumExpiresAt: new Date(NOW.getTime() + AUTH_CONSTANTS.CHAMPION_TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({
      where: { id: 'token-1' },
    });
  });

  it('extends an existing premium window instead of truncating it when granting the trial', async () => {
    const existingExpiry = new Date('2026-05-01T00:00:00.000Z');

    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      premiumTrialClaimed: false,
      premiumExpiresAt: existingExpiry,
    } as never);

    const result = await verifyPlayerEmail({
      id: 'token-1',
      accountId: 'account-1',
    });

    expect(result).toBe(true);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: {
        emailVerified: true,
        premiumTrialClaimed: true,
        isPremium: true,
        premiumExpiresAt: new Date(
          existingExpiry.getTime() + AUTH_CONSTANTS.CHAMPION_TRIAL_DAYS * 24 * 60 * 60 * 1000,
        ),
      },
    });
  });

  it('verifies the email without granting another trial when it was already claimed', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      premiumTrialClaimed: true,
    } as never);

    const result = await verifyPlayerEmail({
      id: 'token-2',
      accountId: 'account-2',
    });

    expect(result).toBe(false);
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-2' },
      data: {
        emailVerified: true,
      },
    });
    expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({
      where: { id: 'token-2' },
    });
  });
});
