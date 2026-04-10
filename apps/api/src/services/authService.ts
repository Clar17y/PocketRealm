import { prisma } from '@pocketrealm/database';
import bcrypt from 'bcrypt';
import { AUTH_CONSTANTS } from '@pocketrealm/shared';
import { createEmailVerificationToken } from './authTokenService';
import { sendVerificationEmail } from './emailService';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../logger';

/** Verify email and grant Champion trial if eligible. Returns whether trial was granted. */
export async function verifyPlayerEmail(tokenRecord: { id: string; playerId: string }): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id: tokenRecord.playerId },
      select: { premiumTrialClaimed: true },
    });

    const shouldGrantTrial = player && !player.premiumTrialClaimed;
    const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.CHAMPION_TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await tx.player.update({
      where: { id: tokenRecord.playerId },
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
export async function changePlayerEmail(playerId: string, newEmail: string, currentPassword: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { passwordHash: true, username: true },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const validPassword = await bcrypt.compare(currentPassword, player.passwordHash);
  if (!validPassword) {
    throw new AppError(401, 'Invalid password', 'INVALID_CREDENTIALS');
  }

  const existing = await prisma.player.findUnique({ where: { email: newEmail } });
  if (existing) {
    throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
  }

  try {
    await prisma.$transaction([
      prisma.player.update({
        where: { id: playerId },
        data: { email: newEmail, emailVerified: false },
      }),
      prisma.emailVerificationToken.deleteMany({ where: { playerId } }),
    ]);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
    }
    throw err;
  }

  createEmailVerificationToken(playerId)
    .then(({ rawToken }) => sendVerificationEmail(newEmail, rawToken, player.username))
    .catch((err) => logger.error({ err }, 'Failed to send verification email'));
}

/** Change a player's password. Revokes all sessions. */
export async function changePlayerPassword(playerId: string, currentPassword: string, newPassword: string): Promise<void> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { passwordHash: true },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const validPassword = await bcrypt.compare(currentPassword, player.passwordHash);
  if (!validPassword) {
    throw new AppError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, AUTH_CONSTANTS.BCRYPT_ROUNDS);

  await prisma.player.update({
    where: { id: playerId },
    data: { passwordHash: newPasswordHash },
  });

  await prisma.refreshToken.deleteMany({
    where: { playerId },
  });
}
