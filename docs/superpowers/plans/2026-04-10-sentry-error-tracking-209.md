# Sentry Error Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Sentry error tracking into the API (`@sentry/node` + Express integration) and the Next.js 16 web app (`@sentry/nextjs` client/server/edge configs), reusing the structured pino context (requestId, playerId, route) established in Phase 2.1. Upload source maps at build time, tag releases with `APP_VERSION`, tag environments, and capture unhandled rejections + uncaught exceptions. The React error boundary itself is deferred to Phase 2.5 — this plan leaves Sentry wired so 2.5 can drop in `Sentry.ErrorBoundary`.

**Architecture:**
- API: new `apps/api/src/instrument.ts` imported at the top of `apps/api/src/index.ts` (before any other import). It calls `Sentry.init(...)` with DSN, environment, release (`APP_VERSION`), `tracesSampleRate`, and `beforeSend` scrubbing. A new `sentryContext` middleware runs after `authenticate` / requestId to call `Sentry.setUser` and `Sentry.setTag('requestId', ...)` per request via `Sentry.withScope`. `Sentry.setupExpressErrorHandler(app)` is installed immediately before the existing `errorHandler`. Unhandled rejection + uncaught exception listeners in `instrument.ts` forward to `Sentry.captureException` + logger.
- Web: `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/sentry.server.config.ts`, and `apps/web/sentry.edge.config.ts` created at project root (Next.js 16 conventions). `next.config.mjs` wrapped with `withSentryConfig(...)` at the outermost layer (outside `withPlausibleProxy` + `withSerwist`) so source maps upload during `next build`. `onRequestError = Sentry.captureRequestError` exported from `instrumentation.ts`.
- Release tag: a new shared helper `apps/api/src/constants/appVersion.ts` reads `process.env.APP_VERSION` (falling back to `packages/shared/package.json` version). The web app reads `process.env.NEXT_PUBLIC_APP_VERSION` (exposed at build time).
- Tests: Sentry init itself is hard to unit test, so we (a) mock `@sentry/node` in a smoke test that verifies `instrument.ts` calls `init` with expected options, (b) unit-test the `sentryContext` middleware with a mocked `Sentry.withScope`, and (c) add a manual verification checklist.

**Tech Stack:** `@sentry/node` ^8, `@sentry/nextjs` ^8, existing pino logger, Express 4, Next.js 16 (app router).

**Issue:** #209 | **Branch:** `feat/sentry-error-tracking-209` | **Depends on:** #208 (structured logging, PR #258 — merged)

