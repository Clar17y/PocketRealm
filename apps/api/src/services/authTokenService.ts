import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@pocketrealm/database';
import { AUTH_CONSTANTS } from '@pocketrealm/shared';

/** Generate a 32-byte crypto-random hex token (64 chars). */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash a raw token for safe DB storage. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Create a verification token for an account. Deletes any existing token first. */
export async function createEmailVerificationToken(accountId: string): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const now = new Date();

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { accountId } }),
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailVerificationToken.create({
      data: { accountId, tokenHash, expiresAt },
    }),
  ]);

  return { rawToken };
}

/** Verify a raw email verification token. Returns the record if valid, null otherwise. */
export async function verifyEmailToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  return record;
}

/** Create a password reset token for an account. Deletes any existing token first. */
export async function createPasswordResetToken(accountId: string): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const now = new Date();

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { accountId } }),
    prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { usedAt: { not: null } },
        ],
      },
    }),
    prisma.passwordResetToken.create({
      data: { accountId, tokenHash, expiresAt },
    }),
  ]);

  return { rawToken };
}

/** Verify a raw password reset token. Returns the record if valid, null otherwise. */
export async function verifyPasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.expiresAt < new Date() || record.usedAt !== null) {
    return null;
  }

  return record;
}

/** Delete expired tokens from both token tables. Called periodically. */
export async function cleanupExpiredTokens(): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { usedAt: { not: null } },
        ],
      },
    }),
  ]);
}
