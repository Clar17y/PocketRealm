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
- Health check path: `/health/ready` (see [Health Check Endpoints](#health-check-endpoints))
- Background timers: none fixed-cadence. Boss and expedition rounds resolve via an in-process `setTimeout` registry keyed by `nextRoundAt`, rehydrated from DB on boot. Other maintenance work is activity-triggered or lazy-on-touch. See `docs/superpowers/specs/2026-04-11-event-driven-scheduling-design.md`.
- Metrics logger (60 s, in-memory only; does not touch Postgres)

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
| `APP_VERSION` | no | (root `package.json#version`) | Override for the version reported by `/health` and Sentry. If unset, the API reads root `package.json#version` at runtime — see [Release Versioning](#release-versioning) |
| `SENTRY_DSN` | yes (prod), no (dev) | — | Server-side Sentry project DSN. Leave unset to disable Sentry. See [Sentry Error Tracking](#sentry-error-tracking). |
| `SENTRY_ENVIRONMENT` | no | `NODE_ENV` | Overrides `NODE_ENV` for the Sentry environment tag (`production` / `staging`). |
| `SENTRY_AUTH_TOKEN` | yes (web build-time) | — | Sentry CLI token used by `next build` to upload web source maps. Not read by the API. |
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
| `NEXT_PUBLIC_SENTRY_DSN` | yes (prod), no (dev) | — | Browser Sentry DSN. Leave unset to disable. See [Sentry Error Tracking](#sentry-error-tracking). |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | no | `NODE_ENV` | Environment tag for client-side Sentry init. |
| `SENTRY_ORG` | yes (web build-time) | — | Sentry org slug for `next build` source map upload. |
| `SENTRY_PROJECT` | yes (web build-time) | — | Sentry project slug for `next build` source map upload. |

Parallel phases adding new variables should append rows to these tables rather than creating a new section.

---

## Database Connection Pool

> **Pre-merge gate:** Before merging the PR that introduces `directUrl` to `schema.prisma` to `main`, confirm Render has `DIRECT_DATABASE_URL` configured on the API service (unpooled Neon connection string — hostname **without** `-pooler`). Without it, `prisma migrate deploy` in the Render build step fails with `P1012: Environment variable not found: DIRECT_DATABASE_URL`. Local worktrees are provisioned automatically by `scripts/setup-worktree.sh`.

Prisma defaults to `num_cpus * 2 + 1` connections. On Render's starter instance this is only 5, which will exhaust under load with 145 API endpoints plus bursty activity-triggered maintenance.

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
| `connection_limit=20` | 20 | Stays well under Neon's compute-tier connection ceiling; room for request bursts plus activity-triggered maintenance |
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

Both the API and web apps read the version from the same root `package.json#version` field so Sentry release tags, the `/health` payload, and the in-game changelog all agree.

### How it is wired

- **Root package.json** is the single source of truth (`pocketrealm` workspace, `version` field).
- **API runtime** reads root `package.json` directly via `require('../../../package.json')` in `apps/api/src/version.ts`. The `APP_VERSION` env var, if set, takes precedence — useful for testing, staging overrides, or pinning a release tag independently of the shipped `package.json`.
- **API build audit log.** `apps/api/scripts/build.cjs` reads root `package.json#version` and logs `[build:api] APP_VERSION=<x.y.z>` to the Render build log so the release tag is visible in build output. It also sets `APP_VERSION` on the spawned `tsc` process, but this is for parity only — production runtime does not depend on that env var being set. (A Node wrapper is used instead of `cross-env-shell $(...)` because `cross-env-shell` does not evaluate command substitution on Windows.)
- **Web build** (`apps/web/next.config.mjs`) reads the same `package.json` via `createRequire(import.meta.url)` and sets `env: { APP_VERSION: pkg.version }`, which Next.js inlines into client and server bundles.
- **Runtime fallback:** both surfaces fall back to `'0.0.0-dev'` only if the root `package.json` lookup throws (should not happen in practice).

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
# Liveness + version
curl -fsS "$BASE/health" | tee /dev/stderr | jq -e '.status == "ok" and (.version | test("^[0-9]+\\.[0-9]+\\.[0-9]+"))'
```

**TODO:** wire up an end-to-end auth smoke test (login → player read → inventory read) once a seeded smoke-test account is provisioned in staging and prod. The auth contract is `POST /api/v1/auth/login` with `{email, password}` returning `{accessToken, refreshToken, player}`; current player data is at `GET /api/v1/player/` with `Authorization: Bearer <accessToken>`; inventory is at `GET /api/v1/inventory`.

If the liveness check fails or reports an old version, halt and start the rollback plan.

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

---

## Health Check Endpoints

The API exposes three health endpoints, all mounted at the root (no `/api/v1` prefix, no auth, excluded from request logs and rate limits):

| Endpoint | Purpose | Status Codes | Touches Dependencies |
|----------|---------|--------------|----------------------|
| `GET /health/live` | Liveness probe — "is the process alive?" | Always `200` | No |
| `GET /health/ready` | Readiness probe — "can it serve traffic?" | `200` healthy, `503` unhealthy | Yes (DB + Redis) |
| `GET /health` | Full snapshot (version, uptime, dependencies, socket count) | `200` (never 5xx) | Yes (DB + Redis) |

### `/health` response shape

```json
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
```

`status` is `"degraded"` if any dependency returns `"error"`. `/health` still returns `200` in that case — use `/health/ready` as the hard gate.

> **Migrating existing monitors:** Prior to this release `/health` always returned `{"status":"ok"}`. Any uptime monitor using a keyword rule on that literal body MUST be repointed at `/health/ready` (which still returns a clean `200` + `"status":"ok"`). Leaving an existing keyword monitor on `/health` will cause false pages whenever a dependency flaps, because `/health` now reports `"status":"degraded"` without changing the HTTP status. Audit Render's built-in health check too — if it is still configured against `/health`, switch it to `/health/ready` before relying on auto-restart.

During a SIGTERM graceful shutdown `/health/ready` returns `503` with `{"status":"shutting_down"}` before the process actually closes dependencies, so the load balancer can drain traffic cleanly.

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

---

## Sentry Error Tracking

Sentry is wired into both the API (`@sentry/node`) and the web app
(`@sentry/nextjs`). Both SDKs no-op when no DSN is configured, so local
development stays noise-free by default.

### API environment variables

| Var | Where | Notes |
|-----|-------|-------|
| `SENTRY_DSN` | API runtime | Public project DSN. Leave unset to disable Sentry entirely. |
| `SENTRY_ENVIRONMENT` | API runtime | Overrides `NODE_ENV` for the Sentry environment tag. Set to `production` / `staging`. |
| `APP_VERSION` | API runtime | Used as the Sentry release tag and surfaced in `/health` response as `version`. Falls back to `"unknown"`. |

### Web environment variables

| Var | Where | Notes |
|-----|-------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | Build + runtime | Public DSN. Exposed to the browser. |
| `NEXT_PUBLIC_APP_VERSION` | Build | Release tag mirroring the API `APP_VERSION`. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Build | Optional override for the environment tag (client-side init). |
| `SENTRY_ENVIRONMENT` | Build | Optional override for the environment tag (server/edge init). |
| `SENTRY_AUTH_TOKEN` | **Build only** | Personal/project auth token used to upload source maps during `next build`. Never expose to the browser. |
| `SENTRY_ORG` | Build only | Sentry org slug. |
| `SENTRY_PROJECT` | Build only | Sentry project slug. |

Source maps upload only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and
`SENTRY_PROJECT` are all present during `next build`. Missing any of
them logs a warning via `withSentryConfig`'s `errorHandler` and the
build continues so offline dev and PR preview builds aren't blocked.

Process-level unhandled rejections and uncaught exceptions in the API
are forwarded to Sentry and logged via pino before the process exits.
4xx `AppError` responses and `ZodError` validation failures are
deliberately filtered out at the SDK boundary (`beforeSend`) so only
true server errors reach the dashboard.
