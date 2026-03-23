import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@pocketrealm/database';

const VERIFICATION_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_HOURS = 1;

/** Generate a 32-byte crypto-random hex token (64 chars). */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash a raw token for safe DB storage. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Create a verification token for a player. Deletes any existing token first. */
export async function createEmailVerificationToken(playerId: string): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.deleteMany({ where: { playerId } });
  await prisma.emailVerificationToken.create({
    data: { playerId, tokenHash, expiresAt },
  });

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

/** Create a password reset token for a player. Deletes any existing token first. */
export async function createPasswordResetToken(playerId: string): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.deleteMany({ where: { playerId } });
  await prisma.passwordResetToken.create({
    data: { playerId, tokenHash, expiresAt },
  });

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
