# Overnight Security Audit Findings

**Started:** April 21, 2026
**Scope:** Pocketrealm repo security review performed across recurring overnight audit passes
**Status:** Remediation pass complete for OA-01 through OA-13 except the documented OA-02 moderate dependency deferral
**Last updated:** April 24, 2026

This document captures findings from the April 21, 2026 overnight security audit so they are tracked in-repo instead of only appearing in the thread. New findings should be appended here as later audit passes complete.

## Findings Summary

| ID | Status | Severity | Area | Finding |
|---|---|---|---|---|
| OA-01 | FIXED | high | Auth / Session Management | Refresh tokens are stored hashed at rest; rollout revokes pre-existing plaintext refresh sessions |
| OA-02 | PARTIAL | high | Dependency Baseline | High advisories fixed through targeted current-major upgrades; Resend/Svix/uuid moderate chain remains deferred |
| OA-03 | FIXED | medium | Stripe Webhook / Availability | The public Stripe webhook endpoint has a dedicated fail-closed limiter before raw-body parsing |
| OA-04 | FIXED | medium | Socket.IO Auth / Admin Actions | Admin-only socket chat moderation events now revalidate admin role from the database |
| OA-05 | FIXED | medium | Rate Limiting / Registration | Registration now has a dedicated limiter that fails closed if Redis is unavailable |
| OA-06 | FIXED | medium | Chat Authorization / Data Exposure | Chat history now checks channel-specific zone and guild membership before returning history |
| OA-07 | FIXED | low | Health Endpoint Exposure | Public health endpoints now return only coarse status values |
| OA-08 | FIXED | medium | Guild Authorization / Internal State | Internal guild read endpoints now require current guild membership before returning state |
| OA-09 | FIXED | medium | Socket.IO Chat Authorization / Stale Room Membership | Zone and guild chat sends/broadcasts now revalidate and prune stale room membership |
| OA-10 | FIXED | medium | Boss Event Data Exposure | Non-participants now receive sanitized boss participant telemetry without raw player IDs or live resources |
| OA-11 | FIXED | low | Casino Socket Data Exposure | Casino bet broadcasts no longer include raw bettor player IDs |
| OA-12 | FIXED | medium | Socket.IO Session Revocation | Chat sockets now disconnect on access-token expiry and password/logout session invalidation |
| OA-13 | FIXED | low | Exploration Estimate Data Exposure | Exploration estimates now reject undiscovered target zones |

## April 24 Remediation Pass

- Pulled latest `origin/main` into `codex/security-audit-findings-doc` before continuing fixes.
- Fixed the remaining code-fixable OA-06 through OA-13 findings.
- Hardened OA-03 and OA-05 so the Stripe webhook and registration limiters fail closed on Redis limiter-store errors.
- OA-02 remains partial because the remaining `resend -> svix -> uuid` advisory chain is moderate severity and npm's forced fix path would install a breaking/downgrade Resend version.
- Broad verification run: `npm run db:generate`; `npm run typecheck`; `npm run test:api`; `npm audit --workspaces --audit-level=high`; `git diff --check`.

## OA-01: Refresh Tokens Stored in Plaintext

**Severity:** high
**Area:** Authentication, session management
**Status:** FIXED
**Checked:** April 21, 2026
**Fixed:** April 23, 2026

### Files Reviewed

- `apps/api/src/routes/auth.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/services/authTokenService.ts`
- `packages/database/prisma/schema.prisma`

### Evidence

- Refresh tokens are persisted as raw bearer tokens in the database model:
  - `packages/database/prisma/schema.prisma`
  - `model RefreshToken`
  - `token String @unique @db.Text`
- The register flow stores the raw token directly:
  - `apps/api/src/routes/auth.ts:192`
- The login flow stores the raw token directly:
  - `apps/api/src/routes/auth.ts:283`
- The refresh flow looks up the raw token directly:
  - `apps/api/src/routes/auth.ts:320`
- The rotated refresh token is stored raw again:
  - `apps/api/src/routes/auth.ts:357`
- By contrast, email-verification and password-reset tokens are explicitly hashed before DB storage:
  - `apps/api/src/services/authTokenService.ts:10`

### Exploit Path

1. An attacker obtains read access to the `refresh_tokens` table through a database leak, compromised admin tooling, backup exposure, or SQL-read vulnerability.
2. The attacker extracts a raw refresh token string from the database.
3. The attacker calls `POST /api/v1/auth/refresh` with that token.
4. Because the system both verifies the JWT and matches the raw token row directly, the attacker can mint a fresh access token and a fresh refresh token without knowing the password.
5. This becomes immediate account takeover for any session represented in the table.

### Why This Matters

Database read access should not automatically translate into live session replay. The codebase already treats email-verification and password-reset tokens as secrets that must be hashed at rest. Refresh tokens should have the same protection.

### Recommended Fix

- Replace plaintext refresh-token storage with a SHA-256 token hash, matching the approach used in `apps/api/src/services/authTokenService.ts`.
- Store only the hash in `RefreshToken`.
- Hash the presented token during refresh and logout before lookup/deletion.
- Rename the schema field to `tokenHash` to make the storage contract explicit.
- Invalidate existing plaintext rows during rollout or migrate them carefully with a forced re-login plan.

### Remediation

- `apps/api/src/services/authSessionService.ts` now hashes refresh tokens with the shared SHA-256 `hashToken()` helper before storing new account sessions.
- `apps/api/src/routes/auth.ts` now hashes presented refresh tokens before refresh lookup, rotation cleanup, and logout deletion.
- Refresh rotation now atomically consumes the stored hashed verifier with `tokenHash`, `accountId`, and `expiresAt >= now` before minting a replacement, so concurrent refresh attempts cannot both rotate the same token.
- Logout now disconnects player sockets only after the presented refresh token hash actually deletes a stored row, so already-revoked signed tokens cannot be used as a socket-disconnect primitive.
- `packages/database/prisma/schema.prisma` now models `RefreshToken.tokenHash` mapped to `refresh_tokens.token_hash`.
- `packages/database/prisma/migrations/20260423235000_hash_refresh_tokens/migration.sql` deletes existing `refresh_tokens` rows before renaming the column, intentionally forcing re-login so no replayable plaintext refresh token survives rollout.
- `apps/api/src/routes/auth.test.ts` now covers hashed storage for register/login, hashed lookup and deletion during refresh rotation, and hashed logout revocation.

**Risk closed:** A database read of `refresh_tokens` no longer yields bearer refresh tokens that can be replayed against `POST /api/v1/auth/refresh`.

**Residual risk:** Access tokens already issued before rollout remain valid until their normal short expiry. The migration intentionally revokes refresh sessions, so active users must log in again after deploy/migration.

**Verification:** `npm run test:api -- src/routes/auth.test.ts src/routes/auth.seasons.test.ts`; `npm run test:api -- src/socket/socketAuth.test.ts src/routes/auth.test.ts src/routes/auth.seasons.test.ts`.

## OA-02: Dependency Vulnerability Baseline

**Severity:** high
**Area:** Dependency hygiene
**Status:** PARTIAL
**Checked:** April 21, 2026
**Updated:** April 23, 2026

### Command Run

- `npm audit --workspaces --json`

### Summary

The current install reported **14 advisories**:

- `12 high`
- `2 moderate`

Not every advisory is equally urgent, but several affect packages that are part of the runtime or server-side toolchain and should be tracked as real risk until upgraded or explicitly triaged.

### Runtime-Facing Packages Flagged

| Package | Installed Version | Severity | Notes |
|---|---|---|---|
| `next` | `16.1.6` | high | Reported with multiple advisories, including a server-components DoS issue affecting versions below `16.2.3` |
| `prisma` | `6.19.2` | high | Flagged via `@prisma/config` / `effect` chain |
| `@prisma/client` | `6.19.2` | high | Same Prisma toolchain exposure |
| `socket.io-parser` | `4.2.5` | high | Reported for unbounded binary attachments |
| `path-to-regexp` | transitive | high | Express routing dependency reported for ReDoS in older ranges |

### Tooling / Development Packages Flagged

| Package | Installed Version | Severity | Notes |
|---|---|---|---|
| `vite` | `7.3.1` | high | Multiple advisories affecting dev-server file exposure and path traversal behavior |
| `rollup` | `4.57.1` | high | Advisory reported for arbitrary file write via path traversal |
| `minimatch` | mixed transitive versions | high | ReDoS advisories in older ranges |
| `picomatch` | `4.0.3` | high | ReDoS advisory in affected range |
| `ajv` | transitive | moderate | ReDoS advisory in older range |
| `brace-expansion` | transitive | moderate | Process hang / memory exhaustion advisory |

### Exploit Path

1. A vulnerable runtime package remains deployed.
2. An attacker targets the affected behavior for the installed version, such as denial of service or parser abuse.
3. The application inherits the library weakness even if the app code itself is otherwise careful.

For dev-only packages, the main risk is local or CI exposure rather than direct production exploitation, but they still need triage because developer tooling regularly handles secrets, source code, and build artifacts.

### Recommended Fix

- Prioritize upgrading `next`, `prisma`, `@prisma/client`, and any Socket.IO components first.
- Re-run `npm audit --workspaces` after each upgrade batch to confirm the remaining list.
- Separate runtime blockers from dev-only advisories so launch-risk decisions stay clear.
- Record package-specific upgrade constraints before making major-version jumps, especially for Prisma.

### Remediation

- Updated Next.js from `16.1.6` to `16.2.4` in the root package, `apps/web`, and `packages/game-engine`, clearing the reported Next.js runtime advisories including the server-components DoS range below `16.2.3`.
- Updated Prisma packages from `6.19.2` to `6.19.3`, clearing the `@prisma/config` / `effect` high advisory chain while staying on Prisma 6.
- Refreshed vulnerable transitive packages in the lockfile, including `socket.io-parser`, `path-to-regexp`, `vite`, `rollup`, `picomatch`, `minimatch`, `brace-expansion`, `ajv`, and `flatted`.

**Risk closed:** `npm audit --workspaces --json` now reports `0 high` advisories, down from `12 high`.

**Residual risk:** `npm audit --workspaces --json` still reports `3 moderate` advisories in the `resend -> svix -> uuid` chain. npm's only suggested fix is `resend@6.1.3`, which is a breaking/downgrade path from the installed `6.9.4` line, so it was deferred pending explicit email-provider compatibility testing or an upstream patched Resend/Svix release.

**Verification:** `npm audit --workspaces --json` (0 high, 3 moderate remaining); `npm audit --workspaces --audit-level=high`.

## OA-03: Stripe Webhook Excluded From Rate Limiting

**Severity:** medium
**Area:** Stripe webhook, availability
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 23, 2026

### Files Reviewed

- `apps/api/src/index.ts`
- `apps/api/src/routes/premiumWebhook.ts`
- `apps/api/src/services/stripeService.ts`
- `apps/api/src/services/premiumService.ts`

### Evidence

