# Launch Readiness Design

## Scope

Four areas to polish before public launch:
1. PWA fundamentals (icons, manifest, service worker, iOS support)
2. Push notifications (PvP attacks, boss round results)
3. Error & loading states polish
4. Analytics (Plausible)

---

## 1. PWA Fundamentals

### Manifest & Icons
- Fix `manifest.json`: full icon set (48–512px), `maskable` purpose for Android adaptive icons, `id` field
- Fix theme color mismatch → `#0c0a08` everywhere (matches CSS `--rpg-background`)
- Icon sizes needed: 48, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512
- Add `favicon.ico` (multi-size: 16, 32, 48)

### iOS Meta Tags (layout.tsx)
- `apple-touch-icon` → 180px icon
- `apple-mobile-web-app-capable` → `yes`
- `apple-mobile-web-app-status-bar-style` → `black-translucent`
- `apple-mobile-web-app-title` → `PocketRealm`

### Service Worker (Serwist)
- Use Serwist (maintained next-pwa/workbox fork for Next.js)
- Precache: app shell (HTML, CSS, JS bundles, static assets/images)
- Runtime cache: API responses use network-first (no stale data for live game)
- Offline fallback: cached app shell with "You're offline" overlay
- Register via Serwist's Next.js plugin

---

## 2. Push Notifications

### Flow
```
Player opts in → Browser PushSubscription → POST /api/v1/notifications/subscribe → DB
PvP attack / Boss round resolves → API finds subscriptions → web-push sends push
Service Worker push event → OS notification → tap → open PocketRealm to relevant screen
```

### Backend
- Prisma model: `PushSubscription` (playerId, endpoint, p256dh, auth, createdAt)
- Env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Routes:
  - `POST /api/v1/notifications/subscribe`
  - `DELETE /api/v1/notifications/unsubscribe`
  - `GET /api/v1/notifications/status`
- Service: `pushNotificationService.ts` — send push, auto-cleanup expired subscriptions (410 Gone)
- Integration: `pvpService.ts` (after PvP attack), `bossEncounterService.ts` (after boss round)

### Frontend
- Permission prompt: non-intrusive banner after first successful action (not on first visit)
- Settings toggle: notification on/off in player settings
- Service worker: `push` + `notificationclick` event handlers
- `notificationclick` → navigate to `/game` with query param for relevant screen

### Payload
```json
{
  "title": "PvP Attack!",
  "body": "DarkKnight challenged you in the arena!",
  "icon": "/icon-192.png",
  "tag": "pvp-attack",
  "data": { "type": "pvp", "matchId": "abc123" }
}
```

---

## 3. Error & Loading States

### Connection Status
- `useConnectionStatus` hook — monitors API reachability + Socket.IO state
- Disconnected: persistent banner ("Connection lost. Reconnecting...") with auto-retry
- Reconnected: brief "Connected" flash, dismiss
- Disable action buttons while disconnected (disabled state + tooltip)

### Loading Skeletons
- Shared `<LoadingSkeleton>` component with RPG-themed variants (dark surface pulse)
- Audit screens for missing loading states

### Error Boundary
- React error boundary wrapping game layout
- Themed "Something went wrong" fallback with Reload button
- Log errors to console (later to analytics)

### API Error UX
- Consistent error format surfaced via toast system
- Timeout handling: >10s shows "Still working..." indicator

---

## 4. Analytics (Plausible)

### Setup
- Plausible cloud ($9/mo) — single script tag via `next/script`
- Configure for production domain

### Custom Events
- `signup`, `tutorial_complete`, `first_combat`, `first_craft`
- `pwa_install` (via `beforeinstallprompt`), `push_subscribe`
- Session length tracked automatically by Plausible

### Privacy
- No cookies, no personal data, GDPR/CCPA compliant
- No cookie banner needed

---

## Technical Decisions
- **Web Push + VAPID** over FCM — simpler, no external dependency, sufficient for launch scale
- **Serwist** over raw workbox — maintained Next.js integration, less boilerplate
- **Plausible** over PostHog — lighter, privacy-friendly, drop-in for launch
- **App shell caching only** — no offline gameplay (game is server-authoritative)
- **iOS push not supported** — Web Push API doesn't work on iOS Safari without Apple Developer account; Android + desktop covers majority
