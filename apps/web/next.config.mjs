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
