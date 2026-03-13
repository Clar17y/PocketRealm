# Security Audit: Cross-Cutting Infrastructure

## Files Reviewed
- `apps/api/src/index.ts` — Express app setup, middleware chain, CORS, route registration
- `apps/api/src/middleware/errorHandler.ts` — global error handler
- `apps/api/src/middleware/auth.ts` — JWT auth middleware (re-examined for infrastructure patterns)
- `apps/api/src/utils/asyncHandler.ts` — async route wrapper
- `apps/api/src/utils/prismaAny.ts` — untyped Prisma client bypass
- `apps/api/src/redis.ts` — Redis connection

## Findings

### 1. No Request Body Size Limit
**Severity:** high
**Type:** input manipulation

**Description:** At `index.ts:90`, `express.json()` is called without a `limit` option. The Express default is 100KB, which is reasonable, but this should be explicitly set. More importantly, there is no per-route body size enforcement. Endpoints that accept arrays (e.g., `sellBulk` with 50 item IDs, `salvageBatch`, `depositBatch`) could receive very large payloads.

However, the real concern is that no rate limiting exists at the application level. Any authenticated user can send unlimited requests per second to any endpoint.

**Exploit Scenario:**
1. Attacker sends rapid-fire requests to expensive endpoints (exploration, combat, crafting).
2. Each request triggers multiple DB queries, game engine calculations, and Redis operations.
3. Server CPU/memory is exhausted, degrading performance for all players.

**Suggested Fix:** Add explicit body limit and rate limiting:
```ts
app.use(express.json({ limit: '100kb' }));

// Global rate limiter
import rateLimit from 'express-rate-limit';
app.use('/api/v1/', rateLimit({ windowMs: 60_000, max: 120 }));
```

---

### 2. No Global Rate Limiting
**Severity:** high
**Type:** input manipulation

**Description:** There is no rate limiting middleware at any level — not globally, not per-route, not per-IP, not per-player. Every endpoint is vulnerable to rapid-fire abuse. This was noted specifically for the login endpoint in the auth audit, but it applies to ALL endpoints.

High-cost endpoints like exploration (which rolls dice, runs combat, creates items, grants XP) can be hammered at hundreds of requests per second per player.

**Exploit Scenario:**
1. Attacker writes a script that sends 100 requests/second to `POST /exploration/start`.
2. Each request triggers the full exploration pipeline: turn spending, dice rolling, mob combat, loot generation, XP granting, achievement checking.
3. Server is overwhelmed. Database connection pool is exhausted.
4. All other players experience timeouts.

**Suggested Fix:** Layer rate limiting:
```ts
// Global: 120 req/min per IP
app.use('/api/v1/', rateLimit({ windowMs: 60_000, max: 120, keyGenerator: req => req.ip }));

// Per-player: 60 game actions/min (on mutating endpoints)
const playerLimiter = rateLimit({
  windowMs: 60_000, max: 60,
  keyGenerator: req => req.player?.playerId ?? req.ip,
});
```

---

### 3. CORS Allows Any Port 3002 Origin in Non-Production
**Severity:** medium
**Type:** input manipulation

**Description:** At `index.ts:64-70`, non-production mode allows any origin on port 3002:
```ts
if (!isProduction) {
  const parsed = new URL(origin);
  return parsed.port === '3002';
}
```
This means `http://evil.com:3002` would pass CORS validation in development/staging environments.

**Assessment:** Acceptable for local development. But if staging environments use `NODE_ENV=development` (common), this opens them to cross-origin attacks from any domain on port 3002.

**Suggested Fix:** Use an explicit allowlist for staging:
```ts
if (!isProduction && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname.endsWith('.local'))) {
  return parsed.port === '3002';
}
```

---

### 4. Error Handler Leaks Stack Traces via console.error
**Severity:** low
**Type:** data leakage

**Description:** At `errorHandler.ts:20`, `console.error('Error:', err)` logs the full error object including stack traces. In production, if logs are accessible (e.g., via a monitoring dashboard without access control), this exposes internal file paths, library versions, and code structure.

The error handler correctly does NOT send stack traces to the client (lines 23-38), which is good. The risk is only in log exposure.

**Suggested Fix:** In production, log only the message and code, not the full error:
```ts
if (process.env.NODE_ENV === 'production') {
  console.error('Error:', err.message, (err as AppError).code);
} else {
  console.error('Error:', err);
}
```

---

### 5. `prismaAny` Bypasses Type Safety Globally
**Severity:** medium
**Type:** business logic (architectural)

**Description:** `prismaAny` at `utils/prismaAny.ts` casts the Prisma client to `any`, bypassing all TypeScript type checking. This is used throughout the codebase for models not yet in the generated schema. Any query using `prismaAny` has no compile-time validation of field names, relation includes, or where clauses.

This means:
- Misspelled field names silently fail at runtime
- Missing relation includes cause null reference errors
- Schema changes don't produce compile-time errors for `prismaAny` queries

**Assessment:** This is a technical debt issue, not a direct security vulnerability. But it increases the risk of runtime errors that could expose error details or create inconsistent state.

**Suggested Fix:** Run `npm run db:generate` to ensure all models are in the Prisma client, then remove `prismaAny` usage file by file.

---

### 6. Health Check Endpoint Is Unauthenticated
**Severity:** info
**Type:** data leakage

**Description:** `GET /health` at `index.ts:93-95` returns `{ status: 'ok', timestamp }` without authentication. This is standard practice for load balancer health checks. No sensitive information is exposed.

**Assessment:** No issue — correct implementation.

---

### 7. No Request ID or Correlation Tracking
**Severity:** info
**Type:** architecture

**Description:** There is no request ID middleware. When errors occur, there's no way to correlate a client-side error with server-side logs. This makes debugging production issues difficult.

**Suggested Fix:** Add request ID middleware:
```ts
import { randomUUID } from 'crypto';
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] as string || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});
```

---

### 8. Background Timers Swallow Errors Silently
**Severity:** low
**Type:** business logic

**Description:** At `index.ts:142-156`, background timers for mob cleanup and leaderboard refresh use `.catch(console.error)`. If these fail repeatedly, there's no alerting, no retry logic, and no circuit breaker. Persisted mobs could accumulate indefinitely, and leaderboards could become stale.

**Assessment:** Low severity — these are maintenance tasks, not critical paths. But adding a failure counter and alert threshold would improve operational visibility.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | **No request body size limit explicitly set** | high | DoS via large payloads |
| 2 | **No global rate limiting** — all endpoints vulnerable | high | Yes — server exhaustion |
| 3 | CORS allows any port 3002 in non-production | medium | Staging environments only |
| 4 | Error handler logs full stack traces | low | Log exposure risk |
| 5 | `prismaAny` bypasses type safety | medium | Increases runtime error risk |
| 6 | Health check unauthenticated | info | By design |
| 7 | No request ID tracking | info | Operational concern |
| 8 | Background timers swallow errors | low | Maintenance degradation |
