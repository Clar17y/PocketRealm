import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import withSerwistInit from "@serwist/next";
import { withPlausibleProxy } from "next-plausible";
import { withSentryConfig } from "@sentry/nextjs";

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

const baseConfig = withPlausibleProxy()(withSerwist({
  reactStrictMode: true,
  transpilePackages: ["@pocketrealm/shared", "@pocketrealm/game-engine"],
  images: {
    minimumCacheTTL: 2592000,
  },
  env: {
    APP_VERSION,
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
}));

export default withSentryConfig(baseConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Source map uploads only happen when authToken is set — safe in dev.
  widenClientFileUpload: true,
  // Don't block `next build` if Sentry upload fails (e.g. offline dev).
  errorHandler: (err) => {
    console.warn('[sentry] source map upload skipped:', err?.message ?? err);
  },
  // Disable logger tree-shake for launch (we want warnings visible).
  disableLogger: false,
});
