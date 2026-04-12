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
