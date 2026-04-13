# Operational Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Phase 2.4 of the pre-launch sprint — ship docs and small code changes that make Render/Neon deployments safe, repeatable, and observable. Deliverables: audited env var reference in `docs/reference/deployment.md`, build-time `APP_VERSION` wired through API + web, tuned Neon connection pool string, migration/rollback runbook, and Neon backup verification/restore runbook.

**Architecture:** This is primarily a docs PR with two small code touches. `APP_VERSION` is injected at build time from root `package.json` version into both `apps/api` (via `process.env.APP_VERSION` read in `logger.ts`/`index.ts` startup) and `apps/web` (via `next.config.mjs` → `env`). The API exposes it on `GET /health` so uptime monitors and Sentry (Phase 2.2) can tag releases consistently. `DATABASE_URL` pool tuning lives entirely in deployment docs — no code change (Prisma reads the URL params). Migration and backup runbooks are new subsections in `docs/reference/deployment.md`.

**Tech Stack:** Prisma 6 / Neon Postgres, Express 4 / pino 10, Next.js 16, Render (API) + Vercel (web).

**Issue:** #211 | **Branch:** `feat/operational-readiness-211`

---

## Coordination with parallel phases

Phase 2.2 (#209 Sentry), 2.3 (#210 Health check), and this plan (2.4 #211) all run in parallel after 2.1 landed. Collisions to watch:

1. **`docs/reference/deployment.md` — env var section.** This plan restructures the env var documentation into a single canonical table plus per-variable notes. 2.2 will want to append `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`. 2.3 will want to append nothing new env-wise but may document `/health/ready` behaviour. **Resolution:** this plan lands the table skeleton with explicit "Added in Phase 2.2" placeholder rows for each Sentry var (so 2.2 only fills in descriptions, not table structure). If 2.2 lands first, its rows are already present — this plan's PR just rebases and keeps them. Do **not** move or rename the "Environment Variables" heading; other PRs will target it by anchor.

2. **`APP_VERSION` ownership.** Both 2.3 (health check enhancement) and this plan need `APP_VERSION` readable at runtime in the API. This plan owns the build-time injection (root `package.json` → `APP_VERSION` env → exposed via `apps/api/src/version.ts` and `apps/web/next.config.mjs`). 2.3 consumes `version.ts` inside `/health/ready`. **Resolution:**
   - If this plan lands first: 2.3 just imports `APP_VERSION` from `apps/api/src/version.ts`.
   - If 2.3 lands first with an inline `process.env.APP_VERSION ?? '0.0.0'` in the health route: this plan extracts that into `version.ts` and updates the health route to import it. Either order works.
   - Single rule: the value MUST come from root `package.json#version` at build time, never from a hand-edited constant.

3. **`/health` route body.** The current `/health` returns `{status, timestamp}`. This plan adds `version` to that payload as a minimal touch so release tagging works even before 2.3's full `/health/ready`. 2.3 will replace the handler entirely with `/health`, `/health/live`, `/health/ready`. The contract this plan commits to: `version` must stay a top-level string key, so 2.3's new payloads keep it.

4. **Sentry `release` tag.** 2.2 will set Sentry `release: process.env.APP_VERSION`. This plan's build-time injection must land before 2.2 wires that up. If 2.2 is blocked on this, coordinate so this plan's Task 3 (build-time APP_VERSION) merges first.

Keep this section in the PR description verbatim so reviewers of all three PRs know the seams.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/version.ts` | Canonical export of `APP_VERSION` (reads `process.env.APP_VERSION`, falls back to `'0.0.0-dev'`) |
| Create | `apps/api/src/version.test.ts` | Verifies fallback + env var override |
| Modify | `apps/api/src/index.ts` | Import `APP_VERSION`, include in `/health` response, log at startup |
| Modify | `apps/api/src/index.test.ts` (or new `apps/api/src/health.test.ts`) | Supertest check that `/health` includes `version` |
| Modify | `apps/api/package.json` | `build` script injects `APP_VERSION` from root `package.json` via cross-env |
| Modify | `apps/web/next.config.mjs` | `env: { APP_VERSION: ... }` read from root `package.json` at build time |
| Modify | `docs/reference/deployment.md` | Full rewrite: env var table, connection pool tuning, migration runbook, backup runbook, APP_VERSION section, LOG_LEVEL section |

No changes to `packages/database/src/index.ts` — Prisma reads `DATABASE_URL` and its pool params directly.

---

### Task 1: Audit and restructure `docs/reference/deployment.md`

**Files:**
- Modify: `docs/reference/deployment.md`

**Rationale:** The current file has only 29 lines — it lists `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` inline under "Backend (Render)" and omits `LOG_LEVEL`, `CORS_ORIGINS`, `NODE_ENV`, `PORT`, VAPID keys, Resend, `SMTP_*`, `APP_VERSION`, and Sentry vars. This task replaces that with a structured reference.

- [ ] **Step 1: Replace the file contents.**

Overwrite `docs/reference/deployment.md` with the following exact content:

~~~markdown
# Deployment Reference

PocketRealm is deployed as a split stack: the Next.js web app on Vercel and the Express API on Render, backed by Neon Postgres and Upstash/Render Redis.

## Services

### Frontend (Vercel)
- Auto-deploys from `main` branch
- Build: `npm run build:web`
- Output: `.next` (Next.js 16, webpack)
- Required env: see [Environment Variables](#environment-variables)

### Backend (Render)
- Web Service, Node 20 environment
- Build: `npm install && npm run build:api`
- Start: `npm run start:api`
- Health check path: `/health`
- Background timers running inside the API process:
  - Adaptive round resolution (5 s when active, 60 s idle)
  - Persisted mob cleanup (5 min)
  - Leaderboard refresh (15 min)
  - Auth token cleanup (6 h)
  - Metrics logger (60 s)

### Database (Neon Postgres)
- Managed Postgres with daily automated backups — see [Backup Verification & Restore](#backup-verification--restore)
- Migrations: `npm run db:migrate` (dev) / `npx prisma migrate deploy` (prod, via Render build step)
- Connection pooling: see [Database Connection Pool](#database-connection-pool)

### Cache (Redis)
- Used for rate limiting, equipment stats cache, guild modifier cache, drop table cache, active player tracking

---

## Environment Variables

All variables are required in production unless marked optional. Set them in Render (API) and Vercel (web) dashboards. Never commit secrets to git — `.env.local` is gitignored for local dev.

### API (Render)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | Neon Postgres connection string, **must include pool params** — see [Database Connection Pool](#database-connection-pool) |
| `REDIS_URL` | yes | — | Redis connection string (e.g. `rediss://default:pass@host:6379`) |
| `JWT_SECRET` | yes | — | HMAC secret for JWT signing. 32+ random bytes. Rotate requires invalidating all sessions. |
| `NODE_ENV` | yes | — | `production` on Render, `development` locally, `test` in vitest |
| `PORT` | no | `4000` | HTTP listen port. Render sets this automatically. |
| `CORS_ORIGINS` | yes | `http://localhost:3002,http://127.0.0.1:3002` | Comma-separated allowed web origins. Production: the Vercel domain. |
| `LOG_LEVEL` | no | `info` (prod), `debug` (dev/test) | pino log level — see [Logging](#logging) |
| `APP_VERSION` | yes (build-time) | `0.0.0-dev` | Injected from root `package.json#version` at build — see [Release Versioning](#release-versioning) |
| `SENTRY_DSN` | yes (Phase 2.2) | — | **Filled in by Phase 2.2 (#209).** Server-side Sentry project DSN. |
| `SENTRY_AUTH_TOKEN` | yes (build-time, Phase 2.2) | — | **Filled in by Phase 2.2 (#209).** Sentry CLI token for source map upload. |
| `VAPID_PUBLIC_KEY` | yes | — | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | yes | — | Web Push VAPID private key |
| `VAPID_SUBJECT` | yes | — | `mailto:` contact for Web Push |
| `RESEND_API_KEY` | yes | — | Transactional email sender (password resets, verification) |
| `RESEND_FROM_EMAIL` | yes | — | Verified sender address for Resend |

### Web (Vercel)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | yes | — | Public URL of the Render API, used by the browser |
| `APP_VERSION` | yes (build-time) | `0.0.0-dev` | Injected from root `package.json#version` via `next.config.mjs` — see [Release Versioning](#release-versioning) |
| `NEXT_PUBLIC_SENTRY_DSN` | yes (Phase 2.2) | — | **Filled in by Phase 2.2 (#209).** Browser Sentry DSN. |

If Phase 2.2 (#209 Sentry) or other parallel phases add more variables, append rows to these tables rather than creating a new section.

---

## Database Connection Pool

Prisma defaults to `num_cpus * 2 + 1` connections. On Render's starter instance this is only 5, which will exhaust under load with 145 API endpoints plus background schedulers (round resolution, leaderboard refresh, metrics, mob cleanup).

Neon's pooled endpoint (port `5432` on the `-pooler` host) uses PgBouncer in transaction mode, which Prisma requires `pgbouncer=true` for so it skips prepared statements.

### Production `DATABASE_URL`

Use Neon's **pooled** connection string (hostname ending in `-pooler.<region>.aws.neon.tech`) and append the following params:

```
postgresql://<user>:<pass>@<project>-pooler.<region>.aws.neon.tech/<db>?sslmode=require&pgbouncer=true&connection_limit=20&pool_timeout=15
```

| Param | Recommended | Reason |
|-------|-------------|--------|
| `sslmode=require` | required | Neon enforces TLS |
| `pgbouncer=true` | required when using `-pooler` host | Disables Prisma's prepared statement cache (PgBouncer transaction mode is incompatible with them) |
| `connection_limit=20` | 20 | Stays well under Neon's compute-tier connection ceiling; room for background schedulers + request traffic |
| `pool_timeout=15` | 15 | Seconds Prisma waits for a free connection before throwing `P2024`. Default 10 is too tight during burst traffic. |

### Migration `DATABASE_URL` (direct connection)

Prisma `migrate deploy` must use the **unpooled** direct connection (hostname without `-pooler`). Set it as a separate Render env var `DIRECT_DATABASE_URL` and reference it in `schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

Running migrations through the pooler causes advisory-lock failures. If `directUrl` is not yet present in `schema.prisma`, add it in the same PR that introduces `DIRECT_DATABASE_URL`.

---

## Release Versioning

`APP_VERSION` is injected at build time from the root `package.json#version` field. Both the API and web apps read the same value so Sentry release tags, the `/health` payload, and the in-game changelog all agree.

### How it is wired

- **Root package.json** is the single source of truth (`pocketrealm` workspace, `version` field).
- **API build** (`apps/api/package.json` `build` script) uses `cross-env APP_VERSION=$(node -p "require('../../package.json').version")` before `tsc`, so Render's build step captures the version into `process.env.APP_VERSION` at compile time. Runtime code reads it from `apps/api/src/version.ts`.
- **Web build** (`apps/web/next.config.mjs`) reads the same `package.json` via `createRequire(import.meta.url)` and sets `env: { APP_VERSION: pkg.version }`, which Next.js inlines into client and server bundles.
- **Runtime fallback:** both surfaces fall back to `'0.0.0-dev'` if unset (local `npm run dev`, vitest).

### Consumers

- `GET /health` returns `{ status, timestamp, version }` — used by uptime monitors and deploy smoke tests.
- Phase 2.2 (#209) will pass `APP_VERSION` to `Sentry.init({ release })` on both surfaces.
- Phase 2.3 (#210) will include `version` in `/health/ready`.

To cut a release, bump `version` in root `package.json`, merge to `main`, and Render/Vercel pick it up on the next build.

---

## Logging

Pino is configured in `apps/api/src/logger.ts`. The level is selected in this order:

1. `LOG_LEVEL` env var if set (any of `fatal`, `error`, `warn`, `info`, `debug`, `trace`)
2. `info` when `NODE_ENV=production`
3. `debug` otherwise

Production Render deploys should leave `LOG_LEVEL` unset to inherit `info`. Temporarily set `LOG_LEVEL=debug` on Render when diagnosing a live issue; revert after.

Render captures stdout JSON logs automatically — no log shipper is required. Request logs and game-event logs are emitted by Phase 2.1's logger middleware (`apps/api/src/middleware/requestLogger.ts`) and exclude `/health*` paths to keep uptime pings out of the log stream.

---

## Migration Runbook

Follow this every deploy that ships a Prisma schema change.

### Pre-deploy

1. **Confirm the migration on staging.** Run `npx prisma migrate deploy` against staging's `DIRECT_DATABASE_URL`. Verify the migration shows `Applied` and no follow-up statements are pending.
2. **Smoke-test staging** (see [Smoke Tests](#smoke-tests) below).
3. **Backup sanity check.** Confirm Neon has a backup from within the last 24 h (see [Backup Verification & Restore](#backup-verification--restore)).
4. **Announce** in the deploys Discord channel: version, PR link, migration name(s), expected downtime (usually none — migrations are online unless they take locks).
5. **Check for destructive operations.** Inspect the new migration SQL under `packages/database/prisma/migrations/<timestamp>_*/migration.sql`. If it contains `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN ... TYPE`, or a `NOT NULL` add without default — escalate to a maintenance window and verify rollback plan below.

### Deploy

1. Merge PR to `main`. Render rebuilds API, Vercel rebuilds web.
2. Render build step runs `npx prisma migrate deploy` (via the `build:api` script chain) against `DIRECT_DATABASE_URL`.
3. Wait for `/health` on Render to report the new `APP_VERSION` — this confirms the new build is live.
4. Run the [Smoke Tests](#smoke-tests) against production.

### Rollback Plan

Rollbacks depend on migration type:

- **Additive migration** (new table, new nullable column, new index): roll forward. Redeploy the previous commit; the added objects stay, unused, until a future cleanup migration.
- **Destructive migration** (dropped column/table, type change): cannot be auto-reverted by Prisma.
  1. Disable traffic: flip Render's "maintenance mode" or scale API to 0 instances.
  2. Restore the database from the Neon backup taken in pre-deploy step 3 — see [Backup Verification & Restore](#backup-verification--restore). **Data written since the backup will be lost** — communicate this.
  3. Redeploy the previous commit.
  4. Re-enable traffic.
- **Code-only regression** (no migration): revert the PR on `main` and let Render/Vercel rebuild. No DB action needed.

Never hand-edit `_prisma_migrations` unless you are recovering from a failed partial migration and have a Neon restore point ready.

### Smoke Tests

Run against the base URL of the environment you just deployed (staging or prod). Replace `$BASE` below.

```bash
# 1. Liveness + version
curl -fsS "$BASE/health" | tee /dev/stderr | jq -e '.status == "ok" and (.version | test("^[0-9]+\\.[0-9]+\\.[0-9]+"))'

# 2. Auth round-trip (uses a seeded smoke-test account — credentials in 1Password "PocketRealm / Smoke Test")
curl -fsS -X POST "$BASE/api/v1/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"smoketest","password":"<from-1password>"}' | jq -e '.token'

# 3. Player bootstrap (replace $TOKEN with the token from step 2)
curl -fsS "$BASE/api/v1/player/state" -H "authorization: Bearer $TOKEN" | jq -e '.player.id'

# 4. Inventory read (catches Prisma client / schema mismatches)
curl -fsS "$BASE/api/v1/inventory" -H "authorization: Bearer $TOKEN" | jq -e '.items'
```

If any step returns non-zero, halt and start the rollback plan.

---

## Backup Verification & Restore

Neon provides point-in-time recovery (PITR) as part of every paid plan. PocketRealm's Neon project uses the **7-day PITR retention window** on the Launch tier (upgrade to 30-day before launch if the user base warrants it).

### What Neon gives us

- **Continuous WAL archiving** — every write is captured; you can restore to any second within the retention window.
- **Automatic daily snapshots** at 00:00 UTC — visible in the Neon console under **Branches → main → History**.
- **Zero-config** — no cron, no S3 bucket to babysit.

### Verifying a backup exists

Do this weekly (add to team calendar) and before every destructive migration:

1. Log in to the Neon console → select the PocketRealm project → **Branches** tab.
2. Confirm the `main` branch shows a **History** entry within the last 24 h. Each entry lists the LSN and timestamp.
3. Optional scripted check:

```bash
# Requires NEON_API_KEY in env. Lists the 5 most recent restore points for the main branch.
curl -fsS "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches" \
  -H "authorization: Bearer $NEON_API_KEY" \
  | jq '.branches[] | select(.name=="main") | {id, last_reset_lsn, updated_at}'
```

If `updated_at` is stale or the API returns empty, open a Neon support ticket immediately.

### Restoring from backup

Neon restore is branch-based: you create a new branch at a prior LSN/timestamp, verify it, then swap it in as the new `main`.

1. **Console flow (preferred, also supported via API):**
   - Neon console → **Branches** → **Create branch**
   - Parent: `main`
   - Branch point: **Time** → pick a timestamp just before the incident
   - Name: `restore-YYYYMMDD-HHMM`
2. **Verify** the new branch:
   - Update a local `DATABASE_URL` to point at the new branch's connection string.
   - Run `npm run db:studio` and spot-check 2–3 known records that existed pre-incident.
3. **Promote** the restored branch:
   - Option A (full cutover): in Neon console, **Branches → restore-... → Set as primary**. This renames `main` to a timestamped archive and makes the restored branch the new `main`. Render/Vercel pick it up automatically because `DATABASE_URL` still points at the `main` branch endpoint.
   - Option B (hotfix path): update Render's `DATABASE_URL` and `DIRECT_DATABASE_URL` to the restore branch directly, then trigger a redeploy.
4. **Re-run smoke tests** (see [Smoke Tests](#smoke-tests)).
5. **Announce** restore complete in Discord with the lost-data window.

### Disaster-recovery drill

Once per quarter, create a throwaway restore branch from a point 6 h in the past, connect a local dev API to it, and confirm the data looks sane. This catches silent backup regressions before they matter.
~~~

- [ ] **Step 2: Verify the rendered markdown.** Open the file in a preview, confirm:
  - All anchor links (`#environment-variables`, `#database-connection-pool`, `#release-versioning`, `#backup-verification--restore`, `#smoke-tests`, `#logging`) resolve.
  - The env var tables render with the `Phase 2.2` placeholder rows present.
  - No trailing whitespace (`npm run lint` on docs if there's a markdownlint config).

---

### Task 2: Add `directUrl` to Prisma schema (if missing)

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

This task is **conditional** — only execute it if `schema.prisma` does not already declare `directUrl`. The deployment doc references it; the schema must match.

- [ ] **Step 1: Check current schema.** Read `packages/database/prisma/schema.prisma`. Find the `datasource db` block.
- [ ] **Step 2: If `directUrl` is absent**, add it:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

- [ ] **Step 3: Regenerate the Prisma client** locally: `npm run db:generate`.
- [ ] **Step 4: If `directUrl` was already present**, skip this task and remove the `DIRECT_DATABASE_URL` TODO from the deployment doc's migration section (it becomes descriptive, not prescriptive).
- [ ] **Step 5: Run `npm run typecheck` and `npm run test -w packages/database`** — no new tests needed, but confirm nothing regressed.

Note: no migration file is generated by this change — `directUrl` is a Prisma-client-only setting, not a schema mutation.

---

### Task 3: Wire build-time `APP_VERSION` (TDD)

**Files:**
- Create: `apps/api/src/version.ts`
- Create: `apps/api/src/version.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/web/next.config.mjs`

- [ ] **Step 1 (RED): Write `apps/api/src/version.test.ts`.**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('APP_VERSION', () => {
  const original = process.env.APP_VERSION;

  beforeEach(() => {
    delete process.env.APP_VERSION;
  });

  afterEach(() => {
    process.env.APP_VERSION = original;
  });

  it('falls back to 0.0.0-dev when env is unset', async () => {
    const mod = await import(`./version.ts?nocache=${Date.now()}`);
    expect(mod.APP_VERSION).toBe('0.0.0-dev');
  });

  it('uses APP_VERSION from the environment', async () => {
    process.env.APP_VERSION = '1.2.3';
    const mod = await import(`./version.ts?nocache=${Date.now()}`);
    expect(mod.APP_VERSION).toBe('1.2.3');
  });
});
```

Run `npm run test -w apps/api -- version.test.ts`. Expect failure (module does not exist).

- [ ] **Step 2 (GREEN): Create `apps/api/src/version.ts`.**

```ts
export const APP_VERSION = process.env.APP_VERSION ?? '0.0.0-dev';
```

Re-run the test. Expect pass.

- [ ] **Step 3: Update `apps/api/package.json` `build` script** to inject `APP_VERSION` at build time. Use `cross-env-shell` (from the existing `cross-env` package) which evaluates `$(...)` substitution on both Windows and POSIX:

```json
"build": "npm run clean && cross-env-shell NODE_OPTIONS=--max-old-space-size=1024 APP_VERSION=\"$(node -p \\\"require('../../package.json').version\\\")\" tsc"
```

Verify by running `npm run build:api` and checking Render's build logs show `APP_VERSION=0.1.0` (or whatever root `package.json` says).

- [ ] **Step 4: Update `apps/web/next.config.mjs`** to expose `APP_VERSION` to both server and client bundles:

```js
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import withSerwistInit from "@serwist/next";
import { withPlausibleProxy } from "next-plausible";

const require = createRequire(import.meta.url);
const rootPkg = require("../../package.json");
const APP_VERSION = process.env.APP_VERSION ?? rootPkg.version ?? "0.0.0-dev";

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

export default withPlausibleProxy()(withSerwist({
  reactStrictMode: true,
  transpilePackages: ["@pocketrealm/shared", "@pocketrealm/game-engine"],
  images: {
    minimumCacheTTL: 2592000,
  },
  env: {
    APP_VERSION,
  },
}));
```

- [ ] **Step 5: Run `npm run typecheck && npm run test -w apps/api && npm run build:web`.** Fix anything red. Confirm the web build log prints `APP_VERSION` resolved to the root `package.json` version.

---

### Task 4: Expose `APP_VERSION` on `/health` (TDD)

**Files:**
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/health.test.ts`

Note: if Phase 2.3 already landed the full health router, skip this task and instead open a follow-up to thread `APP_VERSION` into that router.

- [ ] **Step 1 (RED): Write `apps/api/src/health.test.ts`** using supertest:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { APP_VERSION } from './version';

describe('GET /health', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
      });
    });
  });

  it('returns ok status and APP_VERSION', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe(APP_VERSION);
    expect(typeof res.body.timestamp).toBe('string');
  });
});
```

Note: this test reimplements the handler rather than importing `apps/api/src/index.ts` — the index file boots schedulers and binds a port on import, which we can't do in unit tests. Phase 2.3 will refactor `/health` into its own router module that can be imported cleanly.

If `supertest` is not yet a dev dep, run `npm install -w apps/api -D supertest @types/supertest`.

Run: `npm run test -w apps/api -- health.test.ts`. Expect failure (no `APP_VERSION` import yet, or handler mismatch).

- [ ] **Step 2 (GREEN): Modify `apps/api/src/index.ts`.** Add the import near the other local imports:

```ts
import { APP_VERSION } from './version';
```

Replace the `/health` handler:

```ts
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: APP_VERSION });
});
```

And update the startup log to include the version:

```ts
server.listen(PORT, () => {
  logger.info({ port: PORT, version: APP_VERSION }, 'PocketRealm API running');
  // ... rest unchanged
});
```

Re-run the test. Expect pass.

- [ ] **Step 3: Hand-verify locally.** `npm run dev:api`, then `curl http://localhost:4000/health`. Confirm response includes `"version":"0.0.0-dev"` (or whatever the build injected).

---

### Task 5: Verify `LOG_LEVEL` end-to-end

**Files:** none (verification only; doc already written in Task 1)

Phase 2.1 already implemented `LOG_LEVEL` support in `apps/api/src/logger.ts`. This task is a verification step — no code changes unless a regression is found.

- [ ] **Step 1: Read `apps/api/src/logger.ts`.** Confirm it reads `process.env.LOG_LEVEL` and falls back to `info` in production, `debug` otherwise.
- [ ] **Step 2: Verify the existing `apps/api/src/logger.test.ts` covers the env var.** If it only tests the default case, add one more test:

```ts
it('respects LOG_LEVEL env var', async () => {
  const original = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'warn';
  const { logger: reloaded } = await import(`./logger.ts?nocache=${Date.now()}`);
  expect(reloaded.level).toBe('warn');
  process.env.LOG_LEVEL = original;
});
```

- [ ] **Step 3: Run `npm run test -w apps/api -- logger.test.ts`.** Expect pass.
- [ ] **Step 4: No doc changes needed** — the "Logging" section written in Task 1 already documents the fallback rules.

---

### Task 6: Verify connection pool docs match the spec (no code change)

**Files:** none

- [ ] **Step 1: Confirm `packages/database/src/index.ts`** still uses the default `new PrismaClient()` constructor with no explicit pool overrides. (It does — pool params are read from the URL query string, which is the correct pattern.)
- [ ] **Step 2: Confirm no existing infra pins `DATABASE_URL` without pool params.** Grep the repo for `DATABASE_URL=` in committed files (should only appear in `docs/reference/deployment.md` and `.env.example` if present). If `.env.example` exists and is missing pool params, update it to match the doc.
- [ ] **Step 3: File a follow-up** to rotate Render's `DATABASE_URL` to include `connection_limit=20&pool_timeout=15&pgbouncer=true` if it doesn't already. This is a Render dashboard change outside the PR — capture it as a task in the PR description's "After merge" checklist.

---

### Task 7: Final verification and PR

- [ ] **Step 1: Run the full build and test suite.**
  ```bash
  npm run typecheck && npm run test && npm run build
  ```
  Everything green.
- [ ] **Step 2: Manual curl of local `/health`** — confirm it returns `version`.
- [ ] **Step 3: PR description** — copy the "Coordination with parallel phases" section from this plan verbatim into the PR body, plus:
  - Link to issue #211.
  - **After merge checklist:**
    - [ ] Rotate Render `DATABASE_URL` to include pool params.
    - [ ] Add `DIRECT_DATABASE_URL` to Render env.
    - [ ] Verify Render build logs show `APP_VERSION` set.
    - [ ] Verify production `/health` returns `version`.
    - [ ] Schedule first quarterly disaster-recovery drill.
- [ ] **Step 4: Request review** using superpowers:requesting-code-review. Tag the engineers owning 2.2 and 2.3 so they know their env var rows and `APP_VERSION` consumer are in place.

---

## Exit criteria

- `docs/reference/deployment.md` contains env var table, connection pool section, migration runbook, backup runbook, logging, and release versioning sections.
- `GET /health` returns `{ status, timestamp, version }` where `version` is the root `package.json` version in CI builds and `0.0.0-dev` locally.
- `apps/api/src/version.ts` and `apps/web/next.config.mjs` both resolve `APP_VERSION` from root `package.json` at build time.
- All new tests pass; `npm run test` and `npm run typecheck` green.
- PR description includes coordination notes so 2.2 and 2.3 can rebase cleanly.
