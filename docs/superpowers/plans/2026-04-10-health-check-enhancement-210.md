# Health Check Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `/health` with dependency details, add `/health/ready` (DB + Redis probe returning 503 on failure) and `/health/live` (always 200), introduce an `APP_VERSION` env var, and document the new endpoints + external uptime monitor setup.

**Architecture:** Extract the `/health*` handlers from `apps/api/src/index.ts` into a new `apps/api/src/routes/health.ts` router to keep `index.ts` slim and make the handlers unit-testable. A small `healthChecks.ts` helper holds the dependency probes so they can be mocked in isolation. Prisma uses `SELECT 1` via `$queryRaw` (cheapest possible liveness query); Redis uses `redis.ping()`. Socket.IO count is sourced from the existing `io.sockets.sockets.size` pattern already used in `metricsLogger.ts`. `requestLogger` already skips `/health*` (see `requestLogger.test.ts` lines 78–102) so the new endpoints will not spam logs.

**Tech Stack:** Express 4, Prisma (`@pocketrealm/database`), ioredis, Socket.IO, vitest, supertest (new dev dep for HTTP-level route tests).

**Spec:** `docs/superpowers/specs/2026-03-08-launch-readiness-design.md` §5 "Health Check Enhancement"
**Sprint Plan:** `docs/superpowers/plans/2026-04-06-pre-launch-sprint-plan.md` §2.3
**Issue:** #210 | **Branch:** `feat/health-check-enhancement-210`

**Coupling note:** Sprint item 2.4 (`#211 Operational readiness`) also lists `APP_VERSION`. We define and wire it here because `/health` requires it now; 2.4 should treat the env var as already present and only document it alongside the other operational env vars. If 2.4 lands its `apps/api/src/version.ts` first, import `APP_VERSION` from there instead of reading `process.env.APP_VERSION` inline.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/routes/health.ts` | Express router exposing `/health`, `/health/ready`, `/health/live` |
| Create | `apps/api/src/routes/health.test.ts` | Supertest-level tests for the router (all 5 required tests) |
| Create | `apps/api/src/services/healthChecks.ts` | `checkDatabase()`, `checkRedis()`, `getSocketIoStats()` helpers |
| Create | `apps/api/src/services/healthChecks.test.ts` | Unit tests for each probe helper |
| Modify | `apps/api/src/index.ts` | Mount health router, remove the inline `/health` handler |
| Modify | `apps/api/package.json` | Add `supertest` + `@types/supertest` dev deps |
| Modify | `docs/reference/deployment.md` | Document `APP_VERSION` env var, new endpoints, external uptime monitor setup |

---

## Task 1: Add supertest dev dependency

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install supertest**

```bash
npm install -w apps/api -D supertest @types/supertest
```

- [ ] **Step 2: Verify it resolves**

```bash
npx -w apps/api vitest --version
```

Expected: version prints without error.

**Commit:** `chore(api): add supertest for route-level tests`

---

## Task 2: Create healthChecks helper (RED)

**Files:**
- Create: `apps/api/src/services/healthChecks.test.ts`

- [ ] **Step 1: Write failing tests for the three probe helpers**

Create `apps/api/src/services/healthChecks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('../redis', () => ({
  redis: { ping: vi.fn() },
}));

import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { checkDatabase, checkRedis, getSocketIoStats } from './healthChecks';

describe('healthChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkDatabase', () => {
    it('returns "ok" when SELECT 1 succeeds', async () => {
      (prisma.$queryRaw as any).mockResolvedValueOnce([{ one: 1 }]);
      await expect(checkDatabase()).resolves.toBe('ok');
    });

    it('returns "error" when Prisma throws', async () => {
      (prisma.$queryRaw as any).mockRejectedValueOnce(new Error('connection refused'));
      await expect(checkDatabase()).resolves.toBe('error');
    });
  });

  describe('checkRedis', () => {
    it('returns "ok" when ping returns PONG', async () => {
      (redis.ping as any).mockResolvedValueOnce('PONG');
      await expect(checkRedis()).resolves.toBe('ok');
    });

    it('returns "error" when ping rejects', async () => {
      (redis.ping as any).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      await expect(checkRedis()).resolves.toBe('error');
    });

    it('returns "error" when ping resolves with unexpected value', async () => {
      (redis.ping as any).mockResolvedValueOnce('');
      await expect(checkRedis()).resolves.toBe('error');
    });
  });

  describe('getSocketIoStats', () => {
    it('returns { connected: 0 } when io is null', () => {
      expect(getSocketIoStats(null)).toEqual({ connected: 0 });
    });

    it('returns connected count from io.sockets.sockets.size', () => {
      const io = { sockets: { sockets: { size: 42 } } } as any;
      expect(getSocketIoStats(io)).toEqual({ connected: 42 });
    });
  });
});
```

- [ ] **Step 2: Run the tests — expect failure (module not found)**

```bash
npx -w apps/api vitest run src/services/healthChecks.test.ts
```

Expected: fails with `Cannot find module './healthChecks'`.

---

## Task 3: Implement healthChecks helper (GREEN)

**Files:**
- Create: `apps/api/src/services/healthChecks.ts`

- [ ] **Step 1: Implement the three helpers**

Create `apps/api/src/services/healthChecks.ts`:

```ts
import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { logger } from '../logger';