**Coordination with parallel phases:** Phase 2.4 (#211) owns the canonical `APP_VERSION` build-time injection via `apps/api/src/version.ts` and `apps/web/next.config.mjs` env block. This plan references `appVersion.ts` locally; if 2.4 lands first, replace that helper with `import { APP_VERSION } from './version'` and remove the `constants/appVersion.ts` duplicate.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/instrument.ts` | Top-of-process `Sentry.init` + process-level handlers |
| Create | `apps/api/src/instrument.test.ts` | Smoke test mocking `@sentry/node` |
| Create | `apps/api/src/middleware/sentryContext.ts` | Per-request scope enrichment (user/tags) |
| Create | `apps/api/src/middleware/sentryContext.test.ts` | Scope enrichment tests |
| Create | `apps/api/src/constants/appVersion.ts` | Resolves `APP_VERSION` / fallback (may be replaced by 2.4's `version.ts`) |
| Create | `apps/api/src/constants/appVersion.test.ts` | Version resolution tests |
| Modify | `apps/api/src/index.ts` | Import `./instrument` first; mount context middleware; mount `setupExpressErrorHandler` before `errorHandler` |
| Modify | `apps/api/src/middleware/errorHandler.ts` | Forward non-AppError / 5xx to `Sentry.captureException` with requestId tag |
| Modify | `apps/api/src/middleware/errorHandler.test.ts` | Assert Sentry capture happens for 500s, not 4xx |
| Modify | `apps/api/package.json` | Add `@sentry/node` dep |
| Create | `apps/web/instrumentation.ts` | Registers server/edge configs + `onRequestError` |
| Create | `apps/web/instrumentation-client.ts` | Client-side `Sentry.init` + `onRouterTransitionStart` |
| Create | `apps/web/sentry.server.config.ts` | Server runtime init |
| Create | `apps/web/sentry.edge.config.ts` | Edge runtime init |
| Modify | `apps/web/next.config.mjs` | Wrap with `withSentryConfig` |
| Modify | `apps/web/package.json` | Add `@sentry/nextjs` dep + `SENTRY_AUTH_TOKEN` usage |
| Modify | `docs/reference/deployment.md` | Document new env vars + release version flow (fill in the placeholder rows left by 2.4) |

---

### Task 1: Install Sentry SDKs and add version helper

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Create: `apps/api/src/constants/appVersion.ts`
- Create: `apps/api/src/constants/appVersion.test.ts`

- [ ] **Step 1: Install API dependency**

```bash
npm install -w apps/api @sentry/node@^8
```

- [ ] **Step 2: Install web dependency**

```bash
npm install -w apps/web @sentry/nextjs@^8
```

- [ ] **Step 3: Write appVersion helper test (TDD)**

Create `apps/api/src/constants/appVersion.test.ts`:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { resolveAppVersion } from './appVersion';

const ORIGINAL = process.env.APP_VERSION;

describe('resolveAppVersion', () => {
  beforeEach(() => { delete process.env.APP_VERSION; });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = ORIGINAL;
  });

  it('returns APP_VERSION when set', () => {
    process.env.APP_VERSION = '1.2.3';
    expect(resolveAppVersion()).toBe('1.2.3');
  });

  it('falls back to "unknown" when not set', () => {
    expect(resolveAppVersion()).toBe('unknown');
  });

  it('trims whitespace', () => {
    process.env.APP_VERSION = '  4.5.6  ';
    expect(resolveAppVersion()).toBe('4.5.6');
  });
});
```

- [ ] **Step 4: Implement appVersion helper**

Create `apps/api/src/constants/appVersion.ts`:

```typescript
/**
 * Resolves the deployed application version.
 *
 * Set `APP_VERSION` at build time (e.g. from git tag or package.json).
 * Used as the Sentry release tag and surfaced in /health.
 */
export function resolveAppVersion(): string {
  const raw = process.env.APP_VERSION;
  if (typeof raw !== 'string') return 'unknown';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

export const APP_VERSION = resolveAppVersion();
```

- [ ] **Step 5: Run tests**

```bash
npm test -w apps/api -- --run src/constants/appVersion.test.ts
```

Expected: 3/3 pass.

---

### Task 2: Create API Sentry init module (instrument.ts)

**Files:**
- Create: `apps/api/src/instrument.ts`
- Create: `apps/api/src/instrument.test.ts`

- [ ] **Step 1: Write smoke test (TDD, mocks `@sentry/node`)**

Create `apps/api/src/instrument.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const initMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock('@sentry/node', () => ({
  init: initMock,
  captureException: captureExceptionMock,
}));

describe('instrument', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    initMock.mockReset();
    captureExceptionMock.mockReset();
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('does not call Sentry.init when SENTRY_DSN is missing', async () => {
    delete process.env.SENTRY_DSN;
    await import('./instrument');
    expect(initMock).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with DSN, environment, and release', async () => {
    process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/1';
    process.env.NODE_ENV = 'production';
    process.env.APP_VERSION = '9.9.9';
    await import('./instrument');
    expect(initMock).toHaveBeenCalledTimes(1);
    const opts = initMock.mock.calls[0][0];
    expect(opts.dsn).toBe('https://key@o0.ingest.sentry.io/1');
    expect(opts.environment).toBe('production');
    expect(opts.release).toBe('9.9.9');
    expect(opts.tracesSampleRate).toBeTypeOf('number');
  });

  it('uses staging tag when SENTRY_ENVIRONMENT is set', async () => {
    process.env.SENTRY_DSN = 'https://key@o0.ingest.sentry.io/1';
    process.env.SENTRY_ENVIRONMENT = 'staging';
    await import('./instrument');
    expect(initMock.mock.calls[0][0].environment).toBe('staging');
  });
});
```

- [ ] **Step 2: Implement `apps/api/src/instrument.ts`**

```typescript
// NOTE: This file MUST be imported FIRST in apps/api/src/index.ts
// (before any other import) so Sentry's auto-instrumentation can patch
// Node internals (http, undici, etc.) before Express/Prisma load.

