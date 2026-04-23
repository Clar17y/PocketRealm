import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('./stripeService', () => ({
  retrieveStripeCheckoutSession: vi.fn(),
}));

import { prisma } from '@pocketrealm/database';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import {
  calculatePremiumGrantWindow,
  confirmSupportPocketrealmCheckoutSession,
  grantPremiumDays,
} from './premiumService';
import { retrieveStripeCheckoutSession } from './stripeService';

const PLAYER_ID = 'player-1';
const ACCOUNT_ID = 'account-1';
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
  it('uses a provided transaction client instead of opening a nested transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue(undefined),
      player: {
        findUnique: vi.fn().mockResolvedValue({ accountId: ACCOUNT_ID }),
      },
      account: {
        findUnique: vi.fn().mockResolvedValue({ premiumExpiresAt: null }),
        update: vi.fn().mockResolvedValue({
          id: ACCOUNT_ID,
          isPremium: true,
        }),
      },
      playerAchievement: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      premiumPurchase: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'purchase-tx',
          playerId: PLAYER_ID,
        }),
      },
    } as any;

    const result = await grantPremiumDays({
      playerId: PLAYER_ID,
      provider: 'admin',
      productType: 'admin_grant',
      amount: 0,
      currency: 'usd',
      days: GRANT_DAYS,
      now: NOW,
    }, tx);

    expect(result).toEqual({
      id: 'purchase-tx',
      playerId: PLAYER_ID,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.player.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.premiumPurchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'admin',
        productType: 'admin_grant',
      }),
    });
  });

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

    vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: ACCOUNT_ID } as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ premiumExpiresAt: null } as never);
    vi.mocked(prisma.premiumPurchase.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.account.update).mockResolvedValue({
      id: ACCOUNT_ID,
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
        accountId: true,
      },
    });
    expect(vi.mocked(prisma.player.findUnique).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(prisma.$queryRaw).mock.invocationCallOrder[0],
    );
    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      select: {
        premiumExpiresAt: true,
      },
    });
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
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: {
        isPremium: true,
        premiumExpiresAt: expectedWindow.grantedUntil,
      },
    });
    expect(prisma.playerAchievement.upsert).toHaveBeenCalledWith({
      where: {
        playerId_achievementId: {
          playerId: PLAYER_ID,
          achievementId: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID,
        },
      },
      create: {
        playerId: PLAYER_ID,
        achievementId: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID,
      },
      update: {},
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

    vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: ACCOUNT_ID } as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ premiumExpiresAt: null } as never);
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
        accountId: true,
      },
    });
    expect(prisma.premiumPurchase.create).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
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

    vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: ACCOUNT_ID } as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ premiumExpiresAt: null } as never);
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
    expect(prisma.account.update).not.toHaveBeenCalled();
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

    vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: ACCOUNT_ID } as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ premiumExpiresAt: null } as never);
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
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(prisma.premiumPurchase.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.premiumPurchase.findUnique).toHaveBeenCalledWith({
      where: { providerSessionId: SESSION_ID },
    });
  });

  it('rejects a Stripe session id that belongs to another player', async () => {
    vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: ACCOUNT_ID } as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ premiumExpiresAt: null } as never);
    vi.mocked(prisma.premiumPurchase.findUnique).mockResolvedValue({
      id: 'purchase-3',
      playerId: 'player-2',
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
    } as never);

    await expect(grantPremiumDays({
      playerId: PLAYER_ID,
      provider: 'stripe',
      providerSessionId: SESSION_ID,
      amount: GRANT_AMOUNT,
      currency: GRANT_CURRENCY,
      days: GRANT_DAYS,
      metadata: { source: 'checkout' },
      now: NOW,
    })).rejects.toMatchObject({
      message: 'Stripe purchase belongs to another player',
      code: 'PURCHASE_PLAYER_MISMATCH',
    });

    expect(prisma.premiumPurchase.create).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('rejects a Stripe payment-intent recovery that belongs to another player', async () => {
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });

    vi.mocked(prisma.player.findUnique).mockResolvedValue({ accountId: ACCOUNT_ID } as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ premiumExpiresAt: null } as never);
    vi.mocked(prisma.premiumPurchase.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'purchase-4',
        playerId: 'player-2',
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
      } as never);
    vi.mocked(prisma.premiumPurchase.create).mockRejectedValueOnce(p2002);

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
      message: 'Stripe purchase belongs to another player',
      code: 'PURCHASE_PLAYER_MISMATCH',
    });

    expect(prisma.premiumPurchase.create).toHaveBeenCalledTimes(1);
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(prisma.premiumPurchase.findUnique).toHaveBeenCalledTimes(3);
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

describe('confirmSupportPocketrealmCheckoutSession', () => {
  it('grants premium from a paid support checkout session and returns updated status', async () => {
    const expectedWindow = calculatePremiumGrantWindow(null, GRANT_DAYS, NOW);

    vi.mocked(retrieveStripeCheckoutSession).mockResolvedValue({
      id: SESSION_ID,
      payment_status: 'paid',
      amount_total: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
      currency: 'gbp',
      payment_intent: PAYMENT_INTENT_ID,
      metadata: {
        playerId: PLAYER_ID,
        productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
      },
    } as never);
    vi.mocked(prisma.player.findUnique)
      .mockResolvedValueOnce({ accountId: ACCOUNT_ID } as never)
      .mockResolvedValueOnce({
        id: PLAYER_ID,
        account: {
          isPremium: true,
          premiumExpiresAt: expectedWindow.grantedUntil,
        },
      } as never);
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ premiumExpiresAt: null } as never);
    vi.mocked(prisma.premiumPurchase.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.account.update).mockResolvedValue({
      id: ACCOUNT_ID,
      isPremium: true,
      premiumExpiresAt: expectedWindow.grantedUntil,
    } as never);
    vi.mocked(prisma.premiumPurchase.create).mockResolvedValue({
      id: 'purchase-1',
      playerId: PLAYER_ID,
    } as never);

    const result = await confirmSupportPocketrealmCheckoutSession({
      playerId: PLAYER_ID,
      sessionId: SESSION_ID,
      now: NOW,
    });

    expect(retrieveStripeCheckoutSession).toHaveBeenCalledWith(SESSION_ID);
    expect(prisma.premiumPurchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        playerId: PLAYER_ID,
        provider: 'stripe',
        providerSessionId: SESSION_ID,
        providerPaymentIntentId: PAYMENT_INTENT_ID,
      }),
    });
    expect(result).toEqual({
      id: PLAYER_ID,
      isPremium: true,
      premiumExpiresAt: expectedWindow.grantedUntil,
    });
  });
});
