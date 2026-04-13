# Structured Logging (pino) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all console.log/error/warn calls in the API with pino structured JSON logging, add request logging middleware, game event logging, and periodic metrics.

**Architecture:** Single pino logger instance in `apps/api/src/logger.ts`, configured via `LOG_LEVEL` env var. Request logging middleware attaches to the Express middleware chain after requestId. Services import the logger directly and log with structured context objects. Periodic metrics are emitted every 60s via a setInterval timer.

**Tech Stack:** pino (structured JSON logger), pino-pretty (dev formatting)

**Issue:** #208 | **Branch:** `feat/structured-logging-208`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/logger.ts` | Root pino instance, `LOG_LEVEL` env var |
| Create | `apps/api/src/logger.test.ts` | Logger module tests |
| Create | `apps/api/src/middleware/requestLogger.ts` | HTTP request logging middleware |
| Create | `apps/api/src/middleware/requestLogger.test.ts` | Request logger tests |
| Create | `apps/api/src/services/metricsLogger.ts` | Periodic metrics collection + logging |
| Create | `apps/api/src/services/metricsLogger.test.ts` | Metrics logger tests |
| Modify | `apps/api/src/middleware/errorHandler.ts` | Replace `console.error` with pino |
| Modify | `apps/api/src/middleware/errorHandler.test.ts` | Update test for pino usage |
| Modify | `apps/api/src/index.ts` | Wire middleware, replace console calls, start metrics |
| Modify | `apps/api/src/redis.ts` | Replace console calls with pino child logger |
| Modify | `apps/api/src/services/leaderboardService.ts` | Replace 7 console calls |
| Modify | `apps/api/src/services/eventSchedulerService.ts` | Replace 4 console calls |
| Modify | `apps/api/src/services/casinoService.ts` | Replace 2 console calls |
| Modify | `apps/api/src/services/pushNotificationService.ts` | Replace 3 console calls |
| Modify | `apps/api/src/services/guildService.ts` | Replace 1 console call |
| Modify | `apps/api/src/services/guildUpgradeService.ts` | Replace 2 console calls |
| Modify | `apps/api/src/services/bossEncounterService.ts` | Replace 1 console call |
| Modify | `apps/api/src/services/progressService.ts` | Replace 2 console calls |
| Modify | `apps/api/src/services/sparService.ts` | Replace 1 console call |
| Modify | `apps/api/src/services/roundResolutionScheduler.ts` | Replace 1 console call |
| Modify | `apps/api/src/services/authService.ts` | Replace 1 console call, add login/register info logs |
| Modify | `apps/api/src/routes/auth.ts` | Replace 2 console calls |
| Modify | `apps/api/src/utils/bossJsonSchemas.ts` | Replace 6 console calls |
| Modify | `apps/api/src/utils/jsonColumnSchemas.ts` | Replace 3 console calls |
| Modify | `apps/api/src/services/combatOrchestrationService.ts` | Add combat completion info log |
| Modify | `apps/api/src/services/guildMembershipService.ts` | Add guild create/dissolve info logs |
| Modify | `apps/api/src/services/worldEventService.ts` | Add world event spawn/completion info logs |
| Modify | `apps/api/package.json` | Add pino + pino-pretty deps |

---