- The global limiter explicitly skips the webhook path:
  - `apps/api/src/index.ts:130`
  - `req.path === '/premium/webhook/stripe'`
- The webhook route is mounted publicly before the JSON parser, with no route-local limiter:
  - `apps/api/src/index.ts:135`
  - `apps/api/src/routes/premiumWebhook.ts:65`
- The route immediately performs raw-body processing and Stripe signature verification:
  - `apps/api/src/routes/premiumWebhook.ts:67`
  - `apps/api/src/routes/premiumWebhook.ts:70`
  - `apps/api/src/services/stripeService.ts:98`

### Exploit Path

1. An attacker sends a large volume of unauthenticated requests to `POST /api/v1/premium/webhook/stripe`.
2. The requests bypass the application's global rate limiter because the path is explicitly exempted.
3. Each request still reaches the raw-body route and invokes Stripe webhook signature parsing logic.
4. Under sustained traffic, the endpoint can consume disproportionate CPU and request capacity compared with the rest of the API, creating an availability risk.

This does not require a valid Stripe signature. The attacker only needs network reachability to the public webhook endpoint.

### Why This Matters

The webhook route is one of the few intentionally public POST endpoints. Exempting it entirely from rate limiting creates a softer DoS target than the rest of the API, especially because the code path includes body buffering and cryptographic verification work.

The fulfillment logic itself looks well-defended against duplicate grants:

- Signature verification is enforced.
- The session must be paid and match the expected product, amount, and currency.
- Premium grants are deduplicated by unique session/payment-intent identifiers in `premium_purchases`.

The main weakness here is availability, not integrity.

### Recommended Fix

- Add a dedicated limiter for `/api/v1/premium/webhook/stripe` rather than exempting it from protection entirely.
- Set the threshold high enough to tolerate Stripe retries, but low enough to blunt blind flooding.
- If operationally needed, scope the limiter to non-Stripe traffic using IP allowlisting or a separate reverse-proxy rule rather than leaving the route unlimited in the app.

### Remediation

- `apps/api/src/routes/premiumWebhook.ts` now applies a dedicated fail-closed `stripe-webhook` rate limiter before `express.raw()` and Stripe signature verification.
- `packages/shared/src/constants/gameConstants.ts` now defines `RATE_LIMIT_CONSTANTS.STRIPE_WEBHOOK_MAX` as a tunable webhook-specific bucket.
- `apps/api/src/index.ts` keeps the webhook out of the global limiter and documents that the route-local limiter protects it before body parsing.

**Risk closed:** Blind unauthenticated floods to `POST /api/v1/premium/webhook/stripe` now hit an application limiter before raw body buffering and webhook signature parsing.

**Residual risk:** The limiter now fails closed on Redis store errors, which protects availability but can reject legitimate Stripe retries during a Redis outage. Reverse-proxy, provider-network, or Stripe-signature-aware controls would still be useful defense in depth.

**Verification:** `npm run test:api -- src/routes/premiumWebhook.test.ts src/routes/auth.test.ts`.

## OA-04: Admin-Only Socket Events Trust JWT Role Claim

**Severity:** medium
**Area:** Socket.IO authentication, admin controls
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 23, 2026

### Files Reviewed

- `apps/api/src/socket/socketAuth.ts`
- `apps/api/src/socket/index.ts`
- `apps/api/src/socket/chatHandlers.ts`

### Evidence

- Socket authentication verifies the JWT and copies `payload.role` straight into `socket.data`:
  - `apps/api/src/socket/socketAuth.ts:19`
  - `apps/api/src/socket/socketAuth.ts:20`
- The socket server does not perform any DB-side privilege recheck on connect:
  - `apps/api/src/socket/index.ts:31`
  - `apps/api/src/socket/index.ts:33`
- Admin-only chat pin and unpin actions authorize only against the role stored on the socket:
  - `apps/api/src/socket/chatHandlers.ts:171`
  - `apps/api/src/socket/chatHandlers.ts:172`
  - `apps/api/src/socket/chatHandlers.ts:191`
  - `apps/api/src/socket/chatHandlers.ts:192`

### Exploit Path

1. A user connects a socket with an access token that still contains `role: 'admin'`.
2. The user's admin role is revoked in the database, but the socket remains connected.
3. Because the socket stores the JWT role locally and never revalidates it from the database, the user can continue using `chat:pin` and `chat:unpin` until the token expires or the socket reconnects.

This is the same privilege-staleness class that was already fixed for HTTP admin routes, but the Socket.IO path still trusts the role embedded in the token.

### Why This Matters

The impact is narrower than HTTP admin endpoints because the exposed actions here are chat-moderation operations rather than broad game-state mutation. It is still a privilege boundary issue: revocation in the database does not immediately revoke effective admin power on the live socket connection.

### Recommended Fix

- Revalidate admin role from the database inside admin-only socket handlers, or
- Attach a fresh DB-confirmed role to the socket during connection and reconnect on role-sensitive changes, or
- Restrict chat-moderation actions to an authenticated HTTP admin route that already performs DB-backed role checks.

### Remediation

- `apps/api/src/socket/chatHandlers.ts` now checks the current `accounts.role` value before `chat:pin` and `chat:unpin` perform moderation actions.
- The check fails closed if the player is missing, no longer admin, or the database check errors.
- `apps/api/src/socket/chatHandlers.test.ts` covers stale admin JWTs being denied for both pin and unpin, and current DB-confirmed admins still being allowed to pin.

**Risk closed:** Revoking an admin role in the database now prevents further socket chat pin/unpin actions even if the connected socket still has an older JWT role claim.

**Residual risk:** Other socket behavior still uses the connected token payload for non-admin display metadata until reconnect; this fix is scoped to the documented moderation privilege boundary.

**Verification:** `npm run test:api -- src/socket/chatHandlers.test.ts`.

## OA-05: Rate Limiting Fails Open on Redis Errors, Leaving Registration Soft