import * as Sentry from '@sentry/node';
import { logger } from './logger';
import { resolveAppVersion } from './constants/appVersion';

const dsn = process.env.SENTRY_DSN;
const environment =
  process.env.SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: resolveAppVersion(),
    // 10% of transactions traced in production, 100% in dev.
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Don't send PII by default — we explicitly attach playerId via setUser.
    sendDefaultPii: false,
    // Drop noisy low-severity events at the SDK boundary.
    beforeSend(event, hint) {
      // Never forward 4xx AppErrors — they're client errors, not bugs.
      const err = hint?.originalException as { statusCode?: number } | undefined;
      if (err && typeof err.statusCode === 'number' && err.statusCode < 500) {
        return null;
      }
      return event;
    },
  });

  logger.info({ environment, release: resolveAppVersion() }, 'Sentry initialized');

  // Process-level safety net. Express's error middleware only catches
  // errors that flow through req/next — this catches rogue promises and
  // anything that escapes async contexts entirely.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection');
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException');
    Sentry.captureException(err);
    // Let the process crash after flushing — Render will restart it.
    Sentry.close(2000).finally(() => process.exit(1));
  });
} else {
  logger.warn('SENTRY_DSN not set — Sentry disabled');
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -w apps/api -- --run src/instrument.test.ts
```

Expected: 3/3 pass.

---

### Task 3: Add per-request Sentry context middleware

**Files:**
- Create: `apps/api/src/middleware/sentryContext.ts`
- Create: `apps/api/src/middleware/sentryContext.test.ts`

- [ ] **Step 1: Write tests (TDD, mocks `@sentry/node`)**

Create `apps/api/src/middleware/sentryContext.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const setUserMock = vi.fn();
const setTagMock = vi.fn();
const setContextMock = vi.fn();

vi.mock('@sentry/node', () => ({
  getCurrentScope: () => ({
    setUser: setUserMock,
    setTag: setTagMock,
    setContext: setContextMock,
  }),
}));

import { sentryContext } from './sentryContext';

function makeReq(over: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/test',
    route: { path: '/test' },
    requestId: 'req-123',
    player: undefined,
    ...over,
  } as unknown as Request;
}

