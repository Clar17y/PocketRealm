# Champion Subscription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Champion" premium subscription (£4.99/month via Stripe) that gives 10% multiplicative bonuses to turns, crafting, gathering, exploration, and boss rewards, plus cosmetic perks.

**Architecture:** Premium status stored on the Player model (`isPremium` boolean + `premiumExpiresAt`). Stripe Checkout for payment, webhooks for lifecycle. A shared `applyPremiumBonus()` helper applies the ×1.1 multiplier everywhere. Game-engine functions accept optional overrides so pure functions remain testable without DB access.

**Tech Stack:** Stripe (checkout + billing + webhooks), Prisma migration, Zod validation, Vitest for tests.

**Design doc:** `docs/superpowers/specs/2026-02-23-premium-subscription-design.md`

---

### Task 1: Add PREMIUM_CONSTANTS to Shared Package

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (add after LEADERBOARD_CONSTANTS ~line 521)

**Step 1: Add constants**

Add to `packages/shared/src/constants/gameConstants.ts` after `LEADERBOARD_CONSTANTS`:

```typescript
export const PREMIUM_CONSTANTS = {
  BONUS_MULTIPLIER: 1.1,
  BANK_CAP: 95_040,
  REGEN_RATE: 1.1,
  BOSS_RARITY_BONUS: 6,
  PRICE_GBP: 499,
} as const;
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add PREMIUM_CONSTANTS to shared package"
```

---

### Task 2: Add Premium Helper to Game Engine

**Files:**
- Create: `packages/game-engine/src/premium/premiumBonus.ts`
- Create: `packages/game-engine/src/premium/premiumBonus.test.ts`
- Modify: `packages/game-engine/src/index.ts` (add export)

**Step 1: Write the failing test**

Create `packages/game-engine/src/premium/premiumBonus.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { applyPremiumBonus } from './premiumBonus';

describe('applyPremiumBonus', () => {
  it('returns original value when not premium', () => {
    expect(applyPremiumBonus(100, false)).toBe(100);
  });

  it('multiplies value by 1.1 when premium', () => {
    expect(applyPremiumBonus(100, true)).toBeCloseTo(110);
  });

  it('works with decimal values', () => {
    expect(applyPremiumBonus(0.15, true)).toBeCloseTo(0.165);
  });

  it('returns 0 for 0 input regardless of premium', () => {
    expect(applyPremiumBonus(0, true)).toBe(0);
    expect(applyPremiumBonus(0, false)).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-engine/src/premium/premiumBonus.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `packages/game-engine/src/premium/premiumBonus.ts`:

```typescript
import { PREMIUM_CONSTANTS } from '@adventure/shared';

export function applyPremiumBonus(value: number, isPremium: boolean): number {
  return isPremium ? value * PREMIUM_CONSTANTS.BONUS_MULTIPLIER : value;
}
```

**Step 4: Add export to game-engine index**

Add to `packages/game-engine/src/index.ts`:

```typescript
// Premium
export * from './premium/premiumBonus';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/game-engine/src/premium/premiumBonus.test.ts`
Expected: PASS (4 tests).

**Step 6: Commit**

```bash
git add packages/game-engine/src/premium/ packages/game-engine/src/index.ts
git commit -m "feat: add applyPremiumBonus helper to game-engine"
```

---

### Task 3: Make Turn Calculator Premium-Aware

The turn calculator is a pure function that currently reads `TURN_CONSTANTS` directly. Add optional override parameters so callers can pass premium values without breaking the existing API.

**Files:**
- Modify: `packages/game-engine/src/turns/turnCalculator.ts`
- Modify: `packages/game-engine/src/turns/turnCalculator.test.ts`

**Step 1: Write failing tests for premium overrides**

Add to `packages/game-engine/src/turns/turnCalculator.test.ts`:

```typescript
import { PREMIUM_CONSTANTS } from '@adventure/shared';

describe('calculateAccruedTurns with premium', () => {
  const base = new Date('2025-01-01T00:00:00Z');

  it('uses premium regen rate when provided', () => {
    const later = new Date(base.getTime() + 60_000); // 60 seconds
    const result = calculateAccruedTurns(base, later, PREMIUM_CONSTANTS.REGEN_RATE);
    expect(result).toBeCloseTo(66); // 60 * 1.1
  });
});

describe('calculateCurrentTurns with premium', () => {
  const base = new Date('2025-01-01T00:00:00Z');

  it('uses premium bank cap when provided', () => {
    const later = new Date(base.getTime() + 200_000_000);
    const result = calculateCurrentTurns(0, base, later, PREMIUM_CONSTANTS.REGEN_RATE, PREMIUM_CONSTANTS.BANK_CAP);
    expect(result).toBe(PREMIUM_CONSTANTS.BANK_CAP);
  });
});

