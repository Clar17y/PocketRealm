import { Prisma, prisma } from '@pocketrealm/database';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PremiumGrantWindow {
  grantedFrom: Date;
  grantedUntil: Date;
}

export interface GrantPremiumDaysInput {
  playerId: string;
  provider: string;
  days: number;
  amount: number;
  currency: string;
  providerSessionId?: string | null;
  providerPaymentIntentId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  now?: Date;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError(400, `${label} must be a positive integer`, 'INVALID_DAYS');
  }
}

export function calculatePremiumGrantWindow(
  currentExpiry: Date | null | undefined,
  days: number,
  now: Date = new Date(),
): PremiumGrantWindow {
  assertPositiveInteger(days, 'Champion days');

  const grantStart = currentExpiry && currentExpiry.getTime() > now.getTime()
    ? currentExpiry
    : now;

  return {
    grantedFrom: new Date(grantStart),
    grantedUntil: new Date(grantStart.getTime() + days * MS_PER_DAY),
  };
}

export async function listPremiumPurchases(playerId: string) {
  return prisma.premiumPurchase.findMany({
    where: { playerId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getPremiumStatus(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      isPremium: true,
      premiumExpiresAt: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  return player;
}

export async function grantPremiumDays(input: GrantPremiumDaysInput) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const player = await tx.player.findUnique({
      where: { id: input.playerId },
      select: {
        premiumExpiresAt: true,
      },
    });

    if (!player) {
      throw new AppError(404, 'Player not found', 'NOT_FOUND');
    }

    if (input.provider === 'stripe' && input.providerPaymentIntentId) {
      const existing = await tx.premiumPurchase.findUnique({
        where: { providerPaymentIntentId: input.providerPaymentIntentId },
      });

      if (existing) {
        return existing;
      }
    }

    const grantedAt = input.now ?? new Date();
    const { grantedFrom, grantedUntil } = calculatePremiumGrantWindow(
      player.premiumExpiresAt,
      input.days,
      grantedAt,
    );

    const purchase = await tx.premiumPurchase.create({
      data: {
        playerId: input.playerId,
        provider: input.provider,
        providerSessionId: input.providerSessionId ?? null,
        providerPaymentIntentId: input.providerPaymentIntentId ?? null,
        productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
        status: 'completed',
        amount: input.amount,
        currency: input.currency,
        championDaysGranted: input.days,
        grantedFrom,
        grantedUntil,
        metadata: input.metadata ?? null,
      },
    });

    await tx.player.update({
      where: { id: input.playerId },
      data: {
        isPremium: true,
        premiumExpiresAt: grantedUntil,
      },
    });

    return purchase;
  });
}
