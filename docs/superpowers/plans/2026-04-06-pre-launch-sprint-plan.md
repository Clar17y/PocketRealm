# Pre-Launch Sprint Plan

> **For agentic workers:** Each work item is an independent task with its own worktree and PR. Pick up items in phase order. Don't start the next phase until the current phase's exit gate is met.

**Goal:** Ship all launch-blocking fixes, monitoring, and performance work in three prioritized phases.

**Spec:** `docs/superpowers/specs/2026-04-06-pre-launch-sprint-plan-design.md`

---

## Phase 1 — Data Integrity & Gameplay Bugs

**Exit gate:** All items merged, `npm run test` and `npm run typecheck` green. **STATUS: COMPLETE (2026-04-06)**

- [x] **1.1 — #247 Combat template conditionals not evaluating during battle** — PR #253
  - Root cause: `resolveParticipantActions()` hardcoded `[]` for `activeEffects` instead of forwarding participant effects
  - Fix: added `activeEffects` to `CombatParticipantInput`, mapped and forwarded to `resolveAction()`
  - 747/747 engine tests passing (2 new)

- [x] **1.2 — Achievement reward race condition** — already fixed, confirmation tests in PR #254
  - Already uses `createMany({ skipDuplicates: true })` with composite primary key
  - Added confirmation test for concurrent count=0 path

- [x] **1.3 — Silent achievement reward loss** — already fixed, confirmation tests in PR #254
  - Already validates template inside `$transaction`, rolls back on failure
  - Added `$transaction` assertion to existing test

- [x] **1.4 — Silent error swallowing in boss auto-signup** — already fixed (commit `83dc2ab5`)
  - Catch block now logs unexpected errors, silently skips only `INSUFFICIENT_TURNS`
  - Tests already exist and pass

- [x] **1.5 — JSON column safety (Zod validation)** — PR #255
  - Created Zod schemas for `bossEffects`, `roundSummaries`, `rewardsByPlayer` with `z.ZodType<T>` compile-time enforcement
  - Parse helpers use `.safeParse()` with graceful fallbacks + warning logs
  - Replaced 4 unsafe casts, fixed 2 existing tests with wrong data shapes
  - 117/117 boss encounter tests passing (32 new)

- [x] **1.6 — #179 Quest notification icon missing** — PR #256
  - Root cause: action endpoints returned `questProgress` but frontend only showed toast, never updated local `quests` state
  - Fix: added `updateQuestProgress()` to `useQuests` hook, consolidated `showQuestToasts` inside it
  - Note: encounter site combat and fire-and-forget routes (PvP, boss, casino, travel) are pre-existing gaps — tracked for follow-up

---

## Phase 2 — Observability & Operational Readiness

**Exit gate:** Pino JSON logs flowing, Sentry capturing errors, `/health/ready` returning dependency status, error boundary catching frontend crashes. **STATUS: MAIN VERIFIED; follow-up branch pending merge (2026-04-13)**

**Detailed designs:** `docs/superpowers/specs/2026-03-08-launch-readiness-design.md` §5–§6

**Ordering:** 2.1 first → 2.2–2.4 in parallel → 2.5 last

- [x] **2.1 — #208 Structured logging (pino)** — PR #258
  - Branch: `feat/structured-logging-208`
  - Spec: launch readiness spec §5 "Structured Logging"
  - Scope: replace console.log/error with pino, request logging middleware, game event logging
  - Foundation for Sentry and health check work
  - Verified on `main`: pino logger wiring, request logging middleware, and structured game/server logging landed in PR #258

- [x] **2.2 — #209 Sentry error tracking** — PR #261 + follow-up pending merge from `finish/pre-launch-final-phases`
  - Branch: `feat/sentry-error-tracking-209`
  - Spec: launch readiness spec §5 "Error Tracking"
  - Scope: `@sentry/node` for API, `@sentry/nextjs` for web, source map uploads, error boundary
  - Depends on: 2.1 (for structured context)
  - Verified on `main`: API + Next.js Sentry wiring landed in PR #261
  - Follow-up pending merge from `finish/pre-launch-final-phases`: web release tags read the canonical version env for each runtime, and the game error boundary reports crashes to Sentry

- [x] **2.3 — #210 Health check enhancement** — PR #260 + follow-up pending merge from `finish/pre-launch-final-phases`
  - Branch: `feat/health-check-enhancement-210`
  - Spec: launch readiness spec §5 "Health Check Enhancement"
  - Scope: `/health/ready` with DB/Redis checks, `/health/live`, external uptime monitor
  - Verified on `main`: `/health`, `/health/ready`, `/health/live`, probe timeouts, and single-flight probe protection landed in PR #260
  - Follow-up pending merge from `finish/pre-launch-final-phases`: `/health/ready` includes `version` and `socketio` dependency status in the readiness payload

