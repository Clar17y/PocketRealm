#!/usr/bin/env node
// Cross-platform build wrapper: logs the release version that will be served
// by GET /health, then spawns tsc. Needed because cross-env-shell cannot
// evaluate `$(node -p ...)` command substitution on Windows.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const rootPkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
const rootPkg = require(rootPkgPath);
const appVersion = process.env.APP_VERSION || rootPkg.version || '0.0.0-dev';

console.log(`[build:api] APP_VERSION=${appVersion} (from ${path.relative(process.cwd(), rootPkgPath)})`);

const existingNodeOptions = process.env.NODE_OPTIONS ?? '';
const nodeOptions = /--max-old-space-size=/.test(existingNodeOptions)
  ? existingNodeOptions
  : `${existingNodeOptions} --max-old-space-size=1024`.trim();

const result = spawnSync('tsc', [], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    APP_VERSION: appVersion,
    NODE_OPTIONS: nodeOptions,
  },
});

process.exit(result.status ?? 1);