export type DependencyStatus = 'ok' | 'error';

export async function checkDatabase(): Promise<DependencyStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (err) {
    logger.warn({ err }, 'Health check: database probe failed');
    return 'error';
  }
}

export async function checkRedis(): Promise<DependencyStatus> {
  try {
    const reply = await redis.ping();
    return reply === 'PONG' ? 'ok' : 'error';
  } catch (err) {
    logger.warn({ err }, 'Health check: redis probe failed');
    return 'error';
  }
}

export function getSocketIoStats(io: SocketServer | null): { connected: number } {
  if (!io) return { connected: 0 };
  return { connected: io.sockets.sockets.size };
}
```

- [ ] **Step 2: Run the tests — expect pass**

```bash
npx -w apps/api vitest run src/services/healthChecks.test.ts
```

Expected: all 7 tests pass.

**Commit:** `feat(api): add healthChecks helper for db/redis/socketio probes`

---

## Task 4: Write health router tests (RED)

**Files:**
- Create: `apps/api/src/routes/health.test.ts`

- [ ] **Step 1: Write failing tests covering the 5 required scenarios plus one shape test**

Create `apps/api/src/routes/health.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/healthChecks', () => ({
  checkDatabase: vi.fn(),
  checkRedis: vi.fn(),
  getSocketIoStats: vi.fn(),
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => null),
}));

import { checkDatabase, checkRedis, getSocketIoStats } from '../services/healthChecks';
import { healthRouter } from './health';

function buildApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

describe('health router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_VERSION = '1.2.3-test';
  });

  describe('GET /health/live', () => {
    it('always returns 200 { status: "ok" } without touching dependencies', async () => {
      const res = await request(buildApp()).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(checkDatabase).not.toHaveBeenCalled();
      expect(checkRedis).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when DB + Redis are ok', async () => {
      (checkDatabase as any).mockResolvedValueOnce('ok');
      (checkRedis as any).mockResolvedValueOnce('ok');

      const res = await request(buildApp()).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        dependencies: { database: 'ok', redis: 'ok' },
      });
    });

    it('returns 503 when database check throws/errors', async () => {
      (checkDatabase as any).mockResolvedValueOnce('error');
      (checkRedis as any).mockResolvedValueOnce('ok');

      const res = await request(buildApp()).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.dependencies.database).toBe('error');
      expect(res.body.dependencies.redis).toBe('ok');
    });

    it('returns 503 when Redis ping fails', async () => {
      (checkDatabase as any).mockResolvedValueOnce('ok');
      (checkRedis as any).mockResolvedValueOnce('error');

      const res = await request(buildApp()).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.dependencies.database).toBe('ok');
      expect(res.body.dependencies.redis).toBe('error');
    });
  });

  describe('GET /health', () => {
    it('returns expected shape with timestamp, version, uptime, dependencies', async () => {
      (checkDatabase as any).mockResolvedValueOnce('ok');
      (checkRedis as any).mockResolvedValueOnce('ok');
      (getSocketIoStats as any).mockReturnValueOnce({ connected: 7 });

      const res = await request(buildApp()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        version: '1.2.3-test',
        dependencies: {
          database: 'ok',
          redis: 'ok',
          socketio: { connected: 7 },
        },
      });
      expect(typeof res.body.timestamp).toBe('string');
      expect(Number.isFinite(Date.parse(res.body.timestamp))).toBe(true);
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('returns status "degraded" and 200 when a dependency is down (aggregate view, not probe)', async () => {
      (checkDatabase as any).mockResolvedValueOnce('error');
      (checkRedis as any).mockResolvedValueOnce('ok');
      (getSocketIoStats as any).mockReturnValueOnce({ connected: 0 });

      const res = await request(buildApp()).get('/health');

      // /health is informational; /health/ready is the 503 gate.
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
      expect(res.body.dependencies.database).toBe('error');
    });

    it('falls back to "unknown" when APP_VERSION is unset', async () => {
      delete process.env.APP_VERSION;
      (checkDatabase as any).mockResolvedValueOnce('ok');
      (checkRedis as any).mockResolvedValueOnce('ok');
      (getSocketIoStats as any).mockReturnValueOnce({ connected: 0 });

      const res = await request(buildApp()).get('/health');

      expect(res.body.version).toBe('unknown');
    });
  });
});
```

- [ ] **Step 2: Run tests — expect failure (router not implemented)**

```bash
npx -w apps/api vitest run src/routes/health.test.ts
```

Expected: module-not-found for `./health`.

---

## Task 5: Implement health router (GREEN)

**Files:**
- Create: `apps/api/src/routes/health.ts`

- [ ] **Step 1: Implement the router**

Create `apps/api/src/routes/health.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import { checkDatabase, checkRedis, getSocketIoStats } from '../services/healthChecks';
import { getIo } from '../socket';