- [x] **2.4 — #211 Operational readiness** — PR #259
  - Branch: `feat/operational-readiness-211`
  - Spec: launch readiness spec §6
  - Scope: env var docs, APP_VERSION, connection pool config, migration checklist, backup verification
  - Verified on `main`: deployment docs, canonical `APP_VERSION`, worktree `DIRECT_DATABASE_URL`, and operational runbook updates landed in PR #259

- [x] **2.5 — Error boundary + connection status** — earlier UI work + follow-up pending merge from `finish/pre-launch-final-phases`
  - Branch: `feat/error-boundary-connection-status`
  - Spec: launch readiness spec §3
  - Scope: `useConnectionStatus` hook, disconnected banner, React error boundary (Sentry)
  - Depends on: 2.2 (Sentry error boundary)
  - Existing `main`: connection banner, socket-aware hook, offline gating, and error boundary shell landed via earlier error resilience work
  - Follow-up pending merge from `finish/pre-launch-final-phases`: the connection banner now falls back to disconnected when API reachability drops without a socket disconnect, and the React boundary sends crashes to Sentry

---

## Phase 3 — Performance & Polish

**Exit gate:** Combat queries under 15 per fight, indexes deployed, loot UX consolidated, basic ARIA on core screens. **STATUS: MAIN VERIFIED; final follow-up branch pending merge (2026-04-13)**

**Ordering:** 3.3 first (quick) → 3.1 (big lift) → 3.2 (coordinates with 3.1) → 3.4/3.5 anytime

- [x] **3.1 — P1 scaling work** — PR #246, plus supporting DB/API efficiency work in PR #245
  - Branch: `perf/p1-scaling`
  - Spec: `docs/superpowers/specs/2026-03-23-p1-n1-ratelimit-cache-design.md`
  - Plan: `docs/superpowers/plans/2026-03-23-p1-n1-ratelimit-cache.md`
  - Scope: N+1 query fixes, rate limit tuning, Redis cache expansion
  - Note: check if this already covers 3.2 combat path caching — if so, combine
  - Verified on `main`: Redis-backed rate limiting, cache headers, batched loot inserts, Redis chat throttling, and N+1 cleanup landed in PR #246
  - Supporting cache/static-data work landed in PR #245

- [x] **3.2 — Combat query optimization** — folded into PR #245 / PR #246 per plan note
  - Branch: `perf/combat-query-optimization`
  - Scope: reduce 36–53 queries/fight via Redis caching (guild modifiers, drop tables, equipment stats) and batch loot granting
  - Key files: `apps/api/src/services/combatOrchestrationService.ts`
  - Decision: fold into 3.1 if P1 spec already covers combat caching, otherwise separate PR
  - Verified on `main`: combat path now uses cached/static data reads, preloaded combat prep, and batched loot granting instead of the original hot-path query pattern

- [x] **3.3 — Missing DB indexes** ⬅ quick win landed in PR #245
  - Branch: `perf/missing-db-indexes`
  - Scope: Prisma migration adding the planned index sweep for hot lookup paths, including `DropTable.mobTemplateId` and `GuildUpgrade(guildId, expiresAt)`
  - Key files: `packages/database/prisma/schema.prisma`
  - Verified on `main`: migration `20260323122426_add_missing_indexes` plus schema updates cover the shipped index sweep, including `DropTable.mobTemplateId` and `GuildUpgrade(guildId, expiresAt)`

- [x] **3.4 — #250 Overflow loot screens** — final consolidation pending merge from `finish/pre-launch-final-phases`
  - Branch: `feat/combined-overflow-loot-250`
  - Scope: combine multiple overflow loot modals into single consolidated view
  - Follow-up pending merge from `finish/pre-launch-final-phases`: queued overflow sessions are consolidated into one loot picker flow instead of presenting players with serial modal churn

- [x] **3.5 — Accessibility quick wins** — existing partial work + follow-up pending merge from `finish/pre-launch-final-phases`
  - Branch: `fix/accessibility-quick-wins`
  - Scope: ARIA roles on game page tabs, `role="alert"` on error banners, `aria-label` on modal close buttons
  - Key files: `apps/web/src/app/game/page.tsx`, inventory component, combat screen, forge, quest page
  - Verified on `main`: `SubNav` tab roles, action/status alerts, and many labeled modal controls already landed
  - Follow-up pending merge from `finish/pre-launch-final-phases`: shared `ErrorBanner` announces with `role="alert"` and the overflow loot dismiss control has an explicit accessible label

---

## Out of Scope (Post-Launch)

| Item | Issue | Reason |
|------|-------|--------|
| PWA fundamentals | #203, #204 | Nice-to-have, not blocking |
| Push notifications | #205 | Feature, not fix |
| ~~Client analytics (Plausible)~~ | ~~#207~~ | ~~Merged as PR #239~~ |
| P2 scaling prep | #244 | Not needed at <100 users |
| ~~Guild economy redesign~~ | ~~#174~~ | ~~Merged as PR #257 during Phase 1 session~~ |
| Seasonal architecture | #152 | Future infrastructure |
| Full accessibility audit | — | Quick wins in 3.5 cover launch |
