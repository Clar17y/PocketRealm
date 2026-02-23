# Champion Subscription — Design

## Overview

"10% better at everything" premium subscription. Multiplicative bonuses on existing mechanics. No combat power advantages — efficiency and cosmetic perks only.

**Price:** £4.99/month GBP via Stripe Billing. Monthly only at launch. Annual tier deferred until retention data available.

## Perks

### Turn Economy

| Perk | Free | Champion |
|------|------|----------|
| Bank cap | 64,800 (18h) | 95,040 (24h × 1.1) |
| Regen rate | 1.0/sec | 1.1/sec |

Marketed as "10% more turns". The real value is the 24h bank cap — players can sleep without capping out.

### Crafting

| Perk | Free | Champion |
|------|------|----------|
| Crit chance | Base | ×1.1 |

Multiplicative on final crit chance. E.g., if base crit is 15%, Champion gets 16.5%. Stacks with jewellery bonuses (also multiplicative) without compounding into overpowered territory.

### Gathering

| Perk | Free | Champion |
|------|------|----------|
| Yield | Base | ×1.1 |
| Crit chance | Base | ×1.1 |

Gathering crit coming in jewellery update (active worktree). Premium bonus applies the same multiplicative pattern.

### Exploration

| Perk | Free | Champion |
|------|------|----------|
| Cache find chance | 0.01%/turn | ×1.1 (0.011%/turn) |
| Cache contents | Base | ×1.1 items |
| Chest items | Base | ×1.1 items |

More chest items means more recipe rolls, so soulbound recipe chance increases organically without a direct drop rate buff.

### Boss Rewards

| Perk | Free | Champion |
|------|------|----------|
| Trophy quantity | 2–4 | ×1.1 (rounded) |
| XP reward | Base | ×1.1 |
| Recipe drop chance | 15% | 16.5% |
| Rarity bonus | +5 levels | +6 levels |

### Cosmetics

| Perk | Free | Champion |
|------|------|----------|
| Title | Normal | "Champion" (rainbow animated) |
| Leaderboard badge | None | Champion badge |

Rainbow title visible to other players in all social contexts. Leaderboard badge follows existing `isBot`/`isAdmin` pattern — add `isPremium` flag to leaderboard entries.

## Explicitly Excluded

- No extra inventory/equipment slots
- No combat stat boosts
- No PvP advantages
- No exclusive content/zones
- No faster HP regen or reduced rest costs
- No turn purchases (selling turns directly undermines the core game loop)

## Bonus Application

All bonuses are **multiplicative** (`base × 1.1`). Single helper function used everywhere:

```typescript
const PREMIUM_BONUS_MULTIPLIER = 1.1;

function applyPremiumBonus(value: number, isPremium: boolean): number {
  return isPremium ? value * PREMIUM_BONUS_MULTIPLIER : value;
}
```

Stacking rule: premium multiplier applies after all other modifiers (skill level, luck, jewellery). This keeps the bonus consistent and predictable regardless of how many other systems feed into the same value.

## Data Model

New fields on `Player`:

```prisma
isPremium          Boolean   @default(false)
premiumExpiresAt   DateTime?
stripeCustomerId   String?   @unique
stripeSubscriptionId String? @unique
```

`isPremium` is the runtime flag checked by game logic. `premiumExpiresAt` provides a safety net — even if a webhook is missed, a scheduled job can reconcile expired subscriptions.

## Stripe Integration

### Flow

1. Player clicks "Become Champion" in-game
2. Frontend calls `POST /api/v1/premium/checkout`
3. API creates a Stripe Checkout Session (hosted payment page)
4. Player completes payment on Stripe's hosted page
5. Stripe sends `checkout.session.completed` webhook
6. API sets `isPremium = true`, stores Stripe IDs, sets `premiumExpiresAt`
7. Monthly renewal handled by Stripe Billing automatically
8. `invoice.paid` webhook extends `premiumExpiresAt` each cycle
9. Cancellation: `customer.subscription.deleted` webhook sets `isPremium = false`

### Webhooks

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Set `isPremium = true`, store Stripe customer/subscription IDs |
| `invoice.paid` | Extend `premiumExpiresAt` by billing period |
| `invoice.payment_failed` | No immediate action — Stripe retries for ~3 weeks |
| `customer.subscription.deleted` | Set `isPremium = false`, clear `premiumExpiresAt` |

Webhook signature verification via `stripe.webhooks.constructEvent()` on every request.

### Grace Period

Stripe's Smart Retries handle failed payments automatically (~3 week retry window). Premium stays active during retry window. Only revoked when Stripe gives up and fires `customer.subscription.deleted`.

## API Endpoints

```
POST   /api/v1/premium/checkout    → Create Stripe Checkout session, return URL
POST   /api/v1/premium/webhook     → Stripe webhook handler (no auth, signature verified)
GET    /api/v1/premium/status      → Current subscription status + expiry
POST   /api/v1/premium/cancel      → Cancel at end of billing period (not immediate)
```

Webhook endpoint must bypass JSON body parsing — Stripe requires raw body for signature verification.

## Constants

```typescript
export const PREMIUM_CONSTANTS = {
  BONUS_MULTIPLIER: 1.1,
  BANK_CAP: 95_040,        // 24h × 1.1
  REGEN_RATE: 1.1,
  BOSS_RARITY_BONUS: 6,    // base 5 + 1
  PRICE_GBP: 499,          // £4.99 in pence
  STRIPE_PRICE_ID: '',     // Set from env/config
} as const;
```

## Frontend

- Champion badge/icon component (reusable across leaderboard, profile, chat)
- "Become Champion" CTA on dashboard or settings screen
- Subscription management page (status, cancel, payment history via Stripe Customer Portal)
- Rainbow title CSS animation for Champion players
- Premium indicator on player's own UI showing active perks

## Reconciliation

A daily scheduled job checks `premiumExpiresAt` for any players where:
- `isPremium = true` AND `premiumExpiresAt < now`

These get set to `isPremium = false`. This handles edge cases where webhooks are missed or delayed.
