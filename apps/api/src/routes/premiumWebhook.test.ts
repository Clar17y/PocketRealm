import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
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
  app.use('/api/v1/premium/webhook', premiumWebhookRouter);
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
          id: 'cs_test_123',
          payment_intent: 'pi_123',
          metadata: {
            playerId: 'player-1',
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
});
