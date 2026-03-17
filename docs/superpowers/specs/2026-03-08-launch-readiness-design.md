# Launch Readiness Design (Revised 2026-03-17)

## Scope

Six areas to address before public launch:

| # | Area | Issues |
|---|------|--------|
| 1 | PWA fundamentals (icons, manifest, service worker, iOS support) | [#203](https://github.com/Clar17y/Adventure/issues/203), [#204](https://github.com/Clar17y/Adventure/issues/204) |
| 2 | Push notifications (PvP attacks, boss round results) | [#205](https://github.com/Clar17y/Adventure/issues/205) |
| 3 | Error & connection resilience | [#206](https://github.com/Clar17y/Adventure/issues/206) |
| 4 | Client analytics (Plausible) | [#207](https://github.com/Clar17y/Adventure/issues/207) |
| 5 | Server-side monitoring & observability | [#208](https://github.com/Clar17y/Adventure/issues/208), [#209](https://github.com/Clar17y/Adventure/issues/209), [#210](https://github.com/Clar17y/Adventure/issues/210) |
| 6 | Operational readiness | [#211](https://github.com/Clar17y/Adventure/issues/211) |

---

## Status of Prior Work

Since the original spec (2026-03-08), significant work has landed:

| Area | Status | PRs / Details |
|------|--------|---------------|
| Security audit (43 findings) | **Done** | PRs #122–#140 — TOCTOU fixes, transaction atomicity, Zod validation, request IDs, admin audit log |
| Code health audit | **Done** | PRs #182, #183, #186, #189 — dead code, type safety, error isolation, transaction refactors |
| Database performance | **Done** | PR #173 — Redis caching (equipment stats, guild ID, drop tables), query batching, slim queries |
| Selective refresh / state management | **Done** | PR #199 (#176) — `stateUpdates` replaces `loadAll`, screen-aware polling, inventory delta merging |
| Rate limit UX | **Done** | PR #199 — 429 detection with toast notification |
| Tutorial system | **Done** | Linear 8-step tutorial, screen-specific feature tutorials |
| Error handling improvements | **Partial** | `requestId` on all error responses, Zod → 400 with details, fire-and-forget error logging. Missing: error boundary, connection status hook |
| Image caching | **Done** | 30-day cache headers for optimized images |
| Toast system | **Done** | Quest toasts, rate limit toasts, changelog toasts |

### What remains from original spec:
- PWA fundamentals (manifest incomplete, no service worker, no iOS meta tags, no icons)
- Push notifications (not started)
- Error boundary + connection status (not started)
- Analytics (not started)
- Server-side monitoring (not in original spec)

---

## 1. PWA Fundamentals

### Manifest & Icons
- Fix `manifest.json`: add `id` field, full icon set (48–512px), `maskable` purpose for Android adaptive icons
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

## 3. Error & Connection Resilience

### What exists
- `requestId` on all API error responses (via middleware)
- Zod validation → 400 with field-level detail
- Toast system for rate limits, quests, changelog
- Fire-and-forget operations now log errors instead of swallowing

### Still needed

#### Connection Status
- `useConnectionStatus` hook — monitors API reachability + Socket.IO state
- Disconnected: persistent banner ("Connection lost. Reconnecting...") with auto-retry
- Reconnected: brief "Connected" flash, dismiss
- Disable action buttons while disconnected (disabled state + tooltip)

#### Error Boundary
- React error boundary wrapping game layout
- Themed "Something went wrong" fallback with Reload button
- Log errors to Sentry (see section 5)

#### API Error UX
- Consistent error format surfaced via toast system (partially done — extend to all error paths)
- Timeout handling: >10s shows "Still working..." indicator

---

## 4. Client Analytics (Plausible)

### Setup
- Plausible cloud ($9/mo) — single script tag via `next/script`
- Configure for production domain

### Custom Events
- `signup`, `tutorial_complete`, `first_combat`, `first_craft`
- `pwa_install` (via `beforeinstallprompt`), `push_subscribe`
- `screen_view` with screen name property (track which game tabs see usage)
- Session length tracked automatically by Plausible

### Privacy
- No cookies, no personal data, GDPR/CCPA compliant
- No cookie banner needed

---

## 5. Server-Side Monitoring & Observability

### Structured Logging (pino)
- Replace `console.log` / `console.error` with pino structured logger
- Log format: JSON with `timestamp`, `level`, `requestId`, `playerId`, `route`, `message`
- Log levels: `error` for 5xx + unhandled, `warn` for 4xx + rate limits, `info` for requests + key game events, `debug` for dev only
- Key events to log at `info` level:
  - Player registration, login
  - Combat completion (result, mob, zone)
  - Crafting (recipe, rarity outcome)
  - Boss round resolution
  - Guild creation/dissolution
  - Expedition completion
  - World event spawn/completion
- Request logging middleware: method, path, status, response time (ms), requestId
- Exclude `/health` from request logs (noise)
- Render captures stdout JSON logs automatically — no log transport needed

### Error Tracking (Sentry)
- `@sentry/node` for API, `@sentry/nextjs` for web
- Free tier: 5K errors/mo — sufficient for launch
- API integration: Sentry express error handler after route middleware
- Frontend integration: Sentry error boundary wraps game layout (replaces manual error boundary)
- Capture unhandled rejections + uncaught exceptions
- Attach context: `requestId`, `playerId`, route, release version
- Source maps uploaded at build time for readable stack traces
- Environment tagging: `production` / `staging`

### Health Check Enhancement
- Expand `/health` endpoint to include dependency checks:
  ```json
  {
    "status": "ok",
    "timestamp": "...",
    "version": "0.43.0",
    "uptime": 12345,
    "dependencies": {
      "database": "ok",
      "redis": "ok",
      "socketio": { "connected": 42 }
    }
  }
  ```
- Add `/health/ready` — returns 503 if DB or Redis unreachable (for Render health checks)
- Add `/health/live` — always 200 (process is alive)

### Application Metrics
- Lightweight approach: periodic stats logged as structured JSON (pino), not a full metrics stack
- Every 60s, log a `metrics` event with:
  - `activeConnections` — Socket.IO connected count
  - `activePlayers` — unique playerIds in last 5 min (from Redis)
  - `memoryUsage` — `process.memoryUsage().heapUsed`
  - `eventLoopLag` — via `perf_hooks.monitorEventLoopDelay`
- Key game metrics logged inline (at event time):
  - Combat outcomes per zone (win/loss/flee)
  - Crafting outcomes (success/crit rate)
  - Turn consumption rate
  - API response times (p50, p95 per route — logged every 5 min)

### Uptime Monitoring
- External ping service (free tier): UptimeRobot, Betterstack, or Render's built-in
- Monitor `/health/ready` endpoint every 60s
- Alert channel: Discord webhook or email
- Alert on: endpoint down > 2 consecutive checks, response time > 5s

---

## 6. Operational Readiness

### Environment & Secrets
- Ensure all env vars are documented in `docs/reference/deployment.md`
- Add new vars: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build-time), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PLAUSIBLE_DOMAIN`
- `LOG_LEVEL` env var (default: `info` in production, `debug` in dev)

### Database
- Connection pooling verified (Neon)
- Migration checklist documented
- Backup strategy: Neon automated daily backups (included in plan)

### Release Versioning
- `APP_VERSION` env var set at build time (from `package.json` or git tag)
- Exposed in `/health` response and Sentry release tag
- Changelog system already in place (`apps/web/src/lib/changelog.ts`)

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Service worker | Serwist | Maintained Next.js integration, less boilerplate than raw workbox |
| Push notifications | Web Push + VAPID | Simpler than FCM, no external dependency, sufficient for launch scale |
| Client analytics | Plausible | Lightweight, privacy-friendly, no cookie banner, drop-in |
| Server logging | pino | Fast structured JSON, zero-config with Render log drain |
| Error tracking | Sentry | Free tier sufficient, best-in-class stack traces, built-in error boundary for React |
| Uptime monitoring | External ping | Monitors from outside the infra, catches network/DNS issues too |
| Metrics | Structured log events | Avoids Prometheus/Grafana complexity for launch; upgrade later if needed |
| App shell caching | Cache static only | No offline gameplay — game is server-authoritative |
| iOS push | Not supported at launch | Web Push API requires Apple Developer account on iOS Safari; Android + desktop covers majority |
