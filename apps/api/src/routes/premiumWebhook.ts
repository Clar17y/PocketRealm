import express, { Router } from 'express';
import type Stripe from 'stripe';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { grantPremiumDays } from '../services/premiumService';
import { parseStripeWebhookEvent } from '../services/stripeService';
import { asyncHandler } from '../utils/asyncHandler';

const FULFILLABLE_STRIPE_EVENT_TYPES = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

function getStripeSignature(signature: string | string[] | undefined): string {
  if (typeof signature !== 'string' || signature.length === 0) {
    throw new AppError(400, 'Missing Stripe signature', 'STRIPE_SIGNATURE_MISSING');
  }

  return signature;
}

function getCheckoutSessionPlayerId(metadata: Record<string, string> | null | undefined): string {
  const playerId = metadata?.playerId;

  if (!playerId) {
    throw new AppError(400, 'Stripe checkout session missing playerId metadata', 'STRIPE_PLAYER_ID_MISSING');
  }

  return playerId;
}

function getPaymentIntentId(paymentIntent: string | { id: string } | null): string | null {
  if (typeof paymentIntent === 'string') {
    return paymentIntent;
  }

  if (paymentIntent && typeof paymentIntent === 'object' && 'id' in paymentIntent) {
    const paymentIntentId = paymentIntent.id;
    return typeof paymentIntentId === 'string' ? paymentIntentId : null;
  }

  return null;
}

function isCheckoutSession(object: unknown): object is Stripe.Checkout.Session {
  return (
    typeof object === 'object'
    && object !== null
    && 'object' in object
    && object.object === 'checkout.session'
  );
}

function isSupportPocketrealmSession(session: Stripe.Checkout.Session): boolean {
  return (
    session.payment_status === 'paid'
    && session.metadata?.productType === PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE
    && session.amount_total === PREMIUM_CONSTANTS.PRICE_GBP_PENCE
    && session.currency?.toLowerCase() === 'gbp'
  );
}

export const premiumWebhookRouter = Router();

premiumWebhookRouter.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = getStripeSignature(req.headers['stripe-signature']);
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
    const event = parseStripeWebhookEvent(payload, signature);
    const eventObject = event.data.object;

    if (
      FULFILLABLE_STRIPE_EVENT_TYPES.has(event.type)
      && isCheckoutSession(eventObject)
      && isSupportPocketrealmSession(eventObject)
    ) {
      const playerId = getCheckoutSessionPlayerId(eventObject.metadata);

      await grantPremiumDays({
        playerId,
        provider: 'stripe',
        providerSessionId: eventObject.id,
        providerPaymentIntentId: getPaymentIntentId(eventObject.payment_intent),
        amount: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
        currency: 'gbp',
        days: PREMIUM_CONSTANTS.SUPPORT_DURATION_DAYS,
        metadata: {
          eventId: event.id,
          source: 'stripe_checkout',
        },
      });
    }

    res.json({ received: true });
  }),
);