### Task 1: Install pino and create logger module

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/logger.ts`
- Create: `apps/api/src/logger.test.ts`

- [ ] **Step 1: Install pino and pino-pretty**

```bash
npm install -w apps/api pino && npm install -w apps/api -D pino-pretty
```

- [ ] **Step 2: Write logger tests**

Create `apps/api/src/logger.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  it('exports a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('supports child loggers', () => {
    const child = logger.child({ module: 'test' });
    expect(typeof child.info).toBe('function');
  });

  it('defaults to debug level in test env', () => {
    expect(logger.level).toBe('debug');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/logger.test.ts
```

Expected: FAIL — `Cannot find module './logger'`

- [ ] **Step 4: Create the logger module**

Create `apps/api/src/logger.ts`:

```typescript
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  ...(!isProduction && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/api && npx vitest run src/logger.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/logger.ts apps/api/src/logger.test.ts apps/api/package.json package-lock.json
git commit -m "feat(logging): add pino logger module with LOG_LEVEL env var (#208)"
```

---

### Task 2: Request logging middleware

**Files:**
- Create: `apps/api/src/middleware/requestLogger.ts`
- Create: `apps/api/src/middleware/requestLogger.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write request logger tests**

Create `apps/api/src/middleware/requestLogger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestLogger } from './requestLogger';

// Mock the logger module
vi.mock('../logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger: mockLogger };
});

import { logger } from '../logger';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/player',
    originalUrl: '/api/v1/player',
    requestId: 'test-uuid-1234',
    player: undefined,
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    statusCode: 200,
    on(event: string, cb: () => void) {
      (listeners[event] ??= []).push(cb);
      return this;
    },
    _emit(event: string) {
      for (const cb of listeners[event] ?? []) cb();
    },
  } as unknown as Response & { _emit: (event: string) => void };
}

describe('requestLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next()', () => {
    const next = vi.fn();
    requestLogger(createMockReq(), createMockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('logs request on response finish with correct fields', () => {
    const req = createMockReq({ player: { playerId: 'p1', username: 'hero', role: 'user' } as any });
    const res = createMockRes();
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(logger.info).toHaveBeenCalledOnce();
    const [context, message] = (logger.info as any).mock.calls[0];
    expect(context).toMatchObject({
      requestId: 'test-uuid-1234',
      method: 'GET',
      path: '/api/v1/player',
      status: 200,
      playerId: 'p1',
    });
    expect(context).toHaveProperty('duration');
    expect(typeof context.duration).toBe('number');
    expect(message).toContain('GET');
    expect(message).toContain('/api/v1/player');
    expect(message).toContain('200');
  });

  it('skips /health requests', () => {
    const req = createMockReq({ path: '/health' });
    const res = createMockRes();
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs 4xx as warn', () => {
    const req = createMockReq();
    const res = createMockRes();
    res.statusCode = 404;
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('logs 5xx as error', () => {
    const req = createMockReq();
    const res = createMockRes();
    res.statusCode = 500;
    const next = vi.fn();

    requestLogger(req, res, next);
    (res as any)._emit('finish');

    expect(logger.error).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/middleware/requestLogger.test.ts
```

Expected: FAIL — `Cannot find module './requestLogger'`

- [ ] **Step 3: Implement request logging middleware**

Create `apps/api/src/middleware/requestLogger.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health') return next();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      playerId: req.player?.playerId,
    }, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });

  next();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx vitest run src/middleware/requestLogger.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Wire into index.ts**

In `apps/api/src/index.ts`, add the import near the top (after the existing middleware imports):

```typescript
import { requestLogger } from './middleware/requestLogger';
```

Add the middleware right after the requestId middleware block (after line 107), before the trust proxy line:

```typescript
app.use(requestLogger);
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/requestLogger.ts apps/api/src/middleware/requestLogger.test.ts apps/api/src/index.ts
git commit -m "feat(logging): add request logging middleware with level routing (#208)"
```

---

### Task 3: Update error handler to use pino

**Files:**
- Modify: `apps/api/src/middleware/errorHandler.ts`
- Modify: `apps/api/src/middleware/errorHandler.test.ts`

- [ ] **Step 1: Update error handler test to verify pino usage**

In `apps/api/src/middleware/errorHandler.test.ts`, add mock and assertion for the logger. Replace the full file content:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';

vi.mock('../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { logger } from '../logger';
import { AppError, errorHandler } from './errorHandler';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const mockNext = vi.fn();

function mockReq(overrides: Record<string, unknown> = {}) {
  return { requestId: 'req-123', ...overrides } as any;
}

describe('AppError', () => {
  it('creates error with status code and message', () => {
    const err = new AppError(404, 'Not found', 'NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('AppError');
  });

  it('extends Error', () => {
    const err = new AppError(500, 'oops');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles AppError with correct status and body', () => {
    const res = mockRes();
    const err = new AppError(400, 'Bad request', 'BAD_REQUEST');

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Bad request',
        code: 'BAD_REQUEST',
        requestId: 'req-123',
      },
    });
  });

  it('logs 4xx AppErrors at warn level', () => {
    const res = mockRes();
    const err = new AppError(400, 'Bad request', 'BAD_REQUEST');

    errorHandler(err, mockReq(), res, mockNext);

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-123', statusCode: 400 }),
      expect.stringContaining('Bad request'),
    );
  });

  it('logs 5xx errors at error level', () => {
    const res = mockRes();
    const err = new Error('unexpected');

    errorHandler(err, mockReq(), res, mockNext);

    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-123', err }),
      expect.stringContaining('unexpected'),
    );
  });

  it('handles unknown errors as 500', () => {
    const res = mockRes();
    const err = new Error('unexpected');

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
        requestId: 'req-123',
      },
    });
  });

  it('handles AppError without code', () => {
    const res = mockRes();
    const err = new AppError(422, 'Validation failed');

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Validation failed',
        code: undefined,
        requestId: 'req-123',
      },
    });
  });

  it('handles ZodError as 400', () => {
    const res = mockRes();
    const err = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['name'], message: 'Expected string' },
    ]);

    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/middleware/errorHandler.test.ts
```

Expected: FAIL — tests that check `logger.warn`/`logger.error` will fail because errorHandler still uses `console.error`

- [ ] **Step 3: Update error handler implementation**

Replace `apps/api/src/middleware/errorHandler.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    logger[level]({ requestId, statusCode: err.statusCode, code: err.code }, err.message);

    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const messages = err.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    const combined = messages.join('; ');
    logger.warn({ requestId, statusCode: 400, code: 'VALIDATION_ERROR' }, combined);

    res.status(400).json({
      error: {
        message: combined,
        code: 'VALIDATION_ERROR',
        requestId,
      },
    });
    return;
  }

  // Default to 500 — log full error object for stack trace
  logger.error({ requestId, err }, err.message);

  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx vitest run src/middleware/errorHandler.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/errorHandler.ts apps/api/src/middleware/errorHandler.test.ts
git commit -m "feat(logging): use pino in error handler with level-based routing (#208)"
```

---

### Task 4: Replace console calls in index.ts and redis.ts

**Files:**
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/redis.ts`

- [ ] **Step 1: Replace console calls in index.ts**

Add import at top of `apps/api/src/index.ts` (with other local imports):

```typescript
import { logger } from './logger';
```

Replace each console call (8 total):

| Line | Before | After |
|------|--------|-------|
| 164 | `console.log(\`PocketRealm API running on port ${PORT}\`)` | `logger.info({ port: PORT }, \`PocketRealm API running on port ${PORT}\`)` |
| 173 | `console.error('Persisted mob cleanup error:', err)` | `logger.error({ err }, 'Persisted mob cleanup error')` |
| 179 | `console.error('Initial leaderboard refresh error:', err)` | `logger.error({ err }, 'Initial leaderboard refresh error')` |
| 183 | `console.error('Leaderboard refresh error:', err)` | `logger.error({ err }, 'Leaderboard refresh error')` |
| 190 | `console.error('Auth token cleanup error:', err)` | `logger.error({ err }, 'Auth token cleanup error')` |
| 196 | `console.log('SIGTERM received — shutting down gracefully')` | `logger.info('SIGTERM received — shutting down gracefully')` |
| 201 | `console.log('Redis connection closed')` | `logger.info('Redis connection closed')` |
| 202 | `console.error('Redis quit error:', err.message)` | `logger.error({ err }, 'Redis quit error')` |

- [ ] **Step 2: Replace console calls in redis.ts**

Add import at top of `apps/api/src/redis.ts`:

```typescript
import { logger } from './logger';
```

Replace each console call (3 total):

| Line | Before | After |
|------|--------|-------|
| 13 | `console.error(\`[Redis] Failed to reconnect after ${MAX_RETRIES} attempts — giving up\`)` | `logger.error({ attempts: MAX_RETRIES }, 'Redis failed to reconnect — giving up')` |
| 17 | `console.warn(\`[Redis] Reconnecting in ${delay}ms (attempt ${times}/${MAX_RETRIES})\`)` | `logger.warn({ delay, attempt: times, maxRetries: MAX_RETRIES }, 'Redis reconnecting')` |
| 23 | `console.error('[Redis] Connection error:', err.message)` | `logger.error({ err }, 'Redis connection error')` |

- [ ] **Step 3: Run existing tests to verify nothing broke**

```bash
cd apps/api && npx vitest run src/middleware/ src/logger.test.ts
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/redis.ts
git commit -m "feat(logging): replace console calls in index.ts and redis.ts with pino (#208)"
```

---

### Task 5: Replace console calls in services

**Files:** 13 service files listed below.

All follow the same pattern: add `import { logger } from '../logger';` at the top, then replace `console.error`→`logger.error`, `console.warn`→`logger.warn`, `console.log`→`logger.info`.

Pino convention: first arg is the context object (`{ err, playerId, ... }`), second arg is the message string. Error objects go in the context as `err` (pino serializes them with stack traces).

- [ ] **Step 1: Replace calls in leaderboardService.ts (7 calls)**

Add `import { logger } from '../logger';`

Lines 602–607 — six refresh error calls. Each follows the pattern:
```typescript
// Before:
console.error('Leaderboard refresh error (pvp):', err);
// After:
logger.error({ err, board: 'pvp' }, 'Leaderboard refresh error');
```

Apply for all six boards: `pvp`, `progression`, `skills`, `combat`, `guilds`, `casino`.

Line 613:
```typescript
// Before:
console.log(`Leaderboard refresh completed in ${Date.now() - start}ms (${failures} failures)`);
// After:
logger.info({ durationMs: Date.now() - start, failures }, 'Leaderboard refresh completed');
```

- [ ] **Step 2: Replace calls in eventSchedulerService.ts (4 calls)**

Add `import { logger } from '../logger';`

Lines 381, 388, 395, 415 — each follows the pattern:
```typescript
// Before:
console.error('Scheduler step expireStaleEvents failed', err);
// After:
logger.error({ err, step: 'expireStaleEvents' }, 'Scheduler step failed');
```

Apply with `step` values: `expireStaleEvents`, `checkAndResolveDueBossRounds`, `checkAndSpawnBoss`, `spawnNewEvent`.

- [ ] **Step 3: Replace calls in casinoService.ts (2 calls)**

Add `import { logger } from '../logger';`

```typescript
// Line 242 — Before:
console.error('[casino] corrupt roulette:resolved_round', ...);
// After:
logger.error({ key: 'roulette:resolved_round' }, 'Corrupt casino Redis data');

// Line 276 — Before:
console.error('[casino] corrupt roulette:current_round', ...);
// After:
logger.error({ key: 'roulette:current_round' }, 'Corrupt casino Redis data');
```

- [ ] **Step 4: Replace calls in pushNotificationService.ts (3 calls)**

Add `import { logger } from '../logger';`

```typescript
// Line 45 — Before:
console.warn('[push] VAPID env vars missing ...');
// After:
logger.warn('Push notifications disabled — VAPID env vars missing');

// Line 49 — Before:
console.log('[push] VAPID configured ...');
// After:
logger.info('VAPID configured for push notifications');

// Line 136 — Before:
console.error('[push] sendNotification failed', err);
// After:
logger.error({ err }, 'Push notification send failed');
```

- [ ] **Step 5: Replace calls in remaining services**

Each file: add `import { logger } from '../logger';`, then replace:

**guildService.ts** (line 452):
```typescript
// Before:
console.error('Guild achievement check failed', err);
// After:
logger.error({ err }, 'Guild achievement check failed');
```

**guildUpgradeService.ts** (lines 317, 345):
```typescript
// Before:
console.warn('Unmapped guild project perk effect type', ...);
// After:
logger.warn({ effectType }, 'Unmapped guild project perk effect type');

// Before:
console.warn('Unmapped guild specialization effect type', ...);
// After:
logger.warn({ effectType }, 'Unmapped guild specialization effect type');
```

**bossEncounterService.ts** (line 552):
```typescript
// Before:
console.error('Boss auto-signup failed unexpectedly', ...);
// After:
logger.error({ err }, 'Boss auto-signup failed unexpectedly');
```

**progressService.ts** (lines 36, 41):
```typescript
// Before:
console.warn('[trackProgress] contract increment failed', { playerId, type, err });
// After:
logger.warn({ playerId, type, err }, 'Contract increment failed');

// Before:
console.warn('[trackProgress] failed', { playerId, type, err });
// After:
logger.warn({ playerId, type, err }, 'Track progress failed');
```

**sparService.ts** (line 127):
```typescript
// Before:
console.warn('sendSparResultMail failed', ...);
// After:
logger.warn({ err }, 'Spar result mail send failed');
```

**roundResolutionScheduler.ts** (line 34):
```typescript
// Before:
console.error('Round resolution error', err);
// After:
logger.error({ err }, 'Round resolution error');
```

**authService.ts** (line 77):
```typescript
// Before:
console.error('Failed to send verification email', ...);
// After:
logger.error({ err }, 'Failed to send verification email');
```

- [ ] **Step 6: Run all API tests**

```bash
npm run test:api
```

Expected: All tests PASS. Some tests may have `console.error` spies that need removal — if any fail, check for `vi.spyOn(console, 'error')` patterns and update to spy on `logger` instead.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/
git commit -m "feat(logging): replace console calls in all services with pino (#208)"
```

---

### Task 6: Replace console calls in routes and utils

**Files:**
- Modify: `apps/api/src/routes/auth.ts` (2 calls)
- Modify: `apps/api/src/utils/bossJsonSchemas.ts` (6 calls)
- Modify: `apps/api/src/utils/jsonColumnSchemas.ts` (3 calls)

- [ ] **Step 1: Replace calls in routes/auth.ts**

Add `import { logger } from '../logger';`

```typescript
// Line 202 — Before:
console.error('Failed to send verification email', ...);
// After:
logger.error({ err }, 'Failed to send verification email');

// Line 396 — Before:
console.error('Failed to send password reset email', ...);
// After:
logger.error({ err }, 'Failed to send password reset email');
```

- [ ] **Step 2: Replace calls in utils/bossJsonSchemas.ts**

Add `import { logger } from '../logger';`

All 6 calls are `console.warn` inside parse helpers. Replace each with:
```typescript
// Before:
console.warn(`[bossJsonSchemas] Expected array for ${columnName}, got ${typeof value}`);
// After:
logger.warn({ columnName, actualType: typeof value }, 'Boss JSON column expected array');

// Before:
console.warn(`[bossJsonSchemas] Validation failed for ${columnName}: ${result.error.message}`);
// After:
logger.warn({ columnName, error: result.error.message }, 'Boss JSON column validation failed');
```

Same pattern for all three parse functions: `parseBossEffects`, `parseBossRoundSummaries`, `parseBossRewardsByPlayer`. Each has 2 warn calls (type check + validation), totaling 6.

- [ ] **Step 3: Replace calls in utils/jsonColumnSchemas.ts**

Add `import { logger } from '../logger';`

Same pattern as bossJsonSchemas — 3 `console.warn` calls in parse helpers. Replace with structured `logger.warn`:
```typescript
// Before:
console.warn(`[jsonColumnSchemas] ...`);
// After:
logger.warn({ columnName, ... }, 'JSON column validation failed');
```

- [ ] **Step 4: Run existing tests for these files**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts src/utils/bossJsonSchemas.test.ts
```

Expected: All PASS

- [ ] **Step 5: Verify no console.log/error/warn calls remain in API src**

```bash
cd apps/api && grep -rn "console\.\(log\|error\|warn\)" src/ --include="*.ts" | grep -v "\.test\." | grep -v node_modules
```

Expected: Zero matches (test files may still use console — that's fine)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/utils/bossJsonSchemas.ts apps/api/src/utils/jsonColumnSchemas.ts
git commit -m "feat(logging): replace console calls in routes and utils with pino (#208)"
```

---

### Task 7: Add game event info logging

**Files:**
- Modify: `apps/api/src/services/authService.ts`
- Modify: `apps/api/src/services/combatOrchestrationService.ts`
- Modify: `apps/api/src/services/bossEncounterService.ts`
- Modify: `apps/api/src/services/guildMembershipService.ts`
- Modify: `apps/api/src/services/worldEventService.ts`
- Modify: `apps/api/src/services/eventSchedulerService.ts`

These are new `logger.info` calls at key game event points. The logger import is already present from Task 5. No new tests — these are observability additions, not behavior changes.

- [ ] **Step 1: Add login/register info logs in authService.ts**

After successful player creation (the return statement in the register function):
```typescript
logger.info({ playerId: player.id, username: player.username }, 'Player registered');
```

After successful login (where the token is generated):
```typescript
logger.info({ playerId: player.id, username: player.username }, 'Player logged in');
```

- [ ] **Step 2: Add combat completion info log in combatOrchestrationService.ts**

Add `import { logger } from '../logger';`

After combat result is determined (in the function that returns the combat outcome):
```typescript
logger.info({
  playerId,
  result: combatResult.outcome,
  mobTemplateId: combatResult.mob?.templateId,
  zone: combatResult.zoneName,
}, 'Combat completed');
```

Find the function that returns the final combat result to the route handler — add the log just before the return.

- [ ] **Step 3: Add boss round resolution info log in bossEncounterService.ts**

The logger import is already present from Task 5. After a boss round resolves (in the round resolution function, after rewards are distributed):
```typescript
logger.info({
  bossEncounterId,
  round: roundNumber,
  participantCount,
}, 'Boss round resolved');
```

- [ ] **Step 4: Add guild creation/dissolution info logs**

In `guildMembershipService.ts`, add `import { logger } from '../logger';`

After guild creation:
```typescript
logger.info({ guildId: guild.id, founderId: playerId, guildName: guild.name }, 'Guild created');
```

After guild dissolution (in the dissolve function):
```typescript
logger.info({ guildId, dissolverId: playerId }, 'Guild dissolved');
```

- [ ] **Step 5: Add world event spawn/completion info logs**

In `worldEventService.ts`, add `import { logger } from '../logger';`

After a new world event is created/spawned:
```typescript
logger.info({ eventId: event.id, title: event.title, zoneId: event.zoneId }, 'World event spawned');
```

In `eventSchedulerService.ts` (logger already imported), after events are expired (inside the try block at line 373):
```typescript
for (const event of expired) {
  logger.info({ eventId: event.id, title: event.title }, 'World event expired');
  // ... existing emitSystemMessage calls
}
```

- [ ] **Step 6: Run all API tests**

```bash
npm run test:api
```

Expected: All PASS — info logs don't affect behavior

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/authService.ts apps/api/src/services/combatOrchestrationService.ts apps/api/src/services/bossEncounterService.ts apps/api/src/services/guildMembershipService.ts apps/api/src/services/worldEventService.ts apps/api/src/services/eventSchedulerService.ts
git commit -m "feat(logging): add info-level game event logging for key actions (#208)"
```

---

### Task 8: Periodic metrics logger

**Files:**
- Create: `apps/api/src/services/metricsLogger.ts`
- Create: `apps/api/src/services/metricsLogger.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write metrics logger tests**

Create `apps/api/src/services/metricsLogger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn() },
}));

import { logger } from '../logger';
import { collectMetrics, startMetricsLogger } from './metricsLogger';

describe('collectMetrics', () => {
  it('returns metrics object with required fields', () => {
    const mockIo = {
      sockets: { sockets: new Map([['s1', { data: { playerId: 'p1' } }], ['s2', { data: { playerId: 'p2' } }], ['s3', { data: { playerId: 'p1' } }]]) },
    } as any;

    const metrics = collectMetrics(mockIo);

    expect(metrics).toHaveProperty('activeConnections', 3);
    expect(metrics).toHaveProperty('activePlayers', 2); // p1 deduplicated
    expect(metrics).toHaveProperty('memoryUsageMb');
    expect(typeof metrics.memoryUsageMb).toBe('number');
    expect(metrics).toHaveProperty('eventLoopLagMs');
    expect(typeof metrics.eventLoopLagMs).toBe('number');
  });

  it('handles null io gracefully', () => {
    const metrics = collectMetrics(null);

    expect(metrics.activeConnections).toBe(0);
    expect(metrics.activePlayers).toBe(0);
  });
});

describe('startMetricsLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs metrics on the configured interval', () => {
    const mockIo = {
      sockets: { sockets: new Map() },
    } as any;

    const stop = startMetricsLogger(() => mockIo, 1000);

    expect(logger.info).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ activeConnections: 0, activePlayers: 0 }),
      'metrics',
    );

    vi.advanceTimersByTime(1000);
    expect(logger.info).toHaveBeenCalledTimes(2);

    stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && npx vitest run src/services/metricsLogger.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement metrics logger**