**Severity:** medium
**Area:** Rate limiting, public registration, availability/abuse
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/middleware/rateLimiter.ts`
- `apps/api/src/index.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/services/lockoutService.ts`

### Evidence

- The shared rate-limiter helper is explicitly configured to allow requests through if the Redis-backed store errors:
  - `apps/api/src/middleware/rateLimiter.ts:16`
  - `apps/api/src/middleware/rateLimiter.ts:28`
  - `passOnStoreError: true`
- The global limiter for `/api/v1/*` is built from that helper:
  - `apps/api/src/index.ts:129`
- The public registration route does not have its own dedicated limiter:
  - `apps/api/src/routes/auth.ts:64`
- Registration is one of the heavier unauthenticated code paths in the app:
  - password hashing with bcrypt
  - starter-zone lookups
  - a multi-step Prisma transaction creating player state, skills, starter equipment, and discovery records
  - refresh-token persistence
- The same fail-open helper is also used for login, forgot-password, resend-verification, combat, exploration, PvP, and casino endpoint groups.

### Exploit Path

1. Redis becomes unavailable due to outage, maintenance, network partition, or resource exhaustion.
2. Every limiter created through `createEndpointLimiter()` stops enforcing thresholds because the middleware is configured to pass requests through on store error.
3. An attacker floods `POST /api/v1/auth/register`, which has no route-local backstop beyond the shared limiter.
4. Each request still executes bcrypt work and the full starter-account creation transaction, allowing avoidable database and CPU churn exactly when the app is already operating in a degraded state.

This is most directly an availability and abuse-control issue. It does not require bypassing input validation or authentication; it only requires sending traffic during a Redis failure window.

### Why This Matters

Fail-open rate limiting is a deliberate reliability tradeoff, but here it removes protection from an expensive public write endpoint rather than only from low-impact reads. That increases the blast radius of a Redis incident and makes abusive traffic materially cheaper to generate.

### Recommended Fix

- Add a dedicated limiter to `POST /api/v1/auth/register`.
- Reconsider `passOnStoreError: true` for the highest-risk public write endpoints, or add a conservative in-process fallback limiter for degraded Redis conditions.
- At minimum, separate expensive unauthenticated routes from general API throttling so they retain tighter protection when shared controls are weakened.

### Remediation

- `apps/api/src/routes/auth.ts` now applies a registration-specific fail-closed limiter before the public registration handler.
- `packages/shared/src/constants/gameConstants.ts` now defines `RATE_LIMIT_CONSTANTS.REGISTER_WINDOW_MS` and `REGISTER_MAX` so registration throttling can be tuned separately from login and global API traffic.
- `apps/api/src/middleware/rateLimiter.ts` now lets specific endpoint groups opt out of `passOnStoreError`; existing limiters retain the previous fail-open behavior unless explicitly configured otherwise.
- `apps/api/src/routes/auth.test.ts` covers that the registration route has route-local middleware before the handler and configures it to fail closed on Redis store errors.

**Risk closed:** Registration attempts now have a tighter dedicated bucket and do not pass through during Redis limiter-store failures, reducing CPU/database churn from abusive unauthenticated registration traffic during degraded Redis windows.

**Residual risk:** Other endpoint-group limiters still use the helper's default fail-open behavior. That is a broader availability-vs-reliability tradeoff and should be revisited per endpoint if abuse pressure increases.

**Verification:** `npm run test:api -- src/routes/premiumWebhook.test.ts src/routes/auth.test.ts`.

## OA-06: Chat History Endpoint Lacks Channel-Membership Authorization

**Severity:** medium
**Area:** Request authorization, chat privacy, data exposure
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/routes/chat.ts`
- `apps/api/src/services/chatService.ts`
- `apps/api/src/socket/chatHandlers.ts`

### Evidence

- The HTTP chat history route is authenticated, but it only validates `channelType` and `channelId` shape before returning history:
  - `apps/api/src/routes/chat.ts:8`
  - `apps/api/src/routes/chat.ts:17`
  - `apps/api/src/routes/chat.ts:23`
  - `apps/api/src/routes/chat.ts:24`
- The backing service fetches rows solely by `channelType` and `channelId` and does not receive the caller identity or perform any membership check:
  - `apps/api/src/services/chatService.ts:41`
  - `apps/api/src/services/chatService.ts:46`
- By contrast, the real-time send path explicitly checks that the socket is in the room and revalidates guild membership before allowing guild chat activity:
  - `apps/api/src/socket/chatHandlers.ts:84`
  - `apps/api/src/socket/chatHandlers.ts:95`

### Exploit Path

1. Any authenticated player calls `GET /api/v1/chat/history` with a guessed or discovered `channelType` and `channelId`.
2. The route accepts the request if the query shape is valid.
3. `getChannelHistory()` returns recent messages for that channel without verifying the caller is in the guild or currently in the zone.
4. The attacker can read recent guild or zone chat they should not have access to, including player IDs, usernames, titles, and message contents.

This is easiest for guild channels (`channelType=guild`, `channelId=guild:<id>`) and zone channels (`channelType=zone`, `channelId=zone:<id>`), where membership is meant to scope visibility.

### Why This Matters

The socket send path already treats guild membership and room membership as an authorization boundary. The HTTP history path breaks that same boundary by treating channel IDs as sufficient proof of access. That turns chat history into an authenticated information-disclosure endpoint.

### Recommended Fix

- Require the caller identity in the history path and enforce channel-specific authorization before querying messages.
- For `guild` history, verify current guild membership and require `channelId` to match the caller's guild.
- For `zone` history, verify the caller's current zone and require `channelId` to match it.
- Keep `world` history broadly readable if intended, but make the access policy explicit in code rather than implicit in the route shape.

### Remediation

- `apps/api/src/routes/chat.ts` now passes the authenticated player ID into the chat history service instead of querying history by channel ID alone.
- `apps/api/src/services/chatService.ts` now enforces channel-specific read authorization before returning history:
  - `world` and `casino` history require the canonical channel IDs.
  - `zone:<id>` history requires the caller's current zone to match the requested zone.
  - `guild:<id>` history requires the caller's current guild membership to match the requested guild.
- `apps/api/src/services/chatService.test.ts` covers cross-guild denial, stale-zone denial, and authorized reads.

**Risk closed:** Authenticated callers can no longer use guessed guild or zone channel IDs to read chat history outside their current membership or location.

**Residual risk:** World and casino histories remain readable to authenticated callers as product-level public channels. That is intentional and now explicit in the service policy.

**Verification:** `npm run test:api -- src/services/chatService.test.ts`.

## OA-07: Public Health Endpoints Expose Live Dependency State

**Severity:** low
**Area:** Public data exposure, operational reconnaissance
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/routes/health.ts`
- `apps/api/src/services/healthChecks.ts`
- `apps/api/src/middleware/rateLimiter.ts`

### Evidence

- `/health/ready` is public and returns exact dependency state plus application version:
  - `apps/api/src/routes/health.ts:25`
  - `apps/api/src/routes/health.ts:35`
  - `apps/api/src/routes/health.ts:37`
  - `apps/api/src/routes/health.ts:38`
- `/health` is public and returns timestamp, version, uptime, and current Socket.IO connection count:
  - `apps/api/src/routes/health.ts:46`
  - `apps/api/src/routes/health.ts:51`
  - `apps/api/src/routes/health.ts:54`
  - `apps/api/src/routes/health.ts:55`
  - `apps/api/src/routes/health.ts:56`
- The socket stats helper currently exposes connected-client counts:
  - `apps/api/src/services/healthChecks.ts:104`
- The shared rate limiter is configured to fail open when Redis is unavailable:
  - `apps/api/src/middleware/rateLimiter.ts:16`
  - `apps/api/src/middleware/rateLimiter.ts:28`

### Exploit Path

1. An attacker polls `/health/ready` or `/health` anonymously.
2. The responses reveal whether Redis or the database is currently degraded, along with version and connection-count telemetry.
3. When Redis reports `error`, the attacker knows the app's Redis-backed throttling is in a weakened fail-open state (see OA-05).
4. The attacker times abusive traffic against public endpoints during that window with better precision than blind probing alone.

This is a reconnaissance aid rather than a direct compromise on its own, which is why the severity is lower than the rate-limiter issue it amplifies.

### Why This Matters

Public health routes are useful for load balancers and uptime monitors, but the current responses expose more operational detail than those systems strictly need. In this repo, that detail meaningfully increases the observability of another known weakness: rate limiting falls through when Redis is unavailable.

### Recommended Fix

- Keep `/health/live` minimal and suitable for unauthenticated liveness checks.
- Restrict `/health` and `/health/ready` to trusted infrastructure, or reduce them to coarse status values without version, uptime, and socket-count detail.
- Avoid exposing dependency-specific failure state publicly when that state materially changes the app's defensive posture.

### Remediation

- `apps/api/src/routes/health.ts` now keeps dependency checks for status-code decisions but returns only coarse `status` values to public callers.
- `/health/ready` returns `{ status: 'ok' }`, `{ status: 'error' }`, or `{ status: 'shutting_down' }`.
- `/health` returns `{ status: 'ok' }` or `{ status: 'degraded' }`.
- Version, uptime, per-dependency status, and Socket.IO connection counts are no longer exposed by these public responses.
- `apps/api/src/routes/health.test.ts` covers the trimmed response shapes and verifies socket stats are not queried for public health responses.

**Risk closed:** Anonymous health polling no longer reveals version, uptime, socket counts, or whether Redis or PostgreSQL is the degraded dependency.

**Residual risk:** The public status still reveals coarse service health through response status and `ok`/`degraded`/`error`. That is expected for liveness/readiness endpoints and can be further restricted at infrastructure if needed.

**Verification:** `npm run test:api -- src/routes/health.test.ts`.

## OA-08: Guild Read Endpoints Expose Internal State and One GET Mutates Target Guild State

**Severity:** medium
**Area:** Authorization, public data exposure, unexpected state mutation
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/routes/guild.ts`
- `apps/api/src/services/guildProjectService.ts`
- `apps/api/src/services/guildUpgradeService.ts`
- `apps/api/src/services/guildContractService.ts`
- `apps/api/src/services/guildSpecializationService.ts`

### Evidence

- The guild router is authenticated, but several `GET /:id/*` endpoints do not perform any membership or role check before reading target-guild state:
  - `apps/api/src/routes/guild.ts:183`
  - `apps/api/src/routes/guild.ts:201`
  - `apps/api/src/routes/guild.ts:223`
  - `apps/api/src/routes/guild.ts:262`
- `getGuildProjects(guildId)` returns contribution details for each project, including contributor `playerId`, `username`, turn totals, and material-contribution progress, without caller context:
  - `apps/api/src/services/guildProjectService.ts:70`
  - `apps/api/src/services/guildProjectService.ts:97`
- `getAvailableUpgrades(guildId)` derives availability from the target guild's current `level` and `treasuryTurns`, which exposes internal upgrade-readiness information:
  - `apps/api/src/services/guildUpgradeService.ts:129`
  - `apps/api/src/services/guildUpgradeService.ts:153`
- `getActiveContracts(guildId)` lazily generates weekly contracts if none exist yet for the current week:
  - `apps/api/src/services/guildContractService.ts:81`
  - `apps/api/src/services/guildContractService.ts:96`
  - `apps/api/src/services/guildContractService.ts:100`
- Because `GET /api/v1/guild/:id/contracts` directly calls `getActiveContracts(req.params.id)`, any authenticated player can trigger that generation path for another guild:
  - `apps/api/src/routes/guild.ts:201`

### Exploit Path

1. Any authenticated player requests `GET /api/v1/guild/<targetGuildId>/projects`, `/upgrades`, `/specialization`, or `/contracts` for a guild they do not belong to.
2. The route forwards the target guild ID into the service layer without checking membership or role.
3. The attacker can read internal guild project contribution breakdowns, active upgrade state, upgrade affordability/readiness, specialization status, and weekly contract state for that target guild.
4. On a fresh week before contracts exist, `GET /api/v1/guild/<targetGuildId>/contracts` also creates the contracts and writes a guild log entry, meaning a non-member can cause a state change on the target guild through a GET request.

This is both an information-disclosure issue and a server-side authorization issue because one of the read endpoints is not actually read-only.

### Why This Matters

Guilds have private operational state: contributor breakdowns, treasury-conditioned upgrade availability, and work-in-progress project data are not the same as a public guild profile. The contract-generation behavior makes the issue worse because a non-member can influence when another guild's weekly contracts are instantiated.

### Recommended Fix

- Decide explicitly which guild fields are public and which are member-only.
- Add membership/role checks in the router or service layer for `/contracts`, `/projects`, `/upgrades`, and `/specialization` if they are not meant to be public.
- Remove lazy creation from the `GET /:id/contracts` read path; generate contracts in a scheduled task or a member-authorized mutation path instead.
- If some guild profile data should remain public, return a dedicated sanitized public DTO instead of reusing internal service responses.

### Remediation

- `apps/api/src/services/guildService.ts` now exposes `requireGuildMember(playerId, guildId)` as a shared membership guard for guild-internal reads.
- `apps/api/src/routes/guild.ts` now calls that guard before returning `/upgrades`, `/contracts`, `/projects`, and `/specialization`.
- `apps/api/src/routes/guild.internalReads.test.ts` covers that non-members receive `403` before guild-internal services are called, including the lazy contract generation path.

**Risk closed:** Authenticated non-members can no longer read another guild's internal upgrade, project, specialization, or contract state, and cannot trigger another guild's weekly contract generation through the GET route.

**Residual risk:** `GET /:id/contracts` can still lazily create weekly contracts for authorized guild members. That mutation-on-read behavior is now membership-scoped but remains a product-design cleanup candidate if strict HTTP read semantics are desired later.

**Verification:** `npm run test:api -- src/routes/guild.internalReads.test.ts src/services/guildService.test.ts`.

## OA-09: Connected Sockets Retain Stale Zone and Guild Room Access

**Severity:** medium
**Area:** Socket.IO chat authorization, stale membership enforcement
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/socket/chatHandlers.ts`
- `apps/api/src/socket/socketAuth.ts`
- `apps/api/src/services/zoneService.ts`
- `apps/api/src/services/guildMembershipService.ts`
- `apps/api/src/services/guildService.ts`

### Evidence

- Socket chat room membership is established at connection time from cached zone/guild lookups:
  - `apps/api/src/socket/chatHandlers.ts:55`
  - `apps/api/src/socket/chatHandlers.ts:60`
  - `apps/api/src/socket/chatHandlers.ts:67`
- `chat:send` authorizes delivery primarily by checking whether the socket is still in `chat:${channelId}`:
  - `apps/api/src/socket/chatHandlers.ts:76`
  - `apps/api/src/socket/chatHandlers.ts:84`
  - `apps/api/src/socket/chatHandlers.ts:85`
- Guild sends get a fresh DB membership re-check, but zone sends do not:
  - `apps/api/src/socket/chatHandlers.ts:94`
  - There is no equivalent `currentZoneId` re-check in the `chat:send` path.
- The only server code that leaves old zone rooms is the client-triggered `chat:switch-zone` event:
  - `apps/api/src/socket/chatHandlers.ts:134`
  - `apps/api/src/socket/chatHandlers.ts:148`
  - `apps/api/src/socket/chatHandlers.ts:149`
  - `apps/api/src/socket/chatHandlers.ts:153`
- Zone changes update the database and invalidate the zone cache, but do not resync any already-connected sockets:
  - `apps/api/src/services/zoneService.ts:25`
  - `apps/api/src/services/zoneService.ts:31`
- Guild leave/kick/disband flows invalidate cached guild IDs, but do not evict active sockets from `chat:guild:*` rooms:
  - `apps/api/src/services/guildMembershipService.ts:62`
  - `apps/api/src/services/guildMembershipService.ts:77`
  - `apps/api/src/services/guildMembershipService.ts:207`
  - `apps/api/src/services/guildMembershipService.ts:231`
  - `apps/api/src/services/guildMembershipService.ts:309`
  - `apps/api/src/services/guildService.ts:229`

### Exploit Path

1. A player connects while legitimately in zone `A` or guild `G`, so the socket joins `chat:zone:A` and/or `chat:guild:G`.
2. The player's state changes later through normal gameplay or admin action: they travel to zone `B`, leave a guild, get kicked, or the guild is disbanded.
3. The server updates database state and invalidates cache, but it does not proactively remove the existing socket from the old chat rooms.
4. If the client simply keeps the old socket open, the stale room membership remains active.
5. For zone chat, the player can continue both receiving and sending messages to the old zone because `chat:send` only checks `socket.rooms.has(room)` and does not verify `currentZoneId` in the send path.
6. For guild chat, the player can continue receiving messages for the old guild room until reconnect or explicit resync, even though fresh sends are blocked by the DB-backed guild membership check.

### Why This Matters

Real-time room membership is acting as an authorization cache without reliable invalidation. That creates a stale-access window where chat confidentiality and, for zone chat, message-origin integrity no longer match the player's current server-side state.

### Recommended Fix

- Re-check zone membership in `chat:send`, not just socket room membership.
- Add a server-driven socket room resync whenever zone or guild membership changes, using the existing per-player socket room (`socket.join(socket.data.playerId)`) to target active connections.
- On guild leave/kick/disband, explicitly remove affected sockets from the old `chat:guild:*` room.
- On travel/teleport, explicitly remove affected sockets from old `chat:zone:*` rooms and join only the current zone room.

### Remediation

- `apps/api/src/socket/chatHandlers.ts` now revalidates zone and guild scoped channels against fresh database state before accepting `chat:send`.
- Initial socket scoped-room setup now uses the same DB-backed reconciliation path before emitting zone pins, avoiding stale cache-based pin disclosure on connect.
- Stale scoped rooms are removed from the sending socket and current authorized zone/guild rooms are joined during reconciliation.
- Before broadcasting zone/guild chat messages or pins, the server now prunes unauthorized sockets from the scoped room using current player zone or guild membership.
- `apps/api/src/socket/chatHandlers.test.ts` covers stale zone send denial, stale-room cleanup, and stale receiver pruning before broadcast.

**Risk closed:** Stale zone or guild room membership is no longer sufficient to send or receive scoped chat payloads after the underlying server-side membership changes.

**Residual risk:** The implementation performs just-in-time pruning on scoped socket activity rather than proactively resyncing every affected socket at the moment travel or guild membership changes. Idle stale room membership can exist until the next scoped event, but it is rechecked before data is sent.

**Verification:** `npm run test:api -- src/socket/chatHandlers.test.ts`.

## OA-10: Boss Encounter Detail Routes Expose Raw Participant IDs and Live Combat State

**Severity:** medium
**Area:** Public data exposure, event telemetry
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/routes/boss.ts`
- `apps/api/src/services/bossEncounterService.ts`
- `apps/api/src/services/worldEventService.ts`

### Evidence

- The boss router is only authenticated; it does not require encounter participation or being in the event zone for read access:
  - `apps/api/src/routes/boss.ts:20`
- Any authenticated player can list active boss encounters and obtain encounter IDs:
  - `apps/api/src/routes/boss.ts:34`
  - `apps/api/src/routes/boss.ts:64`
- `getBossEncounterStatus()` returns participants via `toBossParticipantData()`, and that DTO includes raw `playerId` plus live combat-resource fields:
  - `apps/api/src/services/bossEncounterService.ts:91`
  - `apps/api/src/services/bossEncounterService.ts:114`
  - `apps/api/src/services/bossEncounterService.ts:290`
  - `apps/api/src/services/bossEncounterService.ts:306`
- `GET /api/v1/boss/:id` returns those participant records to any authenticated caller, merely enriching them with usernames:
  - `apps/api/src/routes/boss.ts:95`
  - `apps/api/src/routes/boss.ts:129`
- `GET /api/v1/boss/:id/round/:num` separately returns per-round participant rows with raw `playerId`, `currentHp`, `currentStamina`, `currentMana`, `threat`, and related combat state to any authenticated caller:
  - `apps/api/src/routes/boss.ts:198`
  - `apps/api/src/routes/boss.ts:201`
  - `apps/api/src/routes/boss.ts:213`

### Exploit Path

1. Any authenticated player calls `GET /api/v1/boss/active` to discover current encounter IDs.
2. The attacker requests `GET /api/v1/boss/:id` and `GET /api/v1/boss/:id/round/:num` for those encounters.
3. The server returns participant lists containing stable internal `playerId` values and detailed combat-resource state, even if the caller is not participating and is not in the boss zone.
4. The attacker can use that data to map usernames to internal IDs and monitor participants' current HP, stamina, mana, threat, and signup state across raid rounds.

### Why This Matters

Authenticated does not mean need-to-know. Public raid visibility can be legitimate, but exposing stable internal player IDs and live per-round combat state to every logged-in player expands both reconnaissance and tracking unnecessarily. The boss UI can function with sanitized participant displays without leaking internal identifiers or precise live resources to unrelated observers.

### Recommended Fix

- Decide which boss telemetry is intentionally public to all authenticated players and trim the rest.
- Remove raw `playerId` from globally readable boss-detail and round-detail responses unless the caller is the same player or an admin.
- Consider limiting detailed round telemetry to encounter participants, while keeping a sanitized public view with username, rank, and damage totals if that is product-intended.
- If round inspection remains globally readable, return a dedicated public DTO that omits live HP/stamina/mana/threat fields.

### Remediation

- `apps/api/src/routes/boss.ts` now determines whether the caller is an admin or encounter participant before returning detailed participant telemetry.
- Non-participants receive sanitized participant IDs, no raw `playerId`, zeroed live resource/threat/turn fields, and no raw `killedBy` identifier.
- Participants and admins retain the detailed view needed for raid play and moderation.
- `apps/api/src/routes/boss.security.test.ts` covers active encounter, encounter detail, and round-detail sanitization for non-participants while preserving participant detail.

**Risk closed:** Any authenticated non-participant can no longer map boss participants to raw internal player IDs or monitor exact live HP, stamina, mana, threat, turn commitment, or signup state through boss read routes.

**Residual risk:** Encounter participants and admins still receive detailed combat telemetry. That is intentional for gameplay and operations, but future response expansion should keep the same participant/admin split.

**Verification:** `npm run test:api -- src/routes/boss.security.test.ts`.

## OA-11: Casino Socket Broadcasts Leak Bettor IDs to Any Authenticated Spectator

**Severity:** low
**Area:** Socket.IO data exposure, real-time telemetry
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/socket/chatHandlers.ts`
- `apps/api/src/routes/casino.ts`
- `apps/api/src/services/casinoService.ts`
- `packages/shared/src/types/casino.types.ts`

### Evidence

- Any authenticated socket can join the casino room; there is no town/location or casino-access check on room join:
  - `apps/api/src/socket/chatHandlers.ts:162`
  - `apps/api/src/socket/chatHandlers.ts:163`
- The HTTP casino state uses a sanitized public bet shape with `playerName`, `betType`, `betValue`, and `amount`, omitting raw player IDs:
  - `apps/api/src/services/casinoService.ts:324`
  - `apps/api/src/services/casinoService.ts:330`
  - `packages/shared/src/types/casino.types.ts:13`
- By contrast, the real-time bet event type includes a raw `playerId` field:
  - `packages/shared/src/types/casino.types.ts:79`
  - `packages/shared/src/types/casino.types.ts:81`
- `placeBet()` emits that richer event to `chat:casino` on every wager:
  - `apps/api/src/services/casinoService.ts:385`
  - `apps/api/src/services/casinoService.ts:387`
  - `apps/api/src/services/casinoService.ts:392`

### Exploit Path

1. Any authenticated player opens a socket connection and emits `chat:join-casino`, even if they are not in town and are not actively using the casino.
2. The server joins that socket to `chat:casino` without checking location or participation state.
3. Whenever another player places a roulette bet, the server broadcasts `casino:bet` into that room.
4. The spectator receives the bettor's `playerName`, raw `playerId`, bet selection, and wager amount in real time.

### Why This Matters

The HTTP casino endpoints already demonstrate the intended safer pattern by exposing public bets without raw internal IDs. The socket layer currently bypasses that boundary and gives any logged-in observer a live username-to-playerId mapping feed for casino participants. That is a smaller issue than the boss-route leak, but it is still unnecessary internal-identifier exposure.

### Recommended Fix

- Remove `playerId` from `CasinoBetEvent` and from the `casino:bet` broadcast payload unless a caller-specific use case truly requires it.
- If remote spectating is not product-intended, add the same town/location gating used for actual betting before allowing `chat:join-casino`.
- Keep the socket payload aligned with the existing `RoulettePublicBet` shape unless there is a strong reason to expose more.

### Remediation

- `packages/shared/src/types/casino.types.ts` no longer includes `playerId` in the `CasinoBetEvent` socket payload type.
- `apps/api/src/services/casinoService.ts` no longer emits raw bettor `playerId` values in `casino:bet` broadcasts.
- `apps/api/src/services/casinoService.test.ts` covers the trimmed socket event payload.

**Risk closed:** Authenticated casino spectators no longer receive a live username-to-playerId mapping feed when other players place bets.

**Residual risk:** Authenticated sockets can still join the casino room remotely. That permits spectating of public bet names, amounts, and bet selections, but no longer leaks raw internal bettor IDs. Location gating remains a product-policy decision.

**Verification:** `npm run test:api -- src/services/casinoService.test.ts`.

## OA-12: Socket Sessions Outlive Access-Token Expiry and Password-Based Revocation

**Severity:** medium
**Area:** Socket.IO authentication, session revocation
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/socket/socketAuth.ts`
- `apps/api/src/socket/index.ts`
- `apps/api/src/services/authService.ts`
- `apps/api/src/routes/auth.ts`

### Evidence

- Socket authentication verifies the JWT only once during the handshake and then copies the claims into `socket.data`:
  - `apps/api/src/socket/socketAuth.ts:11`
  - `apps/api/src/socket/socketAuth.ts:19`
  - `apps/api/src/socket/socketAuth.ts:20`
- The socket server uses that handshake middleware on connect and then keeps the connection alive with no further auth re-check:
  - `apps/api/src/socket/index.ts:31`
  - `apps/api/src/socket/index.ts:33`
  - `apps/api/src/socket/index.ts:35`
- Password change revokes refresh tokens, but there is no matching socket disconnect or per-player socket invalidation path:
  - `apps/api/src/services/authService.ts:100`
  - `apps/api/src/services/authService.ts:122`
- I did not find a current server path that disconnects a player's active sockets on logout, password reset, or other account-session invalidation events.

### Exploit Path

1. An attacker obtains a valid access token, or a legitimate user opens a socket while their token is still valid.
2. The socket handshake succeeds, and the server stores the authenticated identity in `socket.data`.
3. Later, the access token expires naturally or the account owner changes their password, which deletes refresh tokens and is supposed to force re-login on future session refreshes.
4. The existing socket remains connected and trusted because the server never re-checks token expiry or revocation after the initial handshake.
5. The connected client keeps real-time chat access until the transport disconnects for some unrelated reason.

### Why This Matters

The HTTP model expects short-lived access tokens and explicit session invalidation through password change or logout. The socket layer breaks that assumption by turning a short-lived bearer token into a potentially long-lived session with no expiry enforcement. That leaves a stale-access window that can materially outlast the intended 15-minute access-token lifetime.

### Recommended Fix

- Track socket session expiry from the JWT `exp` claim and disconnect or re-authenticate when it passes.
- Add a server-side per-player socket invalidation path for password changes, logout, and other session-revocation events, using the existing per-player room (`socket.join(socket.data.playerId)`).
- If revocation state is introduced later, check it before handling privileged socket events rather than trusting handshake-time state indefinitely.

### Remediation

- `apps/api/src/socket/socketAuth.ts` now requires the JWT `exp` claim during the socket handshake and stores the access-token expiry time on `socket.data`.
- `apps/api/src/socket/index.ts` now schedules each socket for disconnect when its access token expires and joins both account and player rooms for targeted invalidation.
- `apps/api/src/socket/index.ts` exports `disconnectPlayerSockets()` and `disconnectAccountSockets()` helpers that emit `session:revoked` before disconnecting matching sockets.
- `apps/api/src/routes/auth.ts` now disconnects active sockets on logout, password reset, and password change after revoking refresh sessions.
- `apps/api/src/socket/socketAuth.test.ts`, `apps/api/src/routes/auth.test.ts`, and `apps/api/src/routes/auth.seasons.test.ts` cover expiry storage and auth-route socket invalidation hooks.

**Risk closed:** A valid socket connection no longer outlives the access token indefinitely, and password/logout session invalidation now forces relevant active sockets to disconnect in the current Socket.IO process.

**Residual risk:** The current helper disconnects sockets visible to this Socket.IO server instance. Multi-instance deployments should ensure a Socket.IO adapter or equivalent cross-instance invalidation path is configured before relying on process-local room disconnects.

**Verification:** `npm run test:api -- src/socket/socketAuth.test.ts src/routes/auth.test.ts src/routes/auth.seasons.test.ts`.

## Checked Areas With No New Finding

### HTTP Admin Router Guarding

**Checked:** April 22, 2026

The primary HTTP admin surface appears consistently protected:

- The router is mounted at `/api/v1/admin`.
- `apps/api/src/routes/admin.ts` applies `router.use(authenticate, requireAdmin)` near the top of the file.
- `apps/api/src/middleware/admin.ts` re-reads the caller's role from the database instead of trusting the role embedded in the JWT.

This is the correct mitigation for admin-role revocation on the HTTP path and appears to cover the admin endpoints defined in `apps/api/src/routes/admin.ts`.

**Residual risk:** The admin tooling is intentionally high-impact and many actions mutate game state directly. The HTTP guard itself looks sound, but any future admin-only real-time paths need the same DB-backed privilege check to avoid repeating the socket issue recorded in OA-04.

### Stripe Fulfillment Idempotency

**Checked:** April 22, 2026

The Stripe premium-fulfillment path appears well-defended against duplicate grants:

- Webhook requests require Stripe signature verification via `constructEvent`.
- The event is accepted only for the expected event types.
- The checkout session must be paid and match the expected product metadata, amount, and currency.
- Premium grants are deduplicated by unique `providerSessionId` and `providerPaymentIntentId` values in `premium_purchases`.

**Residual risk:** Availability remains weaker than integrity on this route because the webhook is public. The route now has a dedicated fail-closed application limiter, but reverse-proxy or provider-network controls would still improve defense in depth.

### Public Leaderboard Exposure

**Checked:** April 22, 2026

The main public leaderboard route appears to be intentionally trimmed compared with the older March finding:

- `apps/api/src/routes/leaderboard.ts` uses `optionalAuthenticate`.
- Public category metadata is returned from `/categories` with cache headers only.
- For `GET /:category`, the route explicitly strips `playerId` and `isAdmin` from `entries` before returning the response.

I did not find a current unauthenticated route in this pass that exposes player emails, auth roles, refresh tokens, or other direct account identifiers in the API response body.

**Residual risk:** The underlying leaderboard service still carries `playerId` and `isAdmin` in its internal response shape, and `myRank` is not stripped in the route. That is acceptable for an authenticated caller looking at their own rank, but future route changes should keep the stripping logic at the API boundary so the old public-UUID leak does not regress.

### Prisma Raw Query Usage

**Checked:** April 22, 2026

The Prisma raw SQL usage reviewed in this pass does not currently show an injection issue:

- `apps/api/src/services/leaderboardService.ts` uses a tagged template in `refreshCasino()` for a fixed aggregation query with no user-controlled interpolation.
- The auth service's `SELECT ... FOR UPDATE` lock pattern is also using tagged-template `$queryRaw`, not an unsafe string-concatenated variant.
- I did not find `queryRawUnsafe` or `executeRawUnsafe` in the audited code paths.

**Residual risk:** These raw SQL sites remain higher-maintenance than normal Prisma calls. Future edits that introduce dynamic identifiers, order-by fragments, or filter fragments into raw SQL would need a fresh review.

### Secret Handling

**Checked:** April 22, 2026

The main secret-handling paths reviewed in this pass do not show a new concrete leak or bypass:

- `apps/api/src/middleware/auth.ts` hard-fails startup if `JWT_SECRET` is missing or too short.
- `apps/api/src/services/stripeService.ts` throws if Stripe secrets are absent instead of silently downgrading payment verification.
- `apps/api/src/services/pushNotificationService.ts` disables push delivery when VAPID material is missing rather than attempting an insecure fallback.
- `apps/api/src/services/emailService.ts` escapes interpolated usernames in HTML email templates.

**Residual risk:** `APP_URL` in the email and Stripe services still falls back to `http://localhost:3002` if unset. That is primarily an operational misconfiguration risk rather than a direct exploit, but it would produce broken or misleading links in outbound email and checkout flows if it reached a non-local deployment.

### Remaining Real-Time Request Validation Surface

**Checked:** April 22, 2026

The chat send path is still the strongest-validated real-time input surface reviewed:

- `chat:send` sanitizes user text with `sanitizeUserText`.
- It enforces `CHAT_CONSTANTS.MAX_MESSAGE_LENGTH`.
- It verifies channel membership before broadcast.
- Guild chat rechecks actual guild membership.

The remaining socket handlers (`chat:switch-zone`, `chat:pin`, `chat:unpin`) still use lighter ad hoc validation than the HTTP routes, but I did not confirm a direct exploit from that alone in this pass.

**Residual risk:** The real-time layer does not use Zod schemas, and admin pin/unpin payloads do not currently apply the same sanitization and length checks as normal chat messages. That is worth revisiting if the chat UI ever changes to render richer content or if moderation features expand.

### JWT / Access-Token Verification

**Checked:** April 22, 2026

The main HTTP JWT path looks structurally sound in the current repo:

- `apps/api/src/middleware/auth.ts` hard-fails startup if `JWT_SECRET` is missing or too short.
- `authenticate` requires a `Bearer` header and rejects invalid or expired tokens with a 401.
- Access tokens are short-lived by default (`15` minutes).
- The refresh flow re-reads the caller's current role from the database before minting new tokens.
- The HTTP admin router adds a DB-backed `requireAdmin` check instead of trusting the role embedded in the token.

I did not confirm a concrete signature-verification bypass, algorithm-confusion issue, or access-token-as-refresh-token bypass in this pass.

**Residual risk:** Ordinary authenticated routes still trust the signed access-token claims until the token expires, because the general `authenticate` middleware does not re-read player state from the database on every request. In the current schema that mainly means role or account-state changes outside the dedicated admin guard will not take effect until token expiry unless the route performs its own DB-side authorization check.

### Public Account-Recovery and Email-Verification Flows

**Checked:** April 22, 2026

The public verification and recovery flows reviewed in this pass do not show a new concrete token-handling or account-enumeration flaw:

- `apps/api/src/routes/auth.ts` validates email/token/password inputs with Zod and applies dedicated limiters to `/forgot-password` and authenticated `/resend-verification`.
- `/forgot-password` returns its generic success message before doing any account lookup, and only sends mail for verified accounts after an additional per-email Redis throttle in `apps/api/src/services/lockoutService.ts`.
- `apps/api/src/services/authTokenService.ts` stores both verification and password-reset tokens as SHA-256 hashes rather than raw bearer values.
- `/reset-password` verifies the hashed token and atomically consumes it with `usedAt: null` before changing the password and deleting all refresh tokens.
- `apps/web/src/app/verify-email/page.tsx` and `apps/web/src/app/reset-password/page.tsx` read the token from the URL and call only same-origin API endpoints; I did not find a current third-party script or remote asset on those pages that would obviously exfiltrate the query token via `Referer`.

I did not find a current path here that lets an unauthenticated caller enumerate whether an email is verified through the forgot-password response, reuse a password-reset token after successful consumption, or recover raw verification/reset tokens from database storage.

**Residual risk:** Verification and reset tokens still travel in the browser URL query string, which means they can remain in browser history and any copied link until the user navigates away. In the reviewed pages that looks like an operational/privacy concern rather than an active application leak, but future additions of third-party analytics, external images, or cross-origin resources on those pages would need a fresh review because the query token could then reach outbound `Referer` headers.

### Pending Loot Session Ownership and Replay Protection

**Checked:** April 22, 2026

The pending-loot retrieval and claim flow reviewed in this pass appears correctly bound to the authenticated player:

- `apps/api/src/routes/inventory.ts` applies `authenticate` to the whole router before the loot endpoints.
- Both `GET /api/v1/inventory/loot/:sessionId` and `POST /api/v1/inventory/loot/claim` validate the loot session identifier as a UUID with Zod before use.
- `apps/api/src/services/pendingLootService.ts` derives the Redis key as `pending_loot:${playerId}:${sessionId}`, so a guessed session UUID alone is not enough to read or claim another player's pending loot.
- The claim path uses `GETDEL` to consume the Redis entry atomically, which prevents straightforward double-claim replay if two requests race.
- On parse or database failure, the service restores the Redis entry instead of destroying the loot payload, which avoids loss on transient backend errors.

I did not find a current path here that lets one authenticated player read or claim another player's overflow loot by guessing or reusing a pending-loot session ID.

**Residual risk:** Pending loot is still ephemeral Redis state keyed to the player rather than durable database state. That is fine for ownership in the reviewed code, but it means Redis loss or expiry remains an availability/user-experience risk, and future tooling should avoid adding any admin/debug endpoint that accepts a bare `sessionId` without also deriving ownership from the authenticated player.

### Gathering Node Ownership and Completion Binding

**Checked:** April 22, 2026

The gathering-node listing and mining flow reviewed in this pass appears consistently bound to the authenticated player:

- `apps/api/src/routes/gathering.ts` applies `authenticate` to the whole router and validates node list filters plus `playerNodeId` as a UUID with Zod before use.
- `GET /api/v1/gathering/nodes` queries `PlayerResourceNode` rows with `where: { playerId }`, so the caller only receives their own discovered node IDs.
- `POST /api/v1/gathering/mine` loads the `PlayerResourceNode` by ID and explicitly rejects the request unless `playerNode.playerId === req.player!.playerId`.
- Inside the mining transaction, the route re-checks that the authenticated player is still physically in the node's zone before spending turns or minting resources.
- Node depletion/update writes also include `playerId` and prior-capacity fields in their `where` clauses, which preserves both ownership and optimistic concurrency during depletion.

I did not find a current path here that lets one authenticated player mine another player's discovered resource node, list another player's node inventory, or complete a gather action against a node they no longer occupy by replaying an old request body.

**Residual risk:** The gather endpoint still trusts a caller-supplied `playerNodeId` as the starting selector and then proves ownership in application code rather than at the database key level. That is safe in the reviewed flow, but future refactors should keep the current explicit `playerId` checks and in-transaction zone revalidation rather than widening the lookup into a generic resource-node mutation path.

### Push-Notification Subscription Handling

**Checked:** April 22, 2026

The push-notification subscription surface reviewed in this pass does not show a new concrete authorization or secret-handling flaw:

- `apps/api/src/routes/notifications.ts` puts the router behind `authenticate`.
- Subscribe and unsubscribe requests are validated with Zod before use.
- Subscription writes and deletes are always scoped to `req.player!.playerId`; the caller cannot pass an arbitrary target player ID.
- `get /status` returns only a boolean subscription flag plus `VAPID_PUBLIC_KEY`, which is expected to be public in the Web Push model.
- `apps/api/src/services/pushNotificationService.ts` only reads stored endpoint/key material when sending to that same player's saved subscriptions, and expired subscriptions are cleaned up on `404`/`410`.

I did not find a current API path that exposes stored push endpoints, `p256dh`, or `auth` values to other players.

**Residual risk:** Push subscription endpoints and key material are still stored in plaintext in `push_subscriptions`, which is normal for server-side Web Push delivery but means a database-read compromise would expose device endpoints and subscription secrets. The current issue is therefore at-rest sensitivity, not an application-layer leak in the audited routes.

### Friends, Blocks, and Mail Ownership Checks

**Checked:** April 22, 2026

The social routes reviewed in this pass appear consistently scoped to the authenticated caller:

- `apps/api/src/routes/friends.ts` applies `authenticate` to the whole router.
- Friend-request accept/decline and unfriend flows re-check that the referenced friendship row actually belongs to the caller before mutating it.
- Friend-profile lookup only returns data for an accepted friendship that includes the caller.
- Mail inbox, sent-mail, unread-count, read, and delete operations all scope queries to `playerId` ownership on the sender or recipient side.
- Block and unblock operations are similarly constrained to the caller's own block rows.

I did not find a current route in this area that lets one player read another player's mail, accept another player's friend request, or delete another player's friendship/block row by supplying an arbitrary ID.

**Residual risk:** `findPlayerByUsername()` intentionally supports partial username search for discoverability, excluding only the caller and players who have blocked the searcher. That appears product-intended rather than a broken authorization path, but it does mean usernames and character levels remain lightly discoverable to authenticated players outside the friendship graph.

### Combat-Log Ownership and Playback Access

**Checked:** April 22, 2026

The combat-history and playback routes reviewed in this pass appear correctly scoped to the authenticated player:

- `apps/api/src/routes/combat/logs.ts` validates log IDs as UUIDs before use.
- `GET /api/v1/combat/logs` anchors its raw-SQL history query to `"player_id" = ${playerId}`.
- The zone and mob filter lists are also derived only from that same player's combat logs.
- `GET /api/v1/combat/logs/:id` fetches the playback record with `where: { id, playerId, activityType: 'combat' }`.
- `GET /api/v1/combat/logs/:id/fights` first verifies the summary log belongs to the caller, then restricts the follow-up raw query to the same `playerId`.

I did not find a current path here that lets an authenticated player read another player's combat playback or encounter-site fight expansion by supplying an arbitrary log ID.

**Residual risk:** These routes still depend on hand-built raw SQL and JSON-path extraction over `activity_logs.result`, so future edits need the same ownership guard preserved consistently at the SQL boundary. The current reviewed version appears scoped correctly.

### Authenticated Account-Management Flows

**Checked:** April 22, 2026

The authenticated email-change and password-change paths reviewed in this pass do not show a new concrete bypass:

- `apps/api/src/routes/auth.ts` puts both `/change-email` and `/change-password` behind `authenticate`.
- `apps/api/src/services/authService.ts` re-checks the caller's current password with bcrypt before either mutation.
- Email change resets `emailVerified` to `false` and deletes existing email-verification tokens before issuing a new verification email.
- Password change re-hashes the new password and deletes all refresh tokens for the player, which forces re-login on refreshed sessions.

I did not find a path here that lets an authenticated caller change account email or password without proving knowledge of the current password first.

**Residual risk:** Password change revokes stored refresh tokens but, like the rest of the auth model, already-issued access tokens remain valid until expiry. With the current default 15-minute access-token TTL that is a bounded residual window rather than a unique bug in these handlers.

### PvP History and Notification Ownership

**Checked:** April 22, 2026

The PvP history, match-detail, and notification routes reviewed in this pass appear correctly scoped to the authenticated player:

- `apps/api/src/routes/pvp.ts` applies `authenticate` to the whole router and validates `matchId` / notification ID shapes with Zod before use.
- `apps/api/src/services/pvpService.ts:getHistory()` filters match history with `OR: [{ attackerId: playerId }, { defenderId: playerId }]`.
- `getMatchDetail()` explicitly rejects access unless the caller is either the attacker or defender on that match.
- Attack-result notification count/list/read operations all scope queries to `defenderId: playerId`.
- Scout-notification count/list/read operations all scope queries to `targetId: playerId`.

I did not find a current path here that lets an authenticated player read another player's PvP match detail or mark another player's PvP notifications as read by supplying arbitrary IDs.

**Residual risk:** PvP history intentionally reveals opponent usernames, participant IDs, rating deltas, and outcome details to the two match participants. That appears product-intended, but these handlers should keep their current participant-bound access checks if the match payload expands in the future.

### Guild Join-Request and Member-Management Mutations

**Checked:** April 22, 2026

The guild membership mutation paths reviewed in this pass appear correctly tied to the caller's own guild and role:

- `apps/api/src/services/guildMembershipService.ts` uses `requireRole()` for officer/leader-only actions before mutating join requests or member roles.
- Join-request listing and response both scope the request to `membership.guildId`, so an officer cannot process another guild's request by guessing a `requestId`.
- Kick, promote, demote, transfer-leadership, and disband operations all verify the target member belongs to the requester's guild before mutating state.
- The route-level `/:id` parameter is not the ultimate trust source for several of these mutations; the service layer re-derives authority from the authenticated caller's actual guild membership.

I did not find a current path here that lets a guild officer or leader mutate membership state for another guild by supplying arbitrary request or target IDs.

**Residual risk:** Some route parameters are effectively cosmetic for these mutation paths because the service layer derives the authoritative guild from caller membership rather than trusting the URL. That is safe in the reviewed code, but it does mean future refactors should preserve the service-side guild ownership checks instead of assuming the route parameter alone is a sufficient guard.

### Authenticated Premium Checkout and Confirmation Flow

**Checked:** April 22, 2026

The authenticated premium purchase flow reviewed in this pass does not show a new concrete product/price tampering or cross-account grant issue:

- `apps/api/src/routes/premium.ts` puts checkout, confirm, status, and purchase-history routes behind `authenticate`.
- `createSupportPocketrealmCheckoutSession()` builds the Stripe line item, amount, currency, and product metadata entirely server-side; the caller does not supply price or product inputs.
- `confirmSupportPocketrealmCheckoutSession()` re-fetches the Stripe session from Stripe, checks that `metadata.playerId` matches the authenticated caller, and requires the expected paid Support Pocketrealm session shape before granting premium.
- `grantPremiumDays()` is idempotent for Stripe purchases via unique session/payment-intent tracking, which limits replay and duplicate-grant risk.

I did not find a current path here that lets an authenticated player confirm another player's checkout session or override the premium price/product fields from the client side.

**Residual risk:** `GET /api/v1/premium/purchases` returns the caller's raw purchase records, which may include provider identifiers in metadata. That is acceptable for the owning player, but if the response ever becomes shareable or gets reused in a broader public/admin context, the payload should be reviewed and trimmed intentionally.

### Combat Template Ownership and Activation

**Checked:** April 22, 2026

The combat-template routes reviewed in this pass appear correctly scoped to the authenticated player:

- `apps/api/src/routes/templates.ts` applies `authenticate` to the whole router and parses incoming template payloads with Zod before use.
- `apps/api/src/services/combatTemplateService.ts` always queries templates with `where: { playerId }` or `where: { id: templateId, playerId }` before read, update, delete, or activation.
- Active-template switching first proves ownership of the target template, then only mutates templates belonging to that same player.
- Template-slot validation also checks that referenced actions exist and are available to the caller's unlocked action set.

I did not find a current path here that lets one player read, activate, update, or delete another player's combat template by supplying an arbitrary template ID.

**Residual risk:** The service re-fetches the updated template by `id` after ownership has already been established earlier in the flow. That is safe in the reviewed code path because the ID came from an ownership-checked record, but future refactors should keep the ownership proof and final fetch aligned rather than separating them loosely.

### Expedition Membership and Shared Combat Snapshot Access

**Checked:** April 22, 2026

The expedition collaboration routes and shared combat-snapshot helper reviewed in this pass appear correctly scoped to guild membership and expedition membership:

- `apps/api/src/routes/expedition.ts` applies `authenticate` to the whole router.
- `GET /active` and `GET /history` derive the guild from the authenticated player's `guildMember` row instead of trusting a caller-supplied guild or expedition identifier.
- `GET /:id` fetches expedition status and then explicitly rejects callers whose current guild does not match `data.expedition.guildId`.
- Officer-only expedition controls such as `POST /:id/force-round`, `POST /:id/auto-resolve`, and `POST /:id/abandon` re-check both guild membership and officer/leader role before operating on expedition state.
- Member actions such as signup, recover, target selection, and heal-target selection are backed by `guildExpeditionMember` ownership checks in `apps/api/src/services/expeditionService.ts`, primarily through the shared `assertActiveMember()` guard and composite `expeditionId_playerId` lookups.
- `apps/api/src/services/expeditionCombatCache.ts` stores combat snapshots under a Redis key that includes `expeditionId`, `roomIndex`, and `playerId`, and `apps/api/src/services/expeditionRoundService.ts` only reads them back for players already loaded from the expedition member set via `buildRaidParticipant(member, expeditionId, roomIndex)`.

I did not find a current path here that lets an authenticated player read another guild's expedition detail, perform officer expedition controls on another guild's run, or retrieve another player's cached expedition combat snapshot by supplying arbitrary identifiers.

**Residual risk:** Expedition authorization is currently split across route guards, service-layer membership checks, and the round service's assumption that cached snapshot reads only happen for trusted member records. That composition is sound in the reviewed code, but future refactors should preserve the same server-derived `playerId` and guild-scoping model rather than introducing direct snapshot/debug endpoints that trust caller-supplied player identifiers.

### Quest Reward Claiming, Rerolls, and Lazy Reset Paths

**Checked:** April 22, 2026

The quest state and reward paths reviewed in this pass appear correctly scoped to the authenticated player, including the routes that accept caller-supplied quest IDs:

- `apps/api/src/routes/quests.ts` applies `authenticate` to the whole router and validates the quest ID shape with Zod before calling the service layer.
- `apps/api/src/services/questService.ts:getActiveQuests()` only resets and regenerates quests under `playerId`, using `updateMany()` guards on `playerQuestState` so concurrent requests do not generate duplicate daily or weekly quest sets.
- `claimQuestReward()` loads the quest with `findFirst({ where: { id: questId, playerId, status: 'completed' } })`, so supplying another player's completed quest ID does not make it claimable.
- `claimDailyBonus()` counts only the caller's own current-period quests and uses `updateMany({ where: { playerId, dailyBonusClaimed: false } })` to prevent duplicate bonus claims in a race.
- `rerollQuest()` first proves the quest belongs to the caller and is active, then performs the delete/create sequence together with the reroll-limit increment inside one transaction scoped to that same `playerId`.

I did not find a current path here that lets an authenticated player claim another player's quest reward, reroll another player's quest by supplying its ID, or duplicate the daily bonus through a simple request race.

**Residual risk:** The quest subsystem relies on consistent `playerId` scoping across both lazy reset logic and transaction-time claim/reroll guards. That is sound in the reviewed code, but future refactors should keep the ownership check and final mutation in the same service path rather than splitting them across loosely coordinated route helpers.

### Limiter Coverage Beyond Prior Auth and Webhook Findings

**Checked:** April 22, 2026

This pass reviewed the remaining limiter coverage around public auth endpoints, global HTTP throttling, and real-time chat sends. I did not find a new concrete rate-limit bypass beyond the already-recorded fail-open Redis behavior and Stripe webhook exemption:

- `apps/api/src/index.ts` mounts a global `/api/v1/` limiter before the JSON parser and API routers, so public endpoints like `/api/v1/auth/refresh`, `/api/v1/auth/reset-password`, and `/api/v1/auth/verify-email` are still subject to the global per-IP cap even without route-specific limiters.
- `apps/api/src/routes/auth.ts` adds stricter dedicated limiters for `/login`, `/forgot-password`, and authenticated `/resend-verification`.
- `apps/api/src/services/lockoutService.ts` adds a second per-email Redis counter for password-reset requests, which narrows email-bombing risk beyond the per-IP limiter.
- `apps/api/src/socket/chatHandlers.ts` enforces a Redis-backed per-player chat send cooldown via `checkRateLimit()` before persisting or broadcasting a message, so authenticated sockets are not completely unthrottled even though Socket.IO traffic does not pass through the Express global limiter.

I did not find a new currently exploitable path here that leaves the reviewed password-reset, token-refresh, verification, or chat-send flows entirely unthrottled under normal operation.

**Residual risk:** Limiter policy is still uneven. Registration and the Stripe webhook now have dedicated fail-closed buckets, but many authenticated gameplay routes rely only on the coarse global per-IP limiter, while chat send limits and password-reset anti-bombing depend directly on Redis availability. Future high-cost endpoints should continue to be reviewed for dedicated per-action throttles rather than assuming the global bucket is always sufficient.

### Admin Mutation and Diagnostic Paths

**Checked:** April 22, 2026

The deeper admin surface reviewed in this pass does not show a new privilege-escalation path beyond the already-checked router guard:

- `apps/api/src/routes/admin.ts` applies `authenticate` and `requireAdmin` to the whole router before any handler runs.
- `apps/api/src/middleware/admin.ts` re-reads the caller's role from the database on every admin request, so role revocation is not gated on access-token expiry.
- Most state-changing admin handlers parse request bodies with Zod before use, including premium grants, level/skill changes, event spawns, teleportation, encounter spawning, treasury grants, and analytics period selection.
- The sensitive diagnostic/read endpoints I reviewed, including `/scheduler-status`, `/premium/purchases/:playerId`, and `/analytics/balance`, are only reachable through that same DB-backed admin gate.

I did not find a current path here that lets a non-admin caller reach the admin router, retain HTTP admin power after database-side role revocation, or trigger the reviewed admin mutations without first passing the shared admin middleware.

**Residual risk:** A few admin-only handlers still use lightly validated string params or query values rather than full schema parsing, notably `POST /events/:id/cancel` and the optional `zoneId` filters on some listing endpoints. That does not create a new privilege boundary failure in the reviewed code because the router is already DB-guarded as admin-only, but these operational/diagnostic endpoints also expose raw internal state such as premium purchase records and scheduler timer keys, so they should remain tightly admin-scoped and can be hardened further with stricter param validation later.

### Bestiary, Achievement, and Notification Status Reads

**Checked:** April 22, 2026

The remaining progression/profile read and mutation routes reviewed in this pass appear correctly scoped to the authenticated player and do not show a new cross-account data exposure issue:

- `apps/api/src/routes/bestiary.ts` applies `authenticate` to the whole router and all player-specific progress lookups (`playerBestiary`, `playerBestiaryPrefix`, `playerZoneExploration`, `playerBossRotation`) are keyed by `playerId`.
- Hidden bestiary entries suppress names, stats, flavor text, and drop tables until the caller has either explored far enough or recorded kills for that mob, so the route is not simply dumping the full undiscovered bestiary payload.
- `apps/api/src/routes/achievements.ts` applies `authenticate`, and `apps/api/src/services/achievementService.ts` resolves achievement progress, reward claims, title activation, and unclaimed counts through `playerId`-scoped queries, primarily using the composite `playerId_achievementId` key.
- `apps/api/src/routes/notifications.ts` validates subscription payloads with Zod and all subscribe/unsubscribe/status operations route through `req.player!.playerId` rather than caller-supplied account identifiers.

I did not find a current path here that lets an authenticated player read another player's bestiary progress, claim another player's achievement reward, switch another player's active title, or manage another player's push subscriptions by supplying arbitrary identifiers.

**Residual risk:** `POST /api/v1/achievements/:id/claim` still accepts the achievement ID directly from the URL without an explicit route-level schema parse. In the reviewed code that does not become an ownership bug because the service immediately constrains the lookup by the caller's `playerId` and known achievement definitions, but future route expansions should keep that same service-side ownership pattern and can add explicit param validation for consistency.

### Turn, HP, and Skill-Point Mutation Paths

**Checked:** April 22, 2026

The remaining account-resource and progression mutation routes reviewed in this pass appear correctly tied to the authenticated player and do not show a new ownership or simple race-condition issue:

- `apps/api/src/routes/turns.ts`, `apps/api/src/routes/hp.ts`, and `apps/api/src/routes/skillpoints.ts` all apply `authenticate` to the whole router, and none of the reviewed handlers accept a caller-supplied player identifier.
- `apps/api/src/services/turnBankService.ts` resolves turn-bank state by `playerId` and uses compare-and-swap style `updateMany()` writes over the prior stored values to avoid stale-balance spends and refunds.
- `apps/api/src/services/hpService.ts` keeps rest and recovery state transitions inside transactions and uses guarded `updateMany()` writes on the player's prior HP/recovery state so concurrent requests fail closed with conflict errors rather than double-applying.
- `apps/api/src/services/skillPointService.ts` resolves talent nodes from the static definition set, scopes all reads and writes to `playerId`, and uses a transaction plus row lock / allocation-row creation path to prevent straightforward double-spend of skill points during concurrent allocation.

I did not find a current path here that lets an authenticated player read or mutate another player's turn bank, HP/recovery state, or skill-point allocation by supplying arbitrary identifiers, nor a simple request race that duplicates these resource spends under the reviewed code paths.

**Residual risk:** The skill-point service uses a raw `SELECT ... FOR UPDATE` lock on the allocation row before proceeding with allocation. That is acceptable in the reviewed code because the `playerId` is server-derived and the node ID comes from a static talent definition set, but future refactors should preserve the same transaction boundary and ownership model if the allocation record lifecycle changes.

### Training Route Validation and Bestiary Gating

**Checked:** April 22, 2026

The training fight helper reviewed in this pass does not show a new request-validation or public-data-exposure issue:

- `apps/api/src/routes/training.ts` applies `authenticate` to the whole router, validates `mobTemplateId` as a UUID with Zod, and requires the caller to be in town and not expedition-locked before simulation starts.
- `apps/api/src/services/trainingService.ts:simulateFight()` re-checks the requested `mobTemplateId` against the caller's own `playerBestiary` record, so a player cannot train against arbitrary unseen mobs by guessing valid template IDs.
- If a `prefix` is supplied, the service further constrains it through the composite `playerId_mobTemplateId_prefix` bestiary table, which prevents requesting unseen elite/prefix variants directly.
- The route does not persist rewards or mutate another player's state, and the cooldown key is derived from the authenticated `playerId`, not from caller input.

I did not find a current path here that lets an authenticated player use the training endpoint to access another player's combat state, bypass discovery gates for unseen mobs or prefixes, or influence another player's cooldown by supplying crafted identifiers.

**Residual risk:** The cooldown is enforced through Redis state in `trainingService.ts`, so its availability characteristics still track the Redis dependency discussed elsewhere in this audit. Unlike the HTTP limiter middleware, this specific path does fail closed on Redis errors by surfacing service errors rather than silently disabling the gate, but it remains operationally coupled to Redis health.

### Equipment Ownership and Slot Mutation Paths

**Checked:** April 22, 2026

The equipment equip/unequip flow reviewed in this pass does not show a new ownership or slot-confusion issue:

- `apps/api/src/routes/equipment.ts` applies `authenticate` to the whole router, validates `itemId` as a UUID and `slot` as a fixed enum, and blocks equip/unequip while the player is in recovering state.
- `apps/api/src/services/equipmentService.ts:equipItem()` re-loads the target item from the database and rejects the request unless `item.ownerId === playerId`, so a caller cannot equip another player's item by supplying an arbitrary item ID.
- The same service also re-validates that the item is actually equipable, is not stacked, and matches the requested slot from its template definition before updating `player_equipment`.
- `unequipSlot()` and `getEquippedItemInSlot()` both operate through the composite `playerId_slot` key, so slot mutation stays scoped to the authenticated player's own equipment rows.

I did not find a current path here that lets an authenticated player equip or unequip another player's gear, force an item into the wrong slot, or mutate another player's equipment state by supplying crafted identifiers.

**Residual risk:** The equip flow currently clears any existing reference to the same `itemId` under the same `playerId` before writing the new slot, which is safe in the reviewed single-owner model. Future refactors should keep the same server-derived ownership check and slot-template validation if shared items, alternate loadouts, or bulk equipment updates are introduced.

## OA-13: Exploration Estimate Endpoint Leaks Mechanics for Undiscovered Zones

**Severity:** low
**Area:** Request validation, public data exposure, reconnaissance
**Status:** FIXED
**Checked:** April 22, 2026
**Fixed:** April 24, 2026

### Files Reviewed

- `apps/api/src/routes/exploration/estimate.ts`
- `apps/api/src/routes/exploration/helpers.ts`
- `apps/api/src/routes/zones.ts`

### Evidence

- The exploration estimate query schema accepts an optional arbitrary `zoneId` UUID:
  - `apps/api/src/routes/exploration/helpers.ts:24`
  - `apps/api/src/routes/exploration/helpers.ts:26`
- The estimate route uses that `zoneId` directly to read zone mechanics without verifying the caller is in the zone or has discovered it:
  - `apps/api/src/routes/exploration/estimate.ts:19`
  - `apps/api/src/routes/exploration/estimate.ts:27`
  - `apps/api/src/routes/exploration/estimate.ts:39`
- The same route then returns a live probability estimate derived from that zone's `zoneExitChance` and active zone modifiers:
  - `apps/api/src/routes/exploration/estimate.ts:30`
  - `apps/api/src/routes/exploration/estimate.ts:51`
- Elsewhere, the zone map intentionally hides undiscovered zone details but still exposes their IDs as `???` hints:
  - `apps/api/src/routes/zones.ts:114`
  - `apps/api/src/routes/zones.ts:123`
  - `apps/api/src/routes/zones.ts:124`
  - `apps/api/src/routes/zones.ts:164`

### Exploit Path

1. An authenticated player calls `GET /api/v1/zones` and receives `undiscoveredZones` entries with real zone IDs but hidden names.
2. The player submits one of those undiscovered zone IDs to `GET /api/v1/exploration/estimate?zoneId=<id>&turns=<n>`.
3. The estimate route returns exploration probabilities derived from that target zone's `zoneExitChance` and current zone-specific event modifiers even though the zone is still undiscovered to the caller.
4. By comparing results across turns and time, the player can infer hidden zone characteristics and live modifier state that the rest of the discovery system is trying to conceal.

### Why This Matters

This is a reconnaissance leak rather than a direct account-compromise issue, which is why the severity is low. The problem is still concrete: the estimate endpoint cuts across the intended discovery boundary by letting authenticated users query hidden zones with IDs the app already exposes elsewhere.

### Recommended Fix

- Require `zoneId` to belong to the caller's discovered-zone set before returning zone-specific exploration estimates.
- Alternatively, restrict the endpoint to the caller's current zone or omit zone-derived fields when the zone is not discovered.
- If undiscovered-zone IDs must remain visible in `GET /api/v1/zones`, keep other endpoints from treating those IDs as sufficient proof of discovery.

### Remediation

- `apps/api/src/routes/exploration/estimate.ts` now verifies a caller-specific `PlayerZoneDiscovery` row before using a requested `zoneId` for zone-specific estimate mechanics.
- Undiscovered `zoneId` values are rejected with `403 ZONE_NOT_DISCOVERED` before the route reads zone exit chance or active zone modifiers.
- `apps/api/src/routes/exploration/estimate.test.ts` covers that undiscovered zones are denied and zone mechanics are not queried.

**Risk closed:** Authenticated players can no longer use undiscovered zone IDs from the zone map to infer hidden exploration probabilities or live zone modifier state.

**Residual risk:** The endpoint still returns estimates for zones the caller has discovered. That is consistent with the discovery model; future additions should keep discovery checks before zone-specific mechanics are read.

**Verification:** `npm run test:api -- src/routes/exploration/estimate.test.ts`.

### Encounter-Site Combat Entry and Ownership Checks

**Checked:** April 22, 2026

The dedicated encounter-site combat routes reviewed in this pass appear correctly scoped to the authenticated player's own site records and do not show a new IDOR:

- `apps/api/src/routes/combat/sites.ts` validates site IDs as UUIDs before use and only lists encounter sites through `findMany({ where: { playerId, ... } })`.
- The abandon, auto-resolve, manual start, and manual round flows all ultimately re-load the target encounter site with `where: { id: siteId, playerId }` inside the service layer before mutating it.
- `apps/api/src/services/encounterSiteCombatService.ts:autoResolveEncounterRoom()` and `apps/api/src/services/encounterSiteManualCombat.ts:startManualEncounterRoom()` both assert that the caller is still in the site's zone before proceeding, so a stale site ID alone is not enough to use the route from elsewhere.
- Manual combat session state in Redis is keyed as `encounter-combat:${playerId}:${siteId}`, which keeps one player's in-progress room state from colliding with another player's site even if the site IDs are known.

I did not find a current path here that lets an authenticated player list, start, advance, auto-resolve, or abandon another player's encounter site by supplying a crafted site ID.

**Residual risk:** A few helper writes, such as the decay persistence update in `apps/api/src/routes/combat/helpers.ts`, update by `id` alone after ownership has already been established earlier in the flow. That is safe in the reviewed call graph because the site ID is always obtained from a prior `id + playerId` lookup, but future refactors should keep that ownership proof adjacent to the final write rather than reusing these helpers from looser entry points.

### Residual Route-Layer Request Validation Gaps

**Checked:** April 22, 2026

I used this pass to review the main remaining handlers that still read raw route params or simple query flags instead of parsing every identifier through a dedicated Zod schema. I did not find a new concrete auth bypass or state-tampering issue in the reviewed set:

- `apps/api/src/routes/friends.ts` passes friendship and mail IDs straight through in a few handlers, but the called services (`friendService`, `friendMailService`, `sparService`) all re-scope those IDs to the authenticated player before accepting, declining, deleting, profiling, sparring, reading, or deleting anything.
- `apps/api/src/routes/guild.ts` still uses raw `req.params.id`, `req.params.projectId`, and `req.params.requestId` in many handlers, but the reviewed guild services enforce guild membership, officer/leader role, and guild ownership before returning sensitive data or mutating guild state.
- `apps/api/src/routes/templates.ts` and `apps/api/src/routes/achievements.ts` accept raw template and achievement IDs at the route layer, but the service layer re-checks template ownership and known/unlocked achievement state before allowing activation, updates, deletion, reward claims, or title changes.
- `apps/api/src/routes/leaderboard.ts` does not parse `:category` with Zod, but `leaderboardService.getLeaderboard()` rejects unknown categories up front with `INVALID_CATEGORY`, and the route strips internal fields from public leaderboard entries before responding.

I did not find a currently exploitable path here where malformed or attacker-chosen identifiers bypass ownership, role, or category checks purely because a route skipped explicit Zod parsing.

**Residual risk:** The repo still has uneven route-boundary validation. Several endpoints rely on service-layer guards to turn bad identifiers into `404`/`400` responses instead of rejecting them uniformly at the router boundary. That is acceptable in the reviewed call paths, but future refactors should avoid moving sensitive lookups or writes ahead of those existing service-side ownership and category checks.

### Broader Rate-Limiter Coverage Beyond Prior Findings

**Checked:** April 22, 2026

I used this pass to review the remaining rate-limiter surface outside the auth-specific paths already covered earlier in the audit. I did not find a new unauthenticated write or obviously abusable high-cost route that is completely outside both the global limiter and all existing route-local throttles:

- `apps/api/src/index.ts` applies the shared Redis-backed global limiter to `/api/v1/*`, so most authenticated and public API routes still sit behind a baseline per-IP bucket even when they do not define their own route-specific limiter.
- Higher-risk action groups that are easy to spam in normal play already have dedicated local limiters on top of that shared bucket, including auth login/reset flows, exploration starts, combat starts, PvP routes, crafting, and casino bets.
- The reviewed premium, notification, boss, expedition, and casino read routes currently rely on that global limiter or on existing route-local throttles; I did not find a new route in this set that bypasses all throttling while also performing a sensitive state change comparable to the already-documented webhook and registration cases.
- The main out-of-band exceptions remain the ones already captured elsewhere in this document: the webhook carve-out from the global limiter, the Redis fail-open limiter behavior, and the public health endpoints that sit outside `/api/v1/*`.

I did not find a new concrete availability issue in this pass that is distinct from those existing rate-limiting findings.

**Residual risk:** A number of heavier authenticated routes still depend only on the shared global limiter rather than action-specific buckets. That is acceptable in the current design, but routes that trigger expensive third-party calls, round-resolution work, or broad status aggregation would benefit from dedicated per-action throttles if abuse pressure increases.

## Remaining Audit Areas

### Secret Handling Outside Auth

**Checked:** April 22, 2026

I used this pass to review the remaining non-auth secret-handling surface: Stripe configuration, webhook secret use, Resend email setup, VAPID push configuration, Redis/DB environment handling, Sentry initialization, and request/error logging. I did not find a new concrete secret-exposure issue in the reviewed code:

- `apps/api/src/services/stripeService.ts` reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` only on the server side and does not return them to clients; the webhook route verifies signatures from the raw request body without logging the payload or signature value.
- `apps/api/src/services/emailService.ts` uses `RESEND_API_KEY` and `EMAIL_FROM` server-side only. The reset and verification links still place one-time tokens in URL query strings, but that residual risk was already captured earlier under the account-recovery flow review.
- `apps/api/src/services/pushNotificationService.ts` keeps `VAPID_PRIVATE_KEY` server-side and only exposes `VAPID_PUBLIC_KEY` through the authenticated notification-status route, which is expected because that key is part of the client subscription bootstrap.
- `apps/api/src/instrument.ts`, `apps/api/src/redis.ts`, and `apps/api/src/services/staticDataCacheService.ts` use env configuration without logging raw DSNs, Redis URLs, database URLs, or secret values. The request and error logging middleware also avoid logging request bodies, headers, bearer tokens, and webhook payloads in normal control flow.

I did not find a current path here where a non-auth secret is directly exposed to clients or routinely written into application logs.

**Residual risk:** A few generic `logger.error({ err }, ...)` calls still depend on third-party error objects being reasonably sanitized. That is acceptable in the reviewed code paths because the app does not attach request bodies or secret env values to those logs, but future integrations should avoid logging raw SDK request config objects if the upstream library includes authorization material in thrown errors.

At this point, the broad overnight security sweep has covered the currently identified high-risk surfaces in this repo. Additional passes would mostly retread already-reviewed areas unless new code lands or you want the findings converted into fixes.
