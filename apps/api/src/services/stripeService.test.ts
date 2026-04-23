import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

const createSession = vi.fn();
const constructEvent = vi.fn();
const retrieveSession = vi.fn();

vi.mock('stripe', () => {
  class Stripe {
    checkout = {
      sessions: {
        create: createSession,
        retrieve: retrieveSession,
      },
    };

    webhooks = {
      constructEvent,
    };
  }

  return { default: Stripe };
});

import { prisma } from '@pocketrealm/database';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import {
  createSupportPocketrealmCheckoutSession,
  parseStripeWebhookEvent,
  retrieveStripeCheckoutSession,
} from './stripeService';

describe('stripeService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      APP_URL: 'https://pocketrealm.gg',
    };
  });

  describe('createSupportPocketrealmCheckoutSession', () => {
    it('creates a one-time checkout session using the server-side player email when present', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue({
        account: {
          email: 'player@example.com',
        },
      } as never);
      createSession.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });

      const session = await createSupportPocketrealmCheckoutSession({
        playerId: 'player-1',
      });

      expect(session).toEqual({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });
      expect(prisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        select: {
          account: {
            select: {
              email: true,
            },
          },
        },
      });
      expect(createSession).toHaveBeenCalledWith({
        mode: 'payment',
        success_url: 'https://pocketrealm.gg/game?screen=settings&support=success&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://pocketrealm.gg/game?screen=settings&support=cancelled',
        customer_email: 'player@example.com',
        submit_type: 'donate',
        metadata: {
          playerId: 'player-1',
          source: 'support_pocketrealm_api',
          productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'gbp',
              unit_amount: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
              product_data: {
                name: 'Support Pocketrealm',
                description: `${PREMIUM_CONSTANTS.SUPPORT_DURATION_DAYS} Champion days`,
              },
            },
          },
        ],
      });
    });

    it('omits customer_email when the player has no email address', async () => {
      vi.mocked(prisma.player.findUnique).mockResolvedValue({
        account: {
          email: null,
        },
      } as never);
      createSession.mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/c/pay/cs_test_456',
      });

      await createSupportPocketrealmCheckoutSession({
        playerId: 'player-1',
      });

      expect(createSession).toHaveBeenCalledWith(
        expect.not.objectContaining({
          customer_email: expect.anything(),
        }),
      );
    });
  });

  describe('parseStripeWebhookEvent', () => {
    it('constructs the Stripe event from the raw request body and signature', () => {
      const payload = Buffer.from('{"id":"evt_123"}');
      const event = {
        id: 'evt_123',
        type: 'checkout.session.completed',
      };
      constructEvent.mockReturnValue(event);

      expect(parseStripeWebhookEvent(payload, 't=1,v1=sig')).toEqual(event);
      expect(constructEvent).toHaveBeenCalledWith(payload, 't=1,v1=sig', 'whsec_123');
    });
  });

  describe('retrieveStripeCheckoutSession', () => {
    it('retrieves a checkout session by id', async () => {
      retrieveSession.mockResolvedValue({
        id: 'cs_test_123',
        payment_status: 'paid',
      });

      const session = await retrieveStripeCheckoutSession('cs_test_123');

      expect(session).toEqual({
        id: 'cs_test_123',
        payment_status: 'paid',
      });
      expect(retrieveSession).toHaveBeenCalledWith('cs_test_123');
    });
  });
});
