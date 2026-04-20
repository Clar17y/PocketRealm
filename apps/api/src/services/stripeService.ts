import Stripe from 'stripe';
import { prisma } from '@pocketrealm/database';
import { PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

const SUCCESS_PATH = '/game?screen=settings&support=success&session_id={CHECKOUT_SESSION_ID}';
const CANCEL_PATH = '/game?screen=settings&support=cancelled';

let stripeClient: Stripe | null = null;

function getStripeSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new AppError(503, 'Stripe is not configured', 'STRIPE_NOT_CONFIGURED');
  }

  return secretKey;
}

function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new AppError(503, 'Stripe webhook is not configured', 'STRIPE_WEBHOOK_NOT_CONFIGURED');
  }

  return webhookSecret;
}

function getAppUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3002';
}

function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey());
  }

  return stripeClient;
}

function supportLineItem(): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    quantity: 1,
    price_data: {
      currency: 'gbp',
      unit_amount: PREMIUM_CONSTANTS.PRICE_GBP_PENCE,
      product_data: {
        name: 'Support Pocketrealm',
        description: `${PREMIUM_CONSTANTS.SUPPORT_DURATION_DAYS} Champion days`,
      },
    },
  };
}

export async function createSupportPocketrealmCheckoutSession(input: { playerId: string }) {
  const player = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: {
      email: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const session = await getStripeClient().checkout.sessions.create({
    mode: 'payment',
    success_url: `${getAppUrl()}${SUCCESS_PATH}`,
    cancel_url: `${getAppUrl()}${CANCEL_PATH}`,
    ...(player.email ? { customer_email: player.email } : {}),
    submit_type: 'donate',
    metadata: {
      playerId: input.playerId,
      source: 'support_pocketrealm_api',
      productType: PREMIUM_CONSTANTS.SUPPORT_PRODUCT_TYPE,
    },
    line_items: [supportLineItem()],
  });

  if (!session.url) {
    throw new AppError(502, 'Stripe checkout session did not include a URL', 'STRIPE_CHECKOUT_URL_MISSING');
  }

  return {
    id: session.id,
    url: session.url,
  };
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  return getStripeClient().checkout.sessions.retrieve(sessionId);
}

export function parseStripeWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  return getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    getStripeWebhookSecret(),
  );
}
