function resolveAppVersion(): string {
  const envVersion = process.env.APP_VERSION?.trim();
  if (envVersion) return envVersion;
  try {
    // Resolves the same from both dev (apps/api/src/version.ts) and the
    // built output (apps/api/dist/version.js) — both are two directories
    // deep inside apps/api/, so '../../../package.json' is the repo root.
    // The API compiles to CommonJS (see apps/api/package.json — no `type:
    // module`), so the global `require` is available at runtime.
    const pkg = require('../../../package.json') as { version?: string };
    return pkg.version ?? '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export const APP_VERSION: string = resolveAppVersion();
