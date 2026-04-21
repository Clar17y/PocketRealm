import { prisma } from '@pocketrealm/database';
import bcrypt from 'bcrypt';
import { AUTH_CONSTANTS } from '@pocketrealm/shared';
import { createEmailVerificationToken } from './authTokenService';
import { sendVerificationEmail } from './emailService';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../logger';

/** Verify email and grant Champion trial if eligible. Returns whether trial was granted. */
export async function verifyPlayerEmail(tokenRecord: { id: string; accountId: string }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: tokenRecord.accountId },
      select: {
        premiumTrialClaimed: true,
        premiumExpiresAt: true,
      },
    });

    const shouldGrantTrial = account && !account.premiumTrialClaimed;
    const trialMs = AUTH_CONSTANTS.CHAMPION_TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const trialBaseMs = account?.premiumExpiresAt instanceof Date && account.premiumExpiresAt.getTime() > Date.now()
      ? account.premiumExpiresAt.getTime()
      : Date.now();
    const expiresAt = new Date(trialBaseMs + trialMs);

    await tx.account.update({
      where: { id: tokenRecord.accountId },
      data: {
        emailVerified: true,
        ...(shouldGrantTrial ? {
          premiumTrialClaimed: true,
          isPremium: true,
          premiumExpiresAt: expiresAt,
        } : {}),
      },
    });

    await tx.emailVerificationToken.delete({
      where: { id: tokenRecord.id },
    });

    return !!shouldGrantTrial;
  });
}

/** Change a player's email. Resets verification and sends new verification email. */
export async function changePlayerEmail(accountId: string, newEmail: string, currentPassword: string): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      passwordHash: true,
      activePlayer: { select: { username: true } },
    },
  });

  if (!account) {
    throw new AppError(404, 'Account not found', 'NOT_FOUND');
  }

  const validPassword = await bcrypt.compare(currentPassword, account.passwordHash);
  if (!validPassword) {
    throw new AppError(401, 'Invalid password', 'INVALID_CREDENTIALS');
  }

  const existing = await prisma.account.findUnique({ where: { email: newEmail } });
  if (existing) {
    throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
  }

  try {
    await prisma.$transaction([
      prisma.account.update({
        where: { id: accountId },
        data: { email: newEmail, emailVerified: false },
      }),
      prisma.emailVerificationToken.deleteMany({ where: { accountId } }),
    ]);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
    }
    throw err;
  }

  createEmailVerificationToken(accountId)
    .then(({ rawToken }) => sendVerificationEmail(newEmail, rawToken, account.activePlayer?.username ?? 'Adventurer'))
    .catch((err) => logger.error({ err }, 'Failed to send verification email'));
}

/** Change a player's password. Revokes all sessions. */
export async function changePlayerPassword(accountId: string, currentPassword: string, newPassword: string): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { passwordHash: true },
  });

  if (!account) {
    throw new AppError(404, 'Account not found', 'NOT_FOUND');
  }

  const validPassword = await bcrypt.compare(currentPassword, account.passwordHash);
  if (!validPassword) {
    throw new AppError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, AUTH_CONSTANTS.BCRYPT_ROUNDS);

  await prisma.account.update({
    where: { id: accountId },
    data: { passwordHash: newPasswordHash },
  });

  await prisma.refreshToken.deleteMany({
    where: { accountId },
  });
}
