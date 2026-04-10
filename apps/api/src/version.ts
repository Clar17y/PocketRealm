function resolveAppVersion(): string {
  const envVersion = process.env.APP_VERSION?.trim();
  if (envVersion) return envVersion;
  try {
    // Path is relative to both src/ and dist/ (both sit two levels under
    // apps/api/). If the API's output layout ever changes, fix this here.
    const pkg = require('../../../package.json') as { version?: string };
    return pkg.version ?? '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export const APP_VERSION: string = resolveAppVersion();
