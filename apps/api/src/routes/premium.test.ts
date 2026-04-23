import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/premiumService', () => ({
  getPremiumStatus: vi.fn(),
  listPremiumPurchases: vi.fn(),
  confirmSupportPocketrealmCheckoutSession: vi.fn(),
}));

vi.mock('../services/stripeService', () => ({
  createSupportPocketrealmCheckoutSession: vi.fn(),
}));

import { errorHandler } from '../middleware/errorHandler';
import { generateAccessToken } from '../middleware/auth';
import {
  confirmSupportPocketrealmCheckoutSession,
  getPremiumStatus,
  listPremiumPurchases,
} from '../services/premiumService';
import { createSupportPocketrealmCheckoutSession } from '../services/stripeService';
import { premiumRouter } from './premium';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/premium', premiumRouter);
  app.use(errorHandler);
  return app;
}

describe('premium router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a checkout session for the authenticated player', async () => {
    vi.mocked(createSupportPocketrealmCheckoutSession).mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    const token = generateAccessToken({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'hero',
      seasonId: null,
      role: 'player',
    });

    const res = await request(buildApp())
      .post('/api/v1/premium/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
    expect(createSupportPocketrealmCheckoutSession).toHaveBeenCalledWith({
      playerId: 'player-1',
    });
  });

  it('returns the authenticated player premium status', async () => {
    vi.mocked(getPremiumStatus).mockResolvedValue({
      id: 'player-1',
      isPremium: true,
      premiumExpiresAt: new Date('2026-05-17T12:00:00.000Z'),
    });
    const token = generateAccessToken({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'hero',
      seasonId: null,
      role: 'player',
    });

    const res = await request(buildApp())
      .get('/api/v1/premium/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      premium: {
        id: 'player-1',
        isPremium: true,
        premiumExpiresAt: '2026-05-17T12:00:00.000Z',
      },
    });
    expect(getPremiumStatus).toHaveBeenCalledWith('player-1');
  });

  it('returns the authenticated player premium purchases', async () => {
    vi.mocked(listPremiumPurchases).mockResolvedValue([
      {
        id: 'purchase-1',
        provider: 'stripe',
        amount: 499,
        currency: 'gbp',
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
    ] as never);
    const token = generateAccessToken({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'hero',
      seasonId: null,
      role: 'player',
    });

    const res = await request(buildApp())
      .get('/api/v1/premium/purchases')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      purchases: [
        {
          id: 'purchase-1',
          provider: 'stripe',
          amount: 499,
          currency: 'gbp',
          createdAt: '2026-04-17T12:00:00.000Z',
        },
      ],
    });
    expect(listPremiumPurchases).toHaveBeenCalledWith('player-1');
  });

  it('confirms a Stripe checkout session for the authenticated player', async () => {
    vi.mocked(confirmSupportPocketrealmCheckoutSession).mockResolvedValue({
      id: 'player-1',
      isPremium: true,
      premiumExpiresAt: new Date('2026-05-17T12:00:00.000Z'),
    } as never);
    const token = generateAccessToken({
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'hero',
      seasonId: null,
      role: 'player',
    });

    const res = await request(buildApp())
      .post('/api/v1/premium/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: 'cs_test_123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      premium: {
        id: 'player-1',
        isPremium: true,
        premiumExpiresAt: '2026-05-17T12:00:00.000Z',
      },
    });
    expect(confirmSupportPocketrealmCheckoutSession).toHaveBeenCalledWith({
      playerId: 'player-1',
      sessionId: 'cs_test_123',
    });
  });
});
