# Pre-Launch Sprint Plan

A phased pickup list of everything that needs to land before public launch, ordered by "what breaks first."

Each phase has an exit gate. Don't start the next phase until the current one is merged and green.

---

## Phase 1 — Data Integrity & Gameplay Bugs

**Gate:** No player can lose data or hit broken gameplay.

| # | Item | Source | What |
|---|------|--------|------|
| 1.1 | **#247 Combat template conditionals** | GitHub bug | Template conditionals not evaluating during battle — core gameplay broken |
| 1.2 | **Achievement reward race condition** | Code audit (achievementService.ts `checkAchievements()`) | Concurrent achievement checks can create duplicate records. Fix: `createMany({ skipDuplicates: true })` or unique constraint handling |
| 1.3 | **Silent achievement reward loss** | Code audit (achievementService.ts `claimReward()`) | If item template doesn't exist, reward is marked claimed but never given. Fix: validate template exists before setting `rewardClaimed` flag |
| 1.4 | **Silent error swallowing** | Code audit (bossEncounterService.ts auto-signup) | Empty `catch {}` silently discards all errors including DB failures. Fix: catch only expected cases, log or re-throw others |
| 1.5 | **JSON column safety** | Code audit (bossEncounterService.ts) | Prisma JSON columns cast directly to types without validation. Fix: add Zod validators for JSON column types, starting with boss encounter fields |
| 1.6 | **#179 Quest notification icon** | GitHub bug | Quest completion notification icon doesn't appear until navigating to quest page — likely a stateUpdates gap |

**Parallelization:** 1.1–1.5 are independent, can run in separate worktrees. 1.6 is a quick fix to bundle in.

**Exit gate:** All 6 items merged, test suite green.

---

## Phase 2 — Observability & Operational Readiness

**Gate:** We can see errors, diagnose issues, and deploy confidently.

Implements the remaining items from the existing launch readiness spec (`docs/superpowers/specs/2026-03-08-launch-readiness-design.md`, issues #208–#211). That spec has the detailed designs — this plan sequences them.

| # | Item | Issue | What |
|---|------|-------|------|
| 2.1 | **Structured logging (pino)** | #208 | Replace `console.log/error` with pino JSON logger. Request logging middleware (method, path, status, response time, requestId). Key game event logging (combat, crafting, boss rounds, guild events). Exclude `/health` from request logs. Foundation for 2.2–2.4. |
| 2.2 | **Sentry error tracking** | #209 | `@sentry/node` for API, `@sentry/nextjs` for web. Error boundary wrapping game layout. Source map upload at build time. Context: requestId, playerId, route, release version. Free tier (5K errors/mo). |
| 2.3 | **Health check enhancement** | #210 | Expand `/health` with DB/Redis dependency checks. Add `/health/ready` (503 if deps down) for Render health checks. Add `/health/live` (always 200). External uptime monitor (UptimeRobot/Betterstack) on `/health/ready` every 60s. |
| 2.4 | **Operational readiness** | #211 | Env var documentation update, `APP_VERSION` from git tag, DB connection pool config (`connection_limit=20`, `pool_timeout=15`), migration checklist, backup strategy verification (Neon automated daily). |
| 2.5 | **Error boundary + connection status** | Launch spec §3 | `useConnectionStatus` hook monitoring API reachability + Socket.IO state. Disconnected banner with auto-retry. React error boundary using Sentry (from 2.2). Disable action buttons while disconnected. |

**Ordering:** 2.1 first (logging is the foundation), then 2.2–2.4 in parallel, then 2.5 last (depends on Sentry from 2.2).

**Exit gate:** Pino JSON logs flowing, Sentry capturing unhandled errors with source maps, `/health/ready` returning dependency status, error boundary catching frontend crashes, connection loss handled gracefully.

---

## Phase 3 — Performance & Polish

**Gate:** The game handles launch-day load and rough UX edges are smoothed.

| # | Item | Source | What |
|---|------|--------|------|
| 3.1 | **P1 scaling work** | Scaling roadmap, spec: `docs/superpowers/specs/2026-03-23-p1-n1-ratelimit-cache-design.md` | N+1 query fixes, rate limit tuning, Redis cache expansion. Biggest single performance improvement. |
| 3.2 | **Combat query optimization** | Code audit (combatOrchestrationService.ts) | Combat path fires 36–53 queries per fight. Cache guild modifiers, drop tables, equipment stats in Redis. Batch loot-granting loop (8–12 serial queries → `createMany`). **Decision needed at implementation time:** check the P1 spec — if it already covers combat path caching, fold 3.2 into 3.1 as one PR. If not, keep separate. |
| 3.3 | **Missing DB indexes** | Code audit | Add explicit indexes: `Item.ownerId`, `DropTable.mobTemplateId`. Fix `GuildUpgrade` index to match query pattern `(guildId, expiresAt)`. Quick Prisma migration. |
| 3.4 | **#250 Overflow loot screens** | GitHub UX | Combine multiple overflow loot modals into a single consolidated view. |
| 3.5 | **Accessibility quick wins** | Code audit | ARIA roles on game page tabs (`tablist`/`tab`/`aria-selected`), `role="alert"` on error banners, `aria-label` on modal close buttons. Top 5 most-used screens only (game page, inventory, combat, forge, quest). |

**Ordering:** 3.3 first (quick migration, immediate win). 3.1 next (big perf lift). 3.2 coordinates with 3.1 (overlapping service files). 3.4 and 3.5 are independent UX work, parallelizable anytime.

**Exit gate:** Combat queries under 15 per fight, indexes deployed, loot UX consolidated, basic ARIA coverage on core screens.

---

## Out of Scope

These are valuable but not launch-blocking. Tracked for post-launch:

| Item | Issue/Source | Why deferred |
|------|-------------|--------------|
| PWA fundamentals (manifest, service worker, icons) | Launch spec §1, #203/#204 | App works fine without — nice-to-have for install experience |
| Push notifications | Launch spec §2, #205 | Feature, not a fix — players survive without it at launch |
| Client analytics (Plausible) | Launch spec §4, #207 | Useful but not blocking — can add after launch without data loss |
| P2 scaling prep (Socket.IO adapter, leaderboard pagination) | #244 | Horizontal scaling not needed at <100 users |
| Guild economy redesign | #174 | Feature work, not stability |
| Seasonal architecture | #152 | Future feature infrastructure |
| Full accessibility audit | Code audit | Phase 3 covers quick wins; full WCAG audit is post-launch |
| Admin ops scope (#32 from security tracker) | Security audit | Design decision, not a vulnerability |

---

## Cross-Cutting Concerns

- **Each item is a separate worktree + PR.** Follow existing workflow: `./scripts/setup-worktree.sh <branch>`.
- **Existing specs:** Phase 2 items are fully designed in the launch readiness spec. Phase 3.1 has its own spec. New items (1.1–1.6, 3.3, 3.5) need implementation plans but not separate design specs — they're targeted fixes.
- **Test requirements:** All PRs must pass `npm run test` and `npm run typecheck` before merge (per project feedback).
- **Coordination risk:** 3.1 and 3.2 touch overlapping service files. Either combine into one PR or sequence 3.2 after 3.1 merges.
