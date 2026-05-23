import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import withSerwistInit from "@serwist/next";
import { withPlausibleProxy } from "next-plausible";
import { withSentryConfig } from "@sentry/nextjs";

const require = createRequire(import.meta.url);
const rootPkg = require("../../package.json");
const APP_VERSION = process.env.APP_VERSION ?? rootPkg.version ?? "0.0.0-dev";
const OUTPUT_FILE_TRACING_ROOT = path.resolve(process.cwd(), "..", "..");

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

function getLocalDevOrigins() {
  const origins = new Set(["localhost", "127.0.0.1"]);

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        origins.add(address.address);
      }
    }
  }

  return Array.from(origins);
}

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
  allowedDevOrigins: getLocalDevOrigins(),
  reactStrictMode: true,
  transpilePackages: ["@pocketrealm/shared", "@pocketrealm/game-engine"],
  outputFileTracingRoot: OUTPUT_FILE_TRACING_ROOT,
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
  webpack: {
    treeshake: {
      // Keep Sentry warnings and debug hooks available in launch builds.
      removeDebugLogging: false,
    },
  },
});