describe('calculateTimeToCapMs with premium', () => {
  it('uses premium bank cap when provided', () => {
    const result = calculateTimeToCapMs(0, PREMIUM_CONSTANTS.REGEN_RATE, PREMIUM_CONSTANTS.BANK_CAP);
    const expected = (PREMIUM_CONSTANTS.BANK_CAP / PREMIUM_CONSTANTS.REGEN_RATE) * 1000;
    expect(result).toBeCloseTo(expected);
  });

  it('returns null when at premium cap', () => {
    expect(calculateTimeToCapMs(PREMIUM_CONSTANTS.BANK_CAP, PREMIUM_CONSTANTS.REGEN_RATE, PREMIUM_CONSTANTS.BANK_CAP)).toBeNull();
  });
});
```

**Step 2: Run tests to verify new ones fail**

Run: `npx vitest run packages/game-engine/src/turns/turnCalculator.test.ts`
Expected: New tests FAIL (wrong argument count), existing tests PASS.

**Step 3: Add optional parameters to turn calculator functions**

Modify `packages/game-engine/src/turns/turnCalculator.ts`:

```typescript
import { TURN_CONSTANTS } from '@adventure/shared';

export function calculateAccruedTurns(
  lastRegenAt: Date,
  now: Date = new Date(),
  regenRate: number = TURN_CONSTANTS.REGEN_RATE
): number {
  const elapsedMs = now.getTime() - lastRegenAt.getTime();
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  return Math.floor(elapsedSeconds * regenRate);
}

export function calculateCurrentTurns(
  storedTurns: number,
  lastRegenAt: Date,
  now: Date = new Date(),
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
  bankCap: number = TURN_CONSTANTS.BANK_CAP
): number {
  const accrued = calculateAccruedTurns(lastRegenAt, now, regenRate);
  const total = storedTurns + accrued;
  return Math.min(total, bankCap);
}

export function calculateTimeToCapMs(
  currentTurns: number,
  regenRate: number = TURN_CONSTANTS.REGEN_RATE,
  bankCap: number = TURN_CONSTANTS.BANK_CAP
): number | null {
  if (currentTurns >= bankCap) {
    return null;
  }
  const turnsNeeded = bankCap - currentTurns;
  const secondsNeeded = turnsNeeded / regenRate;
  return secondsNeeded * 1000;
}

// spendTurns and isValidTurnAmount remain unchanged
```

**Step 4: Run all turn calculator tests**

Run: `npx vitest run packages/game-engine/src/turns/turnCalculator.test.ts`
Expected: ALL PASS (existing + new).

**Step 5: Commit**

```bash
git add packages/game-engine/src/turns/
git commit -m "feat: add premium regen rate and bank cap overrides to turn calculator"
```

---

### Task 4: Make Exploration Probability Model Premium-Aware

The `simulateExploration` and `estimateExploration` functions use `EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE` directly. Add an optional override parameter.

**Files:**
- Modify: `packages/game-engine/src/exploration/probabilityModel.ts`
- Modify: `packages/game-engine/src/exploration/probabilityModel.test.ts`

**Step 1: Write failing tests**

Add to `packages/game-engine/src/exploration/probabilityModel.test.ts`:

```typescript
describe('estimateExploration with premium cache chance', () => {
  it('uses boosted hidden cache chance when provided', () => {
    const boostedChance = EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE * 1.1;
    const result = estimateExploration(1000, null, { hiddenCacheChance: boostedChance });
    const expected = cumulativeProbability(boostedChance, 1000);
    expect(result.hiddenCacheChance).toBeCloseTo(expected);
  });
});

