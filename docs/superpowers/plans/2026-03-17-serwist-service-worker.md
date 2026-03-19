# Serwist Service Worker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Serwist service worker to the Next.js PWA so the app shell is precached, static assets load instantly on repeat visits, the PWA install prompt is enabled, and an offline fallback page is shown when the user has no connection.

**Architecture:** Serwist's `@serwist/next` plugin wraps the existing Next.js config to inject a service worker at build time. The service worker precaches the app shell and uses `defaultCache` runtime caching rules (network-first for pages, cache-first for static assets). A `/~offline` route serves a themed fallback page when navigation fails offline.

**Tech Stack:** `@serwist/next` + `serwist` (v9.5.7), Next.js App Router

---

### Task 1: Install Serwist Dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install packages**

Run from repo root:
```bash
npm install @serwist/next serwist --workspace=@pocketrealm/web
```

Expected: Both packages added to `dependencies` in `apps/web/package.json`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore(web): add @serwist/next and serwist dependencies (#204)"
```

---

### Task 2: Convert next.config.js to ESM and Add Serwist Plugin

**Files:**
- Rename: `apps/web/next.config.js` → `apps/web/next.config.mjs`

**Context:** The current `next.config.js` uses `module.exports` (CJS). Serwist's `withSerwistInit` uses ESM default import. Convert to `.mjs` and wrap the existing config.

- [ ] **Step 1: Rename config file**

```bash
cd apps/web && git mv next.config.js next.config.mjs
```

- [ ] **Step 2: Rewrite as ESM with Serwist wrapper**

Replace contents of `apps/web/next.config.mjs` with:

```javascript
import { spawnSync } from "node:child_process";
import withSerwistInit from "@serwist/next";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  cacheOnNavigation: true,
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist({
  reactStrictMode: true,
  transpilePackages: ["@pocketrealm/shared", "@pocketrealm/game-engine"],
  images: {
    minimumCacheTTL: 2592000,
  },
});
```

Key decisions:
- `disable: process.env.NODE_ENV === "development"` — no service worker in dev (avoids caching issues during development)
- `cacheOnNavigation: true` — caches pages as users navigate via `next/link`
- `revision` uses git HEAD so the offline page cache busts on every deploy

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npm run build`

Expected: Build succeeds. A `public/sw.js` file is generated.

- [ ] **Step 4: Add sw.js to .gitignore**

In `apps/web/.gitignore` (create if it doesn't exist), add:

```
# Serwist generates this at build time
public/sw.js
public/sw.js.map
public/swe-worker-*.js
public/swe-worker-*.js.map
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.mjs apps/web/.gitignore
git rm --cached apps/web/public/sw.js apps/web/public/sw.js.map 2>/dev/null; true
git commit -m "feat(web): wrap Next.js config with Serwist plugin (#204)"
```

---

### Task 3: Create the Service Worker

**Files:**
- Create: `apps/web/app/sw.ts`

**Context:** Serwist expects the service worker source at the path specified by `swSrc` in the config. This file lives at `apps/web/app/sw.ts` (project root `app/`, NOT inside `src/app/`) because it's a build-time input for Serwist, not a Next.js page route. It uses Serwist's `defaultCache` which provides sensible runtime caching rules for Next.js apps (network-first for pages, cache-first for static assets like `_next/static`).

- [ ] **Step 1: Create the service worker file**

Create `apps/web/app/sw.ts`:

```typescript
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npm run build`

Expected: Build succeeds, `public/sw.js` is generated with precache manifest injected.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/sw.ts
git commit -m "feat(web): add Serwist service worker with precaching and offline fallback (#204)"
```

---

### Task 4: Create the Offline Fallback Page

**Files:**
- Create: `apps/web/src/app/~offline/page.tsx`

**Context:** When the user navigates to any page while offline and it's not in the cache, Serwist serves the `/~offline` route as a fallback. This page should match the RPG theme and clearly communicate the offline state. Uses inline styles (not Tailwind) so it renders correctly from precache without the full CSS bundle. Uses an `<a>` tag instead of a button to avoid client JS — navigating to `/` will either work (online) or show the offline page again.

- [ ] **Step 1: Create the offline page**

Create `apps/web/src/app/~offline/page.tsx`:

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — PocketRealm",
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0c0a08",
        color: "#e8e8e0",
        fontFamily: "serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <img
        src="/icons/icon-96.png"
        alt="PocketRealm"
        width={96}
        height={96}
        style={{ filter: "grayscale(1) opacity(0.6)", marginBottom: "1rem" }}
      />
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#d4a84b",
          marginBottom: "0.5rem",
        }}
      >
        You&apos;re Offline
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "#8a8878",
          maxWidth: "20rem",
          lineHeight: 1.6,
          marginBottom: "1.5rem",
        }}
      >
        PocketRealm needs a connection to the server. Check your internet and try again.
      </p>
      <a
        href="/"
        style={{
          display: "inline-block",
          padding: "0.625rem 1.5rem",
          borderRadius: "0.5rem",
          backgroundColor: "#d4a84b",
          color: "#0c0a08",
          fontWeight: 600,
          fontSize: "0.875rem",
          textDecoration: "none",
          cursor: "pointer",
        }}
      >
        Retry
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npm run build`

Expected: Build succeeds, `/~offline` route appears in the output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/~offline/page.tsx
git commit -m "feat(web): add themed offline fallback page (#204)"
```

---

### Task 5: Build Verification & Cleanup

**Files:** None (verification only)

- [ ] **Step 1: Full build from repo root**

```bash
npm run build:web
```

Expected: Build succeeds. Output includes `/~offline` route. `public/sw.js` is generated.

- [ ] **Step 2: Verify service worker contents**

```bash
head -5 apps/web/public/sw.js
```

Expected: Compiled service worker with precache manifest.

- [ ] **Step 3: Verify no regressions**

```bash
npm run typecheck
```

Expected: No new type errors (pre-existing `page.tsx:333` is acceptable).

- [ ] **Step 4: Manual test plan**

Start production build locally:
```bash
cd apps/web && npm run build && npm run start
```

1. Open `http://localhost:3000` in Chrome (note: `next start` defaults to 3000, not the dev port 3002)
2. Open DevTools → Application → Service Workers
3. Verify: service worker is registered and active
4. Verify: Cache Storage shows precached assets
5. Go to DevTools → Network → check "Offline"
6. Navigate to any page
7. Verify: themed offline page appears with "You're Offline" message and Retry link
8. Uncheck "Offline", click Retry
9. Verify: app loads normally

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(web): service worker polish (#204)"
```