describe('sentryContext middleware', () => {
  beforeEach(() => {
    setUserMock.mockReset();
    setTagMock.mockReset();
    setContextMock.mockReset();
  });

  it('sets requestId tag and route context on every request', () => {
    const req = makeReq();
    const next = vi.fn() as NextFunction;
    sentryContext(req, {} as Response, next);
    expect(setTagMock).toHaveBeenCalledWith('requestId', 'req-123');
    expect(setContextMock).toHaveBeenCalledWith('route', { method: 'GET', path: '/api/v1/test' });
    expect(next).toHaveBeenCalled();
  });

  it('sets Sentry user when req.player is populated', () => {
    const req = makeReq({ player: { playerId: 'p-1', username: 'hero', role: 'player' } });
    sentryContext(req, {} as Response, vi.fn());
    expect(setUserMock).toHaveBeenCalledWith({ id: 'p-1', username: 'hero' });
  });

  it('clears Sentry user when unauthenticated', () => {
    const req = makeReq();
    sentryContext(req, {} as Response, vi.fn());
    expect(setUserMock).toHaveBeenCalledWith(null);
  });

  it('does not throw when requestId is missing', () => {
    const req = makeReq({ requestId: undefined });
    const next = vi.fn();
    expect(() => sentryContext(req, {} as Response, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement middleware**

Create `apps/api/src/middleware/sentryContext.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Enriches the current Sentry scope with request-scoped context so any
 * exception captured during this request is automatically tagged with
 * requestId, playerId, and route. Mirrors the fields attached by the
 * pino request logger (apps/api/src/middleware/requestLogger.ts).
 *
 * Mount AFTER the requestId middleware and AFTER `optionalAuthenticate`
 * so `req.player` is populated when available.
 */
export function sentryContext(req: Request, _res: Response, next: NextFunction): void {
  const scope = Sentry.getCurrentScope();

  if (req.requestId) {
    scope.setTag('requestId', req.requestId);
  }

  scope.setContext('route', {
    method: req.method,
    path: req.path,
  });

  if (req.player?.playerId) {
    scope.setUser({
      id: req.player.playerId,
      username: req.player.username,
    });
  } else {
    scope.setUser(null);
  }

  next();
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -w apps/api -- --run src/middleware/sentryContext.test.ts
```

Expected: 4/4 pass.

---

### Task 4: Wire Sentry into Express bootstrap

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Import `./instrument` FIRST**

At the very top of `apps/api/src/index.ts`, BEFORE any other import, add:

```typescript
// IMPORTANT: Sentry must be initialized before any other import so its
// auto-instrumentation can patch Node internals (http, express, prisma).
import './instrument';
```

Make sure this line appears above `import http from 'http';`.

- [ ] **Step 2: Import the new middleware and Sentry helper**

Add alongside the other middleware imports:

```typescript
import * as Sentry from '@sentry/node';
import { sentryContext } from './middleware/sentryContext';
```

- [ ] **Step 3: Mount `sentryContext` middleware**

Mount it immediately AFTER `app.use(requestLogger);` (line ~112) so `req.requestId` is set, and BEFORE `app.use('/api/v1/', createEndpointLimiter(...))`:

```typescript
app.use(requestLogger);
app.use(sentryContext);
```

- [ ] **Step 4: Install Express error handler before `errorHandler`**

Replace the block:

```typescript
// Error handler
app.use(errorHandler);
```

with:

```typescript
// Sentry's Express error handler — captures errors before our own
// errorHandler formats the response. `beforeSend` in instrument.ts
// drops 4xx AppErrors so only true server errors get reported.
Sentry.setupExpressErrorHandler(app);

// Error handler
app.use(errorHandler);
```

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck -w apps/api
```

Expected: no errors.

---

### Task 5: Forward captured exceptions from errorHandler

**Files:**
- Modify: `apps/api/src/middleware/errorHandler.ts`
- Modify: `apps/api/src/middleware/errorHandler.test.ts`

Rationale: `setupExpressErrorHandler` already captures, but it runs BEFORE our `errorHandler` in the chain. We want to make sure that 5xx fall-throughs and ZodError handling (which becomes a 400 response) reach Sentry with our extra context. We also want to skip `AppError` with statusCode < 500.

- [ ] **Step 1: Update errorHandler test**

In `apps/api/src/middleware/errorHandler.test.ts`, add a mock for `@sentry/node` at the top:

```typescript
import { vi } from 'vitest';

const captureExceptionMock = vi.fn();
vi.mock('@sentry/node', () => ({
  captureException: captureExceptionMock,
}));
```

Add these test cases to the existing `describe` block:

```typescript
beforeEach(() => { captureExceptionMock.mockReset(); });

it('forwards unknown errors to Sentry', () => {
  const err = new Error('boom');
  errorHandler(err, req as Request, res as Response, next);
  expect(captureExceptionMock).toHaveBeenCalledWith(err);
});

it('forwards 5xx AppError to Sentry', () => {
  const err = new AppError(500, 'db down', 'DB_DOWN');
  errorHandler(err, req as Request, res as Response, next);
  expect(captureExceptionMock).toHaveBeenCalledWith(err);
});

it('does NOT forward 4xx AppError to Sentry', () => {
  const err = new AppError(400, 'bad input', 'BAD');
  errorHandler(err, req as Request, res as Response, next);
  expect(captureExceptionMock).not.toHaveBeenCalled();
});

it('does NOT forward ZodError to Sentry', () => {
  const err = new ZodError([{ path: ['x'], message: 'required', code: 'custom' }] as never);
  errorHandler(err, req as Request, res as Response, next);
  expect(captureExceptionMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Update `errorHandler.ts`**

At the top of `apps/api/src/middleware/errorHandler.ts`, import Sentry:

```typescript
import * as Sentry from '@sentry/node';
```

In the `AppError` branch, after the existing logger call, add:

```typescript
if (err.statusCode >= 500) {
  Sentry.captureException(err);
}
```

At the bottom (the unknown error branch), BEFORE the `res.status(500).json(...)` call, add:

```typescript
Sentry.captureException(err);
```

Leave the `ZodError` branch alone — validation errors are 400s and should not reach Sentry.

- [ ] **Step 3: Run tests**

```bash
npm test -w apps/api -- --run src/middleware/errorHandler.test.ts
```

Expected: all existing + 4 new cases pass.

---

### Task 6: Expose APP_VERSION in /health

**Files:**
- Modify: `apps/api/src/index.ts`

Note: if Phase 2.3 or 2.4 already added `version` to `/health`, skip this task. Otherwise:

- [ ] **Step 1: Update health handler**

Replace:

```typescript
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

with:

```typescript
import { APP_VERSION } from './constants/appVersion';
// ...
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  });
});
```

(Move the `APP_VERSION` import to the import block near the top.)

- [ ] **Step 2: Smoke test**

```bash
npm run dev -w apps/api
```

In a second terminal:

```bash
curl http://localhost:4000/health
```

Expected: JSON includes `"version": "unknown"` (or whatever `APP_VERSION` is set to locally).

---

### Task 7: Create Next.js Sentry init files

**Files:**
- Create: `apps/web/instrumentation.ts`
- Create: `apps/web/instrumentation-client.ts`
- Create: `apps/web/sentry.server.config.ts`
- Create: `apps/web/sentry.edge.config.ts`

- [ ] **Step 1: Create `apps/web/instrumentation.ts`**

```typescript
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors thrown from Server Components, middleware, and route handlers.
export const onRequestError = Sentry.captureRequestError;
```

- [ ] **Step 2: Create `apps/web/sentry.server.config.ts`**

```typescript
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment =
  process.env.SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
```

- [ ] **Step 3: Create `apps/web/sentry.edge.config.ts`**

```typescript
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment =
  process.env.SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
```

- [ ] **Step 4: Create `apps/web/instrumentation-client.ts`**

```typescript
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT
  ?? process.env.NODE_ENV
  ?? 'development';

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Session Replay is opt-in later; disable at launch to avoid PII surprises.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Instrument App Router navigations so transactions are linked across pages.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck -w apps/web
```

Expected: no errors.

---

### Task 8: Wrap `next.config.mjs` with `withSentryConfig`

**Files:**
- Modify: `apps/web/next.config.mjs`

- [ ] **Step 1: Update the config**

Replace the current export with (preserving existing `withSerwist` + `withPlausibleProxy` composition):

```javascript
import { spawnSync } from "node:child_process";
import withSerwistInit from "@serwist/next";
import { withPlausibleProxy } from "next-plausible";
import { withSentryConfig } from "@sentry/nextjs";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [
    { url: "/~offline", revision },
    { url: "/icons/icon-96.png", revision },
  ],
  cacheOnNavigation: true,
  disable: process.env.NODE_ENV === "development",
});

const baseConfig = withPlausibleProxy()(withSerwist({
  reactStrictMode: true,
  transpilePackages: ["@pocketrealm/shared", "@pocketrealm/game-engine"],
  images: {
    minimumCacheTTL: 2592000,
  },
}));

export default withSentryConfig(baseConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Source map uploads only happen when authToken is set — safe in dev.
  widenClientFileUpload: true,
  // Don't block `next build` if Sentry upload fails (e.g. offline dev).
  errorHandler: (err) => {
    console.warn('[sentry] source map upload skipped:', err?.message ?? err);
  },
  // Disable logger tree-shake for launch (we want warnings visible).
  disableLogger: false,
});
```

- [ ] **Step 2: Build smoke test**

```bash
npm run build -w apps/web
```

Expected: build succeeds. Without `SENTRY_AUTH_TOKEN` set you should see a warning but no failure. Verify `.next/` is produced.

---

### Task 9: Verify API boots with and without DSN

**Files:** none (manual).

- [ ] **Step 1: Boot without DSN (Sentry disabled path)**

```bash
unset SENTRY_DSN
npm run dev -w apps/api
```

Expected log line: `SENTRY_DSN not set — Sentry disabled`. App serves normally.

- [ ] **Step 2: Boot with fake DSN (init path)**

```bash
SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0" \
  APP_VERSION=test-0.0.1 \
  npm run dev -w apps/api
```

Expected log line: `Sentry initialized` with `environment` + `release`. Hitting `http://localhost:4000/health` should return `"version": "test-0.0.1"`.

---

### Task 10: Run the full API test + typecheck suite

**Files:** none.

- [ ] **Step 1: Run API unit tests**

```bash
npm test -w apps/api -- --run
```

Expected: all existing tests pass plus the 3 new modules (`instrument.test.ts`, `sentryContext.test.ts`, `appVersion.test.ts`).

- [ ] **Step 2: Typecheck monorepo**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 11: Document new env vars in deployment.md

**Files:**
- Modify: `docs/reference/deployment.md`

Note: if Phase 2.4 already landed the env var table with placeholder rows for Sentry vars, just fill in the descriptions. Otherwise add the full section.

- [ ] **Step 1: Add/fill the Sentry env var rows**

In the API env var table, ensure these rows exist with descriptions:

| Var | Where | Notes |
|-----|-------|-------|
| `SENTRY_DSN` | API runtime | Public project DSN. Leave unset to disable. |
| `SENTRY_ENVIRONMENT` | API runtime | Overrides `NODE_ENV` for the Sentry environment tag. Set to `production` / `staging`. |

In the Web env var table, ensure these rows exist:

| Var | Where | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | Build + runtime | Public DSN. Exposed to the browser. |
| `NEXT_PUBLIC_APP_VERSION` | Build | Release tag mirroring the API `APP_VERSION`. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Build | Optional override for the environment tag. |
| `SENTRY_AUTH_TOKEN` | **Build only** | Personal/Project auth token used to upload source maps during `next build`. Never expose to the browser. |
| `SENTRY_ORG` | Build only | Sentry org slug. |
| `SENTRY_PROJECT` | Build only | Sentry project slug. |

- [ ] **Step 2: Sanity check**

Open `docs/reference/deployment.md` and confirm the new entries render cleanly under the existing headings.

---

### Task 12: Manual verification against Sentry dashboard

**Files:** none (runbook / manual QA).

This task does NOT block the PR merge if Sentry credentials are unavailable at review time, but MUST be executed on staging immediately after deploy.

- [ ] **Step 1: Prepare a disposable route for the smoke test**

Temporarily add a debug route to `apps/api/src/index.ts` behind an env flag (REMOVE before merging):

```typescript
if (process.env.SENTRY_DEBUG === '1') {
  app.get('/debug-sentry', () => {
    throw new Error('Sentry API smoke test');
  });
}
```

- [ ] **Step 2: Boot API with real DSN**

```bash
SENTRY_DSN="<real-staging-dsn>" \
  SENTRY_ENVIRONMENT=staging \
  APP_VERSION=sentry-smoke-1 \
  SENTRY_DEBUG=1 \
  npm run dev -w apps/api
```

- [ ] **Step 3: Trigger the error**

```bash
curl http://localhost:4000/debug-sentry
```

Expected: 500 response. Within ~30 seconds a new issue appears in Sentry
→ Project → Issues tagged `environment:staging`, `release:sentry-smoke-1`,
with the stack trace pointing to `index.ts`.

- [ ] **Step 4: Verify context enrichment**

In the Sentry issue detail, confirm:
- `Tags` panel contains `requestId` (UUID) and `environment`.
- `Contexts → route` shows `{ method: "GET", path: "/debug-sentry" }`.
- `User` panel is empty (request was unauthenticated).

- [ ] **Step 5: Verify authenticated request enrichment**

Log in through the web app, then trigger a 500 via an authenticated
endpoint (e.g. temporarily throw in a dev-only route behind `SENTRY_DEBUG=1`).
Confirm the Sentry issue's `User` panel shows `{ id: <playerId>, username: <name> }`.

- [ ] **Step 6: Verify web-side capture**

With the browser app running against a DSN-enabled build, open DevTools
and run:

```javascript
throw new Error('Sentry web smoke test');
```

Expected: a new issue appears in Sentry tagged as the web project with
a readable stack trace (source maps uploaded).

- [ ] **Step 7: Remove the debug route**

Delete the `SENTRY_DEBUG` block from `apps/api/src/index.ts`. Verify with:

```bash
git diff apps/api/src/index.ts
```

- [ ] **Step 8: Document the outcome**

Comment on issue #209 with:
- Link to the API smoke-test Sentry issue.
- Link to the web smoke-test Sentry issue.
- Confirmation that `requestId`, `playerId`, `route`, `release`, and `environment` all appeared correctly.

---

### Task 13: Leave a hook for Phase 2.5 (React error boundary)

**Files:** none (documentation only — commit message).

Phase 2.5 (`feat/error-boundary-connection-status`) will wrap the game
layout in `Sentry.ErrorBoundary`. This plan intentionally does NOT add
that boundary. When 2.5 starts, the consumer will:

```typescript
import * as Sentry from '@sentry/nextjs';

<Sentry.ErrorBoundary fallback={<GameCrashFallback />} showDialog={false}>
  {children}
</Sentry.ErrorBoundary>
```

- [ ] **Step 1: In the PR description**, add a "Follow-ups" section that explicitly lists:
  - "React error boundary (`Sentry.ErrorBoundary`) — tracked in Phase 2.5 (`feat/error-boundary-connection-status`)."
  - "Session Replay — deferred until after launch; sample rates set to 0."
  - "Performance tracing sample rate (10%) — revisit once we have real traffic data."

No code change.

---

### Task 14: Open PR

**Files:** none.

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/sentry-error-tracking-209
```

- [ ] **Step 2: Open PR with the following description template**

```
## Summary
- Wires `@sentry/node` into the Express API via a top-of-process `instrument.ts`, new `sentryContext` middleware, and `Sentry.setupExpressErrorHandler` before the existing `errorHandler`.
- Wires `@sentry/nextjs` into the web app via `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and `withSentryConfig` in `next.config.mjs`.
- Source maps upload at build time via `SENTRY_AUTH_TOKEN`; releases tagged with `APP_VERSION` (API) / `NEXT_PUBLIC_APP_VERSION` (web); environment tagged from `SENTRY_ENVIRONMENT` or `NODE_ENV`.
- Per-request scope enrichment attaches `requestId`, route, and `playerId` — mirrors the pino request logger added in #208.
- Captures unhandled rejections + uncaught exceptions at process level.
- Documents all new env vars in `docs/reference/deployment.md`.

## Test plan
- [x] `npm test -w apps/api -- --run` (new: appVersion, instrument, sentryContext, errorHandler capture cases)
- [x] `npm run typecheck`
- [x] `npm run build -w apps/web` succeeds with and without `SENTRY_AUTH_TOKEN`
- [ ] Manual smoke: `/debug-sentry` error appears in Sentry staging dashboard with requestId/route tags (runbook: Task 12)
- [ ] Manual smoke: authenticated 500 attaches user context
- [ ] Manual smoke: browser `throw new Error(...)` appears in web Sentry project with readable stack trace

## Follow-ups
- React `Sentry.ErrorBoundary` — Phase 2.5 (`feat/error-boundary-connection-status`)
- Session Replay — deferred post-launch
- Re-tune `tracesSampleRate` once real traffic baselines exist
```

- [ ] **Step 3: Link issue #209 and request review.**
