# Pre-Launch Sprint Plan

> **For agentic workers:** Each work item is an independent task with its own worktree and PR. Pick up items in phase order. Don't start the next phase until the current phase's exit gate is met.

**Goal:** Ship all launch-blocking fixes, monitoring, and performance work in three prioritized phases.

**Spec:** `docs/superpowers/specs/2026-04-06-pre-launch-sprint-plan-design.md`

---

## Phase 1 — Data Integrity & Gameplay Bugs

**Exit gate:** All items merged, `npm run test` and `npm run typecheck` green.

- [ ] **1.1 — #247 Combat template conditionals not evaluating during battle**
  - Branch: `fix/combat-template-conditionals-247`
  - Scope: Template conditionals broken in combat — core gameplay bug
  - Key files: investigate combat template evaluation in game-engine and API
  - Tests: add/fix game-engine combat template tests

- [ ] **1.2 — Achievement reward race condition**
  - Branch: `fix/achievement-race-condition`
  - Scope: Concurrent `checkAchievements()` can create duplicate records
  - Key files: `apps/api/src/services/achievementService.ts` — `checkAchievements()`
  - Fix: `createMany({ skipDuplicates: true })` or unique constraint handling
  - Tests: concurrent achievement check test

- [ ] **1.3 — Silent achievement reward loss**
  - Branch: `fix/achievement-reward-loss`
  - Scope: If item template doesn't exist, reward marked claimed but never given
  - Key files: `apps/api/src/services/achievementService.ts` — `claimReward()`
  - Fix: validate template exists before setting `rewardClaimed` flag; throw or return error if missing
  - Tests: test claimReward with nonexistent template

- [ ] **1.4 — Silent error swallowing in boss auto-signup**
  - Branch: `fix/boss-autosignup-error-handling`
  - Scope: Empty `catch {}` silently discards all errors including DB failures
  - Key files: `apps/api/src/services/bossEncounterService.ts` — auto-signup catch block
  - Fix: catch only expected cases, log others
  - Tests: verify unexpected errors propagate or are logged

- [ ] **1.5 — JSON column safety (Zod validation)**
  - Branch: `fix/json-column-validation`
  - Scope: Prisma JSON columns cast without runtime validation
  - Key files: `apps/api/src/services/bossEncounterService.ts` (lines ~60, 63, 72, 390, 423)
  - Fix: add Zod schemas for JSON column types, validate on read
  - Tests: test with malformed JSON data

- [ ] **1.6 — #179 Quest notification icon missing**
  - Branch: `fix/quest-notification-icon-179`
  - Scope: Quest completion icon doesn't appear until page nav — likely stateUpdates gap
  - Key files: investigate quest state in `stateUpdates` response and frontend quest notification logic
  - Tests: verify quest completion triggers notification state update

---

## Phase 2 — Observability & Operational Readiness

**Exit gate:** Pino JSON logs flowing, Sentry capturing errors, `/health/ready` returning dependency status, error boundary catching frontend crashes.

**Detailed designs:** `docs/superpowers/specs/2026-03-08-launch-readiness-design.md` §5–§6

**Ordering:** 2.1 first → 2.2–2.4 in parallel → 2.5 last

- [ ] **2.1 — #208 Structured logging (pino)** ⬅ do first
  - Branch: `feat/structured-logging-208`
  - Spec: launch readiness spec §5 "Structured Logging"
  - Scope: replace console.log/error with pino, request logging middleware, game event logging
  - Foundation for Sentry and health check work

- [ ] **2.2 — #209 Sentry error tracking**
  - Branch: `feat/sentry-error-tracking-209`
  - Spec: launch readiness spec §5 "Error Tracking"
  - Scope: `@sentry/node` for API, `@sentry/nextjs` for web, source map uploads, error boundary
  - Depends on: 2.1 (for structured context)

- [ ] **2.3 — #210 Health check enhancement**
  - Branch: `feat/health-check-enhancement-210`
  - Spec: launch readiness spec §5 "Health Check Enhancement"
  - Scope: `/health/ready` with DB/Redis checks, `/health/live`, external uptime monitor

- [ ] **2.4 — #211 Operational readiness**
  - Branch: `feat/operational-readiness-211`
  - Spec: launch readiness spec §6
  - Scope: env var docs, APP_VERSION, connection pool config, migration checklist, backup verification

- [ ] **2.5 — Error boundary + connection status**
  - Branch: `feat/error-boundary-connection-status`
  - Spec: launch readiness spec §3
  - Scope: `useConnectionStatus` hook, disconnected banner, React error boundary (Sentry)
  - Depends on: 2.2 (Sentry error boundary)

---

## Phase 3 — Performance & Polish

**Exit gate:** Combat queries under 15 per fight, indexes deployed, loot UX consolidated, basic ARIA on core screens.

**Ordering:** 3.3 first (quick) → 3.1 (big lift) → 3.2 (coordinates with 3.1) → 3.4/3.5 anytime

- [ ] **3.1 — P1 scaling work**
  - Branch: `perf/p1-scaling`
  - Spec: `docs/superpowers/specs/2026-03-23-p1-n1-ratelimit-cache-design.md`
  - Plan: `docs/superpowers/plans/2026-03-23-p1-n1-ratelimit-cache.md`
  - Scope: N+1 query fixes, rate limit tuning, Redis cache expansion
  - Note: check if this already covers 3.2 combat path caching — if so, combine

- [ ] **3.2 — Combat query optimization**
  - Branch: `perf/combat-query-optimization`
  - Scope: reduce 36–53 queries/fight via Redis caching (guild modifiers, drop tables, equipment stats) and batch loot granting
  - Key files: `apps/api/src/services/combatOrchestrationService.ts`
  - Decision: fold into 3.1 if P1 spec already covers combat caching, otherwise separate PR

- [ ] **3.3 — Missing DB indexes** ⬅ do first (quick win)
  - Branch: `perf/missing-db-indexes`
  - Scope: Prisma migration adding indexes on `Item.ownerId`, `DropTable.mobTemplateId`, fix `GuildUpgrade` index to `(guildId, expiresAt)`
  - Key files: `packages/database/prisma/schema.prisma`

- [ ] **3.4 — #250 Overflow loot screens**
  - Branch: `feat/combined-overflow-loot-250`
  - Scope: combine multiple overflow loot modals into single consolidated view

- [ ] **3.5 — Accessibility quick wins**
  - Branch: `fix/accessibility-quick-wins`
  - Scope: ARIA roles on game page tabs, `role="alert"` on error banners, `aria-label` on modal close buttons
  - Key files: `apps/web/src/app/game/page.tsx`, inventory component, combat screen, forge, quest page

---

## Out of Scope (Post-Launch)

| Item | Issue | Reason |
|------|-------|--------|
| PWA fundamentals | #203, #204 | Nice-to-have, not blocking |
| Push notifications | #205 | Feature, not fix |
| Client analytics (Plausible) | #207 | Can add post-launch |
| P2 scaling prep | #244 | Not needed at <100 users |
| Guild economy redesign | #174 | Feature work |
| Seasonal architecture | #152 | Future infrastructure |
| Full accessibility audit | — | Quick wins in 3.5 cover launch |
