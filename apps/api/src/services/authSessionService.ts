import { type Prisma, prisma } from '@pocketrealm/database';
import {
  generateAccessToken,
  generateRefreshToken,
  refreshTokenExpiresAt,
  type AuthPayload,
} from '../middleware/auth';
import { hashToken } from './authTokenService';

interface AuthSessionPlayer {
  id: string;
  username: string;
  seasonId: string | null;
}

type RefreshTokenClient = typeof prisma | Prisma.TransactionClient;

export function buildAuthPayload(
  accountId: string,
  role: string | null | undefined,
  player: AuthSessionPlayer,
): AuthPayload {
  return {
    accountId,
    playerId: player.id,
    username: player.username,
    seasonId: player.seasonId,
    role: role ?? 'player',
  };
}

export function createAuthTokens(payload: AuthPayload): {
  accessToken: string;
  refreshToken: string;
} {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

export async function persistRefreshToken(
  accountId: string,
  refreshToken: string,
  now: Date,
  options: {
    revokeExisting?: boolean;
    tx?: RefreshTokenClient;
  } = {},
): Promise<void> {
  const client = options.tx ?? prisma;
  const deleteWhere = options.revokeExisting
    ? { accountId }
    : {
        accountId,
        expiresAt: { lt: now },
      };

  await client.refreshToken.deleteMany({ where: deleteWhere });
  await client.refreshToken.create({
    data: {
      accountId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt(now.getTime()),
    },
  });
}

export async function issueAccountSession(
  accountId: string,
  role: string | null | undefined,
  player: AuthSessionPlayer,
  now: Date,
  options: {
    revokeExisting?: boolean;
    tx?: RefreshTokenClient;
  } = {},
): Promise<{
  payload: AuthPayload;
  accessToken: string;
  refreshToken: string;
}> {
  const payload = buildAuthPayload(accountId, role, player);
  const { accessToken, refreshToken } = createAuthTokens(payload);
  await persistRefreshToken(accountId, refreshToken, now, options);

  return {
    payload,
    accessToken,
    refreshToken,
  };
}