describe('simulateExploration with premium cache chance', () => {
  it('accepts hiddenCacheChance override', () => {
    // With chance = 1, every turn triggers a cache
    const outcomes = simulateExploration(5, null, { hiddenCacheChance: 1 });
    const caches = outcomes.filter(o => o.type === 'hidden_cache');
    expect(caches.length).toBe(5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/exploration/probabilityModel.test.ts`
Expected: FAIL — wrong argument count.

**Step 3: Add optional overrides parameter**

Add an options interface and wire it through `simulateExploration` and `estimateExploration`:

```typescript
export interface ExplorationOverrides {
  hiddenCacheChance?: number;
}
```

Update `estimateExploration` signature:
```typescript
export function estimateExploration(
  turns: number,
  zoneExitChance: number | null = null,
  overrides?: ExplorationOverrides
): ExplorationEstimate {
  const hiddenCacheChance = overrides?.hiddenCacheChance ?? EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE;
  // ... use hiddenCacheChance instead of EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE
```

Update `simulateExploration` signature:
```typescript
export function simulateExploration(
  turns: number,
  zoneExitChance: number | null = null,
  overrides?: ExplorationOverrides
): ExplorationOutcome[] {
  const hiddenCacheChance = overrides?.hiddenCacheChance ?? EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE;
  // ... use hiddenCacheChance on line 96 instead of EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE
```

**Step 4: Run all exploration tests**

Run: `npx vitest run packages/game-engine/src/exploration/probabilityModel.test.ts`
Expected: ALL PASS.

**Step 5: Commit**

```bash
git add packages/game-engine/src/exploration/probabilityModel.ts packages/game-engine/src/exploration/probabilityModel.test.ts
git commit -m "feat: add premium hidden cache chance override to exploration model"
```

---

### Task 5: Make Chest Rolls Premium-Aware

Add a `bonusRollMultiplier` parameter to `rollChestMaterialRolls` so premium players get ×1.1 items from chests.

**Files:**
- Modify: `packages/game-engine/src/exploration/encounterChest.ts`
- Modify: `packages/game-engine/src/exploration/encounterChest.test.ts`

**Step 1: Write failing test**

Add to `packages/game-engine/src/exploration/encounterChest.test.ts`:

```typescript
describe('rollChestMaterialRolls with premium multiplier', () => {
  it('multiplies roll result by bonus multiplier', () => {
    // rng returns 0.5 → medium chest base = floor(0.5*(4-2+1))+2 = 3
    // 3 * 1.1 = 3.3 → floor = 3 (no change at this value)
    // rng returns 0.99 → medium chest base = floor(0.99*3)+2 = 4
    // 4 * 1.1 = 4.4 → floor = 4 (no change)
    // Use large chest max: rng=0.99 → floor(0.99*4)+3 = 6, 6*1.1=6.6 → floor = 6
    // Better test: use a multiplier of 2 to make the effect obvious
    const result = rollChestMaterialRolls('large', () => 0.99, 2.0);
    // base = floor(0.99 * 4) + 3 = 6, * 2 = 12
    expect(result).toBe(12);
  });

  it('defaults to 1.0 multiplier (no change)', () => {
    const base = rollChestMaterialRolls('medium', () => 0.5);
    const explicit = rollChestMaterialRolls('medium', () => 0.5, 1.0);
    expect(base).toBe(explicit);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/game-engine/src/exploration/encounterChest.test.ts`
Expected: FAIL.

**Step 3: Add multiplier parameter**

Modify `rollChestMaterialRolls` in `packages/game-engine/src/exploration/encounterChest.ts`:

```typescript
export function rollChestMaterialRolls(
  size: EncounterSiteSize,
  rng: () => number = Math.random,
  bonusMultiplier: number = 1.0
): number {
  const { min, max } = getChestMaterialRollRangeForEncounterSize(size);
  if (min >= max) return Math.floor(min * bonusMultiplier);
  const roll = Math.max(0, Math.min(1, rng()));
  const base = Math.floor(roll * (max - min + 1)) + min;
  return Math.floor(base * bonusMultiplier);
}
```

**Step 4: Run all chest tests**

Run: `npx vitest run packages/game-engine/src/exploration/encounterChest.test.ts`
Expected: ALL PASS.

**Step 5: Commit**

```bash
git add packages/game-engine/src/exploration/encounterChest.ts packages/game-engine/src/exploration/encounterChest.test.ts
git commit -m "feat: add bonus multiplier to chest material rolls for premium"
```

---

### Task 6: Database Migration — Add Premium Fields to Player

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (Player model, ~line 55)

**Step 1: Add fields to Player model**

Add after `activeTitle` (~line 55) in the Player model:

```prisma
  // Premium
  isPremium            Boolean   @default(false) @map("is_premium")
  premiumExpiresAt     DateTime? @map("premium_expires_at")
  stripeCustomerId     String?   @unique @map("stripe_customer_id") @db.VarChar(255)
  stripeSubscriptionId String?   @unique @map("stripe_subscription_id") @db.VarChar(255)
```

**Step 2: Generate and run migration**

Run:
```bash
cd packages/database
npx prisma migrate dev --name add-premium-fields
```
Expected: Migration created and applied.

**Step 3: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma client regenerated with new fields.

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add premium subscription fields to Player model"
```

---

### Task 7: Add Premium Types to Shared Package

**Files:**
- Modify: `packages/shared/src/types/player.types.ts` (add premium fields)

**Step 1: Add isPremium to the Player type**

Check the existing `Player` type in `packages/shared/src/types/player.types.ts` and add:

```typescript
isPremium: boolean;
premiumExpiresAt?: string | null;
```

These should be added to whatever player-facing type is returned by `GET /player`. Check the exact type name and add the fields there.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/shared/src/types/player.types.ts
git commit -m "feat: add premium fields to shared Player type"
```

---

### Task 8: Install Stripe SDK and Add Environment Variables

**Files:**
- Modify: `apps/api/package.json` (add `stripe` dependency)
- Modify: `apps/api/.env.example` (add Stripe env vars)

**Step 1: Install Stripe**

```bash
npm install stripe --workspace=apps/api
```

**Step 2: Add env vars to `.env.example`**

Add to `apps/api/.env.example`:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=http://localhost:3002/game?premium=success
STRIPE_CANCEL_URL=http://localhost:3002/game?premium=cancel
```

**Step 3: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/.env.example
git commit -m "feat: install Stripe SDK and add env var templates"
```

---

### Task 9: Create Premium Service (Stripe Integration)

**Files:**
- Create: `apps/api/src/services/premiumService.ts`
- Create: `apps/api/src/services/premiumService.test.ts`

**Step 1: Write failing tests**

Create `apps/api/src/services/premiumService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../__test__/setup';

// Mock Stripe
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: {
        sessions: { create: vi.fn() },
      },
      subscriptions: { cancel: vi.fn() },
    })),
  };
});

import {
  getPremiumStatus,
  activatePremium,
  deactivatePremium,
} from './premiumService';

beforeEach(() => { vi.clearAllMocks(); });

describe('getPremiumStatus', () => {
  it('returns premium status for a player', async () => {
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({
      isPremium: true,
      premiumExpiresAt: new Date('2026-04-01'),
      stripeSubscriptionId: 'sub_123',
    });
    const result = await getPremiumStatus('player1');
    expect(result.isPremium).toBe(true);
    expect(result.stripeSubscriptionId).toBe('sub_123');
  });
});

describe('activatePremium', () => {
  it('sets isPremium to true and stores Stripe IDs', async () => {
    mockPrisma.player.update.mockResolvedValue({});
    await activatePremium('player1', 'cus_abc', 'sub_xyz', new Date('2026-04-01'));
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'player1' },
        data: expect.objectContaining({
          isPremium: true,
          stripeCustomerId: 'cus_abc',
          stripeSubscriptionId: 'sub_xyz',
        }),
      })
    );
  });
});

describe('deactivatePremium', () => {
  it('sets isPremium to false and clears expiry', async () => {
    mockPrisma.player.update.mockResolvedValue({});
    await deactivatePremium('player1');
    expect(mockPrisma.player.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'player1' },
        data: expect.objectContaining({
          isPremium: false,
          premiumExpiresAt: null,
        }),
      })
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/api/src/services/premiumService.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the service**

Create `apps/api/src/services/premiumService.ts`:

```typescript
import Stripe from 'stripe';
import { prisma } from '@adventure/database';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' });

export async function getPremiumStatus(playerId: string) {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: {
      isPremium: true,
      premiumExpiresAt: true,
      stripeSubscriptionId: true,
    },
  });
  return player;
}

export async function createCheckoutSession(playerId: string, email: string) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: process.env.STRIPE_SUCCESS_URL!,
    cancel_url: process.env.STRIPE_CANCEL_URL!,
    metadata: { playerId },
  });
  return { url: session.url };
}

export async function activatePremium(
  playerId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  premiumExpiresAt: Date
) {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      isPremium: true,
      premiumExpiresAt,
      stripeCustomerId,
      stripeSubscriptionId,
    },
  });
}

export async function extendPremium(stripeSubscriptionId: string, premiumExpiresAt: Date) {
  await prisma.player.update({
    where: { stripeSubscriptionId },
    data: { premiumExpiresAt },
  });
}

export async function deactivatePremium(playerId: string) {
  await prisma.player.update({
    where: { id: playerId },
    data: {
      isPremium: false,
      premiumExpiresAt: null,
    },
  });
}

export async function deactivatePremiumBySubscription(stripeSubscriptionId: string) {
  await prisma.player.update({
    where: { stripeSubscriptionId },
    data: {
      isPremium: false,
      premiumExpiresAt: null,
    },
  });
}

export async function cancelSubscription(playerId: string) {
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { stripeSubscriptionId: true },
  });
  if (!player.stripeSubscriptionId) {
    throw new Error('No active subscription');
  }
  await stripe.subscriptions.update(player.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}
```

Note: Check the correct Stripe API version string at implementation time. Use the latest stable version.

**Step 4: Run tests**

Run: `npx vitest run apps/api/src/services/premiumService.test.ts`
Expected: ALL PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/premiumService.ts apps/api/src/services/premiumService.test.ts
git commit -m "feat: add premium service with Stripe integration"
```

---

### Task 10: Create Premium API Routes

**Files:**
- Create: `apps/api/src/routes/premium.ts`
- Modify: `apps/api/src/index.ts` (register route + raw body middleware)

**Step 1: Create the route file**

Create `apps/api/src/routes/premium.ts`:

```typescript
import { Router, raw } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  getPremiumStatus,
  createCheckoutSession,
  cancelSubscription,
  constructWebhookEvent,
  activatePremium,
  extendPremium,
  deactivatePremiumBySubscription,
} from '../services/premiumService';

const router = Router();

// Webhook — must use raw body, no auth (Stripe signature verification instead)
router.post('/webhook', raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const event = constructWebhookEvent(req.body, sig);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as any;
      const playerId = session.metadata?.playerId;
      if (playerId) {
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // ~30 days
        await activatePremium(playerId, session.customer, session.subscription, periodEnd);
      }
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object as any;
      if (invoice.subscription) {
        const periodEnd = new Date((invoice.lines?.data?.[0]?.period?.end ?? Math.floor(Date.now() / 1000) + 30 * 86400) * 1000);
        await extendPremium(invoice.subscription, periodEnd);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as any;
      await deactivatePremiumBySubscription(subscription.id);
      break;
    }
  }

  res.json({ received: true });
}));