export const healthRouter = Router();

/**
 * Liveness probe — always 200 while the process is alive.
 * Does NOT touch dependencies. Safe for high-frequency polling from orchestrators.
 */
healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Readiness probe — 200 when DB + Redis are reachable, 503 otherwise.
 * Used by Render and external uptime monitors (see docs/reference/deployment.md).
 */
healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = database === 'ok' && redis === 'ok';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'error',
    dependencies: { database, redis },
  });
});

/**
 * Full health view — informational snapshot including version, uptime, socket count.
 * Always returns 200 (use /health/ready for a hard gate).
 */
healthRouter.get('/health', async (_req: Request, res: Response) => {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const socketio = getSocketIoStats(getIo());
  const degraded = database !== 'ok' || redis !== 'ok';

  res.status(200).json({
    status: degraded ? 'degraded' : 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? 'unknown',
    uptime: Math.round(process.uptime()),
    dependencies: {
      database,
      redis,
      socketio,
    },
  });
});
```

- [ ] **Step 2: Run tests — expect pass**

```bash
npx -w apps/api vitest run src/routes/health.test.ts
```

Expected: all 7 tests pass.

**Commit:** `feat(api): add /health, /health/ready, /health/live endpoints (#210)`

---

## Task 6: Mount router in index.ts and remove inline handler

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Import and mount the router; delete the inline `/health` handler**

In `apps/api/src/index.ts`:

1. Add after the other route imports (near line 39):

```ts
import { healthRouter } from './routes/health';
```

2. Replace the current `/health` block (lines 125–128):

```ts
// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
```

with:

```ts
// Health / readiness / liveness checks (see docs/reference/deployment.md)
app.use(healthRouter);
```

The mount point is root (`/`) so the router-internal paths `/health`, `/health/ready`, `/health/live` resolve at the public URL as-is. Keep it above `/api/v1/*` mounts so the global rate limiter (which is scoped to `/api/v1/`) continues not to apply to health checks.

- [ ] **Step 2: Typecheck + run the full api test suite**

```bash
npx -w apps/api tsc --noEmit
npx -w apps/api vitest run
```

Expected: typecheck clean; all existing tests still green; the new health tests pass. The existing `requestLogger.test.ts` `/health/ready` skip assertion (line 92) continues to pass untouched.

**Commit:** `refactor(api): mount health router, drop inline /health handler`

---

## Task 7: Smoke-test locally against real DB/Redis

**Files:** none

- [ ] **Step 1: Start the API**

```bash
APP_VERSION=0.0.0-dev npm run dev -w apps/api
```

- [ ] **Step 2: Hit each endpoint**

```bash
curl -s http://localhost:4000/health/live | jq
curl -s http://localhost:4000/health/ready | jq
curl -s http://localhost:4000/health | jq
```

Expected:
- `/health/live` → `{"status":"ok"}` (fast, no DB/Redis hit)
- `/health/ready` → 200 with `{status:"ok", dependencies:{database:"ok", redis:"ok"}}`
- `/health` → full payload with `version:"0.0.0-dev"`, numeric `uptime`, valid ISO `timestamp`, `socketio.connected` number

- [ ] **Step 3: Verify logs are NOT spammed**

Watch stdout while hitting the endpoints twice — `requestLogger` should skip them (existing behavior).

- [ ] **Step 4: Simulate Redis outage**

Stop Redis (or `docker stop` the container), then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/health/ready
```

Expected: `503`. Restart Redis, re-check → `200`.

---

## Task 8: Document endpoints, APP_VERSION, and uptime monitoring

**Files:**
- Modify: `docs/reference/deployment.md`

- [ ] **Step 1: Append a Health Checks section**

Add at the end of `docs/reference/deployment.md`:

```markdown

## Health Check Endpoints

The API exposes three health endpoints, all mounted at the root (no `/api/v1` prefix, no auth, excluded from request logs and rate limits):

| Endpoint | Purpose | Status Codes | Touches Dependencies |
|----------|---------|--------------|----------------------|
| `GET /health/live` | Liveness probe — "is the process alive?" | Always `200` | No |
| `GET /health/ready` | Readiness probe — "can it serve traffic?" | `200` healthy, `503` unhealthy | Yes (DB + Redis) |
| `GET /health` | Full snapshot (version, uptime, dependencies, socket count) | `200` (never 5xx) | Yes (DB + Redis) |

### `/health` response shape

\`\`\`json
{
  "status": "ok",
  "timestamp": "2026-04-10T12:34:56.789Z",
  "version": "0.43.0",
  "uptime": 12345,
  "dependencies": {
    "database": "ok",
    "redis": "ok",
    "socketio": { "connected": 42 }
  }
}
\`\`\`

`status` is `"degraded"` if any dependency returns `"error"`. `/health` still returns `200` in that case — use `/health/ready` as the hard gate.

### APP_VERSION env var

Set `APP_VERSION` at build/deploy time so `/health` and Sentry releases report a real version. Suggested value: the `package.json` version or a git short SHA.

On Render, add it under the service's **Environment** tab. Falls back to `"unknown"` when unset.

### External Uptime Monitoring (launch checklist)

Configure an external ping against `/health/ready` (NOT `/health`, so failures page):

- [ ] Add a monitor in **UptimeRobot** (free tier) or **Render's built-in health check**:
  - URL: `https://<your-api-host>/health/ready`
  - Method: `GET`
  - Interval: 60s
  - Alert threshold: 2 consecutive failures
  - Timeout: 5s
- [ ] Wire alerts to a Discord webhook or email distribution list
- [ ] If using Render's built-in health check, point it at `/health/ready` so Render will restart the instance automatically when the probe fails
```

- [ ] **Step 2: Also bump the "Backend (Render)" section env var list**

In the existing `### Backend (Render)` block (line 9), change:

```
- Environment: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
```

to:

```
- Environment: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `APP_VERSION`
```

**Commit:** `docs: document health endpoints, APP_VERSION, uptime monitor setup`

---

## Task 9: Final verification and PR

- [ ] **Step 1: Full workspace check**

```bash
npx -w apps/api tsc --noEmit
npx -w apps/api vitest run
```

Expected: typecheck clean, all tests green (new: 7 healthChecks + 7 health router; all pre-existing tests unchanged).

- [ ] **Step 2: Verify `/health` is still excluded from request logs**

Re-run `requestLogger.test.ts` alone to sanity-check the skip:

```bash
npx -w apps/api vitest run src/middleware/requestLogger.test.ts
```

Expected: the existing `skips /health requests` and `skips /health/ready requests` cases still pass without modification.

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --base main \
  --head feat/health-check-enhancement-210 \
  --title "feat(api): health check enhancement (#210)" \
  --body "Closes #210. Adds /health/ready + /health/live, expands /health with version/uptime/dependencies, introduces APP_VERSION env var, documents external uptime monitoring."
```

---

## Exit Criteria

- [ ] `/health/live` returns 200 without touching DB or Redis
- [ ] `/health/ready` returns 200 when both DB and Redis are reachable, 503 otherwise
- [ ] `/health` returns the full shape `{status, timestamp, version, uptime, dependencies:{database, redis, socketio:{connected}}}`
- [ ] `APP_VERSION` env var feeds `/health.version` (falls back to `"unknown"`)
- [ ] `requestLogger` still excludes all `/health*` paths (unchanged behavior)
- [ ] `docs/reference/deployment.md` documents endpoints, `APP_VERSION`, and uptime monitor checklist
- [ ] `npx -w apps/api tsc --noEmit` clean
- [ ] `npx -w apps/api vitest run` all green
- [ ] Manual smoke test: stopping Redis flips `/health/ready` to 503 and `/health.status` to `"degraded"`, both recover when Redis returns
