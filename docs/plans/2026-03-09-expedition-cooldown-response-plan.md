# Expedition Cooldown Response Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/api/v1/expedition/cooldowns` return the same top-level response shape as the rest of the expedition API so the guild expeditions UI can reliably disable launch buttons during cooldowns.

**Architecture:** Fix the HTTP contract at the route layer instead of adding client-side unwrapping. Guard the contract with a route regression test that exercises both the guild-member and no-guild fallback paths.

**Tech Stack:** Express, Vitest, TypeScript, mocked Prisma route tests

---

### Task 1: Lock the route contract with tests

**Files:**
- Create: `apps/api/src/routes/expedition.test.ts`
- Modify: `apps/api/src/routes/expedition.ts`
- Test: `apps/api/src/routes/expedition.test.ts`

**Step 1: Write the failing test**

Add route tests that call `GET /cooldowns` through the router handler and assert:
- guild members receive `weeklyCooldowns`, `betweenCooldown`, and `hasActiveExpedition` at the top level
- non-members receive the same top-level shape with empty cooldowns

**Step 2: Run test to verify it fails**

Run: `npm test -w apps/api -- src/routes/expedition.test.ts`
Expected: FAIL because the route currently responds with `{ data: ... }`

**Step 3: Write minimal implementation**

Change the route to return the raw cooldown object in both branches.

**Step 4: Run test to verify it passes**

Run: `npm test -w apps/api -- src/routes/expedition.test.ts`
Expected: PASS

**Step 5: Run focused regression coverage**

Run: `npm test -w apps/api -- src/services/expeditionService.test.ts src/routes/expedition.test.ts`
Expected: PASS
