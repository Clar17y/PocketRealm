#!/usr/bin/env node
/**
 * Cross-platform build wrapper for @pocketrealm/api.
 *
 * Reads the root `package.json#version` (single source of truth) and logs
 * `[build:api] APP_VERSION=<x.y.z>` so Render build logs visibly confirm the
 * release tag that will be served by `GET /health`. The runtime itself
 * resolves the version independently from root `package.json` via
 * `apps/api/src/version.ts` — this script is purely an audit log at build
 * time. It still sets `APP_VERSION` on the spawned tsc process so local
 * `tsc` runs inherit the same value, but production runtime does not depend
 * on that being set.
 *
 * Why not `cross-env-shell $(...)`? `cross-env-shell` uses `shell-quote`
 * under the hood which does not evaluate command substitution, so
 * `APP_VERSION="$(node -p ...)"` ends up as the literal string on both
 * Windows and POSIX. A Node wrapper is the portable fix.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const rootPkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
const rootPkg = require(rootPkgPath);
const appVersion = process.env.APP_VERSION || rootPkg.version || '0.0.0-dev';

console.log(`[build:api] APP_VERSION=${appVersion} (from ${path.relative(process.cwd(), rootPkgPath)})`);

const result = spawnSync('tsc', [], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    APP_VERSION: appVersion,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=1024`.trim(),
  },
});

process.exit(result.status ?? 1);
