# Launch Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare PocketRealm for public launch with polished PWA, push notifications, error handling, and analytics.

**Architecture:** Four independent workstreams: (1) PWA fundamentals via Serwist service worker + manifest/icons, (2) Web Push notifications via VAPID + new Prisma model + service integration, (3) connection/error state polish via React hooks and error boundaries, (4) Plausible analytics via script tag + custom events.

**Tech Stack:** Serwist (service worker), web-push (Node.js), Web Push API (browser), Plausible Analytics, React error boundaries

---

### Task 1: Fix Manifest & Add iOS Meta Tags

**Files:**
- Modify: `apps/web/public/manifest.json`
- Modify: `apps/web/src/app/layout.tsx`

**Context:** The manifest has wrong theme color (`#0a0a0c` instead of `#0c0a08`), only 2 icon sizes, and missing `id` field. Layout is missing iOS PWA meta tags. Icon image files will be added later by the user — for now, reference the correct paths so the manifest is ready.

**Step 1: Update manifest.json**

Replace `apps/web/public/manifest.json` with:

```json
{
  "id": "/",
  "name": "PocketRealm",
  "short_name": "PocketRealm",
  "description": "Turn-based async RPG",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0c0a08",
  "theme_color": "#0c0a08",
  "icons": [
    { "src": "/icons/icon-48.png", "sizes": "48x48", "type": "image/png" },
    { "src": "/icons/icon-72.png", "sizes": "72x72", "type": "image/png" },
    { "src": "/icons/icon-96.png", "sizes": "96x96", "type": "image/png" },
    { "src": "/icons/icon-128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/icons/icon-144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "/icons/icon-152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "/icons/icon-167.png", "sizes": "167x167", "type": "image/png" },
    { "src": "/icons/icon-180.png", "sizes": "180x180", "type": "image/png" },
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Step 2: Add iOS meta tags to layout.tsx**

In `apps/web/src/app/layout.tsx`, update the `metadata` export to include iOS PWA tags. Add `icons` and `appleWebApp` to the Metadata object:

```typescript
export const metadata: Metadata = {
  title: 'PocketRealm — Turn-Based Async RPG',
  description: 'A turn-based RPG that respects your time. Explore 11 zones, battle 80+ monsters, master 14 crafting skills, and raid world bosses. Play free or go Champion.',
  manifest: '/manifest.json',
  icons: [
    { rel: 'icon', url: '/icons/icon-48.png', sizes: '48x48' },
    { rel: 'icon', url: '/icons/icon-96.png', sizes: '96x96' },
    { rel: 'apple-touch-icon', url: '/icons/icon-180.png', sizes: '180x180' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PocketRealm',
  },
};
```

**Step 3: Create placeholder icons directory**

```bash
mkdir -p apps/web/public/icons
```

Add a `.gitkeep` to track the directory until real icons are added.

**Step 4: Commit**

```bash
git add apps/web/public/manifest.json apps/web/src/app/layout.tsx apps/web/public/icons/.gitkeep
git commit -m "fix: update PWA manifest with full icon set, iOS meta tags, and correct theme color"
```

---

### Task 2: Set Up Serwist Service Worker

**Files:**
- Create: `apps/web/src/app/sw.ts`
- Create: `apps/web/src/app/~offline/page.tsx`
- Modify: `apps/web/next.config.js`
- Modify: `apps/web/package.json` (add dependency)

**Context:** Serwist is the maintained fork of next-pwa. It wraps the Next.js config with `withSerwistInit`, compiles the service worker from `app/sw.ts`, and outputs `public/sw.js`. The offline fallback page at `~offline` is precached and served when the user is offline.

**Step 1: Install Serwist**

```bash
cd apps/web && npm install serwist @serwist/next
```

**Step 2: Create the service worker file**

Create `apps/web/src/app/sw.ts`:

```typescript
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

**Step 3: Create offline fallback page**

Create `apps/web/src/app/~offline/page.tsx`:

```tsx
export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0c0a08',
      color: '#e8e8e0',
      fontFamily: 'serif',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{ color: '#d4a84b', fontSize: '1.5rem', marginBottom: '1rem' }}>
        You are offline
      </h1>
      <p style={{ color: '#8a8878', maxWidth: '320px' }}>
        PocketRealm needs an internet connection to play. Please check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: '1.5rem',
          padding: '0.5rem 1.5rem',
          backgroundColor: '#1e1c18',
          border: '1px solid #3a3830',
          borderRadius: '0.5rem',
          color: '#d4a84b',
          cursor: 'pointer',
          fontSize: '1rem',
        }}
      >
        Retry
      </button>
    </div>
  );
}
```

**Step 4: Update next.config.js**

Replace `apps/web/next.config.js`:

```javascript
const { spawnSync } = require('node:child_process');
const withSerwistInit = require('@serwist/next').default;

const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ?? crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
  reloadOnOnline: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pocketrealm/shared', '@pocketrealm/game-engine'],
};

module.exports = withSerwist(nextConfig);
```

**Step 5: Add `public/sw.js` to `.gitignore`**

The service worker is generated at build time. Add to `apps/web/.gitignore` (create if doesn't exist):

```
sw.js
sw.js.map
swe-worker-*.js
workbox-*.js
```

**Step 6: Verify build**

```bash
cd apps/web && npx next build
```

Expected: build succeeds, `public/sw.js` is generated.

**Step 7: Commit**

```bash
git add apps/web/src/app/sw.ts apps/web/src/app/~offline/page.tsx apps/web/next.config.js apps/web/package.json apps/web/package-lock.json apps/web/.gitignore
git commit -m "feat: add Serwist service worker with offline fallback page"
```

---

### Task 3: Push Notifications — Database Model & Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: migration file (auto-generated by Prisma)

**Context:** New `PushSubscription` model stores browser push subscriptions per player. A player can have multiple subscriptions (different devices). The model follows existing patterns (uuid id, `@@map` for table name, `@@index` for queries).

**Step 1: Add PushSubscription model to schema.prisma**

Add before the `// COMBAT TEMPLATES` section (around line 974):

```prisma
// =============================================================================
// PUSH NOTIFICATIONS
// =============================================================================

model PushSubscription {
  id        String   @id @default(uuid())
  playerId  String   @map("player_id")
  endpoint  String   @db.Text
  p256dh    String   @db.VarChar(255)
  auth      String   @db.VarChar(255)
  createdAt DateTime @default(now()) @map("created_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([playerId, endpoint])
  @@index([playerId])
  @@map("push_subscriptions")
}
```

**Step 2: Add relation to Player model**

In the Player model (around line 106, after `friendMailsReceived`), add:

```prisma
  pushSubscriptions  PushSubscription[]
```

**Step 3: Run migration**

```bash
npm run db:generate
npx prisma migrate dev --name add-push-subscriptions
```

Expected: migration creates `push_subscriptions` table.

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add PushSubscription model for web push notifications"
```

---

### Task 4: Push Notifications — Backend Service

**Files:**
- Create: `apps/api/src/services/pushNotificationService.ts`
- Create: `apps/api/src/services/pushNotificationService.test.ts`
- Modify: `apps/api/package.json` (add `web-push` dependency)

**Context:** The service handles subscribing/unsubscribing push subscriptions and sending notifications. Uses the `web-push` library with VAPID keys from env vars. Auto-cleans expired subscriptions (410/404 responses). Follows existing service patterns (exported functions, Prisma client import from `@pocketrealm/database`).

**Step 1: Install web-push**

```bash
cd apps/api && npm install web-push && npm install -D @types/web-push
```

**Step 2: Write the test file**

Create `apps/api/src/services/pushNotificationService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribe, unsubscribe, getSubscriptionStatus, sendPush } from './pushNotificationService';

// Mock Prisma
vi.mock('@pocketrealm/database', () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock web-push
vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

import { prisma } from '@pocketrealm/database';
import webpush from 'web-push';

const PLAYER_ID = 'player-1';
const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
};

describe('pushNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'test-public';
    process.env.VAPID_PRIVATE_KEY = 'test-private';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  });

  describe('subscribe', () => {
    it('upserts a push subscription', async () => {
      vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue({} as never);
      await subscribe(PLAYER_ID, SUBSCRIPTION);
      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: {
          playerId_endpoint: { playerId: PLAYER_ID, endpoint: SUBSCRIPTION.endpoint },
        },
        create: {
          playerId: PLAYER_ID,
          endpoint: SUBSCRIPTION.endpoint,
          p256dh: SUBSCRIPTION.keys.p256dh,
          auth: SUBSCRIPTION.keys.auth,
        },
        update: {
          p256dh: SUBSCRIPTION.keys.p256dh,
          auth: SUBSCRIPTION.keys.auth,
        },
      });
    });
  });

  describe('unsubscribe', () => {
    it('deletes subscriptions for player', async () => {
      vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 });
      await unsubscribe(PLAYER_ID, SUBSCRIPTION.endpoint);
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { playerId: PLAYER_ID, endpoint: SUBSCRIPTION.endpoint },
      });
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns true when subscription exists', async () => {
      vi.mocked(prisma.pushSubscription.findFirst).mockResolvedValue({} as never);
      const status = await getSubscriptionStatus(PLAYER_ID);
      expect(status).toBe(true);
    });

    it('returns false when no subscription', async () => {
      vi.mocked(prisma.pushSubscription.findFirst).mockResolvedValue(null);
      const status = await getSubscriptionStatus(PLAYER_ID);
      expect(status).toBe(false);
    });
  });

  describe('sendPush', () => {
    it('sends notification to all player subscriptions', async () => {
      const subs = [
        { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
        { id: 's2', endpoint: 'https://push.example.com/2', p256dh: 'key2', auth: 'auth2' },
      ];
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs as never);
      vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

      await sendPush(PLAYER_ID, { title: 'Test', body: 'Hello' });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('removes expired subscriptions on 410', async () => {
      const subs = [
        { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
      ];
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs as never);

      const error = new Error('Gone') as Error & { statusCode: number };
      error.statusCode = 410;
      vi.mocked(webpush.sendNotification).mockRejectedValue(error);

      await sendPush(PLAYER_ID, { title: 'Test', body: 'Hello' });

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/pushNotificationService.test.ts
```

Expected: FAIL (module not found)

**Step 4: Implement the service**

Create `apps/api/src/services/pushNotificationService.ts`:

```typescript
import webpush from 'web-push';
import { prisma } from '@pocketrealm/database';

interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

function initVapid(): void {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

let vapidInitialized = false;

function ensureVapid(): void {
  if (!vapidInitialized) {
    initVapid();
    vapidInitialized = true;
  }
}

export async function subscribe(playerId: string, subscription: PushSubscriptionInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: {
      playerId_endpoint: { playerId, endpoint: subscription.endpoint },
    },
    create: {
      playerId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function unsubscribe(playerId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({
    where: { playerId, endpoint },
  });
}

export async function getSubscriptionStatus(playerId: string): Promise<boolean> {
  const sub = await prisma.pushSubscription.findFirst({
    where: { playerId },
    select: { id: true },
  });
  return sub !== null;
}

export async function sendPush(playerId: string, payload: PushPayload): Promise<void> {
  ensureVapid();

  const subs = await prisma.pushSubscription.findMany({
    where: { playerId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192.png',
    tag: payload.tag,
    data: payload.data,
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 3600, urgency: 'high' },
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }),
  );
}
```

**Step 5: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/pushNotificationService.test.ts
```

Expected: all tests PASS

**Step 6: Commit**

```bash
git add apps/api/src/services/pushNotificationService.ts apps/api/src/services/pushNotificationService.test.ts apps/api/package.json
git commit -m "feat: add push notification service with VAPID web-push"
```

---

### Task 5: Push Notifications — API Routes

**Files:**
- Create: `apps/api/src/routes/notifications.ts`
- Modify: `apps/api/src/index.ts` (register route)

**Context:** Three endpoints: subscribe, unsubscribe, status check. Follows existing route patterns: Router, `authenticate` middleware, `asyncHandler` wrapper, Zod validation. Also exposes the VAPID public key so the frontend can use it for subscription.

**Step 1: Create route file**

Create `apps/api/src/routes/notifications.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { subscribe, unsubscribe, getSubscriptionStatus } from '../services/pushNotificationService';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Subscribe to push notifications
notificationsRouter.post('/subscribe', asyncHandler(async (req, res) => {
  const subscription = subscribeSchema.parse(req.body);
  await subscribe(req.playerId!, subscription);
  res.json({ success: true });
}));

// Unsubscribe from push notifications
notificationsRouter.delete('/unsubscribe', asyncHandler(async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
  await unsubscribe(req.playerId!, endpoint);
  res.json({ success: true });
}));

// Check subscription status
notificationsRouter.get('/status', asyncHandler(async (req, res) => {
  const subscribed = await getSubscriptionStatus(req.playerId!);
  res.json({ subscribed, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}));
```

**Step 2: Register route in index.ts**

In `apps/api/src/index.ts`:

1. Add import at the top (around line 31, after other route imports):
```typescript
import { notificationsRouter } from './routes/notifications';
```

2. Add route registration (around line 122, after `friendsRouter`):
```typescript
app.use('/api/v1/notifications', notificationsRouter);
```

**Step 3: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors

**Step 4: Commit**

```bash
git add apps/api/src/routes/notifications.ts apps/api/src/index.ts
git commit -m "feat: add push notification subscribe/unsubscribe API routes"
```

---

### Task 6: Push Notifications — Integrate with PvP & Boss Services

**Files:**
- Modify: `apps/api/src/routes/pvp.ts`
- Modify: `apps/api/src/services/bossEncounterService.ts`

**Context:** After a PvP match is created, send a push notification to the defender. After a boss round resolves, send push notifications to all participants. Push sending is fire-and-forget (don't block the response). The defender's username is available in the PvP challenge result. Boss participant IDs are available during round resolution.

**Step 1: Add push notification to PvP challenge route**

In `apps/api/src/routes/pvp.ts`, add import at the top:

```typescript
import { sendPush } from '../services/pushNotificationService';
```

After the PvP challenge is recorded (in the `POST /challenge` handler, after the existing `emitAchievementNotifications` call), add:

```typescript
// Fire-and-forget push notification to defender
sendPush(result.defenderId, {
  title: 'PvP Attack!',
  body: `${result.attackerName} challenged you in the arena!`,
  tag: 'pvp-attack',
  data: { type: 'pvp', matchId: result.matchId },
}).catch(() => {});
```

Note: check the actual shape of `result` returned by `challenge()` to use the correct field names. The result includes `defenderId` and attacker info.

**Step 2: Add push notifications to boss round resolution**

In `apps/api/src/services/bossEncounterService.ts`, add import:

```typescript
import { sendPush } from './pushNotificationService';
```

At the end of `resolveBossRound()`, after the round is resolved and system messages are emitted, add notification to all participants:

```typescript
// Notify boss participants
const participants = await prisma.bossParticipant.findMany({
  where: { encounterId: encounter.id },
  select: { playerId: true },
});

const bossName = encounter.mobTemplate.name;
const isDefeated = /* check if boss was killed this round */;
const body = isDefeated
  ? `${bossName} has been defeated!`
  : `A new round against ${bossName} has been resolved.`;

for (const p of participants) {
  sendPush(p.playerId, {
    title: 'Boss Encounter',
    body,
    tag: 'boss-round',
    data: { type: 'boss', encounterId: encounter.id },
  }).catch(() => {});
}
```

Note: adapt to the actual variable names and logic flow in `resolveBossRound()`. The boss defeat check and encounter variable names need to match the existing code.

**Step 3: Verify typecheck**

```bash
cd apps/api && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/pvp.ts apps/api/src/services/bossEncounterService.ts
git commit -m "feat: send push notifications on PvP attacks and boss round resolution"
```

---

### Task 7: Push Notifications — Service Worker Push Handlers

**Files:**
- Modify: `apps/web/src/app/sw.ts`

**Context:** Add `push` and `notificationclick` event listeners to the existing Serwist service worker. The push event shows an OS notification. The notificationclick event opens or focuses the app and navigates to the relevant screen.

**Step 1: Add push event handlers to sw.ts**

After `serwist.addEventListeners();` in `apps/web/src/app/sw.ts`, add:

```typescript
// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  const { title, body, icon, tag, data } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon ?? '/icons/icon-192.png',
      tag,
      data,
      badge: '/icons/icon-96.png',
    }),
  );
});

// Notification click handler — open/focus app and navigate
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  let targetPath = '/game';

  if (data?.type === 'pvp') {
    targetPath = '/game?screen=arena';
  } else if (data?.type === 'boss') {
    targetPath = '/game?screen=boss';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes('/game'));
      if (existing) {
        existing.focus();
        existing.navigate(targetPath);
        return;
      }
      return self.clients.openWindow(targetPath);
    }),
  );
});
```

**Step 2: Commit**

```bash
git add apps/web/src/app/sw.ts
git commit -m "feat: add push and notificationclick handlers to service worker"
```

---

### Task 8: Push Notifications — Frontend Subscription UI

**Files:**
- Create: `apps/web/src/lib/api/notifications.ts`
- Create: `apps/web/src/hooks/usePushNotifications.ts`
- Modify: `apps/web/src/components/screens/Settings.tsx`

**Context:** The frontend needs to: (1) check notification permission status, (2) subscribe/unsubscribe the browser push subscription, (3) send the subscription to the API. Show a toggle in the Settings screen. The VAPID public key is fetched from the `/notifications/status` endpoint.

**Step 1: Create API client functions**

Create `apps/web/src/lib/api/notifications.ts`:

```typescript
import { fetchApi } from './core';

interface NotificationStatus {
  subscribed: boolean;
  vapidPublicKey: string | null;
}

export async function getNotificationStatus() {
  return fetchApi<NotificationStatus>('/notifications/status');
}

export async function subscribePush(subscription: PushSubscriptionJSON) {
  return fetchApi<{ success: boolean }>('/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    }),
  });
}

export async function unsubscribePush(endpoint: string) {
  return fetchApi<{ success: boolean }>('/notifications/unsubscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}
```

**Step 2: Create push notifications hook**

Create `apps/web/src/hooks/usePushNotifications.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { getNotificationStatus, subscribePush, unsubscribePush } from '@/lib/api/notifications';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type PushState = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    getNotificationStatus().then((res) => {
      if (res.data) {
        setVapidKey(res.data.vapidPublicKey);
        setState(res.data.subscribed ? 'subscribed' : 'unsubscribed');
      }
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidKey) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState('denied');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    const json = subscription.toJSON();
    await subscribePush(json);
    setState('subscribed');
  }, [vapidKey]);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState('unsubscribed');
  }, []);

  const toggle = useCallback(async () => {
    if (state === 'subscribed') {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [state, subscribe, unsubscribe]);

  return { state, toggle };
}
```

**Step 3: Add notification toggle to Settings screen**

In `apps/web/src/components/screens/Settings.tsx`:

1. Add to `SettingsProps` interface:
```typescript
  // Notifications
  pushState: 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';
  onPushToggle: () => void;
```

2. Add a "Notifications" section in the JSX (before the Account section):
```tsx
{/* Notifications */}
{pushState !== 'unsupported' && (
  <PixelCard title="Notifications">
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-[var(--rpg-text-primary)]">Push Notifications</span>
        {pushState === 'denied' && (
          <p className="text-xs text-[var(--rpg-red)] mt-0.5">Blocked in browser settings</p>
        )}
      </div>
      <ToggleSwitch
        checked={pushState === 'subscribed'}
        onChange={onPushToggle}
        disabled={pushState === 'loading' || pushState === 'denied'}
      />
    </div>
    <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
      Get notified when you&apos;re attacked in PvP or a boss round resolves.
    </p>
  </PixelCard>
)}
```

3. Update the parent component that renders Settings to pass `pushState` and `onPushToggle` from the `usePushNotifications` hook.

**Step 4: Verify typecheck**

```bash
npx tsc --noEmit --project apps/web/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/api/notifications.ts apps/web/src/hooks/usePushNotifications.ts apps/web/src/components/screens/Settings.tsx
git commit -m "feat: add push notification subscription UI in settings"
```

---

### Task 9: Connection Status Hook & Banner

**Files:**
- Create: `apps/web/src/hooks/useConnectionStatus.ts`
- Create: `apps/web/src/components/common/ConnectionBanner.tsx`

**Context:** Monitor both API reachability (via fetch to `/health`) and Socket.IO connection state. Show a persistent banner when disconnected. Auto-retry. The Socket.IO client at `apps/web/src/lib/socket.ts` already has reconnection configured (10 attempts, 1-5s delay).

**Step 1: Create connection status hook**

Create `apps/web/src/hooks/useConnectionStatus.ts`:

```typescript
import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export function useConnectionStatus(): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connected');

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState('disconnected');
    const onReconnecting = () => setState('reconnecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnecting);

    // Set initial state
    if (!socket.connected) setState('disconnected');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnecting);
    };
  }, []);

  return state;
}
```

**Step 2: Create connection banner component**

Create `apps/web/src/components/common/ConnectionBanner.tsx`:

```tsx
'use client';

import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useEffect, useState } from 'react';

export function ConnectionBanner() {
  const status = useConnectionStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);

  useEffect(() => {
    if (status === 'disconnected' || status === 'reconnecting') {
      setWasDisconnected(true);
    } else if (status === 'connected' && wasDisconnected) {
      setShowReconnected(true);
      setWasDisconnected(false);
      const t = setTimeout(() => setShowReconnected(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status, wasDisconnected]);

  if (status === 'connected' && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--rpg-green-dark)] text-[var(--rpg-text-primary)] text-center text-xs py-1 animate-[slideIn_0.3s_ease-out]">
        Connected
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--rpg-red)] text-[var(--rpg-text-primary)] text-center text-xs py-1">
      {status === 'reconnecting' ? 'Reconnecting...' : 'Connection lost. Reconnecting...'}
    </div>
  );
}
```

**Step 3: Add ConnectionBanner to the game layout**

In the main game page component (likely `apps/web/src/app/game/page.tsx` or the game layout), add:

```tsx
import { ConnectionBanner } from '@/components/common/ConnectionBanner';
// ... inside the component JSX, at the top level:
<ConnectionBanner />
```

**Step 4: Commit**

```bash
git add apps/web/src/hooks/useConnectionStatus.ts apps/web/src/components/common/ConnectionBanner.tsx
git commit -m "feat: add connection status hook and reconnection banner"
```

---

### Task 10: Error Boundary

**Files:**
- Create: `apps/web/src/components/common/ErrorBoundary.tsx`
- Modify: `apps/web/src/app/game/layout.tsx` or the game page wrapper

**Context:** Wrap the game UI in an error boundary so unhandled React errors show a themed fallback instead of a white screen. Uses class component (React requirement for error boundaries).

**Step 1: Create error boundary component**

Create `apps/web/src/components/common/ErrorBoundary.tsx`:

```tsx
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0c0a08',
          color: '#e8e8e0',
          fontFamily: 'serif',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <h1 style={{ color: '#d4a84b', fontSize: '1.5rem', marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#8a8878', maxWidth: '320px', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#1e1c18',
              border: '1px solid #3a3830',
              borderRadius: '0.5rem',
              color: '#d4a84b',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Step 2: Wrap the game layout**

Add the ErrorBoundary around the game page content. Find the game page wrapper and wrap children:

```tsx
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// In the component JSX:
<ErrorBoundary>
  {/* existing game content */}
</ErrorBoundary>
```

**Step 3: Commit**

```bash
git add apps/web/src/components/common/ErrorBoundary.tsx
git commit -m "feat: add React error boundary with themed fallback for game UI"
```

---

### Task 11: Loading Skeleton Component

**Files:**
- Create: `apps/web/src/components/common/LoadingSkeleton.tsx`

**Context:** A reusable skeleton component that matches the RPG theme. Uses CSS animation with the dark surface color pulsing. Provides variants for common layouts (text line, stat bar, card, grid item).

**Step 1: Create loading skeleton component**

Create `apps/web/src/components/common/LoadingSkeleton.tsx`:

```tsx
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[var(--rpg-surface-light)]',
        className,
      )}
    />
  );
}

export function SkeletonLine({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-full', className)} />;
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('border border-[var(--rpg-border)] rounded-lg p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/common/LoadingSkeleton.tsx
git commit -m "feat: add reusable LoadingSkeleton component with RPG theme"
```

---

### Task 12: Plausible Analytics Integration

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/lib/analytics.ts`

**Context:** Plausible is a single script tag. Custom events are sent via `window.plausible()`. Create a thin wrapper so event tracking is type-safe and centralized. The Plausible domain will need to be configured via env var.

**Step 1: Add Plausible script to layout.tsx**

In `apps/web/src/app/layout.tsx`, add the Script import and component:

```typescript
import Script from 'next/script';
```

In the `<head>` section (inside `<html>`, before `<body>`), add:

```tsx
<head>
  {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
    <Script
      defer
      data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
      src="https://plausible.io/js/script.js"
      strategy="afterInteractive"
    />
  )}
</head>
```

**Step 2: Create analytics helper**

Create `apps/web/src/lib/analytics.ts`:

```typescript
type AnalyticsEvent =
  | 'signup'
  | 'tutorial_complete'
  | 'first_combat'
  | 'first_craft'
  | 'pwa_install'
  | 'push_subscribe';

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number> }) => void;
  }
}

export function trackEvent(event: AnalyticsEvent, props?: Record<string, string | number>): void {
  window.plausible?.(event, props ? { props } : undefined);
}
```

**Step 3: Add PWA install tracking**

In the main game page component, add a `beforeinstallprompt` listener:

```typescript
useEffect(() => {
  const handler = () => trackEvent('pwa_install');
  window.addEventListener('appinstalled', handler);
  return () => window.removeEventListener('appinstalled', handler);
}, []);
```

**Step 4: Add `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to `.env.example`**

In `apps/web/.env.example`, add:

```
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
```

**Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/lib/analytics.ts apps/web/.env.example
git commit -m "feat: add Plausible analytics with typed custom event tracking"
```

---

### Task 13: Generate VAPID Keys & Update .env.example

**Files:**
- Modify: `apps/api/.env.example`

**Context:** VAPID keys need to be generated once and stored as env vars. The `web-push` CLI can generate them.

**Step 1: Generate VAPID keys**

```bash
cd apps/api && npx web-push generate-vapid-keys
```

Copy the output. Add to your local `.env`:

```
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:your-email@example.com
```

**Step 2: Update .env.example**

In `apps/api/.env.example`, add:

```
# Push Notifications (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@pocketrealm.com
```

**Step 3: Commit**

```bash
git add apps/api/.env.example
git commit -m "docs: add VAPID env vars to .env.example"
```

---

### Task 14: Final Integration Test & Verification

**Files:** None (testing only)

**Step 1: Run all existing tests**

```bash
npm run test
```

Expected: all tests pass (no regressions)

**Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no new errors

**Step 3: Run dev server and verify**

```bash
npm run dev
```

Manual checks:
- Visit `http://localhost:3002` → app loads normally
- Check DevTools → Application → Manifest → shows correct icons and theme color
- Check DevTools → Application → Service Workers → sw.js registered
- Go offline (DevTools → Network → Offline) → navigate → see offline page
- Go to Settings → notification toggle appears
- Check console for any errors

**Step 4: Build verification**

```bash
npm run build
```

Expected: build succeeds for both web and API
