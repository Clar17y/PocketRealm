import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';

vi.mock('../services/stripeService', () => ({
  parseStripeWebhookEvent: vi.fn(),
}));

vi.mock('../services/premiumService', () => ({
  grantPremiumDays: vi.fn(),
}));

import { errorHandler } from '../middleware/errorHandler';
import { grantPremiumDays } from '../services/premiumService';
import { parseStripeWebhookEvent } from '../services/stripeService';
import { premiumWebhookRouter } from './premiumWebhook';

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });
  app.use('/api/v1/', (_req, _res, next) => next());
  app.use('/api/v1/premium/webhook', premiumWebhookRouter);
  app.use(express.json());
  app.use(errorHandler);
  return app;
}

describe('premium webhook router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants premium days for checkout.session.completed events', async () => {
    vi.mocked(parseStripeWebhookEvent).mockReturnValue({
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_test_123',
          payment_status: 'paid',
          amount_total: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
          currency: 'gbp',
          payment_intent: 'pi_123',
          metadata: {
            playerId: 'player-1',
            productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
          },
        },
      },
    } as never);
    vi.mocked(grantPremiumDays).mockResolvedValue({
      id: 'purchase-1',
    } as never);

    const res = await request(buildApp())
      .post('/api/v1/premium/webhook/stripe')
      .set('Stripe-Signature', 't=1,v1=sig')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_123"}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(parseStripeWebhookEvent).toHaveBeenCalledWith(expect.any(Buffer), 't=1,v1=sig');
    expect(grantPremiumDays).toHaveBeenCalledWith({
      playerId: 'player-1',
      provider: 'stripe',
      providerSessionId: 'cs_test_123',
      providerPaymentIntentId: 'pi_123',
      amount: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
      currency: 'gbp',
      days: PREMIUM_CONSTANTS.SUPPORT_DURATION_DAYS,
      metadata: {
        eventId: 'evt_123',
        source: 'stripe_checkout',
      },
    });
  });

  it('grants premium days for checkout.session.async_payment_succeeded events', async () => {
    vi.mocked(parseStripeWebhookEvent).mockReturnValue({
      id: 'evt_async_123',
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_test_async',
          payment_status: 'paid',
          amount_total: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
          currency: 'gbp',
          payment_intent: 'pi_async_123',
          metadata: {
            playerId: 'player-1',
            productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
          },
        },
      },
    } as never);
    vi.mocked(grantPremiumDays).mockResolvedValue({
      id: 'purchase-async-1',
    } as never);

    const res = await request(buildApp())
      .post('/api/v1/premium/webhook/stripe')
      .set('Stripe-Signature', 't=1,v1=sig')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_async_123"}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(grantPremiumDays).toHaveBeenCalledWith({
      playerId: 'player-1',
      provider: 'stripe',
      providerSessionId: 'cs_test_async',
      providerPaymentIntentId: 'pi_async_123',
      amount: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
      currency: 'gbp',
      days: PREMIUM_CONSTANTS.SUPPORT_DURATION_DAYS,
      metadata: {
        eventId: 'evt_async_123',
        source: 'stripe_checkout',
      },
    });
  });

  it('ignores unrelated Stripe event types', async () => {
    vi.mocked(parseStripeWebhookEvent).mockReturnValue({
      id: 'evt_456',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
        },
      },
    } as never);

    const res = await request(buildApp())
      .post('/api/v1/premium/webhook/stripe')
      .set('Stripe-Signature', 't=1,v1=sig')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_456"}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(grantPremiumDays).not.toHaveBeenCalled();
  });

  it('does not grant premium days until the checkout session is paid', async () => {
    vi.mocked(parseStripeWebhookEvent).mockReturnValue({
      id: 'evt_789',
      type: 'checkout.session.completed',
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_test_unpaid',
          payment_status: 'unpaid',
          amount_total: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
          currency: 'gbp',
          payment_intent: 'pi_unpaid',
          metadata: {
            playerId: 'player-1',
            productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
          },
        },
      },
    } as never);

    const res = await request(buildApp())
      .post('/api/v1/premium/webhook/stripe')
      .set('Stripe-Signature', 't=1,v1=sig')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_789"}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(grantPremiumDays).not.toHaveBeenCalled();
  });

  it('ignores paid checkout sessions that do not match the support product metadata', async () => {
    vi.mocked(parseStripeWebhookEvent).mockReturnValue({
      id: 'evt_wrong_product',
      type: 'checkout.session.completed',
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_wrong_product',
          payment_status: 'paid',
          amount_total: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
          currency: 'gbp',
          payment_intent: 'pi_wrong_product',
          metadata: {
            playerId: 'player-1',
            productType: 'guild_boost',
          },
        },
      },
    } as never);

    const res = await request(buildApp())
      .post('/api/v1/premium/webhook/stripe')
      .set('Stripe-Signature', 't=1,v1=sig')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_wrong_product"}');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(grantPremiumDays).not.toHaveBeenCalled();
  });

  it('ignores paid checkout sessions with the wrong amount or currency', async () => {
    vi.mocked(parseStripeWebhookEvent).mockReturnValueOnce({
      id: 'evt_wrong_amount',
      type: 'checkout.session.completed',
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_wrong_amount',
          payment_status: 'paid',
          amount_total: 999,
          currency: 'gbp',
          payment_intent: 'pi_wrong_amount',
          metadata: {
            playerId: 'player-1',
            productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
          },
        },
      },
    } as never).mockReturnValueOnce({
      id: 'evt_wrong_currency',
      type: 'checkout.session.completed',
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_wrong_currency',
          payment_status: 'paid',
          amount_total: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
          currency: 'usd',
          payment_intent: 'pi_wrong_currency',
          metadata: {
            playerId: 'player-1',
            productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
          },
        },
      },
    } as never);

    const amountRes = await request(buildApp())
      .post('/api/v1/premium/webhook/stripe')
      .set('Stripe-Signature', 't=1,v1=sig')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_wrong_amount"}');

    const currencyRes = await request(buildApp())
      .post('/api/v1/premium/webhook/stripe')
      .set('Stripe-Signature', 't=1,v1=sig')
      .set('Content-Type', 'application/json')
      .send('{"id":"evt_wrong_currency"}');

    expect(amountRes.status).toBe(200);
    expect(amountRes.body).toEqual({ received: true });
    expect(currencyRes.status).toBe(200);
    expect(currencyRes.body).toEqual({ received: true });
    expect(grantPremiumDays).not.toHaveBeenCalled();
  });
});