Create `apps/api/src/services/metricsLogger.ts`:

```typescript
import { monitorEventLoopDelay } from 'perf_hooks';
import type { Server as SocketServer } from 'socket.io';
import { logger } from '../logger';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

export interface Metrics {
  activeConnections: number;
  activePlayers: number;
  memoryUsageMb: number;
  eventLoopLagMs: number;
}

export function collectMetrics(io: SocketServer | null): Metrics {
  let activeConnections = 0;
  let activePlayers = 0;

  if (io) {
    const sockets = io.sockets.sockets;
    activeConnections = sockets.size;
    const playerIds = new Set<string>();
    for (const [, socket] of sockets) {
      const pid = (socket as any).data?.playerId;
      if (pid) playerIds.add(pid);
    }
    activePlayers = playerIds.size;
  }

  const memoryUsageMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;
  const eventLoopLagMs = Math.round(histogram.mean / 1e6 * 100) / 100;
  histogram.reset();

  return { activeConnections, activePlayers, memoryUsageMb, eventLoopLagMs };
}

const DEFAULT_INTERVAL_MS = 60_000;

export function startMetricsLogger(
  getIo: () => SocketServer | null,
  intervalMs = DEFAULT_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    const metrics = collectMetrics(getIo());
    logger.info(metrics, 'metrics');
  }, intervalMs);

  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && npx vitest run src/services/metricsLogger.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Wire metrics logger into index.ts**

In `apps/api/src/index.ts`, add import:

```typescript
import { startMetricsLogger } from './services/metricsLogger';
```

Inside the `server.listen` callback, after `startRoundResolutionScheduler(getIo);` add:

```typescript
startMetricsLogger(getIo);
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/metricsLogger.ts apps/api/src/services/metricsLogger.test.ts apps/api/src/index.ts
git commit -m "feat(logging): add periodic metrics logger (connections, memory, event loop) (#208)"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full API test suite**

```bash
npm run test:api
```

Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

```bash
npm run build:api
```

Expected: Clean build, no type errors

- [ ] **Step 3: Verify no remaining console calls in API source**

```bash
cd apps/api && grep -rn "console\.\(log\|error\|warn\)" src/ --include="*.ts" | grep -v "\.test\." | grep -v node_modules
```

Expected: Zero matches

- [ ] **Step 4: Quick smoke test**

```bash
npm run dev:api
```

Verify: pino-pretty formatted output in terminal (not raw JSON). Server starts without errors. Hit `http://localhost:4000/health` — no request log for /health. Hit `http://localhost:4000/api/v1/player` — see structured request log with method, path, status, duration.

Stop the dev server.

- [ ] **Step 5: Final commit if any fixups needed, otherwise done**