// All routes below require auth
router.use(authenticate);

router.get('/status', asyncHandler(async (req, res) => {
  const status = await getPremiumStatus(req.player!.playerId);
  res.json(status);
}));

router.post('/checkout', asyncHandler(async (req, res) => {
  // Look up player email for Stripe
  const { prisma } = await import('@adventure/database');
  const player = await prisma.player.findUniqueOrThrow({
    where: { id: req.player!.playerId },
    select: { email: true },
  });
  const result = await createCheckoutSession(req.player!.playerId, player.email);
  res.json(result);
}));

router.post('/cancel', asyncHandler(async (req, res) => {
  await cancelSubscription(req.player!.playerId);
  res.json({ success: true, message: 'Subscription will cancel at end of billing period' });
}));

export default router;
```

**Step 2: Register route in index.ts**

Add to `apps/api/src/index.ts` (after other route imports):

```typescript
import premiumRouter from './routes/premium';
```

**IMPORTANT**: The webhook endpoint needs raw body, but the rest of the app uses `express.json()`. The webhook route uses `raw({ type: 'application/json' })` at the route level. Make sure the global `express.json()` middleware is configured to skip the premium webhook path. Add this condition to the existing `app.use(express.json())` call:

```typescript
app.use((req, res, next) => {
  if (req.originalUrl === '/api/v1/premium/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});
```

Register the route:
```typescript
app.use('/api/v1/premium', premiumRouter);
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`
Expected: No errors.

**Step 4: Commit**

```bash
git add apps/api/src/routes/premium.ts apps/api/src/index.ts
git commit -m "feat: add premium API routes (checkout, webhook, status, cancel)"
```

---

### Task 11: Wire Premium Into Turn Bank Service

The turn bank service needs to look up `isPremium` and pass premium regen rate / bank cap to the calculator.

**Files:**
- Modify: `apps/api/src/services/turnBankService.ts`
- Modify: `apps/api/src/services/turnBankService.test.ts`

**Step 1: Write failing test**

Add to `apps/api/src/services/turnBankService.test.ts`:

```typescript
import { PREMIUM_CONSTANTS } from '@adventure/shared';

describe('getTurnState for premium player', () => {
  it('uses premium bank cap and regen rate', async () => {
    const now = new Date('2025-01-01T12:00:00Z');
    const fiveSecondsAgo = new Date(now.getTime() - 5000);

    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 1000,
      lastRegenAt: fiveSecondsAgo,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: true });

    const result = await getTurnState('p1', now);
    // 5 seconds * 1.1 = 5.5 → floor = 5 accrued turns
    expect(result.currentTurns).toBe(1005);
    // Bank cap should be premium cap
    expect(result.bankCap).toBe(PREMIUM_CONSTANTS.BANK_CAP);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/turnBankService.test.ts`
Expected: FAIL.

**Step 3: Modify turnBankService to check isPremium**

In `getTurnState`, look up the player's `isPremium` flag and pass the appropriate constants to the calculator:

```typescript
import { TURN_CONSTANTS, PREMIUM_CONSTANTS } from '@adventure/shared';
import { calculateCurrentTurns, calculateTimeToCapMs } from '@adventure/game-engine';

export async function getTurnState(playerId: string, now = new Date()) {
  const [turnBank, player] = await Promise.all([
    prisma.turnBank.findUnique({ where: { playerId } }),
    prisma.player.findUnique({ where: { id: playerId }, select: { isPremium: true } }),
  ]);

  // ... existing null checks ...

  const regenRate = player?.isPremium ? PREMIUM_CONSTANTS.REGEN_RATE : TURN_CONSTANTS.REGEN_RATE;
  const bankCap = player?.isPremium ? PREMIUM_CONSTANTS.BANK_CAP : TURN_CONSTANTS.BANK_CAP;

  const currentTurns = calculateCurrentTurns(turnBank.currentTurns, turnBank.lastRegenAt, now, regenRate, bankCap);
  const timeToCapMs = calculateTimeToCapMs(currentTurns, regenRate, bankCap);

  return { currentTurns, bankCap, timeToCapMs, regenRate };
}
```

Apply the same pattern to `spendPlayerTurns`, `spendPlayerTurnsTx`, `refundPlayerTurns`, and `refundPlayerTurnsTx` — each must look up (or accept) `isPremium` to use the correct bank cap.

**Step 4: Run all turn bank tests**

Run: `npx vitest run apps/api/src/services/turnBankService.test.ts`
Expected: ALL PASS.

**Step 5: Commit**

```bash
git add apps/api/src/services/turnBankService.ts apps/api/src/services/turnBankService.test.ts
git commit -m "feat: wire premium regen rate and bank cap into turn bank service"
```

---

### Task 12: Wire Premium Into Crafting Route

Follow the existing guild bonus pattern in `apps/api/src/routes/crafting/craft.ts` (~line 169).

**Files:**
- Modify: `apps/api/src/routes/crafting/craft.ts` (~line 164-183)

**Step 1: Add premium crit bonus**

After the guild modifier is applied to `effectiveLuck` (~line 170), add:

```typescript
const player = await prisma.player.findUniqueOrThrow({
  where: { id: playerId },
  select: { isPremium: true },
});
```

Then when calling `calculateCraftingCrit`, if the player is premium, multiply the `luckStat` parameter:

```typescript
const premiumLuckBonus = player.isPremium
  ? Math.floor(PREMIUM_CONSTANTS.BONUS_MULTIPLIER / CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT)
  : 0;
const finalLuck = effectiveLuck + premiumLuckBonus;
```

Or alternatively, apply the premium bonus to the final crit result after `calculateCraftingCrit` returns. Check which approach is cleaner — the simplest option is to multiply the crit chance result by 1.1 after calculation, clamping to `MAX_CRIT_CHANCE`:

```typescript
import { applyPremiumBonus } from '@adventure/game-engine';

// After critResult is calculated:
if (player.isPremium) {
  critResult.critChance = Math.min(
    applyPremiumBonus(critResult.critChance, true),
    CRAFTING_CONSTANTS.MAX_CRIT_CHANCE
  );
  // Re-roll crit using boosted chance if the original roll was close
}
```

**Important:** The crit roll has already happened inside `calculateCraftingCrit`. The cleanest approach is to pass a pre-multiplied crit chance bonus. Look at the exact flow and decide the best injection point at implementation time. The key requirement: premium players get ×1.1 effective crit chance, respecting `MAX_CRIT_CHANCE`.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit apps/api/src/routes/crafting/craft.ts`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/api/src/routes/crafting/craft.ts
git commit -m "feat: apply premium crafting crit bonus"
```

---

### Task 13: Wire Premium Into Gathering Route

Follow the existing guild bonus pattern in `apps/api/src/routes/gathering.ts` (~line 274).

**Files:**
- Modify: `apps/api/src/routes/gathering.ts` (~line 256-287)

**Step 1: Add premium yield bonus**

After the guild gathering yield is applied (~line 275), add the premium multiplier:

```typescript
import { applyPremiumBonus } from '@adventure/game-engine';

// Look up isPremium (may already be available from earlier in the route)
const player = await prisma.player.findUniqueOrThrow({
  where: { id: playerId },
  select: { isPremium: true },
});

// After guildMods yield is applied:
const finalYieldPerAction = player.isPremium
  ? Math.floor(applyPremiumBonus(yieldPerAction, true))
  : yieldPerAction;
```

Use `finalYieldPerAction` in the subsequent `totalYield` calculation.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit apps/api/src/routes/gathering.ts`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/api/src/routes/gathering.ts
git commit -m "feat: apply premium gathering yield bonus"
```

---

### Task 14: Wire Premium Into Exploration Route

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts`

This route calls `simulateExploration` (from game-engine) and then processes chest rolls. Two integration points:

**Step 1: Pass premium cache chance to simulateExploration**

Find where `simulateExploration` is called. Pass the overrides parameter:

```typescript
import { applyPremiumBonus } from '@adventure/game-engine';
import { EXPLORATION_CONSTANTS } from '@adventure/shared';

// Look up isPremium
const player = await prisma.player.findUniqueOrThrow({
  where: { id: playerId },
  select: { isPremium: true },
});

const overrides = player.isPremium
  ? { hiddenCacheChance: applyPremiumBonus(EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE, true) }
  : undefined;

const outcomes = simulateExploration(turns, zoneExitChance, overrides);
```

**Step 2: Apply premium bonus to chest material rolls**

Find where `rollChestMaterialRolls` is called. Pass the multiplier:

```typescript
import { PREMIUM_CONSTANTS } from '@adventure/shared';

const chestMultiplier = player.isPremium ? PREMIUM_CONSTANTS.BONUS_MULTIPLIER : 1.0;
const materialRolls = rollChestMaterialRolls(size, Math.random, chestMultiplier);
```

**Step 3: Apply premium bonus to cache contents**

Find where hidden cache items are granted. Apply the same multiplier to cache item quantity. The cache system is noted as currently having no contents, but wire the multiplier in so it's ready when cache contents are implemented.

**Step 4: Verify it compiles**

Run: `npx tsc --noEmit apps/api/src/routes/exploration/start.ts`
Expected: No errors.

**Step 5: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts
git commit -m "feat: apply premium bonuses to exploration cache and chest rolls"
```

---

### Task 15: Wire Premium Into Boss Loot Service

**Files:**
- Modify: `apps/api/src/services/bossLootService.ts`
- Modify: `apps/api/src/services/bossLootService.test.ts` (if exists)

**Step 1: Add isPremium lookup in distributeBossLoot**

The `distributeBossLoot` function iterates over contributors. For each contributor, look up their premium status and apply bonuses:

```typescript
import { applyPremiumBonus } from '@adventure/game-engine';
import { PREMIUM_CONSTANTS } from '@adventure/shared';

// Inside the per-contributor loop:
const player = await prisma.player.findUniqueOrThrow({
  where: { id: contributor.playerId },
  select: { isPremium: true },
});

// XP: multiply by 1.1 for premium
const finalXp = player.isPremium ? Math.floor(applyPremiumBonus(baseXp, true)) : baseXp;

// Trophy quantity: multiply by 1.1, round
const trophyQty = player.isPremium
  ? Math.round(applyPremiumBonus(baseTrophyQty, true))
  : baseTrophyQty;

// Recipe drop chance: multiply by 1.1
const recipeChance = player.isPremium
  ? applyPremiumBonus(WORLD_EVENT_CONSTANTS.BOSS_RECIPE_DROP_CHANCE, true)
  : WORLD_EVENT_CONSTANTS.BOSS_RECIPE_DROP_CHANCE;

// Rarity bonus: use premium value
const rarityBonus = player.isPremium
  ? PREMIUM_CONSTANTS.BOSS_RARITY_BONUS
  : WORLD_EVENT_CONSTANTS.BOSS_RARITY_BONUS;
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit apps/api/src/services/bossLootService.ts`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/api/src/services/bossLootService.ts
git commit -m "feat: apply premium bonuses to boss loot (XP, trophies, recipe chance, rarity)"
```

---

### Task 16: Add isPremium to Leaderboard Entries

**Files:**
- Modify: `apps/api/src/services/leaderboardService.ts` (LeaderboardEntry interface + metadata)

**Step 1: Add isPremium to LeaderboardEntry interface (~line 78)**

```typescript
export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  characterLevel: number;
  score: number;
  isBot: boolean;
  isAdmin: boolean;
  isPremium: boolean;  // new
  title?: string;
  titleTier?: number;
}
```

**Step 2: Add isPremium to Redis metadata**

In `writeToZset` (~line 204), add `isPremium` to the metadata JSON. In the query that feeds the leaderboard data, select `isPremium` from Player.

In the entry builder (~line 142), add:
```typescript
isPremium: meta.isPremium ?? false,
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit apps/api/src/services/leaderboardService.ts`
Expected: No errors.

**Step 4: Commit**

```bash
git add apps/api/src/services/leaderboardService.ts
git commit -m "feat: add isPremium badge to leaderboard entries"
```

---

### Task 17: Add isPremium to GET /player Response

**Files:**
- Modify: `apps/api/src/routes/player.ts` (~line 31, select clause)

**Step 1: Add isPremium to the select clause**

Add `isPremium: true` and `premiumExpiresAt: true` to the Prisma select in the `GET /player` handler.

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit apps/api/src/routes/player.ts`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/api/src/routes/player.ts
git commit -m "feat: include isPremium in GET /player response"
```

---

### Task 18: Frontend — Premium State in Game Controller

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`
- Modify: `apps/web/src/lib/api.ts` (add premium API calls)

**Step 1: Add isPremium state to useGameController**

Add state:
```typescript
const [isPremium, setIsPremium] = useState(false);
```

In `loadAll`, after `getPlayer()` response is processed, set:
```typescript
setIsPremium(playerRes.data.player.isPremium ?? false);
```

Expose `isPremium` from the hook.

**Step 2: Add premium API functions to api.ts**

```typescript
export async function getPremiumStatus() {
  return fetchApi<{ isPremium: boolean; premiumExpiresAt: string | null; stripeSubscriptionId: string | null }>('/premium/status');
}

export async function createPremiumCheckout() {
  return fetchApi<{ url: string }>('/premium/checkout', { method: 'POST' });
}

export async function cancelPremiumSubscription() {
  return fetchApi<{ success: boolean; message: string }>('/premium/cancel', { method: 'POST' });
}
```

**Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 4: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts apps/web/src/lib/api.ts
git commit -m "feat: add premium state to game controller and API functions"
```

---

### Task 19: Frontend — Champion Badge Component

**Files:**
- Create: `apps/web/src/components/common/ChampionBadge.tsx`

**Step 1: Create the badge component**

```tsx
interface ChampionBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function ChampionBadge({ size = 'sm', className }: ChampionBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold
        bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500
        text-black ${size === 'md' ? 'text-sm px-2 py-1' : ''} ${className ?? ''}`}
    >
      Champion
    </span>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/common/ChampionBadge.tsx
git commit -m "feat: add ChampionBadge component"
```

---

### Task 20: Frontend — Rainbow Title CSS

**Files:**
- Modify: `apps/web/src/app/globals.css` (or wherever RPG theme CSS lives)

**Step 1: Add rainbow animation**

```css
@keyframes rainbow-title {
  0% { color: #ff0000; }
  16% { color: #ff8800; }
  33% { color: #ffff00; }
  50% { color: #00ff00; }
  66% { color: #0088ff; }
  83% { color: #8800ff; }
  100% { color: #ff0000; }
}

.rainbow-title {
  animation: rainbow-title 3s linear infinite;
  font-weight: bold;
}
```

**Step 2: Apply rainbow class wherever player titles are rendered**

Find where `activeTitle` is displayed (likely in leaderboard, profile, or chat). If the title is "Champion", add the `rainbow-title` class.

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: add rainbow title CSS animation for Champion subscribers"
```

---

### Task 21: Frontend — Leaderboard Premium Badge

**Files:**
- Modify: `apps/web/src/components/screens/Leaderboard.tsx`

**Step 1: Import and display ChampionBadge**

Find where each leaderboard row is rendered. After the username, conditionally show the badge:

```tsx
import { ChampionBadge } from '../common/ChampionBadge';

// In the row JSX:
{entry.isPremium && <ChampionBadge />}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit apps/web/src/components/screens/Leaderboard.tsx`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/screens/Leaderboard.tsx
git commit -m "feat: show Champion badge on leaderboard entries"
```

---

### Task 22: Frontend — Premium Subscription UI

**Files:**
- Modify: `apps/web/src/components/screens/Dashboard.tsx` (or create a settings section)

**Step 1: Add "Become Champion" CTA**

For non-premium players, show a CTA button that calls `createPremiumCheckout()` and redirects to the returned Stripe URL.

For premium players, show subscription status and a cancel button.

This task is intentionally lighter on specifics because the UI should match the existing game's design patterns. Check `Dashboard.tsx` for how other CTAs/panels are structured and follow the same pattern.

Key elements:
- Premium status indicator (active/inactive)
- "Become Champion — £4.99/mo" button → opens Stripe Checkout
- For active subscribers: expiry date + "Cancel Subscription" button
- List of perks as bullet points

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add apps/web/src/components/screens/Dashboard.tsx
git commit -m "feat: add Champion subscription UI to dashboard"
```

---

### Task 23: Premium Expiry Reconciliation

Add a utility function that can be called periodically to deactivate expired premium subscriptions (safety net for missed webhooks).

**Files:**
- Create: `apps/api/src/services/premiumReconciliation.ts`
- Create: `apps/api/src/services/premiumReconciliation.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { reconcileExpiredPremium } from './premiumReconciliation';

beforeEach(() => { vi.clearAllMocks(); });

describe('reconcileExpiredPremium', () => {
  it('deactivates players with expired premium', async () => {
    mockPrisma.player.updateMany.mockResolvedValue({ count: 3 });
    const result = await reconcileExpiredPremium();
    expect(result.deactivatedCount).toBe(3);
    expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
      where: {
        isPremium: true,
        premiumExpiresAt: { lt: expect.any(Date) },
      },
      data: {
        isPremium: false,
        premiumExpiresAt: null,
      },
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/premiumReconciliation.test.ts`
Expected: FAIL.

**Step 3: Implement**

```typescript
import { prisma } from '@adventure/database';

export async function reconcileExpiredPremium() {
  const result = await prisma.player.updateMany({
    where: {
      isPremium: true,
      premiumExpiresAt: { lt: new Date() },
    },
    data: {
      isPremium: false,
      premiumExpiresAt: null,
    },
  });
  return { deactivatedCount: result.count };
}
```

**Step 4: Run test**

Run: `npx vitest run apps/api/src/services/premiumReconciliation.test.ts`
Expected: PASS.

**Step 5: Wire into a periodic call**

Add to the API startup in `apps/api/src/index.ts`:

```typescript
import { reconcileExpiredPremium } from './services/premiumReconciliation';

// Run reconciliation every hour
setInterval(() => {
  reconcileExpiredPremium().catch(err => console.error('Premium reconciliation failed:', err));
}, 60 * 60 * 1000);
```

**Step 6: Commit**

```bash
git add apps/api/src/services/premiumReconciliation.ts apps/api/src/services/premiumReconciliation.test.ts apps/api/src/index.ts
git commit -m "feat: add hourly premium expiry reconciliation"
```

---

### Task 24: Build, Typecheck, and Full Test Run

**Step 1: Build all packages**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 2: Typecheck everything**

Run: `npm run typecheck`
Expected: No TypeScript errors.

**Step 3: Run all tests**

Run: `npm run test`
Expected: All tests pass (existing + new).

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build/type issues from premium integration"
```

---

## Implementation Notes

### Stripe Setup (Manual, Not Code)
Before testing the integration, you need to:
1. Create a Stripe account (if not already)
2. Create a Product + Price in Stripe Dashboard (£4.99/month, GBP)
3. Copy the Price ID to `STRIPE_PRICE_ID` env var
4. Set up webhook endpoint in Stripe Dashboard pointing to `https://your-api/api/v1/premium/webhook`
5. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`
6. For local dev, use `stripe listen --forward-to localhost:4000/api/v1/premium/webhook`

### Order of Implementation
Tasks 1-5 (shared + game-engine) have no dependencies and can be done in parallel.
Task 6 (migration) should be done before Tasks 9-17 (API layer).
Tasks 7-8 can be done in parallel with Task 6.
Tasks 9-17 (API) should be done before Tasks 18-22 (frontend).
Task 23 (reconciliation) is independent.
Task 24 (final verification) must be last.
