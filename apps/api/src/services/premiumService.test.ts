import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { prisma } from '@pocketrealm/database';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import {
  calculatePremiumGrantWindow,
  grantPremiumDays,
} from './premiumService';

const PLAYER_ID = 'player-1';
const PAYMENT_INTENT_ID = 'pi_123';
const SESSION_ID = 'cs_123';
const NOW = new Date('2026-04-17T12:00:00.000Z');
const ACTIVE_EXPIRY = new Date('2026-04-20T12:00:00.000Z');
const GRANT_DAYS = 30;
const GRANT_AMOUNT = 499;
const GRANT_CURRENCY = 'gbp';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('calculatePremiumGrantWindow', () => {
  it('starts from now when there is no expiry', () => {
    const window = calculatePremiumGrantWindow(null, GRANT_DAYS, NOW);

    expect(window.grantedFrom.toISOString()).toBe(NOW.toISOString());
    expect(window.grantedUntil.toISOString()).toBe(
      new Date(NOW.getTime() + GRANT_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('stacks from the active expiry when expiry is in the future', () => {
    const window = calculatePremiumGrantWindow(ACTIVE_EXPIRY, GRANT_DAYS, NOW);

    expect(window.grantedFrom.toISOString()).toBe(ACTIVE_EXPIRY.toISOString());
    expect(window.grantedUntil.toISOString()).toBe(
      new Date(ACTIVE_EXPIRY.getTime() + GRANT_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
  });
});

describe('grantPremiumDays', () => {
  it('creates a completed purchase and extends Champion time correctly', async () => {
    const expectedWindow = calculatePremiumGrantWindow(null, GRANT_DAYS, NOW);
    const createdPurchase = {
      id: 'purchase-1',
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: PAYMENT_INTENT_ID,
      productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
      status: 'completed',
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      championDaysGranted: GRANT_DAYS,
      grantedFrom: expectedWindow.grantedFrom,
      grantedUntil: expectedWindow.grantedUntil,
      metadata: { source: 'checkout' },
      createdAt: NOW,
    };

    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      premiumExpiresAt: null,
    } as never);
    vi.mocked(prisma.premiumPurchase.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.player.update).mockResolvedValue({
      id: PLAYER_ID,
      isPremium: true,
      premiumExpiresAt: expectedWindow.grantedUntil,
    } as never);
    vi.mocked(prisma.premiumPurchase.create).mockResolvedValue(createdPurchase as never);

    const result = await grantPremiumDays({
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: PAYMENT_INTENT_ID,
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      days: GRANT_DAYS,
      metadata: { source: 'checkout' },
      now: NOW,
    });

    expect(result).toEqual(createdPurchase);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.player.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYER_ID },
      select: {
        premiumExpiresAt: true,
      },
    });
    expect(vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.player.findUnique).mock.invocationCallOrder[0],
    );
    expect(prisma.premiumPurchase.create).toHaveBeenCalledWith({
      data: {
        playerId: PLAYER_ID,
        provider: 'stripe',
        providerSessionId: SESSION_ID,
        providerPaymentIntentId: PAYMENT_INTENT_ID,
        productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
        status: 'completed',
        amount: GRANT_AMOUNT,
        currency: GRANT_CURRENCY,
        championDaysGranted: GRANT_DAYS,
        grantedFrom: expectedWindow.grantedFrom,
        grantedUntil: expectedWindow.grantedUntil,
        metadata: { source: 'checkout' },
      },
    });
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: PLAYER_ID },
      data: {
        isPremium: true,
        premiumExpiresAt: expectedWindow.grantedUntil,
      },
    });
  });

  it('is idempotent for an already-recorded Stripe payment', async () => {
    const existingPurchase = {
      id: 'purchase-1',
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: PAYMENT_INTENT_ID,
      productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
      status: 'completed',
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      championDaysGranted: GRANT_DAYS,
      grantedFrom: NOW,
      grantedUntil: ACTIVE_EXPIRY,
      metadata: { source: 'checkout' },
      createdAt: NOW,
    };

    vi.mocked(prisma.premiumPurchase.findUnique).mockResolvedValue(existingPurchase as never);

    const result = await grantPremiumDays({
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: PAYMENT_INTENT_ID,
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      days: GRANT_DAYS,
      metadata: { source: 'checkout' },
      now: NOW,
    });

    expect(result).toEqual(existingPurchase);
    expect(prisma.player.findUnique).toHaveBeenCalledWith({
      where: { id: PLAYER_ID },
      select: {
        premiumExpiresAt: true,
      },
    });
    expect(prisma.premiumPurchase.create).not.toHaveBeenCalled();
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the existing Stripe purchase when create hits a unique constraint race', async () => {
    const existingPurchase = {
      id: 'purchase-1',
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: PAYMENT_INTENT_ID,
      productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
      status: 'completed',
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      championDaysGranted: GRANT_DAYS,
      grantedFrom: NOW,
      grantedUntil: ACTIVE_EXPIRY,
      metadata: { source: 'checkout' },
      createdAt: NOW,
    };
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });

    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      premiumExpiresAt: null,
    } as never);
    vi.mocked(prisma.premiumPurchase.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingPurchase as never);
    vi.mocked(prisma.premiumPurchase.create).mockRejectedValueOnce(p2002);

    const result = await grantPremiumDays({
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: PAYMENT_INTENT_ID,
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      days: GRANT_DAYS,
      metadata: { source: 'checkout' },
      now: NOW,
    });

    expect(result).toEqual(existingPurchase);
    expect(prisma.premiumPurchase.create).toHaveBeenCalledTimes(1);
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.premiumPurchase.findUnique).toHaveBeenCalledTimes(3);
  });

  it('returns the existing Stripe purchase when the session id is already recorded', async () => {
    const existingPurchase = {
      id: 'purchase-2',
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: null,
      productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
      status: 'completed',
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      championDaysGranted: GRANT_DAYS,
      grantedFrom: NOW,
      grantedUntil: ACTIVE_EXPIRY,
      metadata: { source: 'checkout' },
      createdAt: NOW,
    };

    vi.mocked(prisma.player.findUnique).mockResolvedValue({
      premiumExpiresAt: null,
    } as never);
    vi.mocked(prisma.premiumPurchase.findUnique).mockResolvedValue(existingPurchase as never);

    const result = await grantPremiumDays({
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      days: GRANT_DAYS,
      metadata: { source: 'checkout' },
      now: NOW,
    });

    expect(result).toEqual(existingPurchase);
    expect(prisma.premiumPurchase.create).not.toHaveBeenCalled();
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.premiumPurchase.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.premiumPurchase.findUnique).toHaveBeenCalledWith({
      where: { providerSessionId: SESSION_ID },
    });
  });

  it('throws not found when the player is missing even if the Stripe payment was recorded', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue(null);

    await expect(grantPremiumDays({
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      providerPaymentIntentId: PAYMENT_INTENT_ID,
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      days: GRANT_DAYS,
      metadata: { source: 'checkout' },
      now: NOW,
    })).rejects.toMatchObject({
      message: 'Player not found',
      code: 'NOT_FOUND',
    });

    expect(prisma.premiumPurchase.findUnique).not.toHaveBeenCalled();
  });
});
